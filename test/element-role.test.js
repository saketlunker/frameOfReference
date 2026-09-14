'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPicker } = require('./helpers/load-picker.js');

const HTML = `<!doctype html><html><body>
  <a id="link" href="/docs">Docs</a>
  <a id="anchor-no-href">Docs</a>
  <button id="button">Save</button>
  <summary id="summary">Details</summary>
  <select id="select"><option id="option">One</option></select>
  <textarea id="textarea"></textarea>
  <input id="checkbox" type="checkbox">
  <input id="radio" type="radio">
  <input id="search" type="search">
  <input id="range" type="range">
  <input id="submit" type="submit">
  <input id="text" type="text">
  <input id="bare">
  <div id="explicit" role="tablist">Tabs</div>
  <nav id="nav">Nav</nav>
</body></html>`;

const { picker, document } = loadPicker({ html: HTML });

function roleOf(id) {
  return picker.getElementRole(document.getElementById(id));
}

test('a[href] maps to link', () => {
  assert.equal(roleOf('link'), 'link');
});

test('an anchor without href does not map to link', () => {
  assert.notEqual(roleOf('anchor-no-href'), 'link');
});

test('button maps to button', () => {
  assert.equal(roleOf('button'), 'button');
});

test('summary maps to button', () => {
  assert.equal(roleOf('summary'), 'button');
});

test('select maps to combobox', () => {
  assert.equal(roleOf('select'), 'combobox');
});

test('textarea maps to textbox', () => {
  assert.equal(roleOf('textarea'), 'textbox');
});

test('option maps to option', () => {
  assert.equal(roleOf('option'), 'option');
});

test('input[type=checkbox] maps to checkbox', () => {
  assert.equal(roleOf('checkbox'), 'checkbox');
});

test('input[type=radio] maps to radio', () => {
  assert.equal(roleOf('radio'), 'radio');
});

test('input[type=search] maps to searchbox', () => {
  assert.equal(roleOf('search'), 'searchbox');
});

test('input[type=range] maps to slider', () => {
  assert.equal(roleOf('range'), 'slider');
});

test('input[type=submit] maps to button', () => {
  assert.equal(roleOf('submit'), 'button');
});

test('input[type=text] maps to textbox', () => {
  assert.equal(roleOf('text'), 'textbox');
});

test('a bare input maps to textbox', () => {
  assert.equal(roleOf('bare'), 'textbox');
});

test('an explicit role attribute wins over the tag mapping', () => {
  assert.equal(roleOf('explicit'), 'tablist');
});

test('nav maps to its landmark role', () => {
  assert.equal(roleOf('nav'), 'navigation');
});
