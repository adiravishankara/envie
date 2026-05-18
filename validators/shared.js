const net = require('net');
const https = require('https');
const http = require('http');

const DEFAULT_TIMEOUT_MS = 8000;

function createResult(status, message, extra = {}) {
  const severityMap = {
    connected: 'success',
    auth_error: 'warning',
    unreachable: 'error',
    invalid: 'error',
    untested: 'neutral'
  };
  const colorMap = {
    connected: 'green',
    auth_error: 'orange',
    unreachable: 'red',
    invalid: 'red',
    untested: 'gray'
  };

  return {
    status,
    severity: extra.severity || severityMap[status] || 'error',
    message,
    details: extra.details || null,
    statusCode: extra.statusCode,
    checkedAt: new Date().toISOString(),
    color: colorMap[status] || 'red',
    error: status === 'connected' ? undefined : message
  };
}

function requestUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('Invalid URL format'));
      return;
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const method = options.method || 'GET';
    const timeout = options.timeout || DEFAULT_TIMEOUT_MS;

    const req = lib.request(
      url,
      { method, headers: options.headers || {}, timeout },
      (res) => {
        res.resume();
        resolve({ statusCode: res.statusCode });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Connection timeout'));
    });
    req.on('error', reject);
    req.setTimeout(timeout);
    req.end();
  });
}

function findProjectValue(projectKeys, environment, matcher) {
  for (const [keyName, keyData] of Object.entries(projectKeys || {})) {
    const val = (keyData.values && keyData.values[environment]) || '';
    if (!val) continue;
    if (matcher(keyName, val)) return val;
  }
  return '';
}

function testTcp(url) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const dbProtocols = ['postgresql:', 'postgres:', 'mysql:', 'mongodb:', 'redis:'];
      const defaultPort = dbProtocols.includes(parsedUrl.protocol)
        ? 5432
        : parsedUrl.protocol === 'https:'
          ? 443
          : 80;
      const port = parsedUrl.port || defaultPort;
      const host = parsedUrl.hostname;

      const socket = new net.Socket();
      socket.setTimeout(2500);

      socket.on('connect', () => {
        socket.destroy();
        resolve(createResult('connected', `TCP connection OK (${host}:${port})`));
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(createResult('unreachable', 'Connection timeout'));
      });

      socket.on('error', (err) => {
        resolve(createResult('unreachable', err.message));
      });

      socket.connect(Number(port), host);
    } catch {
      resolve(createResult('invalid', 'Invalid URL format'));
    }
  });
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  createResult,
  requestUrl,
  findProjectValue,
  testTcp
};
