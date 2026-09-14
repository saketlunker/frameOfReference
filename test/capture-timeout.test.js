'use strict';

// Item 4 guards an ordering invariant that lives in two files at once, so
// nothing in either file can enforce it alone. This test is the enforcement:
// the service worker must give up before the content script stops listening,
// otherwise sendResponse fires into a dead channel and the worker is held
// alive for the difference.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readConstant(file, pattern) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const match = source.match(pattern);
  assert.ok(match, `could not find the capture timeout in ${file}`);
  return Number(match[1]);
}

const BACKGROUND_TIMEOUT = readConstant('background.js', /const CAPTURE_RESPONSE_TIMEOUT_MS = (\d+);/);
const CONTENT_TIMEOUT = readConstant(
  'content/picker.js',
  /static CAPTURE_RESPONSE_TIMEOUT_MS = (\d+);/
);

test('the worker capture timeout is strictly shorter than the content script one', () => {
  assert.ok(
    BACKGROUND_TIMEOUT < CONTENT_TIMEOUT,
    `background.js (${BACKGROUND_TIMEOUT}ms) must resolve before content/picker.js (${CONTENT_TIMEOUT}ms)`
  );
});

test('both capture timeouts are still plausible values', () => {
  // Guards against someone "fixing" the invariant by setting one to zero.
  assert.ok(BACKGROUND_TIMEOUT >= 1000, 'a sub-second worker timeout would abort legitimate captures');
  assert.ok(CONTENT_TIMEOUT <= 10000, 'the content script should not wait absurdly long');
});

test('the ordering invariant is documented in both files', () => {
  const background = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
  const content = fs.readFileSync(path.join(ROOT, 'content', 'picker.js'), 'utf8');

  assert.match(background, /CAPTURE_RESPONSE_TIMEOUT_MS[\s\S]{0,400}?content\/picker\.js/);
  assert.match(content, /background\.js[\s\S]{0,200}?|CAPTURE_RESPONSE_TIMEOUT_MS/);
});
