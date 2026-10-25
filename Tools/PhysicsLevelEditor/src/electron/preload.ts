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
contextBridge.exposeInMainWorld('releaseProject', {
  overview: () => ipcRenderer.invoke('release:overview'),
  open: (roomId: string) => ipcRenderer.invoke('release:open',roomId),
  save: (roomId: string,overlay: unknown,expected: string|null) =>
    ipcRenderer.invoke('release:save',roomId,overlay,expected),
  playtest: (roomId: string,overlay: unknown,expected: string|null,rect: unknown) =>
    ipcRenderer.invoke('release:playtest',roomId,overlay,expected,rect),
  resizePlaytest: (rect: unknown) => ipcRenderer.invoke('release:playtest-resize',rect),
  focusPlaytest: () => ipcRenderer.invoke('release:playtest-focus'),
  stopPlaytest: () => ipcRenderer.invoke('release:playtest-stop'),
  onPlaytestExit: (listener:(result:{sessionId:string;exitCode:number|null})=>void) => {
    const fn=(_event:Electron.IpcRendererEvent,result:{sessionId:string;exitCode:number|null})=>listener(result);
    ipcRenderer.on('release:playtest-exit',fn);
    return ()=>ipcRenderer.removeListener('release:playtest-exit',fn);
  },
  onPlaytestEvent: (listener:(event:{type:string;line?:string;message?:string;
    sessionId?:string;exitCode?:number|null})=>void) => {
    const fn=(_event:Electron.IpcRendererEvent,event:{type:string;line?:string;
      message?:string;sessionId?:string;exitCode?:number|null})=>listener(event);
    ipcRenderer.on('release:playtest-event',fn);
    return ()=>ipcRenderer.removeListener('release:playtest-event',fn);
  }
});
