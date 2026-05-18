const { contextBridge, ipcRenderer } = require('electron');

// Expose secure APIs to the renderer process
contextBridge.exposeInMainWorld('api', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  logEvent: (level, message) => ipcRenderer.send('log-event', { level, message }),
  selectProjectDir: () => ipcRenderer.invoke('select-project-dir'),
  loadProjectData: (projectPath) => ipcRenderer.invoke('load-project-data', projectPath),
  saveProjectData: (projectPath, config, targetFile) => ipcRenderer.invoke('save-project-data', projectPath, config, targetFile),
  testConnection: (url, type) => ipcRenderer.invoke('test-connection', url, type)
});
