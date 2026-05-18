const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  logEvent: (level, message) => ipcRenderer.send('log-event', { level, message }),
  selectProjectDir: () => ipcRenderer.invoke('select-project-dir'),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  clearActiveProject: () => ipcRenderer.invoke('clear-active-project'),
  loadProjectData: (projectPath) => ipcRenderer.invoke('load-project-data', projectPath),
  saveProjectData: (projectPath, config, schema, targetFile) =>
    ipcRenderer.invoke('save-project-data', projectPath, config, schema, targetFile),
  previewApply: (projectPath, config, schema, targetFile) =>
    ipcRenderer.invoke('preview-apply', projectPath, config, schema, targetFile),
  confirmApply: (projectPath, config, schema, targetFile, options) =>
    ipcRenderer.invoke('confirm-apply', projectPath, config, schema, targetFile, options),
  listApplyHistory: (projectPath) => ipcRenderer.invoke('list-apply-history', projectPath),
  restoreApplySnapshot: (projectPath, snapshotId) =>
    ipcRenderer.invoke('restore-apply-snapshot', projectPath, snapshotId),
  getValidatorTypes: () => ipcRenderer.invoke('get-validator-types'),
  testConnection: (payload) => ipcRenderer.invoke('test-connection', payload)
});
