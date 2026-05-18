const { createResult } = require('./shared');
const tcp = require('./tcp');
const http = require('./http');
const supabase = require('./supabase');
const clerk = require('./clerk');
const mapbox = require('./mapbox');
const resend = require('./resend');

const REGISTRY = [
  { id: 'none', label: 'None (Untested)', description: 'Skip connection validation' },
  { id: 'tcp', label: 'TCP Network Port', description: 'Raw TCP socket check for database URLs' },
  { id: 'clerk', label: 'Clerk Gateway Check', description: 'Verify Clerk publishable key via frontend API' },
  { id: 'supabase', label: 'Supabase Authorized REST', description: 'Query Supabase REST with API key' },
  { id: 'mapbox', label: 'Mapbox Auth Check', description: 'Validate Mapbox access token' },
  { id: 'resend', label: 'Resend Bearer Assert', description: 'Verify Resend API key' },
  { id: 'http', label: 'Generic HTTP REST GET', description: 'HEAD/GET request to a URL' }
];

const validators = {
  tcp: (value, ctx) => tcp.validate(value, ctx),
  http: (value, ctx) => http.validate(value, ctx),
  supabase: (value, ctx) => supabase.validate(value, ctx),
  clerk: (value, ctx) => clerk.validate(value, ctx),
  mapbox: (value, ctx) => mapbox.validate(value, ctx),
  resend: (value, ctx) => resend.validate(value, ctx)
};

function getValidatorTypes() {
  return REGISTRY.map(({ id, label, description }) => ({ id, label, description }));
}

function isValidValidatorType(type) {
  return REGISTRY.some((entry) => entry.id === type);
}

async function runValidator(type, value, context = {}) {
  if (!value || !String(value).trim()) {
    return createResult('invalid', 'Value is empty');
  }

  if (!type || type === 'none') {
    return createResult('untested', 'No validation type selected');
  }

  const validator = validators[type];
  if (!validator) {
    return createResult('invalid', `Unsupported validation type: ${type}`);
  }

  return validator(String(value).trim(), context);
}

/** @deprecated Use runValidator */
async function runConnectionTest(payload) {
  const { value, type, ...context } = payload || {};
  return runValidator(type, value, context);
}

module.exports = {
  getValidatorTypes,
  isValidValidatorType,
  runValidator,
  runConnectionTest,
  createResult,
  validators
};
