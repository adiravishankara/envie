let state = {
  activeProjectPath: null,
  recentProjects: [],
  environments: ['local', 'test', 'deployment'],
  activeEnvironment: 'local',
  keys: {},
  availableFiles: [],
  selectedTargetFile: '.env.local',
  systemLogs: []
};

// DOM Elements
const btnOpenProject = document.getElementById('menu-open-project');
const btnCenterOpen = document.getElementById('btn-center-open');
const btnSaveEnv = document.getElementById('btn-save-env');
const projectPathDisplay = document.getElementById('project-path-display');
const targetEnvSelect = document.getElementById('target-env-file');
const variablesContainer = document.getElementById('variables-container');
const globalToggles = document.getElementById('global-env-toggles');
const consoleOutput = document.getElementById('console-output');
const searchInput = document.getElementById('search-input');
const navItems = document.querySelectorAll('.nav-item[data-view]');
const viewSections = document.querySelectorAll('.view-section');

const syncModal = document.getElementById('sync-modal-container');
const btnSyncImport = document.getElementById('btn-sync-import');
const btnSyncOverwrite = document.getElementById('btn-sync-overwrite');

// Logger
function logEvent(msg, level = 'INFO') {
  const time = new Date().toLocaleTimeString();
  state.systemLogs.push({ time, level, msg });
  
  // Update UI Console
  const div = document.createElement('div');
  div.className = `log-line ${level.toLowerCase()}`;
  div.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-level">[${level}]</span> ${msg}`;
  consoleOutput.appendChild(div);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;

  // Send to persistent backend
  window.api.logEvent(level, msg);
}

// Navigation
navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    
    const targetView = item.getAttribute('data-view');
    viewSections.forEach(s => s.classList.remove('active-view'));
    document.getElementById(`view-${targetView}`).classList.add('active-view');
  });
});

document.getElementById('btn-clear-logs').addEventListener('click', () => {
  consoleOutput.innerHTML = '';
});

// Toast
function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').innerText = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Global Environment Switcher Setup
function renderGlobalToggles() {
  globalToggles.innerHTML = '';
  state.environments.forEach(env => {
    const btn = document.createElement('button');
    btn.className = `toggle-btn ${state.activeEnvironment === env ? 'active' : ''}`;
    btn.innerText = env.charAt(0).toUpperCase() + env.slice(1);
    btn.onclick = () => {
      state.activeEnvironment = env;
      renderGlobalToggles();
      renderVariables(); // Re-render to show values for active env
    };
    globalToggles.appendChild(btn);
  });
}

// Variables Render
function renderVariables(filter = '') {
  variablesContainer.innerHTML = '';
  
  if (!state.activeProjectPath) {
    variablesContainer.innerHTML = `
      <div class="empty-state">
        <h3>No Project Open</h3>
        <p>Click "Open Project" to load a workspace.</p>
        <button class="btn btn-primary mt-3" onclick="document.getElementById('menu-open-project').click()">Open Project</button>
      </div>`;
    return;
  }

  const keys = Object.keys(state.keys).filter(k => k.toLowerCase().includes(filter.toLowerCase()));
  
  if (keys.length === 0) {
    variablesContainer.innerHTML = `
      <div class="empty-state">
        <h3>No variables found</h3>
        <p>Refine your search or add a new key.</p>
      </div>`;
    return;
  }

  keys.forEach(keyName => {
    const keyData = state.keys[keyName];
    const val = keyData.values[state.activeEnvironment] || '';
    
    const card = document.createElement('div');
    card.className = 'var-card';
    card.innerHTML = `
      <div class="var-header">
        <span class="var-name">${keyName}</span>
        <div class="var-badge ${keyData.validation.type !== 'none' ? 'tested' : ''}">
          ${keyData.validation.type !== 'none' ? keyData.validation.type.toUpperCase() : 'Untested'}
        </div>
      </div>
      <div class="var-value-row">
        <input type="text" class="var-input" value="${val}" readonly>
        <button class="btn btn-secondary btn-test" data-key="${keyName}">Test Connection</button>
      </div>
      ${keyData.note ? `<div class="var-note">📝 ${keyData.note}</div>` : ''}
    `;
    variablesContainer.appendChild(card);
  });

  // Attach Test Handlers
  document.querySelectorAll('.btn-test').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const key = e.target.getAttribute('data-key');
      const val = state.keys[key].values[state.activeEnvironment];
      const type = state.keys[key].validation.type;
      
      if (!val) {
        showToast('Value is empty.');
        return;
      }
      
      const prevText = e.target.innerText;
      e.target.innerText = 'Pinging...';
      e.target.disabled = true;

      logEvent(`Testing ${key} connection...`);
      const res = await window.api.testConnection(val, type === 'none' ? 'tcp' : type);
      
      e.target.innerText = prevText;
      e.target.disabled = false;
      
      if (res.status === 'success') {
        showToast('Connection Successful!');
        e.target.style.background = '#dcfce7';
        e.target.style.color = '#166534';
      } else {
        showToast('Connection Failed');
        e.target.style.background = '#fee2e2';
        e.target.style.color = '#991b1b';
      }
    });
  });
}

searchInput.addEventListener('input', (e) => renderVariables(e.target.value));

// Open Project Handler
async function handleOpenProject() {
  const dir = await window.api.selectProjectDir();
  if (dir) {
    state.activeProjectPath = dir;
    projectPathDisplay.innerText = dir;
    logEvent(`Loading workspace: ${dir}`);
    
    const data = await window.api.loadProjectData(dir);
    state.keys = data.config.keys;
    state.environments = data.config.environments;
    state.activeEnvironment = data.config.activeEnvironment || 'local';
    state.availableFiles = data.availableFiles;
    state.selectedTargetFile = data.activeTargetFile;

    // Populate target select
    targetEnvSelect.innerHTML = '';
    state.availableFiles.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.innerText = f;
      if (f === state.selectedTargetFile) opt.selected = true;
      targetEnvSelect.appendChild(opt);
    });

    renderGlobalToggles();
    renderVariables();
    showToast('Project Loaded');

    // Desync Check
    if (data.externalDesync && data.parsedEnvLocal) {
      logEvent(`Cold boot desync detected. External changes found.`, 'WARN');
      syncModal.classList.add('show');
      
      btnSyncImport.onclick = () => {
        // Import new keys
        for (const [k, v] of Object.entries(data.parsedEnvLocal)) {
          if (!state.keys[k]) {
            state.keys[k] = { values: {}, note: v.note, active: 'local', validation: { type: 'none' } };
          }
          state.keys[k].values[state.activeEnvironment] = v.value;
        }
        syncModal.classList.remove('show');
        renderVariables();
        logEvent('External changes synced into Envie database.', 'INFO');
        showToast('Synced successfully');
      };

      btnSyncOverwrite.onclick = () => {
        // Do nothing to state, just hide modal. Next Save will overwrite file.
        syncModal.classList.remove('show');
        logEvent('Opted to overwrite external changes on next save.', 'INFO');
      };
    }
  }
}

btnOpenProject.addEventListener('click', handleOpenProject);
btnCenterOpen.addEventListener('click', handleOpenProject);

// Manual Sync Handler
const btnSyncProject = document.getElementById('btn-sync-project');
btnSyncProject.addEventListener('click', async () => {
  if (!state.activeProjectPath) {
    showToast('No active project open to sync');
    return;
  }

  logEvent(`Manual workspace synchronization triggered for: ${state.activeProjectPath}`, 'INFO');
  const oldText = btnSyncProject.innerHTML;
  btnSyncProject.innerHTML = 'Syncing...';
  btnSyncProject.disabled = true;

  try {
    const data = await window.api.loadProjectData(state.activeProjectPath);
    
    // Update state
    state.keys = data.config.keys;
    state.environments = data.config.environments;
    state.activeEnvironment = data.config.activeEnvironment || 'local';
    state.availableFiles = data.availableFiles;
    state.selectedTargetFile = data.activeTargetFile;

    // Re-populate target select
    targetEnvSelect.innerHTML = '';
    state.availableFiles.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.innerText = f;
      if (f === state.selectedTargetFile) opt.selected = true;
      targetEnvSelect.appendChild(opt);
    });

    renderGlobalToggles();
    renderVariables();

    if (data.externalDesync && data.parsedEnvLocal) {
      logEvent(`Desync detected during manual verification check.`, 'WARN');
      syncModal.classList.add('show');
      
      btnSyncImport.onclick = () => {
        for (const [k, v] of Object.entries(data.parsedEnvLocal)) {
          if (!state.keys[k]) {
            state.keys[k] = { values: {}, note: v.note, active: 'local', validation: { type: 'none' } };
          }
          state.keys[k].values[state.activeEnvironment] = v.value;
        }
        syncModal.classList.remove('show');
        renderVariables();
        logEvent('External changes synced into Envie database.', 'INFO');
        showToast('Synced successfully');
      };

      btnSyncOverwrite.onclick = () => {
        syncModal.classList.remove('show');
        logEvent('Opted to overwrite external changes on next save.', 'INFO');
        showToast('Overwriting aligned');
      };
    } else {
      logEvent('Workspace is fully in sync with disk.', 'INFO');
      showToast('Workspace Synchronized!');
    }
  } catch (err) {
    logEvent(`Workspace sync failed: ${err.message}`, 'ERROR');
    showToast('Sync Failed');
  } finally {
    btnSyncProject.innerHTML = oldText;
    btnSyncProject.disabled = false;
  }
});

// Save Project Handler
btnSaveEnv.addEventListener('click', async () => {
  if (!state.activeProjectPath) return;

  const targetFile = targetEnvSelect.value;
  const configToSave = {
    environments: state.environments,
    activeEnvironment: state.activeEnvironment,
    keys: state.keys
  };

  const oldText = btnSaveEnv.innerHTML;
  btnSaveEnv.innerText = 'Applying...';
  
  const res = await window.api.saveProjectData(state.activeProjectPath, configToSave, targetFile);
  
  btnSaveEnv.innerHTML = oldText;

  if (res.success) {
    showToast(`Saved & Exported to ${targetFile}`);
    logEvent(`Saved config and output to ${targetFile}`, 'INFO');
  } else {
    showToast('Error saving file');
    logEvent(`Failed to save: ${res.error}`, 'ERROR');
  }
});

targetEnvSelect.addEventListener('change', (e) => {
  state.selectedTargetFile = e.target.value;
  logEvent(`Target output file changed to ${e.target.value}`);
});

// Init
window.api.getSystemInfo().then(info => {
  document.getElementById('version-electron').innerText = info.electron;
  document.getElementById('version-node').innerText = info.node;
  document.getElementById('version-chrome').innerText = info.chrome;
  document.getElementById('system-platform').innerText = `${info.platform} (${info.arch})`;
});
