const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  isCliReady: () => ipcRenderer.invoke("is-cli-ready"),
  readJson: (relativePath) => ipcRenderer.invoke("read-json", relativePath),
  runCli: (payload) => ipcRenderer.invoke("run-cli", payload),
  stopCli: () => ipcRenderer.invoke("stop-cli"),
  exportSessionLog: (payload) => ipcRenderer.invoke("export-session-log", payload),
  onCliLog: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("cli-log", listener);
    return () => ipcRenderer.removeListener("cli-log", listener);
  }
});
