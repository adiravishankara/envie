const { createResult, requestUrl, findProjectValue } = require('./shared');

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

async function validatePublishableKey(publishableKey) {
  if (!publishableKey.startsWith('pk_')) {
    return createResult('invalid', 'Clerk check requires a publishable key (pk_test_... or pk_live_...)');
  }

  const frontendApi = extractClerkFrontendApi(publishableKey);
  if (!frontendApi) {
    return createResult('invalid', 'Could not decode Clerk publishable key');
  }

  const base = frontendApi.replace(/\/$/, '');
  const testUrl = `${base}/v1/environment`;

  try {
    const { statusCode } = await requestUrl(testUrl);
    if (statusCode >= 200 && statusCode < 500) {
      return createResult('connected', 'Clerk frontend API reachable', { statusCode });
    }
    return createResult('unreachable', `Clerk gateway returned HTTP ${statusCode}`, { statusCode });
  } catch (err) {
    return createResult('unreachable', err.message);
  }
}

async function validate(value, context) {
  let publishableKey = value.startsWith('pk_') ? value : '';
  if (!publishableKey) {
    publishableKey = findProjectValue(context.projectKeys || {}, context.environment, (_keyName, val) =>
      val.startsWith('pk_')
    );
  }
  if (!publishableKey) {
    return createResult('invalid', 'Clerk publishable key (pk_...) is required');
  }
  return validatePublishableKey(publishableKey);
}

module.exports = { validate };
