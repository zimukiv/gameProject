'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
contextBridge.exposeInMainWorld('desktopAPI', {
  openProject: (payload) => invoke('project:open', payload),
  saveProject: (payload) => invoke('project:save', payload),
  importAssets: (payload) => invoke('assets:import', payload),
  exportArchive: (payload) => invoke('project:export', payload),
  exportTraces: (payload) => invoke('traces:export', payload),
  importTraces: (payload) => invoke('traces:import', payload),
  cloud: (name, data) => invoke('cloud:action', { name, data }),
  onClosing: (callback) => {
    ipcRenderer.on('cloud:prepare-close', () => callback());
    ipcRenderer.send('cloud:renderer-ready');
  },
  closeReady: () => ipcRenderer.send('cloud:close-ready'),
  closeFailed: () => ipcRenderer.send('cloud:close-failed'),
  platform: 'windows',
  isTest: process.argv.includes('--room-editor-test'),
});
