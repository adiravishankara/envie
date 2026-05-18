const fs = require('fs');
const path = require('path');

const MAX_SNAPSHOTS = 20;

function historyDir(projectPath) {
  return path.join(projectPath, '.envie', 'history');
}

function listSnapshots(projectPath) {
  const dir = historyDir(projectPath);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        return {
          id: data.id,
          targetFile: data.targetFile,
          activeEnvironment: data.activeEnvironment,
          createdAt: data.createdAt
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function saveSnapshot(projectPath, payload) {
  const dir = historyDir(projectPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const record = {
    id,
    targetFile: payload.targetFile,
    activeEnvironment: payload.activeEnvironment,
    before: payload.before,
    after: payload.after,
    createdAt: new Date().toISOString()
  };

  const filePath = path.join(dir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');

  const all = listSnapshots(projectPath);
  if (all.length > MAX_SNAPSHOTS) {
    const toRemove = all.slice(MAX_SNAPSHOTS);
    for (const snap of toRemove) {
      try {
        fs.unlinkSync(path.join(dir, `${snap.id}.json`));
      } catch {
        /* ignore */
      }
    }
  }

  return id;
}

function getSnapshot(projectPath, snapshotId) {
  const filePath = path.join(historyDir(projectPath), `${snapshotId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function restoreSnapshot(projectPath, snapshotId) {
  const snap = getSnapshot(projectPath, snapshotId);
  if (!snap) {
    throw new Error('Snapshot not found');
  }

  const targetPath = path.join(projectPath, snap.targetFile);
  fs.writeFileSync(targetPath, snap.before, 'utf8');
  return { targetFile: snap.targetFile, restoredAt: new Date().toISOString() };
}

module.exports = {
  listSnapshots,
  saveSnapshot,
  getSnapshot,
  restoreSnapshot
};
