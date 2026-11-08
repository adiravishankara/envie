const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const profileLink = require('../profile-link');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'envie-profile-'));
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n', 'utf8');
  return root;
}

function sampleConfig(active = 'local') {
  return {
    environments: ['local', 'staging', 'production'],
    activeEnvironment: active,
    mount: { target: '.env.local', mode: 'symlink' },
    keys: {
      DATABASE_URL: {
        values: {
          local: 'postgres://localhost/local',
          staging: 'postgres://localhost/staging',
          production: 'postgres://localhost/prod'
        },
        active
      },
      PORT: {
        values: { local: '3000', staging: '3001', production: '8080' },
        active
      }
    }
  };
}

test('writes profiles under .envie/profiles and symlinks .env.local', () => {
  const root = makeProject();
  const config = sampleConfig('local');
  const remounted = profileLink.remount(root, config);

  assert.equal(remounted.mode, 'symlink');
  assert.equal(remounted.linkTarget, '.envie/profiles/local.env');

  const mountPath = path.join(root, '.env.local');
  const stat = fs.lstatSync(mountPath);
  assert.equal(stat.isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(mountPath), '.envie/profiles/local.env');

  const content = fs.readFileSync(mountPath, 'utf8');
  assert.match(content, /DATABASE_URL=postgres:\/\/localhost\/local/);
  assert.match(content, /PORT=3000/);

  assert.equal(
    fs.existsSync(path.join(root, '.envie', 'profiles', 'staging.env')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(root, '.envie', 'profiles', 'production.env')),
    true
  );
});

test('switching profiles repoints the symlink wholesale', () => {
  const root = makeProject();
  const config = sampleConfig('local');
  profileLink.remount(root, config);

  profileLink.syncKeyActives(config, 'production');
  const remounted = profileLink.remount(root, config);

  assert.equal(remounted.linkTarget, '.envie/profiles/production.env');
  assert.equal(fs.readlinkSync(path.join(root, '.env.local')), '.envie/profiles/production.env');
  assert.match(fs.readFileSync(path.join(root, '.env.local'), 'utf8'), /PORT=8080/);
});

test('copy fallback still mounts the active profile content', () => {
  const root = makeProject();
  const config = sampleConfig('staging');
  config.mount.mode = 'copy';
  const remounted = profileLink.remount(root, config);

  assert.equal(remounted.mode, 'copy');
  const mountPath = path.join(root, '.env.local');
  assert.equal(fs.lstatSync(mountPath).isSymbolicLink(), false);
  assert.match(fs.readFileSync(mountPath, 'utf8'), /postgres:\/\/localhost\/staging/);
});

test('inspectMount reports plain-file desync', () => {
  const root = makeProject();
  const config = sampleConfig('local');
  profileLink.writeProfileFiles(root, config);
  fs.writeFileSync(path.join(root, '.env.local'), 'PORT=9999\n', 'utf8');

  const mount = profileLink.inspectMount(root, config);
  assert.equal(mount.status, 'plain-file');
  assert.equal(mount.needsReplace, true);
  assert.equal(mount.inSync, false);
});

test('ensureMountGitignore ignores .envie and the mount target', () => {
  const root = makeProject();
  profileLink.ensureMountGitignore(root, '.env.local');
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /\.envie\//);
  assert.match(gitignore, /\.env\.local/);
});
