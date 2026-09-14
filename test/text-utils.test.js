'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPicker } = require('../test-support/load-picker.js');

const ELLIPSIS = '\u2026';
const { picker } = loadPicker();

test('clipText leaves a value shorter than the limit alone', () => {
  assert.equal(picker.clipText('abcdefghi', 10), 'abcdefghi');
});

test('clipText leaves a value exactly at the limit alone', () => {
  assert.equal(picker.clipText('abcdefghij', 10), 'abcdefghij');
});

test('clipText clips one character over the limit', () => {
  const clipped = picker.clipText('abcdefghijk', 10);

  assert.equal(clipped, `abcdefghi${ELLIPSIS}`);
  assert.equal(clipped.length, 10);
});

test('clipText never exceeds the limit', () => {
  const clipped = picker.clipText('x'.repeat(500), 80);

  assert.equal(clipped.length, 80);
  assert.ok(clipped.endsWith(ELLIPSIS));
});

test('clipText trims the trailing space before the ellipsis', () => {
  assert.equal(picker.clipText('abcdefgh ijkl', 10), `abcdefgh${ELLIPSIS}`);
});

test('clipText normalizes whitespace before measuring', () => {
  assert.equal(picker.clipText('  a \n\t b  ', 10), 'a b');
});

test('normalizeWhitespace collapses runs and trims', () => {
  assert.equal(picker.normalizeWhitespace('  Save   the \n\t file  '), 'Save the file');
});

test('normalizeWhitespace coerces empty-ish values to an empty string', () => {
  assert.equal(picker.normalizeWhitespace(''), '');
  assert.equal(picker.normalizeWhitespace(null), '');
  assert.equal(picker.normalizeWhitespace(undefined), '');
  assert.equal(picker.normalizeWhitespace('   '), '');
});

test('escapeAttributeValue escapes backslashes', () => {
  assert.equal(picker.escapeAttributeValue('a\\b'), 'a\\\\b');
});

test('escapeAttributeValue escapes double quotes', () => {
  assert.equal(picker.escapeAttributeValue('say "hi"'), 'say \\"hi\\"');
});

test('escapeAttributeValue escapes newlines and carriage returns', () => {
  assert.equal(picker.escapeAttributeValue('a\nb'), 'a\\nb');
  assert.equal(picker.escapeAttributeValue('a\rb'), 'a\\rb');
  assert.equal(picker.escapeAttributeValue('a\fb'), 'a\\fb');
});

test('escapeAttributeValue escapes closing brackets and nulls', () => {
  assert.equal(picker.escapeAttributeValue('a]b'), 'a\\]b');
  assert.equal(picker.escapeAttributeValue('a\0b'), 'a\\0b');
});

test('escapeAttributeValue escapes the backslash before anything it introduces', () => {
  // A naive ordering would double-escape: the backslash pass must run first, so
  // an input backslash and an escaped quote stay distinguishable.
  assert.equal(picker.escapeAttributeValue('\\"'), '\\\\\\"');
});

test('escapeAttributeValue leaves ordinary text alone', () => {
  assert.equal(picker.escapeAttributeValue('Save changes'), 'Save changes');
});
