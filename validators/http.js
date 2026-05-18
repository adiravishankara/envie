const { createResult, requestUrl } = require('./shared');

async function validate(value) {
  if (!/^https?:\/\//i.test(value)) {
    return createResult('invalid', 'HTTP check requires a full URL (https://...)');
  }

  try {
    const { statusCode } = await requestUrl(value, { method: 'GET' });
    if (statusCode >= 200 && statusCode < 400) {
      return createResult('connected', `HTTP ${statusCode}`, { statusCode });
    }
    if (statusCode === 401 || statusCode === 403) {
      return createResult('auth_error', `HTTP ${statusCode} (unauthorized)`, { statusCode });
    }
    return createResult('unreachable', `HTTP ${statusCode}`, { statusCode });
  } catch (err) {
    return createResult('unreachable', err.message);
  }
}

module.exports = { validate };
