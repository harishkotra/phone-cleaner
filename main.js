const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { execFile, exec } = require("child_process");
const fs = require("fs");

const ADB = "adb";
const CACHE_DIR = path.join(app.getPath("userData"), "cache");
const HISTORY_FILE = path.join(app.getPath("userData"), "delete-history.json");

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ---------- Delete history ----------

function readHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE))
      return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch (_) {}
  return { sessions: [] };
}

function writeHistory(data) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

function adb(args) {
  return new Promise((resolve, reject) => {
    execFile(
      ADB,
      args,
      { maxBuffer: 128 * 1024 * 1024, timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr.trim() || err.message));
        resolve(stdout);
      },
    );
  });
}

// ---------- Device ----------

async function getDevices() {
  const out = await adb(["devices"]);
  const lines = out.split("\n").slice(1);
  return lines
    .filter((l) => l.includes("\tdevice"))
    .map((l) => ({ id: l.split("\t")[0] }));
}

// ---------- Scan ----------

const WHATSAPP_BASES = [
  "/sdcard/WhatsApp/Media",
  "/sdcard/Android/media/com.whatsapp/WhatsApp/Media",
];

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);
const VIDEO_EXTS = new Set([".mp4", ".3gp", ".mov", ".avi", ".mkv"]);
const ALL_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);

function parseLsLine(line) {
  // Formats seen on Android toybox:
  //   -rw-rw---- 1 u0_a147 media_rw 123456 2024-01-15 10:30 file.jpg
  //   -rw-rw---- 1 u0_a147 media_rw 123456 Jan 15 10:30 file.jpg
  //   -rw-rw---- 1 u0_a147 media_rw 123456 Jan 15  2024 file.jpg
  const m1 = line.match(
    /^([\-dl])[\-rwxsSltT]{9}\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/,
  );
  if (m1)
    return {
      type: m1[1],
      size: parseInt(m1[2], 10),
      date: m1[3],
      time: m1[4],
      name: m1[5],
    };

  // Old-style: Jan 15  2024 or Jan 15 10:30
  const m2 = line.match(
    /^([\-dl])[\-rwxsSltT]{9}\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w{3}\s+\d{1,2})\s+(?:\d{4}|\d{2}:\d{2})\s+(.+)$/,
  );
  if (m2) {
    const months = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12",
    };
    const parts = m2[3].split(/\s+/);
    const mon = months[parts[0]] || "01";
    const day = parts[1].padStart(2, "0");
    const datePart = line.match(/(\w{3}\s+\d{1,2})\s+(\d{4}|\d{2}:\d{2})/);
    let dateStr, timeStr;
    if (datePart && /^\d{4}$/.test(datePart[2])) {
      dateStr = `${datePart[2]}-${mon}-${day}`;
      timeStr = "00:00";
    } else {
      dateStr = `${new Date().getFullYear()}-${mon}-${day}`;
      timeStr = datePart ? datePart[2] : "00:00";
    }
    return {
      type: m2[1],
      size: parseInt(m2[2], 10),
      date: dateStr,
      time: timeStr,
      name: m2[4],
    };
  }
  return null;
}

async function scanMedia(deviceId, progressCb) {
  const found = [];
  const dirsToScan = [];

  // Find actual top-level media dirs
  for (const base of WHATSAPP_BASES) {
    for (const sub of ["WhatsApp Images", "WhatsApp Video"]) {
      const d = `${base}/${sub}`;
      try {
        const out = await adb([
          "-s",
          deviceId,
          "shell",
          `ls "${d}" 2>/dev/null || true`,
        ]);
        if (out.trim()) dirsToScan.push(d);
      } catch (_) {}
    }
  }

  if (!dirsToScan.length) return found;

  for (let idx = 0; idx < dirsToScan.length; idx++) {
    const dir = dirsToScan[idx];
    const dirName = path.posix.basename(dir);
    progressCb(`Scanning ${dirName}...`, 0, 0);

    let out;
    try {
      out = await adb([
        "-s",
        deviceId,
        "shell",
        `ls -laR "${dir}" 2>/dev/null || true`,
      ]);
    } catch (_) {
      continue;
    }

    let currentDir = "";
    let parsedCount = 0;
    const lines = out.split("\n");
    const totalLines = lines.length;

    for (const line of lines) {
      parsedCount++;

      // Report progress while parsing (every 5%)
      if (parsedCount % 100 === 0 || parsedCount === totalLines) {
        const pct =
          totalLines > 0 ? Math.round((parsedCount / totalLines) * 100) : 0;
        progressCb(
          `Scanning ${dirName}... ${found.length} files found`,
          pct,
          100,
        );
      }

      // Directory header
      if (line.startsWith("/") && line.endsWith(":")) {
        currentDir = line.slice(0, -1);
        continue;
      }
      if (line.startsWith("total") || !line.trim()) continue;

      const parsed = parseLsLine(line);
      if (!parsed || parsed.type === "d") continue;

      const ext = path.extname(parsed.name).toLowerCase();
      if (!ALL_EXTS.has(ext)) continue;

      found.push({
        name: parsed.name,
        path: path.posix.join(currentDir, parsed.name),
        dir: currentDir,
        size: parsed.size,
        date: parsed.date,
        time: parsed.time,
        isVideo: VIDEO_EXTS.has(ext),
        deviceId,
      });
    }
  }

  found.sort(
    (a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time),
  );
  return found;
}

// ---------- File ops ----------

function cachePath(filePath) {
  const hash = Buffer.from(filePath).toString("base64").replace(/[/+=]/g, "_");
  return { hash, ext: path.extname(filePath) };
}

async function pullFile(filePath, deviceId) {
  const { hash, ext } = cachePath(filePath);
  const dest = path.join(CACHE_DIR, hash + ext);
  if (fs.existsSync(dest)) return dest;

  // Ensure file exists before pulling
  await adb(["-s", deviceId, "pull", filePath, dest]);
  return dest;
}

async function deleteFiles(deviceId, filePaths, fileInfos) {
  const escaped = filePaths.map((fp) => `"${fp.replace(/"/g, '\\"')}"`);
  const cmd = "rm -f " + escaped.join(" ");
  let results;
  try {
    await adb(["-s", deviceId, "shell", cmd]);
    results = filePaths.map((p) => ({ path: p, success: true }));
  } catch (e) {
    results = [];
    for (const fp of filePaths) {
      try {
        await adb([
          "-s",
          deviceId,
          "shell",
          `rm -f "${fp.replace(/"/g, '\\"')}"`,
        ]);
        results.push({ path: fp, success: true });
      } catch (e2) {
        results.push({ path: fp, success: false, error: e2.message });
      }
    }
  }

  // Record successful deletions in history
  const history = readHistory();
  const succeeded = results.filter((r) => r.success);
  if (succeeded.length > 0) {
    const totalBytes = succeeded.reduce((sum, r) => {
      const info = fileInfos.find((f) => f.path === r.path);
      return sum + (info ? info.size : 0);
    }, 0);
    const images = succeeded.filter((r) => {
      const info = fileInfos.find((f) => f.path === r.path);
      return info && !info.isVideo;
    }).length;
    const videos = succeeded.filter((r) => {
      const info = fileInfos.find((f) => f.path === r.path);
      return info && info.isVideo;
    }).length;

    history.sessions.push({
      date: new Date().toISOString(),
      totalFiles: succeeded.length,
      totalBytes,
      images,
      videos,
      files: succeeded.map((r) => {
        const info = fileInfos.find((f) => f.path === r.path);
        return {
          path: r.path,
          name: info?.name,
          size: info?.size,
          isVideo: info?.isVideo,
        };
      }),
    });

    // Keep last 500 entries max
    if (history.sessions.length > 500) {
      history.sessions = history.sessions.slice(-500);
    }
    writeHistory(history);
  }

  return results;
}

// ---------- IPC ----------

ipcMain.handle("get-devices", async () => {
  try {
    return await getDevices();
  } catch {
    return [];
  }
});

ipcMain.handle("scan-media", async (_, deviceId) => {
  ensureDir(CACHE_DIR);
  const progressCb = (msg, current, total) => {
    if (global.scanWindow) {
      global.scanWindow.webContents.send("scan-progress", msg, current, total);
    }
  };
  return await scanMedia(deviceId, progressCb);
});

ipcMain.handle("get-file", async (_, filePath, deviceId) => {
  try {
    return await pullFile(filePath, deviceId);
  } catch {
    return null;
  }
});

ipcMain.handle("delete-files", async (_, deviceId, filePaths, fileInfos) => {
  return await deleteFiles(deviceId, filePaths, fileInfos);
});

ipcMain.handle("get-history", async () => {
  return readHistory();
});

ipcMain.handle("clear-history", async () => {
  writeHistory({ sessions: [] });
  return true;
});

// ---------- Window ----------

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "WhatsApp Media Manager",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  global.scanWindow = win;
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  ensureDir(CACHE_DIR);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
