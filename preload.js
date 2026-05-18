const { contextBridge, ipcRenderer } = require('electron');

// Expose secure APIs to the renderer process
contextBridge.exposeInMainWorld('api', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  logEvent: (level, message) => ipcRenderer.send('log-event', { level, message }),
  selectProjectDir: () => ipcRenderer.invoke('select-project-dir'),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  clearActiveProject: () => ipcRenderer.invoke('clear-active-project'),
  loadProjectData: (projectPath) => ipcRenderer.invoke('load-project-data', projectPath),
  saveProjectData: (projectPath, config, targetFile) => ipcRenderer.invoke('save-project-data', projectPath, config, targetFile),
  testConnection: (payload) => ipcRenderer.invoke('test-connection', payload)
});
