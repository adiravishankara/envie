const { createResult, requestUrl } = require('./shared');

async function validate(apiKey) {
  if (!apiKey || !apiKey.startsWith('re_')) {
    return createResult('invalid', 'Resend API key (re_...) is required');
  }

  try {
    const { statusCode } = await requestUrl('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    if (statusCode >= 200 && statusCode < 300) {
      return createResult('connected', 'Resend API authorized', { statusCode });
    }
    if (statusCode === 401 || statusCode === 403) {
      return createResult('auth_error', 'Resend rejected API key', { statusCode });
    }
    return createResult('unreachable', `Resend returned HTTP ${statusCode}`, { statusCode });
  } catch (err) {
    return createResult('unreachable', err.message);
  }
}

module.exports = { validate };
