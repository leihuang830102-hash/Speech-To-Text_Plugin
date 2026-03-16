// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startRecording: () => ipcRenderer.send('start-recording'),
  stopRecording: () => ipcRenderer.send('stop-recording'),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  switchBackend: (backend) => ipcRenderer.send('switch-backend', backend),

  onStateChanged: (callback) => {
    ipcRenderer.on('state-changed', (event, state) => callback(state));
  },

  onBackendChanged: (callback) => {
    ipcRenderer.on('backend-changed', (event, backend) => callback(backend));
  },

  onLog: (callback) => {
    ipcRenderer.on('log', (event, message) => callback(message));
  }
});
