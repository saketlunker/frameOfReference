'use strict';

// Manifest and store-copy consistency. The `alarms` permission shipped in the
// manifest for a while without appearing in the privacy policy, which is the
// kind of drift nobody notices until a store review does.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const privacyPolicy = fs.readFileSync(path.join(ROOT, 'store', 'PRIVACY_POLICY.txt'), 'utf8');

test('every declared permission is explained in the privacy policy', () => {
  for (const permission of manifest.permissions) {
    assert.match(
      privacyPolicy,
      new RegExp(`^\\s*-\\s*${permission}:`, 'm'),
      `${permission} is requested but never explained to the user`
    );
  }
});

test('the privacy policy does not claim permissions the manifest never asks for', () => {
  const declared = new Set(manifest.permissions);
  const documented = [...privacyPolicy.matchAll(/^\s*-\s*([A-Za-z]+):/gm)].map((match) => match[1]);

  for (const permission of documented) {
    assert.ok(declared.has(permission), `${permission} is documented but not requested`);
  }
});

test('the extension requests no host permissions', () => {
  // The picker works entirely through activeTab. Adding host permissions would
  // change the review posture and the install-time warning.
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.ok(!manifest.permissions.some((permission) => permission.includes('://')));
});

test('the permission set is exactly what the extension uses', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'alarms', 'clipboardWrite', 'scripting']);
});

test('manifest and package versions agree', () => {
  assert.equal(manifest.version, packageJson.version);
});

test('the homepage points at the current repository name', () => {
  assert.equal(manifest.homepage_url, 'https://github.com/saketlunker/frameOfReference');
});

test('the manifest declares the content script the worker injects', () => {
  const background = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
  const match = background.match(/const PICKER_SCRIPT = '([^']+)';/);

  assert.ok(match, 'background.js should name the picker script it injects');
  assert.ok(fs.existsSync(path.join(ROOT, match[1])), `${match[1]} does not exist`);
});

test('the shipped extension has no runtime dependencies', () => {
  // "Load unpacked" has to keep working straight from a clone.
  assert.equal(packageJson.dependencies, undefined);
  assert.ok(packageJson.devDependencies, 'test tooling is allowed to be a devDependency');
});
