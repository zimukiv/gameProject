import { contextBridge, ipcRenderer } from 'electron';
const api = {
  open: () => ipcRenderer.invoke('level:open-dialog'),
  openSample: () => ipcRenderer.invoke('level:open-sample'),
  save: (path: string, text: string, fingerprint: string) => ipcRenderer.invoke('level:save', path, text, fingerprint),
  saveAs: (text: string) => ipcRenderer.invoke('level:save-dialog', text),
  openTemplate: () => ipcRenderer.invoke('template:open'),
  saveTemplate: (text: string) => ipcRenderer.invoke('template:save', text)
};
contextBridge.exposeInMainWorld('levelFiles', api);
