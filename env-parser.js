const fs = require('fs');
const path = require('path');

/**
 * Parses .env content into a structured object, extracting preceding comments as notes.
 * @param {string} content - Raw .env file content
 * @returns {object} Parsed keys with values and notes
 */
function parse(content) {
  const lines = content.split(/\r?\n/);
  const result = {};
  let currentComment = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) {
      currentComment = [];
      continue;
    }
    
    // Check if it's a comment
    if (line.startsWith('#')) {
      currentComment.push(line.replace(/^#\s*/, ''));
      continue;
    }

    // Match key-value
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();

      // Strip quotes if fully wrapped
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }

      result[key] = {
        value: val,
        note: currentComment.join('\n')
      };
      currentComment = [];
    } else {
      // Unrecognized line, reset comment
      currentComment = [];
    }
  }

  return result;
}

/**
 * Stringifies the structured project config into standard .env format.
 * @param {object} keys - The keys object from envie.json
 * @param {string} activeEnv - The current active environment (e.g. 'local')
 * @returns {string} Compiled .env file content
 */
function stringify(keys, activeEnv) {
  let output = '';
  for (const [keyName, keyData] of Object.entries(keys)) {
    // If there is a note, append it as a comment block
    if (keyData.note) {
      const noteLines = keyData.note.split('\n');
      for (const noteLine of noteLines) {
        output += `# ${noteLine}\n`;
      }
    }
    
    // Get the value for the active environment
    let val = keyData.values[activeEnv] || '';
    
    // If value contains spaces, wrap in double quotes
    if (val.includes(' ') && !val.startsWith('"') && !val.endsWith('"')) {
      val = `"${val}"`;
    }
    
    output += `${keyName}=${val}\n\n`;
  }
  return output.trim() + '\n';
}

/**
 * Atomically writes content to a file, creating any missing parent directories and a backup first.
 * @param {string} filePath - Target file path
 * @param {string} content - Content to write
 */
function safeWrite(filePath, content) {
  // Ensure the parent directory (like .envie) exists
  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const tmpPath = `${filePath}.tmp`;
  const bakPath = `${filePath}.bak`;

  // Create backup if target file already exists
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, bakPath);
  }

  // Atomic write via temp file
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Appends .envie/ and *.bak to .gitignore if it exists and isn't already ignored.
 * @param {string} projectDir - The root project directory
 */
function ensureGitignored(projectDir) {
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return; // No .gitignore found, nothing to do
  }

  let content = fs.readFileSync(gitignorePath, 'utf8');
  const lines = content.split(/\r?\n/).map(l => l.trim());
  
  let changed = false;
  
  if (!lines.includes('.envie/')) {
    content = content.trim() + '\n\n# Envie Local Config Folder\n.envie/\n';
    changed = true;
  }
  
  if (!lines.includes('*.bak')) {
    content = content.trim() + '\n*.bak\n';
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(gitignorePath, content.trim() + '\n', 'utf8');
  }
}

module.exports = {
  parse,
  stringify,
  safeWrite,
  ensureGitignored
};
