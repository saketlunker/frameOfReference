'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPicker } = require('../test-support/load-picker.js');

const EXPECTED_TEXT = [
  '# Frame of Reference (UI element reference)',
  'Path: example.com/preferences (page route)',
  'Target: button "Save & <send>" (selected element)',
  'Exact: example.com###save (CSS selector)',
  'Region: main "Settings" (parent container)'
].join('\n');

function loadCopy(t, { screenshot = true } = {}) {
  const { picker, window, document, dom } = loadPicker({
    html: '<main id="settings" aria-label="Settings"><button id="save">Save &amp; &lt;send&gt;</button></main>',
    url: 'https://example.com/preferences?utm_source=test'
  });
  t.after(() => {
    picker.deactivate();
    dom.window.close();
  });

  const writes = [];
  const textWrites = [];
  const messages = [];
  const requests = [];
  let finish;
  const finished = new Promise((resolve) => { finish = resolve; });
  window.console.debug = () => {};
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, respond) {
        messages.push(message);
        if (message.type === 'frameofreference:capture') requests.push(respond);
        if (message.type === 'frameofreference:result') finish(message.kind);
      }
    }
  };
  const clipboard = {
    async write(items) { writes.push(items); },
    async writeText(text) { textWrites.push(text); }
  };
  Object.defineProperty(window.navigator, 'clipboard', { value: clipboard, configurable: true });
  window.ClipboardItem = class {
    constructor(data) { this.data = data; }
    static supports() { return true; }
  };

  const target = document.getElementById('save');
  target.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 60, right: 110, bottom: 80 });
  document.elementsFromPoint = () => [target];
  document.documentElement.style.setProperty('cursor', 'help', 'important');
  document.body.style.setProperty('cursor', 'wait');
  const image = new window.Blob(['fixture'], { type: 'image/png' });
  const originalCapture = picker.captureElementScreenshot;
  picker.captureElementScreenshot = async () => screenshot ? image : null;
  picker.activate();

  return {
    picker, window, document, target, image, clipboard, writes, textWrites, messages, requests,
    finished, originalCapture
  };
}

function readBlob(window, blob) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('clicking a target copies exact text and rich image formats, then restores the page', async (t) => {
  const run = loadCopy(t);
  let pageClicks = 0;
  run.target.addEventListener('click', () => { pageClicks += 1; });
  const event = new run.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 30 });

  run.target.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(pageClicks, 0);
  assert.equal(await run.finished, 'copied');

  assert.equal(run.writes.length, 1);
  assert.equal(run.textWrites.length, 0);
  const data = run.writes[0][0].data;
  assert.deepEqual(Object.keys(data).sort(), ['image/png', 'text/html', 'text/plain']);
  assert.equal(data['image/png'], run.image);
  assert.equal(await readBlob(run.window, data['text/plain']), EXPECTED_TEXT);
  const html = new run.window.DOMParser().parseFromString(await readBlob(run.window, data['text/html']), 'text/html');
  assert.equal(html.querySelector('pre').textContent, EXPECTED_TEXT);
  assert.match(html.querySelector('img').src, /^data:image\/png;base64,/);
  assert.equal(html.querySelector('send'), null, 'captured text must be escaped in rich HTML');
  assert.equal(run.picker.active, false);
  assert.equal(run.picker._copyInFlight, false);
  assert.equal(run.picker._listenersAttached, false);
  assert.equal(run.document.getElementById('frameofreference-picker-host'), null);
  assert.equal(run.document.documentElement.style.getPropertyValue('cursor'), 'help');
  assert.equal(run.document.documentElement.style.getPropertyPriority('cursor'), 'important');
  assert.equal(run.document.body.style.cursor, 'wait');
  run.target.click();
  assert.equal(pageClicks, 1, 'ordinary page clicks must work after the picker closes');
});

test('Enter copies the highlighted target when screenshots are unavailable', async (t) => {
  const run = loadCopy(t, { screenshot: false });
  run.target.dispatchEvent(new run.window.MouseEvent('pointermove', { bubbles: true, clientX: 20, clientY: 30 }));
  run.picker.flushRefresh();
  assert.equal(run.picker.currentTarget, run.target);

  const event = new run.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  run.document.dispatchEvent(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(await run.finished, 'copied');
  assert.deepEqual(run.textWrites, [EXPECTED_TEXT]);
  assert.equal(run.writes.length, 0);
});

test('a rejected rich clipboard write falls back to the same plain-text reference', async (t) => {
  const run = loadCopy(t);
  run.clipboard.write = async () => { throw new Error('rich clipboard refused'); };

  await run.picker.copyCurrentTarget(run.target);

  assert.equal(await run.finished, 'copied');
  assert.deepEqual(run.textWrites, [EXPECTED_TEXT]);
});

test('a stale screenshot falls back to text without changing the reference', async (t) => {
  const run = loadCopy(t);
  run.picker.captureElementScreenshot = run.originalCapture;
  run.window.requestAnimationFrame = (callback) => {
    queueMicrotask(() => callback(0));
    return 1;
  };
  const pending = run.picker.copyCurrentTarget(run.target);
  await flush();
  assert.equal(run.requests.length, 1);
  run.window.dispatchEvent(new run.window.Event('scroll'));
  run.requests[0]({ ok: true, dataUrl: 'data:image/png;base64,fixture' });
  await pending;

  assert.equal(await run.finished, 'copied');
  assert.deepEqual(run.textWrites, [EXPECTED_TEXT]);
  assert.equal(run.writes.length, 0);
});

test('legacy copy remains available when both clipboard APIs refuse the write', async (t) => {
  const run = loadCopy(t);
  run.clipboard.write = async () => { throw new Error('rich clipboard refused'); };
  run.clipboard.writeText = async () => { throw new Error('plain clipboard refused'); };
  const fallbackWrites = [];
  run.document.execCommand = (command) => {
    assert.equal(command, 'copy');
    fallbackWrites.push(run.document.activeElement.value);
    return true;
  };

  await run.picker.copyCurrentTarget(run.target);

  assert.equal(await run.finished, 'copied');
  assert.deepEqual(fallbackWrites, [EXPECTED_TEXT]);
  assert.equal(run.document.querySelector('textarea'), null);
});

test('a failed text copy reports an error and removes picker UI', async (t) => {
  const run = loadCopy(t, { screenshot: false });
  run.clipboard.writeText = async () => { throw new Error('plain clipboard refused'); };
  run.document.execCommand = () => false;

  await run.picker.copyCurrentTarget(run.target);

  assert.equal(await run.finished, 'error');
  assert.equal(run.picker.active, false);
  assert.equal(run.document.querySelector('textarea'), null);
  assert.equal(run.document.getElementById('frameofreference-picker-host'), null);
});

test('Escape during screenshot capture prevents clipboard writes and restores page input', async (t) => {
  const run = loadCopy(t);
  let finishCapture;
  run.picker.captureElementScreenshot = () => new Promise((resolve) => { finishCapture = resolve; });
  const pending = run.picker.copyCurrentTarget(run.target);

  const escape = new run.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  run.document.dispatchEvent(escape);
  finishCapture(run.image);
  await pending;

  assert.equal(escape.defaultPrevented, true);
  assert.equal(await run.finished, 'cancelled');
  assert.equal(run.writes.length, 0);
  assert.equal(run.textWrites.length, 0);
  assert.equal(run.picker._listenersAttached, false);
  assert.equal(run.document.documentElement.style.cursor, 'help');
});

test('a superseded image encoding cannot write to the clipboard or close the new picker', async (t) => {
  const run = loadCopy(t);
  let finishEncoding;
  run.picker.blobToDataUrl = () => new Promise((resolve) => { finishEncoding = resolve; });
  const pending = run.picker.copyCurrentTarget(run.target);
  await flush();
  assert.equal(typeof finishEncoding, 'function');

  run.picker.deactivate();
  run.picker.activate();
  const overlay = run.picker.overlayRoot;
  finishEncoding('data:image/png;base64,fixture');
  await pending;

  assert.equal(run.writes.length, 0);
  assert.equal(run.textWrites.length, 0);
  assert.equal(run.picker.active, true);
  assert.equal(run.picker.overlayRoot, overlay);
  assert.equal(run.messages.filter((message) => message.type === 'frameofreference:result').length, 0);
});

test('a superseded clipboard rejection cannot fall through to legacy copy', async (t) => {
  const run = loadCopy(t, { screenshot: false });
  let rejectWrite;
  run.clipboard.writeText = () => new Promise((_resolve, reject) => { rejectWrite = reject; });
  let legacyCopies = 0;
  run.document.execCommand = () => { legacyCopies += 1; return true; };
  const pending = run.picker.copyCurrentTarget(run.target);
  await flush();
  assert.equal(typeof rejectWrite, 'function');

  run.picker.deactivate();
  run.picker.activate();
  rejectWrite(new Error('clipboard refused'));
  await pending;

  assert.equal(legacyCopies, 0);
  assert.equal(run.picker.active, true);
  assert.equal(run.document.querySelector('textarea'), null);
});

test('a second copy request cannot replace the target while the first is pending', async (t) => {
  const run = loadCopy(t);
  let finishCapture;
  let captures = 0;
  run.picker.captureElementScreenshot = () => {
    captures += 1;
    return new Promise((resolve) => { finishCapture = resolve; });
  };
  const first = run.picker.copyCurrentTarget(run.target);
  await run.picker.copyCurrentTarget(run.document.getElementById('settings'));
  finishCapture(null);
  await first;

  assert.equal(captures, 1);
  assert.deepEqual(run.textWrites, [EXPECTED_TEXT]);
  assert.equal(await run.finished, 'copied');
});
