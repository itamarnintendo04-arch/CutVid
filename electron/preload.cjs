const { contextBridge, ipcRenderer } = require('electron');

// AI provider calls go through the main process so they are not blocked by browser CORS.
contextBridge.exposeInMainWorld('cutvidHttp', (req) => ipcRenderer.invoke('cutvid-http', req));

// Sign-in: the main process opens the system browser and waits for the redirect on a loopback port.
contextBridge.exposeInMainWorld('cutvidAuth', { start: (url) => ipcRenderer.invoke('cutvid-auth', url) });
