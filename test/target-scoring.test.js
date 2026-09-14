'use strict';

// Sanity coverage for the target scoring engine. These assert relative ordering,
// not absolute scores, so tuning the weights does not break the suite — only
// inverting the intent does.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPicker } = require('../test-support/load-picker.js');

const HTML = `<!doctype html><html><body>
  <div id="wrapper">
    <button id="action">Save</button>
  </div>
  <div id="plain">Some copy</div>
  <span id="tagged" role="button">Go</span>
  <div id="identified">Has an id</div>
  <div id="tested" data-testid="save-action">Has a test id</div>
</body></html>`;

const { picker, document } = loadPicker({ html: HTML });

// Scores a candidate as if it sat at the top of the stack with no anchor, which
// isolates the element's own signals from position and proximity bonuses.
function scoreAt(id, stackIndex = 0, ancestorDepth = 0) {
  const element = document.getElementById(id);
  return picker.scoreTargetCandidate(
    element,
    null,
    { element, stackIndex, ancestorDepth },
    null,
    null
  );
}

test('an interactive element outranks a plain wrapper div at the same stack position', () => {
  assert.ok(
    scoreAt('action') > scoreAt('wrapper'),
    'a button should beat the div wrapping it'
  );
});

test('an element with an explicit interactive role outranks a plain wrapper div', () => {
  assert.ok(
    scoreAt('tagged') > scoreAt('plain'),
    'role="button" should beat a generic div'
  );
});

test('an id raises a wrapper above an identical wrapper without one', () => {
  const withId = scoreAt('identified');
  const element = document.getElementById('identified');
  element.removeAttribute('id');
  const withoutId = picker.scoreTargetCandidate(
    element,
    null,
    { element, stackIndex: 0, ancestorDepth: 0 },
    null,
    null
  );
  element.setAttribute('id', 'identified');

  assert.ok(withId > withoutId, 'an id is a stability signal and should score higher');
});

test('a test attribute raises a wrapper above a bare one', () => {
  assert.ok(scoreAt('tested') > scoreAt('identified'), 'data-testid should beat a plain id');
});

test('a deeper stack position scores lower than a shallower one', () => {
  assert.ok(scoreAt('action', 0) > scoreAt('action', 2), 'stack index should decay the score');
});

test('a more distant ancestor scores lower than a nearer one', () => {
  assert.ok(scoreAt('action', 0, 0) > scoreAt('action', 0, 3), 'ancestor depth should decay the score');
});

test('chooseBestTargetCandidate promotes the button over its wrapper', () => {
  const button = document.getElementById('action');
  const wrapper = document.getElementById('wrapper');

  assert.equal(picker.chooseBestTargetCandidate(button, [button, wrapper]), button);
});
