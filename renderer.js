// Mock Electron APIs when running in standard web browser (for headless testing/UI presentation)
if (typeof window.api === 'undefined') {
  window.api = {
    selectProjectDir: async () => 'C:\\mock-workspace',
    getRecentProjects: async () => ({
      recentProjects: ['C:\\mock-workspace', 'C:\\another-project'],
      lastActiveProject: null
    }),
    clearActiveProject: async () => ({ success: true }),
    loadProjectData: async (dir) => ({
      config: {
        environments: ['local', 'dev', 'staging', 'production'],
        activeEnvironment: 'local',
        keys: {
          'NEXT_PUBLIC_SUPABASE_URL': { values: { 'local': 'https://local-sb.co', 'dev': 'https://dev-sb.co', 'staging': 'https://staging-sb.co', 'production': 'https://supabase.co' }, note: 'Supabase REST Endpoint', validation: { type: 'supabase' } },
          'NEXT_PUBLIC_SUPABASE_ANON_KEY': { values: { 'local': 'eyJhbG...', 'dev': 'eyJhbG...', 'staging': 'eyJhbG...', 'production': 'eyJhbG...' }, note: 'Anon API Key', validation: { type: 'supabase' } },
          'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY': { values: { 'local': 'pk_test_clerk', 'dev': 'pk_dev_clerk', 'production': 'pk_prod_clerk' }, note: 'Clerk Client Publishable Key', validation: { type: 'clerk' } },
          'CLERK_SECRET_KEY': { values: { 'local': 'sk_test_clerk', 'dev': 'sk_dev_clerk', 'production': 'sk_prod_clerk' }, note: 'Clerk Secret Backend Key', validation: { type: 'clerk' } },
          'DATABASE_URL': { values: { 'local': 'postgresql://localhost:5432/db', 'dev': 'postgresql://pg.dev:5432/db', 'production': 'postgresql://postgres.neon.tech/db' }, note: 'Main Postgres DB url', validation: { type: 'tcp' } },
          'MAPBOX_ACCESS_TOKEN': { values: { 'local': 'pk.mapbox.local', 'production': 'pk.mapbox.prod' }, note: 'Mapbox maps credential', validation: { type: 'mapbox' } },
          'RESEND_API_KEY': { values: { 'local': 're_123_local', 'production': 're_123_prod' }, note: 'Resend transactional mail key', validation: { type: 'resend' } },
          'GENERIC_API_TOKEN': { values: { 'local': 'token_local_123', 'dev': 'token_dev_123', 'production': 'token_prod_123' }, note: 'Generic server bearer token', validation: { type: 'http' } },
          'PORT': { values: { 'local': '3000', 'dev': '4000', 'production': '8000' }, note: 'Server active listening port', validation: { type: 'none' } }
        },
        profiles: {}
      },
      schema: { version: 1, keys: {} },
      availableFiles: ['.env', '.env.local', '.env.development'],
      activeTargetFile: '.env.local',
      externalDesync: false,
      parsedEnvLocal: null
    }),
    saveProjectData: async () => ({ success: true }),
    previewApply: async () => ({
      before: 'OLD_KEY=old\n',
      after: 'NEW_KEY=new\n',
      diffRows: [{ type: 'modified', before: 'OLD_KEY=old', after: 'NEW_KEY=new' }],
      validation: { errors: [], warnings: [], valid: true },
      hasChanges: true,
      targetFile: '.env.local',
      activeEnvironment: 'local'
    }),
    confirmApply: async () => ({ success: true, snapshotId: 'mock-snapshot' }),
    listApplyHistory: async () => [],
    restoreApplySnapshot: async () => ({ success: true, targetFile: '.env.local' }),
    getValidatorTypes: async () => [
      { id: 'none', label: 'None (Untested)' },
      { id: 'tcp', label: 'TCP Network Port' }
    ],
    logEvent: (level, msg) => console.log(`[Mock ${level}] ${msg}`),
    testConnection: async () => ({
      status: 'unreachable',
      message: 'Connection checks run in the Electron app only'
    }),
    getSystemInfo: async () => ({ appVersion: '1.0.0-alpha (Mock)' })
  };
}

let state = {
  activeProjectPath: null,
  recentProjects: [],
  environments: ['local', 'test', 'deployment'],
  activeEnvironment: 'local',
  keys: {},
  schema: { version: 1, keys: {} },
  availableFiles: [],
  selectedTargetFile: '.env.local',
  systemLogs: [],
  maskSecrets: true,
  unmaskedKeys: {}
};

let validatorTypes = [];
let applyPreviewCache = null;

// DOM Elements
const viewWorkspace = document.getElementById('view-workspace');
const btnOpenProject = document.getElementById('menu-open-project');
const btnCenterOpen = document.getElementById('btn-center-open');
const btnSaveEnv = document.getElementById('btn-save-env');
const projectPathDisplay = document.getElementById('project-path-display');
const projectNameHeader = document.getElementById('project-name-header');
const topPathIndicator = document.getElementById('top-path-indicator');
const closeProjectButtons = [
  document.getElementById('menu-close-project'),
  document.getElementById('sidebar-close-project'),
  document.getElementById('btn-close-project')
].filter(Boolean);
const openProjectButtons = [
  btnOpenProject,
  btnCenterOpen,
  document.getElementById('sidebar-open-project'),
  document.getElementById('btn-switch-project')
].filter(Boolean);
const targetEnvSelect = document.getElementById('target-env-file');
const variablesContainer = document.getElementById('variables-container');
const consoleOutput = document.getElementById('console-output');
const searchInput = document.getElementById('search-input');
const navItems = document.querySelectorAll('.nav-item[data-view]');
const viewSections = document.querySelectorAll('.view-section');

// Drawer Elements
const drawerOverlay = document.getElementById('drawer-overlay');
const slidingDrawer = document.getElementById('sliding-drawer');
const drawerTitle = document.getElementById('drawer-title');
const drawerContent = document.getElementById('drawer-content');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const btnDrawerApply = document.getElementById('btn-drawer-apply');

// Modal Elements
const syncModal = document.getElementById('sync-modal-container');
const btnSyncImport = document.getElementById('btn-sync-import');
const btnSyncOverwrite = document.getElementById('btn-sync-overwrite');

const envModal = document.getElementById('env-modal-container');
const btnManageEnvs = document.getElementById('btn-manage-envs');
const btnCloseEnvModal = document.getElementById('btn-close-env-modal');
const btnAddEnv = document.getElementById('btn-add-env');
const newEnvInput = document.getElementById('new-env-input');
const envListItems = document.getElementById('env-list-items');

// Environment segmented control
const sliderLabels = document.getElementById('slider-labels');

let activeDrawerGroup = null; // Track which group is open in drawer

// Logger
function logEvent(msg, level = 'INFO') {
  const time = new Date().toLocaleTimeString();
  state.systemLogs.push({ time, level, msg });
  
  const div = document.createElement('div');
  div.className = `log-line ${level.toLowerCase()}`;
  div.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-level">[${level}]</span> ${msg}`;
  consoleOutput.appendChild(div);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;

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

// Background Connections Health Cache
let connectionStatusCache = {};

function getKeySchema(keyName) {
  if (!state.schema.keys[keyName]) {
    state.schema.keys[keyName] = {
      required: false,
      type: 'string',
      note: state.keys[keyName]?.note || '',
      validation: state.keys[keyName]?.validation || { type: 'none' },
      group: state.keys[keyName]?.group
    };
  }
  return state.schema.keys[keyName];
}

function buildConfigPayload() {
  return {
    environments: state.environments,
    activeEnvironment: state.activeEnvironment,
    keys: state.keys
  };
}

function buildValidatorOptionsHtml(selectedType) {
  const types = validatorTypes.length
    ? validatorTypes
    : [
        { id: 'none', label: 'None (Untested)' },
        { id: 'tcp', label: 'TCP Network Port' },
        { id: 'clerk', label: 'Clerk Gateway Check' },
        { id: 'supabase', label: 'Supabase Authorized REST' },
        { id: 'mapbox', label: 'Mapbox Auth Check' },
        { id: 'resend', label: 'Resend Bearer Assert' },
        { id: 'http', label: 'Generic HTTP REST GET' }
      ];
  return types
    .map(
      (t) =>
        `<option value="${t.id}" ${t.id === selectedType ? 'selected' : ''}>${t.label}</option>`
    )
    .join('');
}

function updateWorkspaceMeta() {
  const keyCount = Object.keys(state.keys || {}).length;
  const envCount = state.environments.length;
  const verifiedCount = Object.values(connectionStatusCache).filter(status => status === 'success').length;
  const testableCount = Object.values(state.keys || {}).filter(keyData => (keyData.validation?.type || 'none') !== 'none').length;

  const keyStat = document.getElementById('key-count-stat');
  const envStat = document.getElementById('env-count-stat');
  const activeStat = document.getElementById('active-env-stat');
  const verifiedStat = document.getElementById('verified-count-stat');

  if (keyStat) keyStat.innerText = keyCount.toString();
  if (envStat) envStat.innerText = envCount.toString();
  if (activeStat) activeStat.innerText = state.activeEnvironment || 'none';
  if (verifiedStat) verifiedStat.innerText = `${verifiedCount}/${testableCount}`;
}

function getKeyActiveEnv(keyName) {
  const keyData = state.keys[keyName];
  if (!keyData) return state.activeEnvironment;
  return keyData.active || state.activeEnvironment || state.environments[0];
}

function setKeyActiveEnv(keyName, env) {
  if (!state.keys[keyName] || !state.environments.includes(env)) return;
  state.keys[keyName].active = env;
}

function applyEnvironmentPreset(env) {
  state.activeEnvironment = env;
  Object.keys(state.keys).forEach(keyName => {
    state.keys[keyName].active = env;
  });
}

async function triggerBackgroundPings() {
  if (!state.activeProjectPath) return;
  
  logEvent('Triggering automatic background connection checks...', 'INFO');
  
  for (const [keyName, keyData] of Object.entries(state.keys)) {
    const type = keyData.validation?.type || 'none';
    if (type === 'none') {
      connectionStatusCache[keyName] = 'untested';
      continue;
    }
    
    const env = getKeyActiveEnv(keyName);
    const val = keyData.values[env] || '';
    if (!val) {
      connectionStatusCache[keyName] = 'untested';
      continue;
    }

    connectionStatusCache[keyName] = 'testing';
    updateHealthBadges();

    window.api.testConnection({
      value: val,
      type,
      keyName,
      environment: env,
      projectKeys: state.keys
    }).then(res => {
      if (res.status === 'connected' || res.status === 'success' || res.legacyStatus === 'success') {
        connectionStatusCache[keyName] = 'success';
      } else if (res.status === 'auth_error') {
        connectionStatusCache[keyName] = 'auth_error';
      } else {
        connectionStatusCache[keyName] = 'failed';
      }
      updateHealthBadges();

      if (res.status === 'connected' || res.status === 'success') {
        logEvent(`Connection successful for ${keyName} (${type}): ${res.message}`, 'INFO');
      } else if (res.status === 'auth_error') {
        logEvent(`Auth rejected for ${keyName} (${type}): ${res.message}`, 'WARN');
      } else {
        logEvent(`Connection failed for ${keyName} (${type}): ${res.message || res.error || 'unreachable'}`, 'WARN');
      }
    }).catch(err => {
      connectionStatusCache[keyName] = 'failed';
      updateHealthBadges();
      logEvent(`Connection failed for ${keyName} (${type}): ${err.message}`, 'ERROR');
    });
  }
}

function updateHealthBadges() {
  updateWorkspaceMeta();

  // Update badges for each Service Group Card dynamically
  const groups = getGroupedKeys();
  for (const [groupName, keysList] of Object.entries(groups)) {
    const groupDomId = getGroupDomId(groupName);
    const badge = document.getElementById(`badge-group-${groupDomId}`);
    const dot = document.getElementById(`dot-group-${groupDomId}`);
    const textSpan = document.getElementById(`badge-text-group-${groupDomId}`);
    if (!badge) continue;

    // Aggregate health for keys in this group
    let hasFailed = false;
    let hasAuthError = false;
    let hasTesting = false;
    let hasSuccess = false;

    keysList.forEach(k => {
      const status = connectionStatusCache[k] || 'untested';
      if (status === 'failed') hasFailed = true;
      if (status === 'auth_error') hasAuthError = true;
      if (status === 'testing') hasTesting = true;
      if (status === 'success') hasSuccess = true;
    });

    badge.className = 'health-badge';
    if (hasFailed) {
      badge.classList.add('failed');
      textSpan.innerText = 'Failed';
    } else if (hasAuthError) {
      badge.classList.add('auth-error');
      textSpan.innerText = 'Auth Error';
    } else if (hasTesting) {
      badge.classList.add('testing');
      textSpan.innerText = 'Testing';
    } else if (hasSuccess) {
      badge.classList.add('success');
      textSpan.innerText = 'Connected';
    } else {
      badge.classList.add('untested');
      textSpan.innerText = 'Untested';
    }
  }
}

// Group keys helper
function getGroupedKeys() {
  const groups = {
    Supabase: [],
    Clerk: [],
    Contentful: [],
    Mapbox: [],
    Resend: [],
    Database: [],
    General: []
  };

  Object.keys(state.keys).forEach(key => {
    const manualGroup = normalizeGroupName(state.keys[key].group);
    if (manualGroup) {
      if (!groups[manualGroup]) groups[manualGroup] = [];
      groups[manualGroup].push(key);
      return;
    }

    const kUpper = key.toUpperCase();
    if (kUpper.includes('SUPABASE')) {
      groups.Supabase.push(key);
    } else if (kUpper.includes('CLERK')) {
      groups.Clerk.push(key);
    } else if (isContentfulKey(kUpper)) {
      groups.Contentful.push(key);
    } else if (kUpper.includes('MAPBOX')) {
      groups.Mapbox.push(key);
    } else if (kUpper.includes('RESEND')) {
      groups.Resend.push(key);
    } else if (kUpper.includes('DATABASE') || kUpper.includes('DB_') || kUpper.includes('POSTGRES') || kUpper.includes('REDIS') || kUpper.includes('MONGO') || kUpper.includes('MYSQL')) {
      groups.Database.push(key);
    } else {
      groups.General.push(key);
    }
  });

  // Filter out empty groups
  for (const group in groups) {
    if (groups[group].length === 0) {
      delete groups[group];
    }
  }
  return groups;
}

function normalizeGroupName(value) {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'auto') return '';
  return trimmed
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getGroupNameForKey(key) {
  const manualGroup = normalizeGroupName(state.keys[key]?.group);
  if (manualGroup) return manualGroup;

  const kUpper = key.toUpperCase();
  if (kUpper.includes('SUPABASE')) return 'Supabase';
  if (kUpper.includes('CLERK')) return 'Clerk';
  if (isContentfulKey(kUpper)) return 'Contentful';
  if (kUpper.includes('MAPBOX')) return 'Mapbox';
  if (kUpper.includes('RESEND')) return 'Resend';
  if (kUpper.includes('DATABASE') || kUpper.includes('DB_') || kUpper.includes('POSTGRES') || kUpper.includes('REDIS') || kUpper.includes('MONGO') || kUpper.includes('MYSQL')) return 'Database';
  return 'General';
}

function getAvailableGroupNames() {
  return [...new Set(Object.keys(getGroupedKeys()))].sort((a, b) => a.localeCompare(b));
}

function buildGroupOptionMarkup(value, label = value, isCreate = false) {
  const safeValue = String(value).replace(/"/g, '&quot;');
  const safeLabel = String(label).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <button type="button" class="drawer-group-option${isCreate ? ' is-create' : ''}" data-value="${safeValue}">
      ${safeLabel}
    </button>
  `;
}

function attachGroupCombobox(card, key, availableGroups) {
  const wrapper = card.querySelector('.drawer-group-combobox');
  const input = wrapper?.querySelector('.drawer-group-input');
  const toggle = wrapper?.querySelector('.drawer-group-toggle');
  const menu = wrapper?.querySelector('.drawer-group-menu');
  if (!wrapper || !input || !toggle || !menu) return;

  const getFilteredGroups = (shouldFilter) => {
    const query = input.value.trim().toLowerCase();
    if (!query || !shouldFilter) return availableGroups;
    return availableGroups.filter(group => group.toLowerCase().includes(query));
  };

  const renderMenu = () => {
    const shouldFilter = wrapper.dataset.filterMode === 'typed';
    const filteredGroups = getFilteredGroups(shouldFilter);
    const normalizedValue = normalizeGroupName(input.value);
    const hasExactMatch = filteredGroups.some(group => group === normalizedValue) ||
      availableGroups.some(group => group === normalizedValue);

    let markup = '';
    if (shouldFilter && normalizedValue && !hasExactMatch) {
      markup += buildGroupOptionMarkup(normalizedValue, `Create "${normalizedValue}"`, true);
    }

    if (filteredGroups.length > 0) {
      markup += filteredGroups.map(group => buildGroupOptionMarkup(group)).join('');
    } else if (!markup) {
      markup = '<div class="drawer-group-empty">No matching groups</div>';
    }

    menu.innerHTML = markup;
  };

  const openMenu = () => {
    renderMenu();
    wrapper.classList.add('open');
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  };

  const closeMenu = () => {
    wrapper.classList.remove('open');
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };

  input.addEventListener('focus', openMenu);
  input.addEventListener('input', () => {
    wrapper.dataset.filterMode = 'typed';
    openMenu();
  });
  input.addEventListener('click', (event) => {
    event.stopPropagation();
    wrapper.dataset.filterMode = 'all';
    openMenu();
  });

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (menu.hidden) {
      wrapper.dataset.filterMode = 'all';
      input.focus();
      openMenu();
    } else {
      closeMenu();
    }
  });

  menu.addEventListener('click', (event) => {
    const option = event.target.closest('.drawer-group-option');
    if (!option) return;
    event.preventDefault();
    input.value = option.getAttribute('data-value') || '';
    wrapper.dataset.filterMode = 'all';
    closeMenu();
    input.focus();
  });

  wrapper.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!wrapper.contains(document.activeElement)) {
        closeMenu();
      }
    }, 0);
  });

  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      input.blur();
    }
  });

  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target)) {
      closeMenu();
    }
  });
}

function isContentfulKey(kUpper) {
  return kUpper.includes('CONTENTFUL') ||
         kUpper.includes('CONTENT_DELIVERY') ||
         kUpper.includes('CONTENT_PREVIEW') ||
         kUpper === 'SPACE_ID' ||
         kUpper.endsWith('_SPACE_ID') ||
         kUpper.includes('CONTENT_ENVIRONMENT');
}

function getGroupDomId(groupName) {
  return groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
}

function toDomId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

// Clean Key Prefix for visualization display
function cleanKeyLabel(key, groupName) {
  let label = key;
  // Strip framework prefixes
  label = label.replace(/^(VITE_PUBLIC_|VITE_|NEXT_PUBLIC_|REACT_APP_|APP_|NEXT_)/i, '');
  // Strip service group name if redundant
  const gUpper = groupName.toUpperCase();
  if (label.startsWith(gUpper + '_')) {
    label = label.replace(new RegExp(`^${gUpper}_`, 'i'), '');
  }
  return label;
}

// Environment Slider Setup & Render
function renderEnvironmentSlider() {
  sliderLabels.innerHTML = '';
  const total = state.environments.length;
  
  if (total === 0) return;

  const applyPreset = (env) => {
    if (!state.environments.includes(env)) return;
    applyEnvironmentPreset(env);
    logEvent(`Applied environment preset to all variables: ${env}`, 'INFO');
    renderEnvironmentSlider();
    renderServiceGroups();
    triggerBackgroundPings();
  };

  if (total > 5) {
    const wrapper = document.createElement('div');
    wrapper.className = 'preset-select-wrap';
    wrapper.innerHTML = `
      <label class="preset-select-label" for="global-env-preset">Preset</label>
      <select class="preset-select dropdown-select" id="global-env-preset">
        ${state.environments.map(env => `
          <option value="${env}" ${state.activeEnvironment === env ? 'selected' : ''}>${env.charAt(0).toUpperCase() + env.slice(1)}</option>
        `).join('')}
      </select>
    `;

    wrapper.querySelector('.preset-select').onchange = (event) => {
      applyPreset(event.target.value);
    };
    sliderLabels.appendChild(wrapper);
  } else {
    state.environments.forEach(env => {
      const label = document.createElement('button');
      label.type = 'button';
      label.className = `slider-label ${state.activeEnvironment === env ? 'active' : ''}`;
      label.setAttribute('aria-pressed', state.activeEnvironment === env ? 'true' : 'false');
      label.innerText = env.charAt(0).toUpperCase() + env.slice(1);
      label.onclick = () => {
        applyPreset(env);
      };
      sliderLabels.appendChild(label);
    });
  }

  updateWorkspaceMeta();
}

// Render one-key-per-row list with lightweight service groupings
function renderServiceGroups(filter = '') {
  variablesContainer.innerHTML = '';
  updateWorkspaceMeta();
  
  if (!state.activeProjectPath) {
    variablesContainer.innerHTML = `
      <div class="empty-state">
        <h3>No Project Open</h3>
        <p>Open a project folder from the sidebar, title bar, or pick a recent project below.</p>
        <button class="btn btn-primary mt-3" id="btn-center-open-dynamic" type="button">Open Project</button>
      </div>`;
    const dynamicOpenBtn = document.getElementById('btn-center-open-dynamic');
    if (dynamicOpenBtn) dynamicOpenBtn.addEventListener('click', handleOpenProject);
    return;
  }

  const groups = getGroupedKeys();
  const filteredGroups = {};
  
  // Apply search query filtering
  Object.entries(groups).forEach(([groupName, keys]) => {
    const matchedKeys = keys.filter(k => {
      const label = cleanKeyLabel(k, groupName);
      return k.toLowerCase().includes(filter.toLowerCase()) || 
             label.toLowerCase().includes(filter.toLowerCase()) ||
             groupName.toLowerCase().includes(filter.toLowerCase());
    });
    if (matchedKeys.length > 0) {
      filteredGroups[groupName] = matchedKeys;
    }
  });

  if (Object.keys(filteredGroups).length === 0) {
    variablesContainer.innerHTML = `
      <div class="empty-state">
        <h3>No services or keys matched</h3>
        <p>Refine your search query.</p>
      </div>`;
    return;
  }

  const groupedList = document.createElement('div');
  groupedList.className = 'grouped-key-list';

  Object.entries(filteredGroups).forEach(([groupName, keysList]) => {
    const groupDomId = getGroupDomId(groupName);
    const groupSection = document.createElement('section');
    groupSection.className = `key-group-section ${groupDomId}`;
    
    groupSection.innerHTML = `
      <div class="key-group-header">
        <div class="service-title-row">
          <div class="service-icon-bg">${groupName.charAt(0)}</div>
          <div>
            <span class="service-name">${groupName}</span>
            <span class="group-count">${keysList.length} ${keysList.length === 1 ? 'key' : 'keys'}</span>
          </div>
        </div>
        <div class="health-badge untested" id="badge-group-${groupDomId}">
          <span class="badge-dot" id="dot-group-${groupDomId}"></span>
          <span id="badge-text-group-${groupDomId}">Untested</span>
        </div>
      </div>
      <div class="stripped-keys-list" id="keys-list-${groupDomId}"></div>
    `;

    const keysListContainer = groupSection.querySelector(`#keys-list-${groupDomId}`);
    keysList.forEach(key => {
      const cleanLabel = cleanKeyLabel(key, groupName);
      const row = document.createElement('div');
      row.className = 'stripped-key-row';
      
      const env = getKeyActiveEnv(key);
      const rawVal = state.keys[key].values[env] || '';
      const displayVal = state.unmaskedKeys[key] ? rawVal : '••••••••';
      const useEnvDropdown = state.environments.length > 5;
      const envOptions = useEnvDropdown
        ? `
          <label class="key-env-select-label" for="env-select-${toDomId(key)}">Environment</label>
          <select class="key-env-select dropdown-select" id="env-select-${toDomId(key)}" data-key="${key}">
            ${state.environments.map(envName => `
              <option value="${envName}" ${envName === env ? 'selected' : ''}>${envName.charAt(0).toUpperCase() + envName.slice(1)}</option>
            `).join('')}
          </select>
        `
        : state.environments.map(envName => `
          <button type="button" class="key-env-option ${envName === env ? 'active' : ''}" data-key="${key}" data-env="${envName}" aria-pressed="${envName === env ? 'true' : 'false'}">
            ${envName.charAt(0).toUpperCase() + envName.slice(1)}
          </button>
        `).join('');

      row.innerHTML = `
        <div class="key-main">
          <span class="stripped-key-name">${cleanLabel}</span>
          <div class="stripped-key-val-wrapper">
            <span>${displayVal || '<empty>'}</span>
            <button class="eye-btn" data-key="${key}" title="Toggle secret visibility">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                ${state.unmaskedKeys[key] ? 
                  `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>` :
                  `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
                }
              </svg>
            </button>
          </div>
        </div>
        <div class="key-env-switcher" aria-label="Environment for ${key}">
          ${envOptions}
        </div>
      `;

      row.onclick = (event) => {
        if (event.target.closest('.key-env-switcher, .eye-btn')) {
          return;
        }
        openDrawer(groupName, [key]);
      };

      row.querySelectorAll('.key-env-option').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          setKeyActiveEnv(key, btn.getAttribute('data-env'));
          renderEnvironmentSlider();
          renderServiceGroups(filter);
          triggerBackgroundPings();
        };
      });

      const keyEnvSelect = row.querySelector('.key-env-select');
      if (keyEnvSelect) {
        keyEnvSelect.onchange = (e) => {
          e.stopPropagation();
          setKeyActiveEnv(key, e.target.value);
          renderEnvironmentSlider();
          renderServiceGroups(filter);
          triggerBackgroundPings();
        };
        keyEnvSelect.onclick = (e) => e.stopPropagation();
      }

      // Attach Toggle Mask Eye click
      row.querySelector('.eye-btn').onclick = (e) => {
        e.stopPropagation(); // Avoid opening drawer
        state.unmaskedKeys[key] = !state.unmaskedKeys[key];
        renderServiceGroups(filter);
      };

      keysListContainer.appendChild(row);
    });

    groupedList.appendChild(groupSection);
  });

  variablesContainer.appendChild(groupedList);
  updateHealthBadges();
}

searchInput.addEventListener('input', (e) => renderServiceGroups(e.target.value));

// --- sliding Drawer Controls ---
function openDrawer(groupName, keysList) {
  activeDrawerGroup = groupName;
  drawerTitle.innerText = `${groupName} Integration Settings`;
  drawerContent.innerHTML = '';
  const availableGroups = getAvailableGroupNames();

  keysList.forEach(key => {
    const keyData = state.keys[key];
    const keySchema = getKeySchema(key);
    const validationType = keySchema.validation?.type || keyData.validation?.type || 'none';
    const card = document.createElement('div');
    card.className = 'drawer-var-card';
    
    // Header key
    card.innerHTML = `
      <span class="drawer-var-name">${key}</span>
      <div id="envs-inputs-container-${key.replace(/\$/g, '_')}"></div>
      
      <div class="drawer-var-settings">
        <div>
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:4px;">Service Group</label>
          <div class="drawer-group-combobox" data-key="${key}">
            <div class="drawer-group-input-wrap">
              <input
                type="text"
                class="dropdown-select drawer-group-input"
                data-key="${key}"
                value="${keySchema.group || keyData.group || ''}"
                style="width:100%; box-sizing:border-box;"
                placeholder="${getGroupNameForKey(key)}"
                autocomplete="off"
              >
              <button type="button" class="drawer-group-toggle" aria-label="Show service groups" aria-expanded="false">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
            <div class="drawer-group-menu" hidden></div>
          </div>
          <div class="drawer-field-hint">Choose an existing group or type a new one.</div>
        </div>
        <div>
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:4px;">Validation Mode</label>
          <select class="dropdown-select drawer-type-select" data-key="${key}" style="width:100%;">${buildValidatorOptionsHtml(validationType)}</select>
        </div>
        <div>
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:4px;">Comment Note</label>
          <input type="text" class="dropdown-select drawer-note-input" data-key="${key}" value="${keySchema.note || keyData.note || ''}" style="width:100%; box-sizing:border-box;" placeholder="Add helpful inline note...">
        </div>
        <div>
          <label class="drawer-required-label"><input type="checkbox" class="drawer-required-input" data-key="${key}" ${keySchema.required ? 'checked' : ''}> Required key</label>
        </div>
      </div>
    `;

    const inputsContainer = card.querySelector(`#envs-inputs-container-${key.replace(/\$/g, '_')}`);
    
    // Create input fields for each environment
    state.environments.forEach(env => {
      const row = document.createElement('div');
      row.className = 'drawer-var-row';
      row.innerHTML = `
        <label>${env} value</label>
        <input type="text" class="env-val-input" data-key="${key}" data-env="${env}" value="${keyData.values[env] || ''}" placeholder="Empty value">
      `;
      inputsContainer.appendChild(row);
    });

    // Populate active selector
    const sel = card.querySelector('.drawer-type-select');
    sel.value = validationType;
    attachGroupCombobox(card, key, availableGroups);

    drawerContent.appendChild(card);
  });

  drawerOverlay.style.display = 'block';
  setTimeout(() => {
    drawerOverlay.style.opacity = '1';
    slidingDrawer.classList.add('show');
  }, 10);
}

function closeDrawer() {
  slidingDrawer.classList.remove('show');
  drawerOverlay.style.opacity = '0';
  setTimeout(() => {
    drawerOverlay.style.display = 'none';
  }, 300);
}

btnCloseDrawer.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

// Apply Drawer changes
btnDrawerApply.addEventListener('click', () => {
  if (!activeDrawerGroup) return;

  // Read drawer inputs
  const valInputs = drawerContent.querySelectorAll('.env-val-input');
  const groupInputs = drawerContent.querySelectorAll('.drawer-group-input');
  const typeSelects = drawerContent.querySelectorAll('.drawer-type-select');
  const noteInputs = drawerContent.querySelectorAll('.drawer-note-input');
  const requiredInputs = drawerContent.querySelectorAll('.drawer-required-input');

  valInputs.forEach(input => {
    const key = input.getAttribute('data-key');
    const env = input.getAttribute('data-env');
    state.keys[key].values[env] = input.value;
  });

  groupInputs.forEach(input => {
    const key = input.getAttribute('data-key');
    const group = normalizeGroupName(input.value);
    if (group) {
      state.keys[key].group = group;
      getKeySchema(key).group = group;
    } else {
      delete state.keys[key].group;
      delete getKeySchema(key).group;
    }
  });

  typeSelects.forEach(select => {
    const key = select.getAttribute('data-key');
    const type = select.value;
    state.keys[key].validation = { type };
    getKeySchema(key).validation = { type };
  });

  noteInputs.forEach(input => {
    const key = input.getAttribute('data-key');
    const note = input.value;
    state.keys[key].note = note;
    getKeySchema(key).note = note;
  });

  requiredInputs.forEach(input => {
    const key = input.getAttribute('data-key');
    getKeySchema(key).required = input.checked;
  });

  logEvent(`Updated local configurations for variables in ${activeDrawerGroup}`, 'INFO');
  closeDrawer();
  renderServiceGroups();
  triggerBackgroundPings();
  showToast('Overrides Applied Locally');
});


// --- Manage Environments Controls ---
btnManageEnvs.addEventListener('click', () => {
  envModal.classList.add('show');
  renderEnvManageList();
});

btnCloseEnvModal.addEventListener('click', () => envModal.classList.remove('show'));

function renderEnvManageList() {
  envListItems.innerHTML = '';
  state.environments.forEach(env => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="env-name-span">${env}</span>
      <button class="env-delete-btn" data-env="${env}">Delete</button>
    `;
    
    li.querySelector('.env-delete-btn').onclick = () => {
      if (state.environments.length <= 1) {
        showToast('You must keep at least one environment!');
        return;
      }
      
      // Remove env
      state.environments = state.environments.filter(e => e !== env);
      
      // Clean values
      Object.keys(state.keys).forEach(key => {
        delete state.keys[key].values[env];
      });
      
      if (state.activeEnvironment === env) {
        state.activeEnvironment = state.environments[0];
      }

      logEvent(`Environment stage deleted: ${env}`, 'INFO');
      renderEnvManageList();
      renderEnvironmentSlider();
      renderServiceGroups();
      triggerBackgroundPings();
      showToast(`${env} Removed`);
    };

    envListItems.appendChild(li);
  });
}

// Add New Environment stage
btnAddEnv.addEventListener('click', () => {
  const val = newEnvInput.value.trim().toLowerCase();
  if (!val) return;
  if (state.environments.includes(val)) {
    showToast('Environment already exists');
    return;
  }

  state.environments.push(val);
  newEnvInput.value = '';

  // Seed empty placeholder values
  Object.keys(state.keys).forEach(key => {
    state.keys[key].values[val] = '';
  });

  logEvent(`New environment stage added: ${val}`, 'INFO');
  renderEnvManageList();
  renderEnvironmentSlider();
  renderServiceGroups();
  showToast(`${val} Environment Added`);
});

function updateProjectChrome() {
  const hasProject = Boolean(state.activeProjectPath);

  if (viewWorkspace) {
    viewWorkspace.classList.toggle('has-active-project', hasProject);
  }

  closeProjectButtons.forEach(btn => {
    btn.disabled = !hasProject;
  });

  if (hasProject) {
    const folderName = state.activeProjectPath.split(/[\\/]/).pop();
    projectPathDisplay.innerText = state.activeProjectPath;
    projectPathDisplay.title = state.activeProjectPath;
    if (projectNameHeader) projectNameHeader.innerText = folderName;
    if (topPathIndicator) {
      topPathIndicator.innerText = state.activeProjectPath;
      topPathIndicator.title = state.activeProjectPath;
    }
  } else {
    projectPathDisplay.innerText = 'No Project Open';
    projectPathDisplay.removeAttribute('title');
    if (projectNameHeader) projectNameHeader.innerText = 'No Project Open';
    if (topPathIndicator) {
      topPathIndicator.innerText = 'Open a project folder to manage environment variables';
      topPathIndicator.removeAttribute('title');
    }
  }

  renderRecentProjectsList();
}

async function closeProject() {
  if (!state.activeProjectPath) return;

  const closedPath = state.activeProjectPath;
  logEvent(`Closing workspace: ${closedPath}`, 'INFO');

  state.activeProjectPath = null;
  state.keys = {};
  state.schema = { version: 1, keys: {} };
  state.environments = ['local', 'test', 'deployment'];
  state.activeEnvironment = 'local';
  state.availableFiles = [];
  state.selectedTargetFile = '.env.local';
  connectionStatusCache = {};

  if (searchInput) searchInput.value = '';

  try {
    await window.api.clearActiveProject();
  } catch (err) {
    console.error('Failed to clear active project:', err);
  }

  updateProjectChrome();
  renderServiceGroups();
  showToast('Project closed');
}

// Load Project Handler
async function loadProject(dir) {
  if (!dir) return;
  
  try {
    state.activeProjectPath = dir;
    updateProjectChrome();
    logEvent(`Loading workspace: ${dir}`);
    
    const data = await window.api.loadProjectData(dir);
    state.keys = data.config.keys;
    state.schema = data.schema || { version: 1, keys: {} };
    state.environments = data.config.environments;
    state.activeEnvironment = data.config.activeEnvironment || 'local';
    state.availableFiles = data.availableFiles;
    state.selectedTargetFile = data.activeTargetFile;

    Object.keys(state.keys).forEach(key => {
      if (!state.keys[key].active || !state.environments.includes(state.keys[key].active)) {
        state.keys[key].active = state.activeEnvironment;
      }
    });

    // Populate target select
    targetEnvSelect.innerHTML = '';
    state.availableFiles.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.innerText = f;
      if (f === state.selectedTargetFile) opt.selected = true;
      targetEnvSelect.appendChild(opt);
    });

    renderEnvironmentSlider();
    renderServiceGroups();
    triggerBackgroundPings();
    showToast('Project Loaded');

    // Sync recent projects sidebar
    await refreshRecentProjects();

    // Desync Check
    if (data.externalDesync && data.parsedEnvLocal) {
      logEvent(`Cold boot desync detected. External changes found.`, 'WARN');
      syncModal.classList.add('show');
      
      btnSyncImport.onclick = () => {
        // Import new keys
        for (const [k, v] of Object.entries(data.parsedEnvLocal)) {
          if (!state.keys[k]) {
            state.keys[k] = { values: {}, note: v.note, active: 'local', validation: { type: 'none' } };
            getKeySchema(k).note = v.note || '';
          }
          state.keys[k].values[state.activeEnvironment] = v.value;
        }
        syncModal.classList.remove('show');
        renderServiceGroups();
        triggerBackgroundPings();
        logEvent('External changes synced into Envie database.', 'INFO');
        showToast('Synced successfully');
      };

      btnSyncOverwrite.onclick = () => {
        syncModal.classList.remove('show');
        logEvent('Opted to overwrite external changes on next save.', 'INFO');
      };
    }
  } catch (err) {
    logEvent(`Failed to load workspace data: ${err.message}`, 'ERROR');
    showToast('Load Failed');
  }
}

async function handleOpenProject() {
  const dir = await window.api.selectProjectDir();
  if (dir) {
    await loadProject(dir);
  }
}

openProjectButtons.forEach(btn => btn.addEventListener('click', handleOpenProject));
closeProjectButtons.forEach(btn => btn.addEventListener('click', closeProject));

// Sync Recent Projects Sidebar List
async function refreshRecentProjects() {
  try {
    const { recentProjects } = await window.api.getRecentProjects();
    state.recentProjects = recentProjects || [];
    renderRecentProjectsList();
  } catch (err) {
    console.error('Failed to retrieve recent projects:', err);
  }
}

function renderRecentProjectsList() {
  const list = document.getElementById('recent-projects-list');
  if (!list) return;
  list.innerHTML = '';
  
  if (state.recentProjects.length === 0) {
    list.innerHTML = '<li class="empty-recent">No projects loaded</li>';
    return;
  }
  
  state.recentProjects.forEach(p => {
    const li = document.createElement('li');
    const isActive = state.activeProjectPath && p === state.activeProjectPath;
    li.className = `recent-project-item${isActive ? ' active' : ''}`;
    const folderName = p.split(/[\\/]/).pop();
    li.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <span class="proj-name" title="${p}">${folderName}</span>
    `;
    li.onclick = () => {
      logEvent(`Switching workspace to recent project: ${p}`);
      loadProject(p);
    };
    list.appendChild(li);
  });
}

// Manual Sync Button Handler
document.getElementById('btn-sync-project').addEventListener('click', async () => {
  if (!state.activeProjectPath) return;

  logEvent(`Manual workspace synchronization triggered for: ${state.activeProjectPath}`, 'INFO');
  const btnSyncProject = document.getElementById('btn-sync-project');
  const oldText = btnSyncProject.innerHTML;
  btnSyncProject.innerHTML = 'Syncing...';
  btnSyncProject.disabled = true;

  try {
    await loadProject(state.activeProjectPath);
    logEvent('Workspace is fully in sync with disk.', 'INFO');
    showToast('Workspace Synchronized!');
  } catch (err) {
    logEvent(`Workspace sync failed: ${err.message}`, 'ERROR');
    showToast('Sync Failed');
  } finally {
    btnSyncProject.innerHTML = oldText;
    btnSyncProject.disabled = false;
  }
});

// Apply diff modal elements
const applyDiffModal = document.getElementById('apply-diff-modal');
const applyDiffMount = document.getElementById('apply-diff-mount');
const applyValidationBanner = document.getElementById('apply-validation-banner');
const applyRevealSecrets = document.getElementById('apply-reveal-secrets');
const btnApplyCancel = document.getElementById('btn-apply-cancel');
const btnApplyForce = document.getElementById('btn-apply-force');
const btnApplyConfirm = document.getElementById('btn-apply-confirm');
const btnCloseApplyDiff = document.getElementById('btn-close-apply-diff');
const applyHistoryList = document.getElementById('apply-history-list');

function renderApplyValidationBanner(validation) {
  if (!validation || (!validation.errors?.length && !validation.warnings?.length)) {
    applyValidationBanner.hidden = true;
    applyValidationBanner.innerHTML = '';
    return;
  }

  const items = [
  ...(validation.errors || []).map((e) => `<li class="validation-error">${e.message}</li>`),
  ...(validation.warnings || []).map((w) => `<li class="validation-warning">${w.message}</li>`)
  ].join('');

  applyValidationBanner.hidden = false;
  applyValidationBanner.innerHTML = `<ul class="validation-list">${items}</ul>`;
  btnApplyForce.disabled = !(validation.errors?.length);
  btnApplyConfirm.disabled = validation.errors?.length > 0;
}

function renderApplyDiffModal() {
  if (!applyPreviewCache) return;
  const reveal = applyRevealSecrets.checked;
  const maskFn = (text) => (window.maskEnvContent ? window.maskEnvContent(text) : text);

  window.renderCodeComparison(applyDiffMount, {
    filename: applyPreviewCache.targetFile,
    revealSecrets: reveal,
    maskFn,
    diffRows: applyPreviewCache.diffRows
  });
}

async function loadApplyHistoryList() {
  if (!applyHistoryList || !state.activeProjectPath) return;
  const history = await window.api.listApplyHistory(state.activeProjectPath);
  applyHistoryList.innerHTML = '';

  if (!history.length) {
    applyHistoryList.innerHTML = '<li class="apply-history-empty">No apply history yet</li>';
    return;
  }

  history.slice(0, 5).forEach((snap) => {
    const li = document.createElement('li');
    const when = new Date(snap.createdAt).toLocaleString();
    li.innerHTML = `
      <span>${when} — ${snap.targetFile} (${snap.activeEnvironment})</span>
      <button type="button" class="btn btn-secondary btn-restore-snapshot" data-id="${snap.id}">Restore</button>
    `;
    li.querySelector('.btn-restore-snapshot').onclick = async () => {
      if (!confirm(`Restore ${snap.targetFile} to the state before this apply?`)) return;
      const res = await window.api.restoreApplySnapshot(state.activeProjectPath, snap.id);
      if (res.success) {
        logEvent(`Restored snapshot ${snap.id} to ${res.targetFile}`, 'INFO');
        showToast('Snapshot restored');
        closeApplyDiffModal();
        await loadProject(state.activeProjectPath);
      } else {
        logEvent(`Restore failed: ${res.error}`, 'ERROR');
        showToast('Restore failed');
      }
    };
    applyHistoryList.appendChild(li);
  });
}

function openApplyDiffModal(preview) {
  applyPreviewCache = preview;
  renderApplyValidationBanner(preview.validation);
  renderApplyDiffModal();
  loadApplyHistoryList();
  applyDiffModal.classList.add('show');
}

function closeApplyDiffModal() {
  applyDiffModal.classList.remove('show');
  applyPreviewCache = null;
}

btnApplyCancel.addEventListener('click', closeApplyDiffModal);
btnCloseApplyDiff.addEventListener('click', closeApplyDiffModal);
applyRevealSecrets.addEventListener('change', renderApplyDiffModal);

btnApplyConfirm.addEventListener('click', async () => {
  if (!applyPreviewCache || !state.activeProjectPath) return;
  btnApplyConfirm.disabled = true;
  const res = await window.api.confirmApply(
    state.activeProjectPath,
    buildConfigPayload(),
    state.schema,
    applyPreviewCache.targetFile,
    { force: false }
  );
  btnApplyConfirm.disabled = false;

  if (res.success) {
    logEvent(`Applied to ${applyPreviewCache.targetFile} (snapshot ${res.snapshotId})`, 'INFO');
    showToast(`Applied to ${applyPreviewCache.targetFile}`);
    closeApplyDiffModal();
    await loadProject(state.activeProjectPath);
  } else {
    logEvent(`Apply failed: ${res.error}`, 'ERROR');
    showToast('Apply failed');
  }
});

btnApplyForce.addEventListener('click', async () => {
  if (!applyPreviewCache || !state.activeProjectPath) return;
  const res = await window.api.confirmApply(
    state.activeProjectPath,
    buildConfigPayload(),
    state.schema,
    applyPreviewCache.targetFile,
    { force: true }
  );

  if (res.success) {
    logEvent(`Force-applied to ${applyPreviewCache.targetFile} (snapshot ${res.snapshotId})`, 'WARN');
    showToast(`Applied to ${applyPreviewCache.targetFile}`);
    closeApplyDiffModal();
    await loadProject(state.activeProjectPath);
  } else {
    logEvent(`Force apply failed: ${res.error}`, 'ERROR');
    showToast('Apply failed');
  }
});

btnSaveEnv.addEventListener('click', async () => {
  if (!state.activeProjectPath) return;

  const targetFile = targetEnvSelect.value;
  if (!targetFile || targetFile === '.envie') {
    showToast('Invalid target output file');
    logEvent('Error: Target output file cannot be empty or .envie', 'ERROR');
    return;
  }

  const oldText = btnSaveEnv.innerHTML;
  btnSaveEnv.innerText = 'Preparing...';

  const preview = await window.api.previewApply(
    state.activeProjectPath,
    buildConfigPayload(),
    state.schema,
    targetFile
  );

  btnSaveEnv.innerHTML = oldText;

  if (preview.error) {
    logEvent(`Preview failed: ${preview.error}`, 'ERROR');
    showToast('Preview failed');
    return;
  }

  openApplyDiffModal(preview);
});

targetEnvSelect.addEventListener('change', (e) => {
  state.selectedTargetFile = e.target.value;
  logEvent(`Target output file changed to ${e.target.value}`);
});

// Init Version Watermark & Boot App
window.api.getSystemInfo().then(info => {
  const versionEl = document.querySelector('.app-version');
  if (versionEl) {
    versionEl.innerText = `v${info.appVersion || '1.0.0-alpha'}`;
  }
});

// Load recent projects and last active project on startup!
async function initApp() {
  try {
    validatorTypes = (await window.api.getValidatorTypes()) || [];
    const { recentProjects, lastActiveProject } = await window.api.getRecentProjects();
    state.recentProjects = recentProjects || [];
    updateProjectChrome();

    if (lastActiveProject) {
      logEvent(`Auto-loading last active workspace: ${lastActiveProject}`, 'INFO');
      await loadProject(lastActiveProject);
    } else {
      renderServiceGroups();
    }
  } catch (err) {
    console.error('App init failed:', err);
    updateProjectChrome();
    renderServiceGroups();
  }
}

initApp();
