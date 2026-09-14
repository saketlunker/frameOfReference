'use strict';

// Regression coverage for the Target: line. getPrimaryLabel falls all the way
// back to the element's innerText, which has no length bound of its own, so
// selecting a section or a card used to dump the whole subtree into the copied
// reference and destroy the point of the extension.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPicker } = require('./helpers/load-picker.js');

const LONG_TEXT =
  'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud ' +
  'exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';

const MAX_LABEL_LENGTH = 80;
const ELLIPSIS = '\u2026';

function targetLineOf(clipboardText) {
  return clipboardText.split('\n').find((line) => line.startsWith('Target: '));
}

function quotedLabelOf(line) {
  const match = line.match(/"([\s\S]*)"/);
  return match ? match[1] : '';
}

test('Target: line clips a long-text container to the label limit', () => {
  const html = `<!doctype html><html><body>
    <section id="hero"><p>${LONG_TEXT}</p></section>
  </body></html>`;
  const { picker, document } = loadPicker({ html });

  const capture = picker.buildCapture(document.getElementById('hero'));
  const targetLine = targetLineOf(capture.clipboardText);

  assert.ok(targetLine, 'capture should emit a Target: line');

  const label = quotedLabelOf(targetLine);
  assert.ok(label.endsWith(ELLIPSIS), 'a clipped label should end with an ellipsis');
  assert.ok(
    label.length <= MAX_LABEL_LENGTH,
    `label was ${label.length} chars, expected at most ${MAX_LABEL_LENGTH}`
  );
  assert.ok(
    targetLine.length < LONG_TEXT.length,
    'the Target: line must not carry the container\u2019s full text'
  );
});

test('Target: line leaves a short label untouched', () => {
  const html = '<!doctype html><html><body><button id="save">Save changes</button></body></html>';
  const { picker, document } = loadPicker({ html });

  const capture = picker.buildCapture(document.getElementById('save'));
  const targetLine = targetLineOf(capture.clipboardText);

  assert.equal(targetLine, 'Target: button "Save changes" (selected element)');
});

test('every emitted line stays bounded for a long-text container', () => {
  const html = `<!doctype html><html><body>
    <main id="region" aria-label="${LONG_TEXT}">
      <section id="hero"><p>${LONG_TEXT}</p></section>
    </main>
  </body></html>`;
  const { picker, document } = loadPicker({ html });

  const capture = picker.buildCapture(document.getElementById('hero'));

  for (const line of capture.clipboardText.split('\n')) {
    const label = quotedLabelOf(line);
    assert.ok(
      label.length <= MAX_LABEL_LENGTH,
      `line "${line.slice(0, 40)}..." carried a ${label.length} char label`
    );
  }
});

test('buildCaptureTargetLine omits the quoted label when there is none', () => {
  const html = '<!doctype html><html><body><div id="bare"></div></body></html>';
  const { picker, document } = loadPicker({ html });

  const element = document.getElementById('bare');
  const summary = picker.summarizeElement(element);

  assert.equal(picker.buildCaptureTargetLine(summary, ''), 'Target: div (selected element)');
});
