let allFiles = [];
let sel = new Set();
let keep = new Set();
let deviceId = null;
let historyCache = null;

const $ = (id) => document.getElementById(id);
const D = (t, p, c) => {
  const e = document.createElement(t);
  if (p) Object.assign(e, p);
  if (c) e.append(...c);
  return e;
};

// DOM
const deviceSelect = $("device-select");
const scanBtn = $("scan-btn");
const refreshBtn = $("refresh-btn");
const historyBtn = $("history-btn");
const grid = $("grid");
const welcome = $("welcome");
const statusEl = $("status");
const fileCount = $("file-count");
const selCount = $("sel-count");
const deleteBtn = $("delete-btn");
const keepBtn = $("keep-btn");
const selAllBtn = $("sel-all-btn");
const selNoneBtn = $("sel-none-btn");
const fi = $("fi");
const fv = $("fv");
const search = $("search");
const smin = $("smin");
const smax = $("smax");
const sortSelect = $("sort-select");
const progress = $("progress");
const progressFill = $("progress-fill");
const progressText = $("progress-text");

const modal = $("modal");
const modalOverlay = $("modal-overlay");
const modalClose = $("modal-close");
const modalMedia = $("modal-media");
const modalInfo = $("modal-info");

const hpanel = $("hpanel");
const hpanelOverlay = $("hpanel-overlay");
const hpanelClose = $("hpanel-close");
const hpanelClear = $("hpanel-clear");
const hpanelSummary = $("hpanel-summary");
const hpanelList = $("hpanel-list");

// ---------- IntersectionObserver for lazy thumbnails ----------

const thumbObs = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const img = e.target;
      if (img.dataset.loading) continue;
      img.dataset.loading = "1";
      thumbObs.unobserve(img);
      loadThumb(img);
    }
  },
  { rootMargin: "300px" },
);

// ---------- Devices ----------

async function refreshDevices() {
  const devices = await window.api.getDevices();
  deviceSelect.innerHTML = "";
  if (!devices.length) {
    deviceSelect.innerHTML = '<option value="">No device connected</option>';
    scanBtn.disabled = true;
    statusEl.textContent = "";
    return;
  }
  devices.forEach((d) => {
    deviceSelect.appendChild(D("option", { value: d.id, textContent: d.id }));
  });
  deviceSelect.value = devices[0].id;
  scanBtn.disabled = false;
  statusEl.textContent = `${devices.length} device(s) connected`;
}

refreshBtn.addEventListener("click", refreshDevices);
deviceSelect.addEventListener("change", () => {
  scanBtn.disabled = !deviceSelect.value;
});

// ---------- Scan ----------

scanBtn.addEventListener("click", async () => {
  deviceId = deviceSelect.value;
  if (!deviceId) return;

  allFiles = [];
  sel.clear();
  keep.clear();
  grid.classList.add("hidden");
  welcome.classList.add("hidden");
  progress.classList.remove("hidden");
  progressFill.style.width = "0%";
  progressText.textContent = "Starting scan...";
  statusEl.textContent = "Scanning...";

  window.api.onScanProgress((msg, cur, total) => {
    if (total > 0) {
      progressFill.style.width = cur + "%";
    } else {
      progressFill.style.width = "30%";
    }
    progressText.textContent = msg;
  });

  try {
    allFiles = await window.api.scanMedia(deviceId);
  } catch (e) {
    progress.classList.add("hidden");
    statusEl.textContent = "Scan failed";
    welcome.classList.remove("hidden");
    return;
  }

  progress.classList.add("hidden");
  statusEl.textContent = `${allFiles.length} files found`;
  render();
});

// ---------- Filtering ----------

function filtered() {
  let f = allFiles;
  if (!fi.checked) f = f.filter((x) => x.isVideo);
  if (!fv.checked) f = f.filter((x) => !x.isVideo);
  const q = search.value.toLowerCase();
  if (q) f = f.filter((x) => x.name.toLowerCase().includes(q));
  const mn = parseFloat(smin.value);
  const mx = parseFloat(smax.value);
  if (!isNaN(mn)) f = f.filter((x) => x.size / 1048576 >= mn);
  if (!isNaN(mx)) f = f.filter((x) => x.size / 1048576 <= mx);

  const sort = sortSelect.value;
  f = [...f].sort((a, b) => {
    switch (sort) {
      case "oldest":
        return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
      case "largest":
        return b.size - a.size;
      case "smallest":
        return a.size - b.size;
      default:
        return b.date.localeCompare(a.date) || b.time.localeCompare(a.time);
    }
  });
  return f;
}

function esc(s) {
  return D("div", { textContent: s }).innerHTML;
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

async function loadThumb(imgEl) {
  const f = imgEl.__file;
  if (!f) return;
  try {
    const localPath = await window.api.getFile(f.path, f.deviceId);
    if (localPath) {
      imgEl.src = "file://" + localPath;
      imgEl.classList.remove("placeholder");
    }
  } catch {}
}

// ---------- Render ----------

function render() {
  const files = filtered();
  fileCount.textContent = `${files.length} / ${allFiles.length} files`;
  grid.innerHTML = "";

  if (!files.length) {
    grid.classList.add("hidden");
    welcome.classList.remove("hidden");
    if (allFiles.length) {
      welcome.querySelector("h2").textContent = "No files match filters";
      welcome.querySelector(".sub").textContent =
        "Try adjusting the filters above.";
    }
    updateActions();
    return;
  }

  grid.classList.remove("hidden");
  welcome.classList.add("hidden");

  for (const f of files) {
    const card = D("div", {
      className:
        "card" +
        (sel.has(f.path) ? " sel" : "") +
        (keep.has(f.path) ? " keep" : ""),
    });
    card.dataset.path = f.path;

    let thumb;
    if (f.isVideo) {
      thumb = D("div", { className: "th placeholder" });
    } else {
      thumb = D("img", { className: "th placeholder", alt: f.name });
      thumb.__file = f;
      thumbObs.observe(thumb);
    }

    const cb = D("div", {
      className: "cb",
      textContent: sel.has(f.path) ? "✓" : "",
    });
    const meta = D("div", { className: "meta" });
    meta.innerHTML = `<span>${esc(f.name)}</span><br>${f.date}`;

    card.append(thumb, cb, meta);

    if (f.isVideo) {
      card.appendChild(D("div", { className: "play-icon" }));
      card.appendChild(D("div", { className: "badge", textContent: "Video" }));
    }

    card.appendChild(
      D("div", { className: "sb", textContent: fmtSize(f.size) }),
    );

    if (keep.has(f.path)) {
      card.appendChild(D("div", { className: "kb", textContent: "KEEP" }));
    }

    card.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        keep.has(f.path) ? keep.delete(f.path) : keep.add(f.path);
        sel.delete(f.path);
        render();
        return;
      }
      sel.has(f.path) ? sel.delete(f.path) : sel.add(f.path);
      keep.delete(f.path);
      updateActions();
      card.classList.toggle("sel");
      cb.textContent = sel.has(f.path) ? "✓" : "";
    });

    card.addEventListener("dblclick", () => previewFile(f));

    grid.appendChild(card);
  }

  updateActions();
}

// ---------- Preview ----------

async function previewFile(file) {
  statusEl.textContent = `Loading ${file.name}...`;
  try {
    const localPath = await window.api.getFile(file.path, file.deviceId);
    statusEl.textContent = allFiles.length
      ? `${allFiles.length} files found`
      : "";
    if (!localPath) {
      alert("Failed to load file");
      return;
    }

    modal.classList.remove("hidden");
    modalMedia.innerHTML = "";

    if (file.isVideo) {
      const v = D("video", {
        src: "file://" + localPath,
        controls: true,
        autoplay: true,
      });
      modalMedia.appendChild(v);
    } else {
      modalMedia.appendChild(D("img", { src: "file://" + localPath }));
    }

    modalInfo.innerHTML = `
      <div><span class="lbl">Name</span> ${esc(file.name)}</div>
      <div><span class="lbl">Path</span> ${esc(file.path)}</div>
      <div><span class="lbl">Size</span> ${fmtSize(file.size)}</div>
      <div><span class="lbl">Date</span> ${file.date} ${file.time}</div>
      <div><span class="lbl">Type</span> ${file.isVideo ? "Video" : "Image"}</div>
    `;
  } catch (e) {
    statusEl.textContent = "Preview failed";
    alert("Preview failed: " + e.message);
  }
}

modalClose.addEventListener("click", () => modal.classList.add("hidden"));
modalOverlay.addEventListener("click", () => modal.classList.add("hidden"));

// ---------- Actions ----------

function updateActions() {
  selCount.textContent = `${sel.size} selected`;
  deleteBtn.disabled = sel.size === 0;
  keepBtn.disabled = sel.size === 0;
}

selAllBtn.addEventListener("click", () => {
  sel = new Set(filtered().map((f) => f.path));
  render();
});

selNoneBtn.addEventListener("click", () => {
  sel.clear();
  render();
});

keepBtn.addEventListener("click", () => {
  for (const p of sel) keep.add(p);
  sel.clear();
  render();
});

deleteBtn.addEventListener("click", async () => {
  if (!sel.size) return;
  const filesToDel = allFiles.filter((f) => sel.has(f.path));
  const totalSize = filesToDel.reduce((s, f) => s + f.size, 0);
  if (
    !confirm(
      `Delete ${sel.size} file(s) (${fmtSize(totalSize)}) from your phone?\n\nThis cannot be undone.`,
    )
  )
    return;

  const paths = [...sel];
  deleteBtn.disabled = true;
  statusEl.textContent = `Deleting ${paths.length} files...`;

  try {
    const results = await window.api.deleteFiles(deviceId, paths, filesToDel);
    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;
    statusEl.textContent =
      `Deleted ${ok} file(s)` + (fail ? ` (${fail} failed)` : "");

    allFiles = allFiles.filter((f) => !sel.has(f.path));
    keep = new Set([...keep].filter((p) => !sel.has(p)));
    sel.clear();
    historyCache = null;
    render();
  } catch (e) {
    alert("Delete failed: " + e.message);
    deleteBtn.disabled = false;
  }
});

// ---------- History ----------

async function loadHistory() {
  if (!historyCache) historyCache = await window.api.getHistory();
  return historyCache;
}

async function showHistory() {
  const h = await loadHistory();
  const s = h.sessions || [];
  let totalFiles = 0,
    totalBytes = 0,
    totalImages = 0,
    totalVideos = 0;
  for (const sess of s) {
    totalFiles += sess.totalFiles || 0;
    totalBytes += sess.totalBytes || 0;
    totalImages += sess.images || 0;
    totalVideos += sess.videos || 0;
  }
  hpanelSummary.innerHTML = `
    <strong>${totalFiles}</strong> files deleted &middot;
    <strong>${fmtSize(totalBytes)}</strong> recovered &middot;
    ${totalImages} images, ${totalVideos} videos
    ${s.length ? ` &middot; ${s.length} sessions` : ""}
  `;
  hpanelList.innerHTML = "";
  if (!s.length) {
    hpanelList.innerHTML =
      '<p style="color:var(--dim);padding:20px 0">No deletions recorded yet.</p>';
  } else {
    for (let i = s.length - 1; i >= 0; i--) {
      const sess = s[i];
      const d = new Date(sess.date);
      const dateStr =
        d.toLocaleDateString() +
        " " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const item = D("div", { className: "hist-item" });
      item.innerHTML = `
        <span class="hist-date">${esc(dateStr)}</span>
        <span class="hist-count">${sess.totalFiles}</span>
        <span class="hist-bytes">${fmtSize(sess.totalBytes)}</span>
        <span>${sess.images || 0} images, ${sess.videos || 0} videos</span>
      `;
      hpanelList.appendChild(item);
    }
  }
  hpanel.classList.remove("hidden");
}

historyBtn.addEventListener("click", showHistory);
hpanelClose.addEventListener("click", () => hpanel.classList.add("hidden"));
hpanelOverlay.addEventListener("click", () => hpanel.classList.add("hidden"));

hpanelClear.addEventListener("click", async () => {
  if (!confirm("Clear all delete history?")) return;
  await window.api.clearHistory();
  historyCache = { sessions: [] };
  showHistory();
});

// ---------- Filter listeners ----------

[fi, fv, search, smin, smax, sortSelect].forEach((el) => {
  el.addEventListener("input", () => render());
  el.addEventListener("change", () => render());
});

// ---------- Keyboard ----------

document.addEventListener("keydown", (e) => {
  if (
    (e.key === "Delete" || e.key === "Backspace") &&
    document.activeElement?.tagName !== "INPUT" &&
    document.activeElement?.tagName !== "SELECT"
  ) {
    deleteBtn.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "a") {
    if (document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      selAllBtn.click();
    }
  }
  if (e.key === "Escape") {
    modal.classList.add("hidden");
    hpanel.classList.add("hidden");
  }
});

// ---------- Init ----------

refreshDevices();
