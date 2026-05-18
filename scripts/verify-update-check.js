/**
 * Verifies GitHub update-check logic used in main.js (no Electron required).
 * Run: node scripts/verify-update-check.js
 */

const https = require('https');

function isNewerVersion(current, latest) {
  const normalize = (v) => v.replace(/^v/, '').replace(/-.*$/, '');
  const cParts = normalize(current).split('.').map(Number);
  const lParts = normalize(latest).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (lParts[i] > cParts[i]) return true;
    if (lParts[i] < cParts[i]) return false;
  }
  return false;
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/adiravishankara/envie/releases/latest',
      headers: { 'User-Agent': 'Envie-App' },
    };
    https
      .get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function parseReleaseLikeMain(body) {
  if (!body || !body.tag_name) return null;
  const latestVersion = body.tag_name.replace(/^v/, '');
  return { latestVersion, html_url: body.html_url, body: body.body };
}

async function main() {
  let failed = 0;
  const ok = (msg) => console.log(`  PASS: ${msg}`);
  const fail = (msg) => {
    console.log(`  FAIL: ${msg}`);
    failed++;
  };

  console.log('\n1. Semver comparison (isNewerVersion)\n');
  const semverCases = [
    ['1.0.0', '1.1.0', true],
    ['1.0.0', '1.0.0', false],
    ['1.2.0', '1.1.9', false],
    ['0.9.0', '1.0.0', true],
    ['1.0.0-alpha', '1.0.1', true],
    ['1.0.0-alpha', '1.1.0', true],
    ['2.0.0', '1.9.9', false],
  ];
  for (const [current, latest, expected] of semverCases) {
    const got = isNewerVersion(current, latest);
    if (got === expected) ok(`${current} vs ${latest} => ${got}`);
    else fail(`${current} vs ${latest}: expected ${expected}, got ${got}`);
  }

  console.log('\n2. GitHub API /releases/latest\n');
  try {
    const { statusCode, body } = await fetchLatestRelease();
    console.log(`  HTTP status: ${statusCode}`);
    if (statusCode === 404) {
      console.log('  INFO: No published releases on adiravishankara/envie yet.');
      console.log('  INFO: checkManualUpdates() will silently skip (no tag_name in 404 JSON).');
    } else if (statusCode === 200) {
      const parsed = parseReleaseLikeMain(body);
      if (parsed) {
        ok(`Latest release tag parses to v${parsed.latestVersion}`);
        ok(`Release URL: ${parsed.html_url}`);
      } else {
        fail('200 response but missing tag_name');
      }
    } else {
      fail(`Unexpected status ${statusCode}: ${body.message || JSON.stringify(body)}`);
    }
  } catch (err) {
    fail(`Network error: ${err.message}`);
  }

  console.log('\n3. Simulated newer release (dialog would show)\n');
  const currentVersion = '1.0.0-alpha';
  const mockRelease = {
    tag_name: 'v1.1.0',
    html_url: 'https://github.com/adiravishankara/envie/releases/tag/v1.1.0',
    body: 'Mock release notes',
  };
  const parsed = parseReleaseLikeMain(mockRelease);
  if (parsed && isNewerVersion(currentVersion, parsed.latestVersion)) {
    ok(`Would prompt: v${currentVersion} -> v${parsed.latestVersion}`);
    ok(`Would open: ${parsed.html_url}`);
  } else {
    fail('Mock release should be detected as newer than 1.0.0-alpha');
  }

  console.log(`\n${failed === 0 ? 'All checks passed.' : `${failed} check(s) failed.`}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
