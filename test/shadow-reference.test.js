'use strict';

// Coverage for buildExactReference's shadow-piercing chain. The match count for a
// multi-segment `>>>` chain used to be hardcoded to 1, so the Exact: line claimed
// a uniqueness nothing had checked. It is now measured by walking the chain.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPicker } = require('../test-support/load-picker.js');

function buildHost(document, hostId, innerHtml) {
  const host = document.createElement('div');
  host.id = hostId;
  document.body.appendChild(host);
  host.attachShadow({ mode: 'open' }).innerHTML = innerHtml;
  return host;
}

test('a unique shadow chain reports a single match', () => {
  const { picker, document } = loadPicker();
  const host = buildHost(document, 'only-host', '<button id="go">Go</button>');
  const target = host.shadowRoot.getElementById('go');

  const reference = picker.buildExactReference(target);

  assert.ok(reference.text.includes(' >>> '), 'the reference should pierce the shadow boundary');
  assert.equal(reference.matchCount, 1);
  assert.equal(picker.formatExactReference(reference), reference.text);
});

test('a chain reaching several elements reports the real count', () => {
  const { picker, document } = loadPicker();

  // Two hosts that share a selector, each holding a button that shares a selector.
  // The chain therefore resolves to two elements, not one.
  const first = buildHost(document, 'host-a', '<button class="go">Go</button>');
  buildHost(document, 'host-b', '<button class="go">Go</button>');

  const target = first.shadowRoot.querySelector('button');
  const reference = picker.buildExactReference(target);

  if (!reference.text.includes(' >>> ')) {
    // The leaf was unique enough on its own; nothing to assert about the chain.
    return;
  }

  const segments = reference.text.split('##')[1].split(' >>> ');
  const resolved = Array.from(document.querySelectorAll(segments[0]))
    .filter((element) => element.shadowRoot)
    .flatMap((element) => Array.from(element.shadowRoot.querySelectorAll(segments[1])));

  assert.equal(
    reference.matchCount,
    resolved.length,
    'the reported count must equal what the chain actually resolves to'
  );
});

test('formatExactReference warns when the chain is not unique', () => {
  const { picker } = loadPicker();

  assert.equal(picker.formatExactReference({ text: 'a##b >>> c', matchCount: 3 }), 'a##b >>> c (3 matches)');
  assert.equal(picker.formatExactReference({ text: 'a##b', matchCount: 1 }), 'a##b');
});

test('a light-DOM reference keeps its measured single-segment count', () => {
  const { picker, document } = loadPicker({
    html: '<!doctype html><html><body><button id="only">Go</button></body></html>'
  });

  const reference = picker.buildExactReference(document.getElementById('only'));

  assert.ok(!reference.text.includes(' >>> '));
  assert.equal(reference.matchCount, 1);
});

test('the query cache keeps distinct shadow roots apart', () => {
  const { picker, document } = loadPicker();
  const first = buildHost(document, 'cache-a', '<button class="go">A</button>');
  buildHost(document, 'cache-b', '<button class="go">B</button><button class="go">C</button>');

  picker._queryCache = new Map();
  try {
    const fromFirst = picker.findCssMatches(first.shadowRoot, '.go');
    const fromSecond = picker.findCssMatches(document.getElementById('cache-b').shadowRoot, '.go');

    assert.equal(fromFirst.length, 1);
    assert.equal(fromSecond.length, 2, 'the second root must not be served the first root\u2019s results');
  } finally {
    picker._queryCache = null;
  }
});
