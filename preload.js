const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getDevices: () => ipcRenderer.invoke("get-devices"),
  scanMedia: (deviceId) => ipcRenderer.invoke("scan-media", deviceId),
  getFile: (filePath, deviceId) =>
    ipcRenderer.invoke("get-file", filePath, deviceId),
  deleteFiles: (deviceId, filePaths, fileInfos) =>
    ipcRenderer.invoke("delete-files", deviceId, filePaths, fileInfos),
  getHistory: () => ipcRenderer.invoke("get-history"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  onScanProgress: (cb) => {
    ipcRenderer.on("scan-progress", (_event, msg, current, total) =>
      cb(msg, current, total),
    );
  },
});
