const { contextBridge, ipcRenderer } = require('electron');

// AI provider calls go through the main process so they are not blocked by browser CORS.
contextBridge.exposeInMainWorld('cutvidHttp', (req) => ipcRenderer.invoke('cutvid-http', req));
