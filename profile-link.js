const fs = require('fs');
const path = require('path');
const envParser = require('./env-parser');

const DEFAULT_MOUNT_TARGET = '.env.local';

function profileSlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'profile';
}

function profilesDir(projectPath) {
  return path.join(projectPath, '.envie', 'profiles');
}

function profileRelPath(environment) {
  return path.posix.join('.envie', 'profiles', `${profileSlug(environment)}.env`);
}

function profileAbsPath(projectPath, environment) {
  return path.join(profilesDir(projectPath), `${profileSlug(environment)}.env`);
}

function resolveProjectFile(projectPath, filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Missing filename');
  }
  if (filename !== path.basename(filename) && !filename.startsWith('.envie/')) {
    // Allow only project-root basenames for the mount target.
    if (filename.includes('..') || path.isAbsolute(filename)) {
      throw new Error(`Refusing to touch ${filename}`);
    }
  }
  if (filename.includes('..')) {
    throw new Error(`Refusing to touch ${filename}`);
  }

  const root = path.resolve(projectPath);
  const full = path.resolve(root, filename);
  const relative = path.relative(root, full);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to touch ${filename}`);
  }
  return full;
}

function getMountTarget(config) {
  const target = config?.mount?.target || DEFAULT_MOUNT_TARGET;
  if (target === '.envie' || target.startsWith('.envie/') || target.includes('..')) {
    return DEFAULT_MOUNT_TARGET;
  }
  return path.basename(target) === target ? target : DEFAULT_MOUNT_TARGET;
}

function getMountMode(config) {
  return config?.mount?.mode === 'copy' ? 'copy' : 'symlink';
}

function renderProfile(keys, environment) {
  return envParser.stringify(keys, environment, { profile: true });
}

function ensureProfilesDir(projectPath) {
  const dir = profilesDir(projectPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeProfileFiles(projectPath, config) {
  ensureProfilesDir(projectPath);
  const written = [];

  for (const environment of config.environments || []) {
    const content = renderProfile(config.keys, environment);
    const abs = profileAbsPath(projectPath, environment);
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    envParser.safeWrite(abs, content);
    written.push({
      environment,
      relPath: profileRelPath(environment),
      before,
      after: content,
      existed: Boolean(before) || fs.existsSync(abs)
    });
  }

  return written;
}

function readMount(projectPath, targetFile) {
  const abs = resolveProjectFile(projectPath, targetFile);
  let exists = false;
  let symlink = false;
  let linkTarget = null;
  let content = '';

  try {
    const stat = fs.lstatSync(abs);
    exists = true;
    symlink = stat.isSymbolicLink();
    if (symlink) {
      linkTarget = fs.readlinkSync(abs);
      try {
        content = fs.readFileSync(abs, 'utf8');
      } catch {
        content = '';
      }
    } else if (stat.isFile()) {
      content = fs.readFileSync(abs, 'utf8');
    }
  } catch {
    exists = false;
  }

  return { exists, symlink, linkTarget, content, abs };
}

function expectedLinkTarget(environment) {
  // Relative from project root — portable across machines.
  return profileRelPath(environment);
}

function inspectMount(projectPath, config) {
  const targetFile = getMountTarget(config);
  const activeEnvironment = config.activeEnvironment || (config.environments || [])[0] || 'local';
  const mode = getMountMode(config);
  const expected = expectedLinkTarget(activeEnvironment);
  const mount = readMount(projectPath, targetFile);
  const activeProfileAbs = profileAbsPath(projectPath, activeEnvironment);
  const activeProfileContent = fs.existsSync(activeProfileAbs)
    ? fs.readFileSync(activeProfileAbs, 'utf8')
    : renderProfile(config.keys, activeEnvironment);

  const pointsAtActive =
    mount.symlink &&
    path.normalize(mount.linkTarget || '') === path.normalize(expected);

  const contentMatches =
    mount.exists && mount.content === activeProfileContent;

  let status = 'missing';
  if (mount.exists && pointsAtActive) status = 'linked';
  else if (mount.exists && mode === 'copy' && contentMatches) status = 'copied';
  else if (mount.exists && mount.symlink) status = 'wrong-link';
  else if (mount.exists) status = 'plain-file';

  return {
    targetFile,
    activeEnvironment,
    mode,
    expectedLink: expected,
    status,
    exists: mount.exists,
    symlink: mount.symlink,
    linkTarget: mount.linkTarget,
    content: mount.content,
    activeProfileContent,
    needsReplace: mount.exists && status === 'plain-file' && !contentMatches,
    inSync: status === 'linked' || status === 'copied'
  };
}

function removePath(absPath) {
  try {
    fs.lstatSync(absPath);
    fs.unlinkSync(absPath);
  } catch {
    /* missing */
  }
}

function trySymlink(projectPath, targetFile, environment) {
  const abs = resolveProjectFile(projectPath, targetFile);
  const linkTarget = expectedLinkTarget(environment);
  const profileAbs = profileAbsPath(projectPath, environment);
  if (!fs.existsSync(profileAbs)) {
    throw new Error(`Profile file missing: ${linkTarget}`);
  }

  removePath(abs);
  try {
    fs.symlinkSync(linkTarget, abs, 'file');
    return { mode: 'symlink', linkTarget };
  } catch (err) {
    // Windows without Developer Mode often rejects file symlinks.
    envParser.safeWrite(abs, fs.readFileSync(profileAbs, 'utf8'));
    return {
      mode: 'copy',
      linkTarget: null,
      fallbackReason: err.message
    };
  }
}

function applyCopyMount(projectPath, targetFile, environment) {
  const abs = resolveProjectFile(projectPath, targetFile);
  const profileAbs = profileAbsPath(projectPath, environment);
  if (!fs.existsSync(profileAbs)) {
    throw new Error(`Profile file missing for ${environment}`);
  }
  removePath(abs);
  envParser.safeWrite(abs, fs.readFileSync(profileAbs, 'utf8'));
  return { mode: 'copy', linkTarget: null };
}

function remount(projectPath, config, options = {}) {
  writeProfileFiles(projectPath, config);

  const targetFile = getMountTarget(config);
  const activeEnvironment = config.activeEnvironment || (config.environments || [])[0];
  if (!activeEnvironment) {
    throw new Error('No active environment to mount');
  }

  const preferredMode = options.forceMode || getMountMode(config);
  const before = readMount(projectPath, targetFile);
  let result;

  if (preferredMode === 'copy') {
    result = applyCopyMount(projectPath, targetFile, activeEnvironment);
  } else {
    result = trySymlink(projectPath, targetFile, activeEnvironment);
  }

  return {
    targetFile,
    activeEnvironment,
    before,
    mode: result.mode,
    linkTarget: result.linkTarget,
    fallbackReason: result.fallbackReason || null
  };
}

function ensureMountGitignore(projectPath, targetFile) {
  const gitignorePath = path.join(projectPath, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return false;

  let content = fs.readFileSync(gitignorePath, 'utf8');
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  let changed = false;

  if (!lines.includes('.envie/')) {
    content = `${content.trimEnd()}\n\n# Envie Local Config Folder\n.envie/\n`;
    changed = true;
  }
  if (targetFile && !lines.includes(targetFile)) {
    content = `${content.trimEnd()}\n# Envie mount target (symlink or copy of active profile)\n${targetFile}\n`;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(gitignorePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  }
  return changed;
}

function syncKeyActives(config, environment) {
  for (const keyData of Object.values(config.keys || {})) {
    keyData.active = environment;
  }
  config.activeEnvironment = environment;
  return config;
}

module.exports = {
  DEFAULT_MOUNT_TARGET,
  profileSlug,
  profileRelPath,
  profileAbsPath,
  resolveProjectFile,
  getMountTarget,
  getMountMode,
  renderProfile,
  writeProfileFiles,
  readMount,
  inspectMount,
  remount,
  ensureMountGitignore,
  syncKeyActives
};
