const SENSITIVE_KEY_PATTERN = /(KEY|SECRET|PASSWORD|TOKEN|URL)/i;

function isSensitiveKey(keyName) {
  return SENSITIVE_KEY_PATTERN.test(keyName);
}

function maskValue(value) {
  if (!value || value.length <= 4) return '••••••••';
  return value.slice(0, 2) + '••••' + value.slice(-2);
}

function maskEnvContent(content) {
  if (!content) return '';

  return content
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;

      const match = line.match(/^([^=]+)=(.*)$/);
      if (!match) return line;

      const key = match[1].trim();
      const rawVal = match[2].trim();
      if (!isSensitiveKey(key)) return line;

      let unquoted = rawVal;
      const quote = rawVal.startsWith('"') ? '"' : rawVal.startsWith("'") ? "'" : '';
      if (quote && rawVal.endsWith(quote)) {
        unquoted = rawVal.slice(1, -1);
      }

      const masked = maskValue(unquoted);
      if (quote) return `${key}=${quote}${masked}${quote}`;
      return `${key}=${masked}`;
    })
    .join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isSensitiveKey, maskValue, maskEnvContent };
}

if (typeof window !== 'undefined') {
  window.maskEnvContent = maskEnvContent;
  window.isSensitiveKey = isSensitiveKey;
}
