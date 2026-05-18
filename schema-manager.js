const fs = require('fs');
const path = require('path');
const { isValidValidatorType } = require('./validators');

const SENSITIVE_KEY_PATTERN = /(KEY|SECRET|PASSWORD|TOKEN|URL)/i;

function inferValidationType(keyName, value) {
  const k = keyName.toUpperCase();
  const v = String(value || '');

  if (k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('MYSQL') || k.includes('REDIS') || k.includes('MONGO')) {
    if (/^(postgresql?|mysql|mongodb|redis):/i.test(v)) return 'tcp';
  }
  if (k.includes('SUPABASE')) {
    if (/^https?:\/\//i.test(v)) return 'supabase';
    if (v.length >= 20) return 'supabase';
  }
  if (k.includes('CLERK')) return 'clerk';
  if (k.includes('MAPBOX')) return 'mapbox';
  if (k.includes('RESEND')) return 'resend';
  if (/^https?:\/\//i.test(v)) return 'http';
  return 'none';
}

function inferGroup(keyName) {
  const k = keyName.toUpperCase();
  if (k.includes('SUPABASE')) return 'Supabase';
  if (k.includes('CLERK')) return 'Clerk';
  if (k.includes('CONTENTFUL')) return 'Contentful';
  if (k.includes('MAPBOX')) return 'Mapbox';
  if (k.includes('RESEND')) return 'Resend';
  if (k.includes('DATABASE') || k.includes('DB_') || k.includes('POSTGRES') || k.includes('REDIS') || k.includes('MONGO') || k.includes('MYSQL')) {
    return 'Database';
  }
  return 'General';
}

function inferValueType(keyName, value) {
  if (/^https?:\/\//i.test(value)) return 'url';
  if (SENSITIVE_KEY_PATTERN.test(keyName)) return 'secret';
  return 'string';
}

function buildKeySchema(keyName, keyData, parsedNote) {
  const sampleValue = Object.values(keyData.values || {}).find((v) => v) || '';
  const validationType = keyData.validation?.type || inferValidationType(keyName, sampleValue);

  return {
    required: false,
    type: inferValueType(keyName, sampleValue),
    note: keyData.note || parsedNote || '',
    validation: { type: validationType },
    group: keyData.group || inferGroup(keyName)
  };
}

function migrateConfigToSchema(config, parsedEnv) {
  const schema = { version: 1, keys: {} };

  for (const [keyName, keyData] of Object.entries(config.keys || {})) {
    const parsedNote = parsedEnv?.[keyName]?.note || '';
    schema.keys[keyName] = buildKeySchema(keyName, keyData, parsedNote);
  }

  for (const [keyName, parsed] of Object.entries(parsedEnv || {})) {
    if (!schema.keys[keyName]) {
      schema.keys[keyName] = {
        required: false,
        type: inferValueType(keyName, parsed.value),
        note: parsed.note || '',
        validation: { type: inferValidationType(keyName, parsed.value) },
        group: inferGroup(keyName)
      };
    }
  }

  return schema;
}

function stripMetadataFromConfig(config, schema) {
  const cleaned = {
    environments: config.environments,
    activeEnvironment: config.activeEnvironment,
    keys: {}
  };

  for (const [keyName, keyData] of Object.entries(config.keys || {})) {
    cleaned.keys[keyName] = {
      values: { ...(keyData.values || {}) },
      active: keyData.active
    };
  }

  return cleaned;
}

function mergeSchemaIntoConfig(config, schema) {
  const merged = {
    environments: config.environments,
    activeEnvironment: config.activeEnvironment,
    keys: {}
  };

  for (const [keyName, keyData] of Object.entries(config.keys || {})) {
    const meta = schema.keys?.[keyName] || {};
    merged.keys[keyName] = {
      values: { ...(keyData.values || {}) },
      active: keyData.active,
      note: meta.note || keyData.note || '',
      validation: meta.validation || keyData.validation || { type: 'none' },
      group: meta.group || keyData.group
    };
  }

  return merged;
}

function ensureSchema(projectPath, config, parsedEnv) {
  const schemaPath = path.join(projectPath, '.envie', 'schema.json');
  let schema = null;
  let migrated = false;

  if (fs.existsSync(schemaPath)) {
    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    } catch {
      schema = null;
    }
  }

  if (!schema || !schema.keys) {
    schema = migrateConfigToSchema(config, parsedEnv);
    migrated = true;
  } else {
    for (const [keyName, keyData] of Object.entries(config.keys || {})) {
      if (!schema.keys[keyName]) {
        schema.keys[keyName] = buildKeySchema(keyName, keyData, parsedEnv?.[keyName]?.note);
        migrated = true;
      }
    }
  }

  if (migrated) {
    const dir = path.dirname(schemaPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');
  }

  return schema;
}

function validateBeforeApply(config, schema, activeEnv) {
  const errors = [];
  const warnings = [];
  const env = activeEnv || config.activeEnvironment || 'local';

  for (const [keyName, meta] of Object.entries(schema.keys || {})) {
    const keyData = config.keys?.[keyName];
    const selectedEnv = keyData?.active || env;
    const value = (keyData?.values && keyData.values[selectedEnv]) || '';

    if (meta.required && !String(value).trim()) {
      errors.push({ key: keyName, message: `Required key "${keyName}" has no value for environment "${selectedEnv}"` });
    }

    const validationType = meta.validation?.type || 'none';
    if (validationType !== 'none' && !isValidValidatorType(validationType)) {
      errors.push({ key: keyName, message: `Invalid validation type "${validationType}" for key "${keyName}"` });
    }

    if (!keyData) {
      warnings.push({ key: keyName, message: `Schema defines "${keyName}" but it is missing from config` });
    }
  }

  for (const keyName of Object.keys(config.keys || {})) {
    if (!schema.keys?.[keyName]) {
      warnings.push({ key: keyName, message: `Key "${keyName}" is not in schema (will be added on next save)` });
    }
  }

  return { errors, warnings, valid: errors.length === 0 };
}

module.exports = {
  ensureSchema,
  validateBeforeApply,
  migrateConfigToSchema,
  mergeSchemaIntoConfig,
  stripMetadataFromConfig,
  inferValidationType,
  inferGroup
};
