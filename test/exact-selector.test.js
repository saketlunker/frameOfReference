'use strict';

// Coverage for the selector engine — the beam search behind `Exact:`. Its whole
// promise is that the emitted selector resolves back to the element it
// describes, and says so honestly when it cannot be made unique.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPicker } = require('../test-support/load-picker.js');

const PAGE = `<!doctype html><html><body>
  <header id="masthead"><h1>Dashboard</h1></header>
  <main class="content">
    <section id="billing" class="card panel">
      <form name="billingForm">
        <input id="email" name="email" type="email" placeholder="you@example.com">
        <button type="submit" data-testid="save-billing">Save</button>
        <button type="button">Save</button>
      </form>
    </section>
    <section class="card" data-component="activity">
      <ul>
        <li class="row">One</li>
        <li class="row">Two</li>
        <li class="row">Three</li>
      </ul>
      <a href="/deep">Deep link</a>
      <img src="/logo.png" alt="Logo">
    </section>
  </main>
</body></html>`;

function selectorOf(reference) {
  // buildExactReference returns "<host>##<selector>"; the tests care about the
  // selector half only.
  return reference.text.split('##')[1];
}

test('every element gets an Exact reference that resolves back to it', () => {
  const { picker, document } = loadPicker({ html: PAGE });

  for (const element of document.querySelectorAll('body *')) {
    const reference = picker.buildExactReference(element);
    assert.ok(reference, `no exact reference produced for ${element.tagName}`);

    const selector = selectorOf(reference);
    assert.ok(!selector.includes(' >>> '), 'this page has no shadow roots');

    const resolved = Array.from(document.querySelectorAll(selector));
    assert.ok(
      resolved.includes(element),
      `${element.tagName}#${element.id} produced "${selector}", which does not select it`
    );
  }
});

test('a reported match count of 1 really is unique', () => {
  const { picker, document } = loadPicker({ html: PAGE });

  for (const element of document.querySelectorAll('body *')) {
    const reference = picker.buildExactReference(element);
    if (reference.matchCount !== 1) {
      continue;
    }

    const resolved = document.querySelectorAll(selectorOf(reference));
    assert.equal(
      resolved.length,
      1,
      `"${selectorOf(reference)}" claimed uniqueness but matched ${resolved.length}`
    );
  }
});

test('the reported match count equals what the selector actually matches', () => {
  const { picker, document } = loadPicker({ html: PAGE });

  for (const element of document.querySelectorAll('body *')) {
    const reference = picker.buildExactReference(element);
    const resolved = document.querySelectorAll(selectorOf(reference));

    assert.equal(
      reference.matchCount,
      resolved.length,
      `"${selectorOf(reference)}" reported ${reference.matchCount} but matched ${resolved.length}`
    );
  }
});

test('an id is preferred over structural paths', () => {
  const { picker, document } = loadPicker({ html: PAGE });

  assert.equal(selectorOf(picker.buildExactReference(document.getElementById('billing'))), '#billing');
});

test('a test attribute is preferred over classes and position', () => {
  const { picker, document } = loadPicker({ html: PAGE });

  const selector = selectorOf(picker.buildExactReference(document.querySelector('[data-testid]')));

  assert.match(selector, /data-testid/);
  assert.ok(!selector.includes(':nth-of-type('), 'a test id should not need positional disambiguation');
});

test('identical siblings are separated rather than reported as one', () => {
  const { picker, document } = loadPicker({ html: PAGE });
  const rows = Array.from(document.querySelectorAll('.row'));

  const selectors = rows.map((row) => selectorOf(picker.buildExactReference(row)));

  assert.equal(new Set(selectors).size, rows.length, 'each row needs its own selector');
  for (let index = 0; index < rows.length; index += 1) {
    assert.ok(Array.from(document.querySelectorAll(selectors[index])).includes(rows[index]));
  }
});

test('scoreExactSelector rewards a unique match over an ambiguous one', () => {
  const { picker } = loadPicker({ html: PAGE });

  const unique = picker.scoreExactSelector('#billing', 100, 1);
  const ambiguous = picker.scoreExactSelector('#billing', 100, 4);

  assert.ok(unique > ambiguous);
});

test('scoreExactSelector prefers a stable attribute over a positional selector', () => {
  const { picker } = loadPicker({ html: PAGE });

  const stable = picker.scoreExactSelector('[data-testid="save-billing"]', 100, 1);
  const positional = picker.scoreExactSelector('div:nth-of-type(3)', 100, 1);

  assert.ok(stable > positional);
});

test('a shorter selector outranks a longer one at the same uniqueness', () => {
  const { picker } = loadPicker({ html: PAGE });

  const short = picker.scoreExactSelector('#billing', 100, 1);
  const long = picker.scoreExactSelector('main.content > section.card.panel > form > button', 100, 1);

  assert.ok(short > long);
});

test('an element with no distinguishing features still resolves', () => {
  const { picker, document } = loadPicker({
    html: '<!doctype html><html><body><div><span></span><span></span></div></body></html>'
  });

  const target = document.querySelectorAll('span')[1];
  const reference = picker.buildExactReference(target);
  const resolved = Array.from(document.querySelectorAll(selectorOf(reference)));

  assert.ok(resolved.includes(target));
  assert.equal(reference.matchCount, resolved.length);
});
