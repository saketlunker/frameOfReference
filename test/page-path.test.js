'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPicker } = require('../test-support/load-picker.js');

const { picker } = loadPicker();

test('isNoisyQueryParam matches the utm_ prefix', () => {
  assert.equal(picker.isNoisyQueryParam('utm_source'), true);
  assert.equal(picker.isNoisyQueryParam('utm_campaign'), true);
  assert.equal(picker.isNoisyQueryParam('UTM_MEDIUM'), true);
});

test('isNoisyQueryParam matches the clid suffix', () => {
  assert.equal(picker.isNoisyQueryParam('gclid'), true);
  assert.equal(picker.isNoisyQueryParam('fbclid'), true);
  assert.equal(picker.isNoisyQueryParam('vendorclid'), true);
  assert.equal(picker.isNoisyQueryParam('MSCLID'), true);
});

test('isNoisyQueryParam matches the explicit key set', () => {
  for (const key of ['igshid', 'srsltid', '_ga', '_gl', 'mc_cid', 'mc_eid', 'ref', 'ref_src']) {
    assert.equal(picker.isNoisyQueryParam(key), true, `${key} should be treated as noisy`);
  }
});

test('isNoisyQueryParam leaves ordinary params alone', () => {
  for (const key of ['q', 'page', 'id', 'sort', 'utmsource', 'client', 'reference']) {
    assert.equal(picker.isNoisyQueryParam(key), false, `${key} should survive`);
  }
});

test('isNoisyQueryParam tolerates empty input', () => {
  assert.equal(picker.isNoisyQueryParam(''), false);
  assert.equal(picker.isNoisyQueryParam(null), false);
  assert.equal(picker.isNoisyQueryParam(undefined), false);
});

test('buildCompactPath strips noisy params and keeps ordinary ones', () => {
  const { picker: scoped } = loadPicker({
    url: 'https://example.com/docs/guide?q=selector&utm_source=news&gclid=abc&page=2'
  });

  assert.equal(scoped.buildCompactPath(), 'example.com/docs/guide?q=selector&page=2');
});

test('buildCompactPath preserves the hash', () => {
  const { picker: scoped } = loadPicker({
    url: 'https://example.com/search?q=picker&fbclid=xyz#results'
  });

  assert.equal(scoped.buildCompactPath(), 'example.com/search?q=picker#results');
});

test('buildCompactPath keeps a hash when every param was noisy', () => {
  const { picker: scoped } = loadPicker({
    url: 'https://example.com/pricing?utm_source=news&utm_medium=email#plans'
  });

  assert.equal(scoped.buildCompactPath(), 'example.com/pricing#plans');
});

test('buildCompactPath handles a bare path', () => {
  const { picker: scoped } = loadPicker({ url: 'https://example.com/' });

  assert.equal(scoped.buildCompactPath(), 'example.com/');
});

test('buildCompactPath keeps the port in the host', () => {
  const { picker: scoped } = loadPicker({ url: 'http://localhost:3000/app?view=grid' });

  assert.equal(scoped.buildCompactPath(), 'localhost:3000/app?view=grid');
});
