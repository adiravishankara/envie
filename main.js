const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const envParser = require('./env-parser');
const { runValidator, getValidatorTypes } = require('./validators');
const schemaManager = require('./schema-manager');
const applyHistory = require('./apply-history');
const { maskEnvContent } = require('./secret-mask');
const { computeLineDiff, hasDiffChanges } = require('./env-diff');

function checkManualUpdates() {
  const currentVersion = app.getVersion(); // e.g., '1.0.0'
  const options = {
    hostname: 'api.github.com',
    path: '/repos/adiravishankara/envie/releases/latest',
    headers: { 'User-Agent': 'Envie-App' } // GitHub API requires a User-Agent header
  };

  https.get(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      if (res.statusCode !== 200) {
        logToFile(`Update check skipped: GitHub API returned ${res.statusCode}`, 'INFO');
        return;
      }
      try {
        const release = JSON.parse(data);
        if (!release || !release.tag_name) return;

        // Clean the tag (e.g., convert 'v1.1.0' to '1.1.0')
        const latestVersion = release.tag_name.replace(/^v/, '');

        // Standard semver comparison
        if (isNewerVersion(currentVersion, latestVersion)) {
          dialog.showMessageBox({
            type: 'info',
            title: 'New Version Available!',
            message: `A new version (v${latestVersion}) of Envie is available. You are currently on v${currentVersion}.`,
            detail: release.body || 'No release notes provided.',
            buttons: ['Download Update', 'Cancel']
          }).then((result) => {
            if (result.response === 0) {
              // Open the download/release page in the user's default browser
              shell.openExternal(release.html_url);
            }
          });
        }
      } catch (err) {
        console.error('Failed to parse release data:', err);
      }
    });
  }).on('error', (err) => {
    console.error('Failed to check for updates:', err);
  });
}

// Simple semver comparison helper (current < latest); strips v-prefix and prerelease suffix
function isNewerVersion(current, latest) {
  const normalize = (v) => v.replace(/^v/, '').replace(/-.*$/, '');
  const cParts = normalize(current).split('.').map(Number);
  const lParts = normalize(latest).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (lParts[i] > cParts[i]) return true;
    if (lParts[i] < cParts[i]) return false;
  }
  return false;
}



// Basic logger to AppData
function logToFile(msg, type = 'INFO') {
  try {
    const logPath = path.join(app.getPath('userData'), 'envie.log');
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type}] ${msg}\n`;
    fs.appendFileSync(logPath, logLine, 'utf8');
    console.log(logLine.trim());
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1020,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    show: false, // Prevents white flash before load
    backgroundColor: '#f8fafc', // Light theme background
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f3f4f6',
      symbolColor: '#4b5563',
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

// Global Configuration Registry for Recent Projects
const globalConfigPath = path.join(app.getPath('userData'), 'envie-global-config.json');

function getGlobalConfig() {
  try {
    if (fs.existsSync(globalConfigPath)) {
      return JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
    }
  } catch (err) {
    logToFile(`Error reading global config: ${err.message}`, 'ERROR');
  }
  return { recentProjects: [], lastActiveProject: null };
}

function saveGlobalConfig(config) {
  try {
    fs.writeFileSync(globalConfigPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    logToFile(`Error saving global config: ${err.message}`, 'ERROR');
  }
}

function addRecentProject(projectPath) {
  if (!projectPath) return;
  const config = getGlobalConfig();
  let recents = config.recentProjects || [];
  
  // Clean duplicates
  recents = recents.filter(p => p !== projectPath);
  // Add to front
  recents.unshift(projectPath);
  // Limit to 10 recents
  recents = recents.slice(0, 10);
  
  config.recentProjects = recents;
  config.lastActiveProject = projectPath;
  saveGlobalConfig(config);
}

function clearActiveProject() {
  const config = getGlobalConfig();
  config.lastActiveProject = null;
  saveGlobalConfig(config);
}

app.whenReady().then(() => {
  logToFile('Application Started', 'INFO');

  ipcMain.handle('get-system-info', () => {
    return {
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
      appVersion: app.getVersion()
    };
  });

  // Recent Projects IPC
  ipcMain.handle('get-recent-projects', () => {
    return getGlobalConfig();
  });

  ipcMain.handle('clear-active-project', () => {
    clearActiveProject();
    logToFile('Active workspace closed by user', 'INFO');
    return { success: true };
  });

  // Logging IPC
  ipcMain.on('log-event', (event, { level, message }) => {
    logToFile(message, level);
  });

  // Open directory dialog
  ipcMain.handle('select-project-dir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      logToFile(`Project directory selected: ${result.filePaths[0]}`, 'INFO');
      return result.filePaths[0];
    }
    return null;
  });

  // Load project
  ipcMain.handle('load-project-data', async (event, projectPath) => {
    logToFile(`Loading project: ${projectPath}`, 'INFO');
    const envieConfigPath = path.join(projectPath, '.envie', 'config.json');
    
    // Track loaded project in recents list
    addRecentProject(projectPath);
    
    // Ensure .gitignore is protecting us
    envParser.ensureGitignored(projectPath);

    let config = null;
    let externalDesync = false;
    let parsedEnvLocal = null;

    // Scan for available .env files, ensuring they are actual files and not .envie directory or files
    const availableFiles = fs.readdirSync(projectPath).filter(file => {
      try {
        const fullPath = path.join(projectPath, file);
        return file.startsWith('.env') && 
               !file.endsWith('.bak') && 
               file !== '.envie' && 
               fs.statSync(fullPath).isFile();
      } catch (e) {
        return false;
      }
    });
    let activeTargetFile = availableFiles.includes('.env.local') ? '.env.local' : (availableFiles.length > 0 ? availableFiles[0] : '.env');

    if (fs.existsSync(envieConfigPath)) {
      try {
        config = JSON.parse(fs.readFileSync(envieConfigPath, 'utf8'));
        logToFile('.envie/config.json loaded successfully.', 'INFO');
        
        // Cold Boot Diff Check
        const targetPath = path.join(projectPath, activeTargetFile);
        if (fs.existsSync(targetPath)) {
          const rawContent = fs.readFileSync(targetPath, 'utf8');
          parsedEnvLocal = envParser.parse(rawContent);
          
          // Basic diff check logic: check if keys match each key's selected env in config
          const activeEnv = config.activeEnvironment || 'local';
          for (const [k, v] of Object.entries(parsedEnvLocal)) {
            const selectedEnv = config.keys[k]?.active || activeEnv;
            if (!config.keys[k] || config.keys[k].values[selectedEnv] !== v.value) {
              externalDesync = true;
              break;
            }
          }
          if (externalDesync) {
            logToFile(`Cold Boot Desync detected between .envie/config.json and ${activeTargetFile}`, 'WARN');
          }
        }
      } catch (err) {
        logToFile(`Error parsing .envie/config.json: ${err.message}`, 'ERROR');
      }
    } else {
      // Seed a new project!
      logToFile('.envie/config.json not found. Seeding a new project database.', 'INFO');
      config = {
        environments: ['local', 'test', 'deployment'],
        activeEnvironment: 'local',
        keys: {}
      };

      const targetPath = path.join(projectPath, activeTargetFile);
      if (fs.existsSync(targetPath)) {
        const rawContent = fs.readFileSync(targetPath, 'utf8');
        const parsed = envParser.parse(rawContent);
        
        for (const [key, data] of Object.entries(parsed)) {
          config.keys[key] = {
            values: { local: data.value, test: '', deployment: '' },
            note: data.note,
            active: 'local',
            validation: { type: 'none' }
          };
        }
        logToFile(`Seeded ${Object.keys(parsed).length} keys from ${activeTargetFile}`, 'INFO');
      }

      // Write newly seeded config immediately to create the .envie directory and config.json
      envParser.safeWrite(envieConfigPath, JSON.stringify(config, null, 2));
      logToFile('Created initial .envie/config.json database file.', 'INFO');
    }

    const parsedEnvRecord = parsedEnvLocal || {};
    const schema = schemaManager.ensureSchema(projectPath, config, parsedEnvRecord);
    const mergedConfig = schemaManager.mergeSchemaIntoConfig(config, schema);

    return {
      config: mergedConfig,
      schema,
      activeTargetFile,
      availableFiles,
      externalDesync,
      parsedEnvLocal
    };
  });

  ipcMain.handle('get-validator-types', () => getValidatorTypes());

  ipcMain.handle('preview-apply', async (event, projectPath, config, schema, targetFile) => {
    try {
      if (targetFile === '.envie') {
        throw new Error('Target output file cannot be .envie');
      }

      const activeEnv = config.activeEnvironment || 'local';
      const validation = schemaManager.validateBeforeApply(config, schema, activeEnv);
      const after = envParser.stringify(config.keys, activeEnv);
      const targetPath = path.join(projectPath, targetFile);
      const before = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
      const diffRows = computeLineDiff(before, after);

      return {
        before,
        after,
        afterMasked: maskEnvContent(after),
        beforeMasked: maskEnvContent(before),
        validation,
        hasChanges: before !== after || hasDiffChanges(diffRows),
        diffRows,
        activeEnvironment: activeEnv,
        targetFile
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('confirm-apply', async (event, projectPath, config, schema, targetFile, options = {}) => {
    try {
      if (targetFile === '.envie') {
        throw new Error('Target output file cannot be .envie');
      }

      const activeEnv = config.activeEnvironment || 'local';
      const validation = schemaManager.validateBeforeApply(config, schema, activeEnv);
      if (!options.force && !validation.valid) {
        return { success: false, error: 'Validation failed', validation };
      }

      const targetPath = path.join(projectPath, targetFile);
      const before = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
      const after = envParser.stringify(config.keys, activeEnv);

      const snapshotId = applyHistory.saveSnapshot(projectPath, {
        targetFile,
        activeEnvironment: activeEnv,
        before,
        after
      });

      const envieConfigPath = path.join(projectPath, '.envie', 'config.json');
      const schemaPath = path.join(projectPath, '.envie', 'schema.json');
      envParser.safeWrite(envieConfigPath, JSON.stringify(config, null, 2));
      envParser.safeWrite(schemaPath, JSON.stringify(schema, null, 2));
      envParser.safeWrite(targetPath, after);
      envParser.ensureGitignored(projectPath);

      logToFile(`Applied variables to ${targetFile} (snapshot ${snapshotId})`, 'INFO');
      return { success: true, snapshotId, validation };
    } catch (err) {
      logToFile(`Confirm apply failed: ${err.message}`, 'ERROR');
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('list-apply-history', async (event, projectPath) => {
    return applyHistory.listSnapshots(projectPath).slice(0, 20);
  });

  ipcMain.handle('restore-apply-snapshot', async (event, projectPath, snapshotId) => {
    try {
      const result = applyHistory.restoreSnapshot(projectPath, snapshotId);
      logToFile(`Restored snapshot ${snapshotId} to ${result.targetFile}`, 'INFO');
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Save project (config only, no target file write — used by drawer saves if needed)
  ipcMain.handle('save-project-data', async (event, projectPath, config, schema, targetFile) => {
    try {
      if (targetFile === '.envie') {
        throw new Error('Target output file cannot be .envie');
      }
      
      logToFile(`Saving project config to .envie/config.json...`, 'INFO');

      const envieConfigPath = path.join(projectPath, '.envie', 'config.json');
      const schemaPath = path.join(projectPath, '.envie', 'schema.json');
      envParser.safeWrite(envieConfigPath, JSON.stringify(config, null, 2));
      if (schema) {
        envParser.safeWrite(schemaPath, JSON.stringify(schema, null, 2));
      }
      envParser.ensureGitignored(projectPath);

      logToFile(`Successfully saved project config.`, 'INFO');
      return { success: true };
    } catch (err) {
      logToFile(`Save failed: ${err.message}`, 'ERROR');
      return { success: false, error: err.message };
    }
  });

  // Test connection ping
  ipcMain.handle('test-connection', async (event, payload) => {
    const type = payload?.type || 'none';
    const keyName = payload?.keyName || 'unknown';
    logToFile(`Pinging connection [${type}] for key ${keyName}...`, 'INFO');

    try {
      const result = await runValidator(type, payload?.value, payload);
      const level =
        result.status === 'connected' ? 'INFO' : result.status === 'auth_error' ? 'WARN' : 'ERROR';
      logToFile(`Connection [${type}] ${keyName}: ${result.message}`, level);
      return {
        ...result,
        legacyStatus:
          result.status === 'connected'
            ? 'success'
            : result.status === 'auth_error'
              ? 'auth_error'
              : 'failed'
      };
    } catch (err) {
      logToFile(`Connection [${type}] ${keyName} failed: ${err.message}`, 'ERROR');
      return {
        status: 'error',
        severity: 'error',
        message: err.message,
        color: 'red',
        error: err.message,
        checkedAt: new Date().toISOString()
      };
    }
  });

  createWindow();

  // Check for updates 5 seconds after startup
  setTimeout(checkManualUpdates, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
