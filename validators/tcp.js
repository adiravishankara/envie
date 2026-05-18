const { testTcp } = require('./shared');

async function validate(value) {
  if (!value || !String(value).trim()) {
    return require('./shared').createResult('invalid', 'Value is empty');
  }
  return testTcp(String(value).trim());
}

module.exports = { validate };
