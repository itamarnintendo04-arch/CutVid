const { app, BrowserWindow, shell, Menu, ipcMain, net } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0c10',
    title: 'CutVid',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // External links (e.g. Supabase dashboard) open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// HTTP bridge for AI providers (see preload.cjs). Only web URLs, and only from our own window.
ipcMain.handle('cutvid-http', async (event, req) => {
  if (!event.senderFrame || !event.senderFrame.url.startsWith('file://')) throw new Error('Forbidden');
  const url = new URL(String(req.url));
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('Only https URLs are allowed');
  const res = await net.fetch(url.toString(), { method: req.method || 'GET', headers: req.headers || {}, body: req.body });
  const headers = {};
  res.headers.forEach((v, k) => {
    // The body is already decoded here; forwarding these would make the renderer misread it.
    if (k !== 'content-encoding' && k !== 'content-length') headers[k] = v;
  });
  return { status: res.status, headers, body: await res.text() };
});

app.whenReady().then(() => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
