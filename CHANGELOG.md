# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-06-29

### Added

- **ADB device detection** — automatically detects connected Android devices via `adb devices`
- **WhatsApp media scanning** — recursive scan of `WhatsApp Images` and `WhatsApp Video` folders (including Sent/Received subdirectories) across both legacy and Android 11+ scoped storage paths
- **Lazy-loaded thumbnail grid** — images pulled from the phone on-demand using `IntersectionObserver` with 300px root margin; only visible files are transferred
- **Video identification** — video files show a play-button overlay and "Video" badge; thumbnails are never pulled for videos
- **Full-size preview** — double-click any file to open in a modal: images display full-resolution, videos play with native controls and autoplay
- **Multi-select deletion** — click files to select (red border), batch delete via `adb shell rm -f` with confirmation dialog
- **Keep workflow** — Ctrl+Click / Cmd+Click to mark files as Keep (green border + KEEP badge); separate from selection
- **Filtering** — toggle image/video type, filename search, minimum/maximum file size (MB)
- **Sorting** — newest first, oldest first, largest first, smallest first
- **Select All / Clear** — bulk selection management with `Ctrl+A` shortcut
- **Keyboard shortcuts** — `Delete`/`Backspace` to delete selected, `Escape` to close modals
- **Delete history** — persistent JSON log tracking every deletion session: timestamp, file count, bytes recovered, image/video breakdown
- **History panel** — viewable via History button, shows all past sessions with summary stats and Clear History option
- **Progress reporting** — real-time scan progress bar showing directory being scanned and files found so far
- **Dark theme** — modern dark UI with layered surfaces, system font stack, and subtle animations
- **Privacy disclaimer** — visible on welcome screen: "100% local & private. No AI, no cloud, no data leaves your computer."

### Technical

- Electron 35 with `contextIsolation: true` and `nodeIntegration: false` for security
- Vanilla JS renderer with no build step or framework dependencies
- ADB communication via `child_process.execFile` with 128MB maxBuffer
- File caching with Base64-encoded path hashes
- `ls -laR` scanning strategy — single ADB round-trip per directory instead of per-file stat calls
- Date format parser supporting both `YYYY-MM-DD` and legacy `Mon DD YYYY` formats
