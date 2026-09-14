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

// --- Area-based scoring ---
// jsdom performs no layout, so every rect is 0x0 unless a test supplies one.
// Without these stubs the AREA_THRESHOLDS and TINY_AREA branches never run.

function scoreWithRect(scoped, element, width, height) {
  element.getBoundingClientRect = () => ({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height
  });

  return scoped.scoreTargetCandidate(element, null, { element, stackIndex: 0, ancestorDepth: 0 }, null, null);
}

test('a candidate covering most of the viewport is penalised', () => {
  const { picker: scoped, document: scopedDocument, window } = loadPicker({
    html: '<!doctype html><html><body><div id="area">Panel</div></body></html>'
  });

  const element = scopedDocument.getElementById('area');
  const w = window.innerWidth;
  const h = window.innerHeight;

  const modest = scoreWithRect(scoped, element, w * 0.2, h * 0.2);
  const huge = scoreWithRect(scoped, element, w * 0.95, h * 0.95);

  assert.ok(huge < modest, 'a near-fullscreen wrapper is rarely what the user meant');
});

test('the area penalty deepens as the candidate grows', () => {
  const { picker: scoped, document: scopedDocument, window } = loadPicker({
    html: '<!doctype html><html><body><div id="area">Panel</div></body></html>'
  });

  const element = scopedDocument.getElementById('area');
  const area = (ratio) => scoreWithRect(scoped, element, window.innerWidth * ratio, window.innerHeight);

  // Ratios chosen to sit either side of each configured threshold.
  const small = area(0.3);
  const mid = area(0.5);
  const large = area(0.7);
  const full = area(0.9);

  assert.ok(small > mid, 'crossing the first threshold should cost something');
  assert.ok(mid > large, 'crossing the second threshold should cost more');
  assert.ok(large > full, 'crossing the third threshold should cost most');
});

test('a sub-pixel non-interactive candidate is penalised', () => {
  const { picker: scoped, document: scopedDocument } = loadPicker({
    html: '<!doctype html><html><body><div id="area">Panel</div></body></html>'
  });

  const element = scopedDocument.getElementById('area');

  const normal = scoreWithRect(scoped, element, 120, 40);
  const invisible = scoreWithRect(scoped, element, 0.01, 0.01);

  assert.ok(invisible < normal, 'a tracking pixel is not a useful target');
});

test('an interactive element is exempt from the tiny-area penalty', () => {
  const { picker: scoped, document: scopedDocument } = loadPicker({
    html: '<!doctype html><html><body><button id="tiny">x</button><div id="plain">x</div></body></html>'
  });

  const button = scopedDocument.getElementById('tiny');
  const div = scopedDocument.getElementById('plain');

  const buttonSmall = scoreWithRect(scoped, button, 0.01, 0.01);
  const buttonNormal = scoreWithRect(scoped, button, 120, 40);
  const divSmall = scoreWithRect(scoped, div, 0.01, 0.01);
  const divNormal = scoreWithRect(scoped, div, 120, 40);

  assert.equal(buttonSmall, buttonNormal, 'a small button is still a button');
  assert.ok(divSmall < divNormal, 'a small plain div is not');
});
