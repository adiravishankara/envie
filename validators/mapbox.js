const { createResult, requestUrl } = require('./shared');

async function validate(token) {
  if (!token || token.length < 10) {
    return createResult('invalid', 'Mapbox access token is required');
  }

  const testUrl = `https://api.mapbox.com/tokens/v2?access_token=${encodeURIComponent(token)}`;

  try {
    const { statusCode } = await requestUrl(testUrl);
    if (statusCode === 200) {
      return createResult('connected', 'Mapbox token authorized', { statusCode });
    }
    if (statusCode === 401 || statusCode === 403) {
      return createResult('auth_error', 'Mapbox rejected access token', { statusCode });
    }
    return createResult('unreachable', `Mapbox returned HTTP ${statusCode}`, { statusCode });
  } catch (err) {
    return createResult('unreachable', err.message);
  }
}

module.exports = { validate };
