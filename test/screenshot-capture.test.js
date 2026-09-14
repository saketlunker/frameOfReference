'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPicker } = require('../test-support/load-picker.js');

function loadCapture(t) {
  const { picker, window, document, dom } = loadPicker({ html: '<button id="save">Save</button>' });
  t.after(() => {
    picker.deactivate();
    dom.window.close();
  });
  Object.assign(window, { innerWidth: 400, innerHeight: 300 });

  const frames = [];
  const requests = [];
  const crops = [];
  window.console.debug = () => {};
  window.requestAnimationFrame = (callback) => frames.push(callback);
  window.cancelAnimationFrame = () => {};
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, respond) {
        if (message.type === 'frameofreference:capture') {
          requests.push({ message, respond });
        }
      }
    }
  };

  const target = document.getElementById('save');
  const state = { rect: { left: 10, top: 20, width: 100, height: 60 } };
  target.getBoundingClientRect = () => ({ ...state.rect });
  const image = new window.Blob(['fixture'], { type: 'image/png' });
  picker.cropScreenshot = async (...args) => {
    crops.push(args);
    return image;
  };
  picker.activate();

  return {
    picker, window, target, state, requests, crops, image,
    paint: () => {
      assert.ok(frames.length > 0, 'a paint should have been scheduled');
      frames.shift()(0);
    },
    respond: (index = 0) => requests[index].respond({ ok: true, dataUrl: 'data:image/png;base64,fixture' })
  };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('a stable capture hides and restores its overlay and crops the original target', async (t) => {
  const run = loadCapture(t);
  const pending = run.picker.captureElementScreenshot(run.target);
  assert.equal(run.picker.overlayRoot.style.display, 'none');

  run.paint();
  await flush();
  run.respond();

  assert.equal(await pending, run.image);
  assert.equal(run.picker.overlayRoot.style.display, 'block');
  assert.equal(run.crops.length, 1);
  assert.deepEqual({ ...run.crops[0][1] }, run.state.rect);
});

test('a refused screenshot restores the overlay and preserves the text-only path', async (t) => {
  const run = loadCapture(t);
  const pending = run.picker.captureElementScreenshot(run.target);
  run.paint();
  await flush();
  run.requests[0].respond({ ok: false, dataUrl: null });

  assert.equal(await pending, null);
  assert.equal(run.picker.overlayRoot.style.display, 'block');
  assert.equal(run.crops.length, 0);
});

test('cancelling before paint prevents a screenshot request', async (t) => {
  const run = loadCapture(t);
  const pending = run.picker.captureElementScreenshot(run.target);
  run.picker.deactivate();
  run.paint();
  await flush();

  if (run.requests.length) run.respond();
  assert.equal(await pending, null);
  assert.equal(run.requests.length, 0);
  assert.equal(run.crops.length, 0);
});

test('moving the target before paint prevents a stale screenshot request', async (t) => {
  const run = loadCapture(t);
  const pending = run.picker.captureElementScreenshot(run.target);
  run.state.rect.left += 30;
  run.paint();
  await flush();

  if (run.requests.length) run.respond();
  assert.equal(await pending, null);
  assert.equal(run.requests.length, 0);
  assert.equal(run.picker.overlayRoot.style.display, 'block');
});

const STALE_CHANGES = [
  ['target movement', (run) => { run.state.rect.top += 40; }],
  ['target resizing', (run) => { run.state.rect.width += 20; }],
  ['target removal', (run) => { run.target.remove(); }],
  ['window scrolling', (run) => { run.window.scrollY += 40; }],
  ['viewport resizing', (run) => { run.window.innerWidth += 40; }],
  ['device scale changing', (run) => { run.window.devicePixelRatio = 2; }],
  ['pinch zoom starting', (run) => { run.window.visualViewport = { scale: 2 }; }],
  ['a scroll that returns to its original position', (run) => {
    run.window.dispatchEvent(new run.window.Event('scroll'));
  }],
  ['a resize that returns to its original dimensions', (run) => {
    run.window.dispatchEvent(new run.window.Event('resize'));
  }]
];

for (const [description, change] of STALE_CHANGES) {
  test(`${description} during capture discards the screenshot`, async (t) => {
    const run = loadCapture(t);
    const pending = run.picker.captureElementScreenshot(run.target);
    run.paint();
    await flush();
    change(run);
    run.respond();

    assert.equal(await pending, null);
    assert.equal(run.crops.length, 0);
    assert.equal(run.picker.overlayRoot.style.display, 'block');
  });
}

test('an old capture cannot reveal the overlay of a restarted capture', async (t) => {
  const run = loadCapture(t);
  const first = run.picker.captureElementScreenshot(run.target);
  run.paint();
  await flush();

  run.picker.deactivate();
  run.picker.activate();
  const newOverlay = run.picker.overlayRoot;
  const second = run.picker.captureElementScreenshot(run.target);
  run.paint();
  await flush();

  run.respond(0);
  const firstImage = await first;
  const newOverlayDisplay = newOverlay.style.display;
  run.respond(1);

  assert.equal(await second, run.image);
  assert.equal(firstImage, null);
  assert.equal(newOverlayDisplay, 'none');
  assert.equal(newOverlay.style.display, 'block');
});

test('cancelling while image decoding finishes discards the screenshot', async (t) => {
  const run = loadCapture(t);
  let finishCrop;
  run.picker.cropScreenshot = () => new Promise((resolve) => { finishCrop = resolve; });
  const pending = run.picker.captureElementScreenshot(run.target);
  run.paint();
  await flush();
  run.respond();
  await flush();
  assert.equal(typeof finishCrop, 'function');

  run.picker.deactivate();
  finishCrop(run.image);

  assert.equal(await pending, null);
});

for (const [description, rect] of [
  ['fully off-screen', { left: -120, top: 20, width: 100, height: 60 }],
  ['larger than half the viewport', { left: 0, top: 0, width: 400, height: 151 }]
]) {
  test(`a target ${description} skips screenshot capture`, async (t) => {
    const run = loadCapture(t);
    run.state.rect = rect;
    const pending = run.picker.captureElementScreenshot(run.target);
    if (run.picker.overlayRoot.style.display === 'none') {
      run.paint();
      await flush();
      if (run.requests.length) run.respond();
    }

    assert.equal(await pending, null);
    assert.equal(run.requests.length, 0);
    assert.equal(run.crops.length, 0);
    assert.equal(run.picker.overlayRoot.style.display, 'block');
  });
}

test('a target at exactly half the viewport still permits a screenshot', async (t) => {
  const run = loadCapture(t);
  run.state.rect = { left: 0, top: 0, width: 400, height: 150 };
  const pending = run.picker.captureElementScreenshot(run.target);
  run.paint();
  await flush();
  run.respond();

  assert.equal(await pending, run.image);
});

test('a pinch-zoomed page keeps text copy without requesting a misaligned screenshot', async (t) => {
  const run = loadCapture(t);
  run.window.visualViewport = { scale: 2 };

  assert.equal(await run.picker.captureElementScreenshot(run.target), null);
  assert.equal(run.requests.length, 0);
  assert.equal(run.picker.overlayRoot.style.display, 'block');
});
