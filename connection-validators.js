const net = require('net');
const https = require('https');
const http = require('http');

const DEFAULT_TIMEOUT_MS = 8000;

function createResult(status, message, extra = {}) {
  const severity =
    status === 'success' ? 'ok' : status === 'auth_error' ? 'warn' : 'error';
  const color =
    status === 'success' ? 'green' : status === 'auth_error' ? 'orange' : 'red';

  return {
    status,
    severity,
    message,
    details: extra.details || null,
    statusCode: extra.statusCode,
    checkedAt: new Date().toISOString(),
    color,
    error: status === 'success' ? undefined : message
  };
}

function requestUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(new Error('Invalid URL format'));
      return;
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const method = options.method || 'GET';
    const timeout = options.timeout || DEFAULT_TIMEOUT_MS;

    const req = lib.request(
      url,
      {
        method,
        headers: options.headers || {},
        timeout
      },
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
        resolve(createResult('success', `TCP connection OK (${host}:${port})`));
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(createResult('error', 'Connection timeout'));
      });

      socket.on('error', (err) => {
        resolve(createResult('error', err.message));
      });

      socket.connect(Number(port), host);
    } catch (err) {
      resolve(createResult('error', 'Invalid URL format'));
    }
  });
}

function resolveSupabasePair(value, context) {
  const env = context.environment;
  const projectKeys = context.projectKeys || {};
  let url = /^https?:\/\//i.test(value) ? value : '';
  let apiKey = url ? '' : value;

  const pairedUrl = findProjectValue(projectKeys, env, (keyName, val) => {
    return keyName.toUpperCase().includes('SUPABASE') && /^https?:\/\//i.test(val);
  });
  const pairedKey = findProjectValue(projectKeys, env, (keyName, val) => {
    return (
      keyName.toUpperCase().includes('SUPABASE') &&
      !/^https?:\/\//i.test(val) &&
      val.length >= 20
    );
  });

  if (!url && pairedUrl) url = pairedUrl;
  if (!apiKey && pairedKey) apiKey = pairedKey;

  return { url, apiKey };
}

async function testSupabase(value, context) {
  const { url, apiKey } = resolveSupabasePair(value, context);

  if (!url) {
    return createResult('error', 'Supabase project URL is required');
  }
  if (!apiKey) {
    return createResult(
      'error',
      'Supabase API key is required (add anon/service key in this environment)'
    );
  }

  const baseUrl = url.replace(/\/$/, '');
  const testUrl = `${baseUrl}/rest/v1/`;

  try {
    const { statusCode } = await requestUrl(testUrl, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`
      }
    });

    if (statusCode >= 200 && statusCode < 300) {
      return createResult('success', 'Supabase REST API authorized', { statusCode });
    }
    if (statusCode === 401 || statusCode === 403) {
      return createResult('auth_error', 'Supabase rejected API key', { statusCode });
    }
    return createResult('error', `Supabase returned HTTP ${statusCode}`, { statusCode });
  } catch (err) {
    return createResult('error', err.message);
  }
}

function extractClerkFrontendApi(publishableKey) {
  const match = publishableKey.match(/^pk_(test|live)_(.+)$/);
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[2], 'base64').toString('utf8').replace(/\$$/, '');
    if (!decoded) return null;
    return decoded.startsWith('http') ? decoded : `https://${decoded}`;
  } catch {
    return null;
  }
}

async function testClerk(publishableKey) {
  if (!publishableKey.startsWith('pk_')) {
    return createResult('error', 'Clerk check requires a publishable key (pk_test_... or pk_live_...)');
  }

  const frontendApi = extractClerkFrontendApi(publishableKey);
  if (!frontendApi) {
    return createResult('error', 'Could not decode Clerk publishable key');
  }

  const base = frontendApi.replace(/\/$/, '');
  const testUrl = `${base}/v1/environment`;

  try {
    const { statusCode } = await requestUrl(testUrl);
    if (statusCode >= 200 && statusCode < 500) {
      return createResult('success', 'Clerk frontend API reachable', { statusCode });
    }
    return createResult('error', `Clerk gateway returned HTTP ${statusCode}`, { statusCode });
  } catch (err) {
    return createResult('error', err.message);
  }
}

async function testClerkWithContext(value, context) {
  let publishableKey = value.startsWith('pk_') ? value : '';
  if (!publishableKey) {
    publishableKey = findProjectValue(context.projectKeys || {}, context.environment, (_keyName, val) =>
      val.startsWith('pk_')
    );
  }
  if (!publishableKey) {
    return createResult('error', 'Clerk publishable key (pk_...) is required');
  }
  return testClerk(publishableKey);
}

async function testMapbox(token) {
  if (!token || token.length < 10) {
    return createResult('error', 'Mapbox access token is required');
  }

  const testUrl = `https://api.mapbox.com/tokens/v2?access_token=${encodeURIComponent(token)}`;

  try {
    const { statusCode } = await requestUrl(testUrl);
    if (statusCode === 200) {
      return createResult('success', 'Mapbox token authorized', { statusCode });
    }
    if (statusCode === 401 || statusCode === 403) {
      return createResult('auth_error', 'Mapbox rejected access token', { statusCode });
    }
    return createResult('error', `Mapbox returned HTTP ${statusCode}`, { statusCode });
  } catch (err) {
    return createResult('error', err.message);
  }
}

async function testResend(apiKey) {
  if (!apiKey || !apiKey.startsWith('re_')) {
    return createResult('error', 'Resend API key (re_...) is required');
  }

  try {
    const { statusCode } = await requestUrl('https://api.resend.com/domains', {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    if (statusCode >= 200 && statusCode < 300) {
      return createResult('success', 'Resend API authorized', { statusCode });
    }
    if (statusCode === 401 || statusCode === 403) {
      return createResult('auth_error', 'Resend rejected API key', { statusCode });
    }
    return createResult('error', `Resend returned HTTP ${statusCode}`, { statusCode });
  } catch (err) {
    return createResult('error', err.message);
  }
}

async function testHttp(url) {
  if (!/^https?:\/\//i.test(url)) {
    return createResult('error', 'HTTP check requires a full URL (https://...)');
  }

  try {
    const { statusCode } = await requestUrl(url, { method: 'GET' });
    if (statusCode >= 200 && statusCode < 400) {
      return createResult('success', `HTTP ${statusCode}`, { statusCode });
    }
    if (statusCode === 401 || statusCode === 403) {
      return createResult('auth_error', `HTTP ${statusCode} (unauthorized)`, { statusCode });
    }
    return createResult('error', `HTTP ${statusCode}`, { statusCode });
  } catch (err) {
    return createResult('error', err.message);
  }
}

const validators = {
  tcp: (value) => testTcp(value),
  supabase: (value, context) => testSupabase(value, context),
  clerk: (value, context) => testClerkWithContext(value, context),
  mapbox: (value) => testMapbox(value),
  resend: (value) => testResend(value),
  http: (value) => testHttp(value)
};

async function runConnectionTest(payload) {
  const { value, type } = payload || {};

  if (!value || !String(value).trim()) {
    return createResult('error', 'Value is empty');
  }

  if (!type || type === 'none') {
    return createResult('error', 'No validation type selected');
  }

  const validator = validators[type];
  if (!validator) {
    return createResult('error', `Unsupported validation type: ${type}`);
  }

  return validator(String(value).trim(), payload);
}

module.exports = {
  validators,
  runConnectionTest,
  createResult
};
