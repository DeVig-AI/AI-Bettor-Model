// The score pill's window (main.js openPill): lets pill.html fit the window to the pill and close it. Nothing else.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("devigPill", {
  resize: (w, h) => ipcRenderer.send("pill:resize", w, h),
  close: () => ipcRenderer.send("pill:close"),
});
