const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lyricsOverlay', {
  onState: (handler) => {
    const listener = (_event, state) => handler(state);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
  setMode: (mode) => ipcRenderer.send('set-mode', mode),
  close: () => ipcRenderer.send('close-overlay'),
  requestState: () => ipcRenderer.send('request-state'),
});
