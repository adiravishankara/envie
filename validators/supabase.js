const { createResult, requestUrl, findProjectValue } = require('./shared');

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

async function validate(value, context) {
  const { url, apiKey } = resolveSupabasePair(value, context);

  if (!url) {
    return createResult('invalid', 'Supabase project URL is required');
  }
  if (!apiKey) {
    return createResult(
      'invalid',
      'Supabase API key is required (add anon/service key in this environment)'
    );
  }

  const baseUrl = url.replace(/\/$/, '');
  const testUrl = `${baseUrl}/rest/v1/`;

  try {
    const { statusCode } = await requestUrl(testUrl, {
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
    });

    if (statusCode >= 200 && statusCode < 300) {
      return createResult('connected', 'Supabase REST API authorized', { statusCode });
    }
    if (statusCode === 401 || statusCode === 403) {
      return createResult('auth_error', 'Supabase rejected API key', { statusCode });
    }
    return createResult('unreachable', `Supabase returned HTTP ${statusCode}`, { statusCode });
  } catch (err) {
    return createResult('unreachable', err.message);
  }
}

module.exports = { validate };
