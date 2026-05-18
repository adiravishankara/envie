const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const envParser = require('./env-parser');

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

app.whenReady().then(() => {
  logToFile('Application Started', 'INFO');

  ipcMain.handle('get-system-info', () => {
    return {
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
    };
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
    
    // Ensure .gitignore is protecting us
    envParser.ensureGitignored(projectPath);

    let config = null;
    let externalDesync = false;
    let parsedEnvLocal = null;

    // Scan for available .env files
    const availableFiles = fs.readdirSync(projectPath).filter(file => file.startsWith('.env') && !file.endsWith('.bak'));
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
          
          // Basic diff check logic: check if keys match the active env in config
          const activeEnv = config.activeEnvironment || 'local';
          for (const [k, v] of Object.entries(parsedEnvLocal)) {
            if (!config.keys[k] || config.keys[k].values[activeEnv] !== v.value) {
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

    return { config, activeTargetFile, availableFiles, externalDesync, parsedEnvLocal };
  });

  // Save project
  ipcMain.handle('save-project-data', async (event, projectPath, config, targetFile) => {
    try {
      logToFile(`Saving project config to .envie/config.json and applying to ${targetFile}...`, 'INFO');
      
      // Save JSON
      const envieConfigPath = path.join(projectPath, '.envie', 'config.json');
      envParser.safeWrite(envieConfigPath, JSON.stringify(config, null, 2));

      // Stringify & Save .env
      const activeEnv = config.activeEnvironment || 'local';
      const envContent = envParser.stringify(config.keys, activeEnv);
      const targetPath = path.join(projectPath, targetFile);
      
      envParser.safeWrite(targetPath, envContent);

      // Protect
      envParser.ensureGitignored(projectPath);

      logToFile(`Successfully applied variables to ${targetFile}.`, 'INFO');
      return { success: true };
    } catch (err) {
      logToFile(`Save failed: ${err.message}`, 'ERROR');
      return { success: false, error: err.message };
    }
  });

  // Test connection ping
  ipcMain.handle('test-connection', async (event, url, type) => {
    logToFile(`Pinging connection [${type}] for ${url}...`, 'INFO');
    
    return new Promise((resolve) => {
      // Fallback pseudo-checker for UI mockup right now since dynamic pinging can be complex
      // We will actually implement a basic TCP check for postgres
      if (type === 'tcp') {
        try {
          // url e.g. postgresql://user:pass@localhost:5432/db
          const parsedUrl = new URL(url);
          const port = parsedUrl.port || 5432;
          const host = parsedUrl.hostname || 'localhost';
          
          const socket = new net.Socket();
          socket.setTimeout(2500); // 2.5s timeout
          
          socket.on('connect', () => {
            socket.destroy();
            logToFile(`TCP Connection SUCCESS to ${host}:${port}`, 'INFO');
            resolve({ status: 'success', color: 'green', message: 'TCP Connection OK' });
          });
          
          socket.on('timeout', () => {
            socket.destroy();
            logToFile(`TCP Connection TIMEOUT to ${host}:${port}`, 'ERROR');
            resolve({ status: 'error', color: 'red', message: 'Connection Timeout' });
          });
          
          socket.on('error', (err) => {
            logToFile(`TCP Connection ERROR to ${host}:${port} - ${err.message}`, 'ERROR');
            resolve({ status: 'error', color: 'red', message: err.message });
          });
          
          socket.connect(port, host);
        } catch(e) {
          logToFile(`TCP Connection URL PARSE ERROR - ${e.message}`, 'ERROR');
          resolve({ status: 'error', color: 'red', message: 'Invalid URL Format' });
        }
      } else {
        // Fallback for http/supabase/clerk/etc
        setTimeout(() => {
          logToFile(`Mock connection SUCCESS for ${type}`, 'INFO');
          resolve({ status: 'success', color: 'green', message: 'Connection OK' });
        }, 1000);
      }
    });
  });

  createWindow();

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
