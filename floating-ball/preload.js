// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startRecording: () => ipcRenderer.send('start-recording'),
  stopRecording: () => ipcRenderer.send('stop-recording'),

  onStateChanged: (callback) => {
    ipcRenderer.on('state-changed', (event, state) => callback(state));
  },

  onLog: (callback) => {
    ipcRenderer.on('log', (event, message) => callback(message));
  }
});
