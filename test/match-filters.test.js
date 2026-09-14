'use strict';

// Coverage for the locator match filters. These used to build a full element
// summary — and therefore read innerText, forcing layout — for every node
// querySelectorAll returned. The behaviour they encode must survive the
// cheaper implementation.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPicker } = require('../test-support/load-picker.js');

const HTML = `<!doctype html><html><body>
  <button id="save">Save</button>
  <button id="save-two">Save</button>
  <button id="delete">Delete</button>
  <button id="labelled" aria-label="Save">Discard</button>
  <a id="link" href="/save">Save</a>
  <div id="roled" role="button">Save</div>
  <input id="named" name="Save">
  <button id="empty"></button>
</body></html>`;

const { picker, document } = loadPicker({ html: HTML });

// The picker runs inside the jsdom realm, so the arrays it returns carry that
// realm's Array.prototype. Rebuild them here before deep-comparing.
function idsOf(elements) {
  return Array.from(elements, (element) => element.id).sort();
}

test('findTagTextMatches finds every button carrying the text', () => {
  const ids = idsOf(picker.findTagTextMatches(document, 'button', 'Save'));

  assert.deepEqual(ids, ['labelled', 'save', 'save-two']);
});

test('findTagTextMatches rejects buttons with different text', () => {
  const matches = picker.findTagTextMatches(document, 'button', 'Save');

  assert.ok(!matches.some((element) => element.id === 'delete'));
});

test('an aria-label wins over the element text, matching getPrimaryLabel', () => {
  const labelled = document.getElementById('labelled');

  assert.equal(picker.getPrimaryLabel(picker.summarizeElement(labelled)), 'Save');
  assert.ok(picker.findTagTextMatches(document, 'button', 'Discard').length === 0);
});

test('findRoleNameMatches narrows by role as well as name', () => {
  const ids = idsOf(picker.findRoleNameMatches(document, 'button', 'Save'));

  assert.deepEqual(ids, ['labelled', 'roled', 'save', 'save-two']);
  assert.ok(!ids.includes('link'), 'a link must not satisfy the button role');
});

test('findRoleNameMatches finds links by role', () => {
  assert.deepEqual(idsOf(picker.findRoleNameMatches(document, 'link', 'Save')), ['link']);
});

test('the name attribute is the last label fallback', () => {
  const named = document.getElementById('named');

  assert.equal(picker.getPrimaryLabel(picker.summarizeElement(named)), 'Save');
  assert.deepEqual(idsOf(picker.findRoleNameMatches(document, 'textbox', 'Save')), ['named']);
});

test('an empty expected label never matches', () => {
  assert.deepEqual(idsOf(picker.findTagTextMatches(document, 'button', '')), []);
});

test('hidden descendant text does not hide a visible label', () => {
  const { picker: scoped, document: scopedDocument } = loadPicker({
    html: '<!doctype html><html><body><button id="a"><span hidden>Icon</span>Save</button></body></html>'
  });

  const expected = scoped.getPrimaryLabel(scoped.summarizeElement(scopedDocument.getElementById('a')));

  assert.deepEqual(idsOf(scoped.findTagTextMatches(scopedDocument, 'button', expected)), ['a']);
});

test('the filter agrees with the label the locator candidate was built from', () => {
  // addLocatorCandidate drops any candidate whose target does not match itself,
  // so extraction and filtering have to stay in step.
  for (const id of ['save', 'delete', 'labelled', 'roled', 'link']) {
    const element = document.getElementById(id);
    const summary = picker.summarizeElement(element);
    const label = picker.getPrimaryLabel(summary);
    const matches = picker.findRoleNameMatches(document, summary.role, label);

    assert.ok(matches.includes(element), `${id} should match its own extracted label`);
  }
});
