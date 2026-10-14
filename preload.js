const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('browser', {
  command: (action, value) => ipcRenderer.invoke('command', action, value),
  onState: callback => ipcRenderer.on('state', (_event, state) => callback(state)),
  onFocusAddress: callback => ipcRenderer.on('focus-address', callback),
  onOpenSettings: callback => ipcRenderer.on('open-settings', callback),
  onQuickClose: callback => ipcRenderer.on('quick-close', callback)
});
