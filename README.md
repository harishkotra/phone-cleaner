# Phone Cleaner

> Browse, preview, and clean up WhatsApp media from your Android phone — 100% offline, no cloud, no AI.

Phone Cleaner is a **desktop app** that connects to your Android phone via ADB (USB debugging), scans your WhatsApp media folders, and gives you a fast, visual interface to review and delete files you no longer need. Everything runs locally on your machine.

## Features

- **ADB device detection** — automatically finds connected Android devices
- **Recursive media scan** — scans `WhatsApp Images` and `WhatsApp Video` folders (including Sent/Received subdirectories) using `ls -laR`
- **Lazy-loaded thumbnails** — images are pulled from your phone only when scrolled into view (IntersectionObserver)
- **Video preview** — videos show a play icon placeholder; double-click to pull and play
- **Filtering & sorting** — by image/video type, filename, size range, date (newest/oldest/largest/smallest)
- **Keep/Delete workflow** — mark files as Keep (green) or select for deletion (red)
- **Full-screen preview** — double-click any file to view it in a modal (images full-size, videos with controls)
- **Delete history** — every deletion session is logged locally with file count, size recovered, and image/video breakdown
- **Keyboard shortcuts** — `Delete` to remove selected, `Ctrl+A` to select all, `Escape` to close modals
- **100% private** — no data ever leaves your machine; all communication is via USB through ADB

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Renderer (Chromium)                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ index.html  │  │  styles.css  │  │  app.js    │ │
│  └─────────────┘  └──────────────┘  └──────┬─────┘ │
│                                            │        │
│                                  IPC (contextBridge) │
├────────────────────────────────────────────┼────────┤
│                  Main Process (Node.js)     │        │
│  ┌─────────────────────────────────────────┼──────┐ │
│  │  main.js                                │      │ │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────┴────┐ │ │
│  │  │ ADB ops  │  │ History  │  │ File cache   │ │ │
│  │  └────┬─────┘  └──────────┘  └──────────────┘ │ │
│  └───────┼────────────────────────────────────────┘ │
└──────────┼──────────────────────────────────────────┘
           │ adb
    ┌──────┴──────┐
    │   Phone     │
    │ (USB/ADB)   │
    └─────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Electron](https://www.electronjs.org/) 35 |
| Frontend | Vanilla JS, HTML5, CSS3 |
| Device communication | [Android Debug Bridge (ADB)](https://developer.android.com/studio/command-line/adb) |
| Thumbnail lazy loading | IntersectionObserver API |
| Persistent storage | JSON file via `fs` (delete history) |
| Build tool | npm |

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Android phone** with USB Debugging enabled
- **USB cable** that supports data transfer

### Installation & Development

```bash
git clone https://github.com/harishkotra/phone-cleaner.git
cd phone-cleaner
npm install
npm start
```

### Building for Distribution

```bash
# macOS (DMG + ZIP)
npm run build:mac

# Windows (NSIS installer + portable)
npm run build:win

# Both platforms
npm run build

# All platforms + architectures
npm run dist
```

Artifacts are written to the `release/` directory.

### First Run

1. **Enable USB Debugging** on your phone:
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → Enable USB Debugging

2. **Connect your phone** via USB and tap **Allow** on the authorization prompt

3. **Click Refresh Devices** in the app, then **Scan Media**

## How It Works

### Scanning

The app probes two possible WhatsApp media paths on your device:

```
/sdcard/WhatsApp/Media/WhatsApp Images/
/sdcard/WhatsApp/Media/WhatsApp Video/
/sdcard/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/
/sdcard/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/
```

For each directory that exists, it runs a single `ls -laR` command via ADB. The output is parsed line-by-line to extract file name, size, and modification date.

```js
// main.js — scanMedia function
const out = await adb(["-s", deviceId, "shell",
  `ls -laR "${dir}" 2>/dev/null || true`,
]);

// Parse the recursive output
for (const line of out.split('\n')) {
  // Directory headers start with /path:
  if (line.startsWith('/') && line.endsWith(':')) {
    currentDir = line.slice(0, -1);
    continue;
  }
  // Parse file entries
  const parsed = parseLsLine(line);
  if (parsed && parsed.type !== 'd') {
    found.push({ name, path, size, date, ... });
  }
}
```

### Thumbnail Loading

Thumbnails are pulled on-demand using IntersectionObserver — only images visible in the viewport (plus a 300px buffer) are downloaded from the phone:

```js
const thumbObs = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const img = entry.target;
    // ADB pull the file to local cache, then set as img src
    loadThumb(img);
    thumbObs.unobserve(img);
  }
}, { rootMargin: '300px' });
```

Video files never pull a thumbnail — they show a play-button overlay icon instead.

### Delete Workflow

When you confirm deletion, files are removed from your phone via `adb shell rm`:

```js
const cmd = "rm -f " + filePaths.map(fp => `"${fp}"`).join(' ');
await adb(["-s", deviceId, "shell", cmd]);
```

Successful deletions are recorded in a JSON history file at:

```
~/Library/Application Support/phone-cleaner/delete-history.json
```

## Contributing

Contributions are welcome! Here are some ideas for features you could add:

### Feature Ideas

| Feature | Description | Complexity |
|---------|-------------|------------|
| [**Video thumbnail extraction**](https://github.com/harishkotra/phone-cleaner/issues/1) | Use ffmpeg to extract a frame from videos for thumbnail preview | Medium |
| [**Bulk export**](https://github.com/harishkotra/phone-cleaner/issues/2) | Pull selected files to a local folder before deleting | Low |
| [**Other media sources**](https://github.com/harishkotra/phone-cleaner/issues/3) | Add Telegram, Signal, or camera folder scanning | Low |
| [**Undo delete**](https://github.com/harishkotra/phone-cleaner/issues/4) | Move files to a trash folder instead of permanent delete | Medium |
| [**Duplicate detection**](https://github.com/harishkotra/phone-cleaner/issues/5) | Find and group duplicate files by hash | Medium |
| [**Date range filter**](https://github.com/harishkotra/phone-cleaner/issues/6) | Filter files by a date picker instead of manual sort | Low |
| [**Statistics dashboard**](https://github.com/harishkotra/phone-cleaner/issues/7) | Charts showing storage usage over time, file type distribution | Medium |
| [**Wireless ADB**](https://github.com/harishkotra/phone-cleaner/issues/8) | Support pairing over Wi-Fi (adb pair) | Low |
| [**Dark/Light theme toggle**](https://github.com/harishkotra/phone-cleaner/issues/9) | Let users switch themes | Low |
| [**i18n**](https://github.com/harishkotra/phone-cleaner/issues/10) | Multi-language support | Medium |
| [**Offline cache browser**](https://github.com/harishkotra/phone-cleaner/issues/11) | Browse previously pulled thumbnails without phone connected | Low |

### Development Setup

```bash
git clone https://github.com/harishkotra/phone-cleaner.git
cd phone-cleaner
npm install
npm start
```

The app uses no build step — vanilla JS with Electron. Edit files in `renderer/` for UI changes and `main.js` for backend/ADB changes.

### Pull Request Guidelines

1. Keep changes focused — one feature per PR
2. Maintain the existing code style (no semicolons, 2-space indent)
3. Test with a real Android device before submitting
4. Update this README if adding new features

## Privacy

**Phone Cleaner is 100% local and private:**
- All file operations run through ADB over USB
- No data is sent to any server
- No analytics, no tracking, no AI
- The delete history JSON file is stored locally on your machine
- The only cache is a local copy of thumbnails you've viewed

## License

[MIT](LICENSE)

### Screenshots

<img width="1276" height="857" alt="phone-cleaner-1" src="https://github.com/user-attachments/assets/ce44f945-fa53-42c1-b392-3fe3ecdc1116" />
<img width="1277" height="858" alt="phone-cleaner-2" src="https://github.com/user-attachments/assets/a79241a9-6431-4346-9341-11c2b853e502" />
<img width="1276" height="856" alt="phone-cleaner-3" src="https://github.com/user-attachments/assets/3eadbe40-54b5-49b6-b92d-927e99b15236" />
<img width="1279" height="857" alt="phone-cleaner-4" src="https://github.com/user-attachments/assets/bddd3733-54be-4dcc-aaf7-7eb164bcc6df" />
