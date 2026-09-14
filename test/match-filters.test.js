'use strict';

// Coverage for the locator match filters. These used to build a full element
// summary for every node querySelectorAll returned; the cheaper implementation
// must answer identically to getPrimaryLabel in every case.
//
// The hidden-content tests below are the important ones. An earlier version of
// this optimisation decided matches from textContent, which looks equivalent
// but is not: innerText drops display:none subtrees, so textContent both
// over-matched and — when hidden content split visible text — failed to match an
// element against its own label. jsdom has no innerText of its own, so these
// only bite once the harness supplies one.

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

test('an empty expected label matches only elements that have no label', () => {
  // buildLocatorCandidates never creates a candidate without a label, so this
  // case is unreachable in practice. It is asserted to keep the filter exactly
  // equivalent to getPrimaryLabel rather than approximately so.
  assert.deepEqual(idsOf(picker.findTagTextMatches(document, 'button', '')), ['empty']);
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

test('hidden text does not make an element answer to a label it does not have', () => {
  // The visible label is "Save"; only the decoy is really named "CancelSave".
  const { picker: scoped, document: scopedDocument } = loadPicker({
    html: `<!doctype html><html><body>
      <button id="hidden-prefix"><span style="display:none">Cancel</span>Save</button>
      <button id="decoy">CancelSave</button>
    </body></html>`
  });

  assert.equal(
    scoped.getPrimaryLabel(scoped.summarizeElement(scopedDocument.getElementById('hidden-prefix'))),
    'Save'
  );
  assert.deepEqual(idsOf(scoped.findTagTextMatches(scopedDocument, 'button', 'CancelSave')), ['decoy']);
});

test('an element whose visible text is split by hidden content still matches itself', () => {
  const { picker: scoped, document: scopedDocument } = loadPicker({
    html: '<!doctype html><html><body><button id="split">Sa<span style="display:none">XX</span>ve</button></body></html>'
  });

  const element = scopedDocument.getElementById('split');
  const label = scoped.getPrimaryLabel(scoped.summarizeElement(element));

  assert.equal(label, 'Save');
  assert.ok(
    scoped.findTagTextMatches(scopedDocument, 'button', label).includes(element),
    'an element that cannot match its own label loses its readable locator'
  );
});

test('the filter answers identically to getPrimaryLabel across a mixed page', () => {
  // Property-style sweep: for every element and every label in play, the cheap
  // filter and the authoritative getPrimaryLabel must agree exactly.
  const { picker: scoped, document: scopedDocument } = loadPicker({
    html: `<!doctype html><html><body>
      <button id="a"><span style="display:none">Cancel</span>Save</button>
      <button id="b">CancelSave</button>
      <button id="c" aria-label="Save">Discard</button>
      <button id="d" hidden>Save</button>
      <button id="e">Sa<span hidden>XX</span>ve</button>
      <div id="f" role="button"><p>One</p><p>Two</p></div>
      <button id="g"></button>
    </body></html>`
  });

  const elements = Array.from(scopedDocument.querySelectorAll('button, div[role]'));
  const labels = new Set(['Save', 'CancelSave', 'Discard', 'One Two', 'OneTwo']);
  for (const element of elements) {
    labels.add(scoped.getPrimaryLabel(scoped.summarizeElement(element)));
  }

  for (const label of labels) {
    if (!label) {
      continue;
    }

    const expected = elements
      .filter((element) => scoped.getPrimaryLabel(scoped.summarizeElement(element)) === label)
      .map((element) => element.id)
      .sort();

    const actual = idsOf(scoped.findTagTextMatches(scopedDocument, 'button, div[role]', label));

    assert.deepEqual(actual, expected, `mismatch for label ${JSON.stringify(label)}`);
  }
});
