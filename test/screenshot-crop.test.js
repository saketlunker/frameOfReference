'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPicker } = require('../test-support/load-picker.js');

function loadCrop(t, { bitmapWidth = 800, bitmapHeight = 600, dpr = 2 } = {}) {
  const { picker, window, dom } = loadPicker();
  t.after(() => dom.window.close());
  Object.assign(window, { innerWidth: 400, innerHeight: 300, devicePixelRatio: dpr });

  const draws = [];
  let imageLoads = 0;
  window.Image = class {
    naturalWidth = bitmapWidth;
    naturalHeight = bitmapHeight;
    set src(_value) {
      imageLoads += 1;
      queueMicrotask(() => this.onload());
    }
  };
  window.HTMLCanvasElement.prototype.getContext = function () {
    return { drawImage: (_image, ...args) => draws.push({ args, width: this.width, height: this.height }) };
  };
  window.HTMLCanvasElement.prototype.toBlob = (done, type) => {
    done(new window.Blob(['fixture'], { type }));
  };

  return { picker, window, draws, imageLoads: () => imageLoads };
}

const VISIBLE_CASES = [
  ['inside the viewport', { left: 10, top: 20, width: 100, height: 60 }, [20, 40, 200, 120]],
  ['past the left edge', { left: -20, top: 20, width: 100, height: 60 }, [0, 40, 160, 120]],
  ['past the top edge', { left: 10, top: -10, width: 100, height: 60 }, [20, 0, 200, 100]],
  ['past the top-left corner', { left: -20, top: -10, width: 100, height: 60 }, [0, 0, 160, 100]],
  ['past the right edge', { left: 350, top: 20, width: 100, height: 60 }, [700, 40, 100, 120]],
  ['past the bottom edge', { left: 10, top: 270, width: 100, height: 60 }, [20, 540, 200, 60]],
  ['past the bottom-right corner', { left: 350, top: 270, width: 100, height: 60 }, [700, 540, 100, 60]],
  ['across every edge', { left: -10, top: -20, width: 430, height: 350 }, [0, 0, 800, 600]]
];

for (const [description, rect, expected] of VISIBLE_CASES) {
  test(`a crop ${description} includes only the visible target bounds`, async (t) => {
    const { picker, draws } = loadCrop(t);

    const blob = await picker.cropScreenshot('data:image/png;base64,fixture', rect);

    assert.equal(blob.type, 'image/png');
    assert.equal(draws.length, 1);
    assert.deepEqual(draws[0].args, [...expected, 0, 0, expected[2], expected[3]]);
    assert.equal(draws[0].width, expected[2]);
    assert.equal(draws[0].height, expected[3]);
  });
}

const EMPTY_CASES = [
  ['left of the viewport', { left: -120, top: 20, width: 100, height: 60 }],
  ['above the viewport', { left: 10, top: -70, width: 100, height: 60 }],
  ['right of the viewport', { left: 410, top: 20, width: 100, height: 60 }],
  ['below the viewport', { left: 10, top: 310, width: 100, height: 60 }],
  ['touching the left edge', { left: -100, top: 20, width: 100, height: 60 }],
  ['touching the top edge', { left: 10, top: -60, width: 100, height: 60 }],
  ['touching the right edge', { left: 400, top: 20, width: 100, height: 60 }],
  ['touching the bottom edge', { left: 10, top: 300, width: 100, height: 60 }],
  ['zero width', { left: 10, top: 20, width: 0, height: 60 }],
  ['negative height', { left: 10, top: 20, width: 100, height: -1 }],
  ['non-finite coordinates', { left: NaN, top: 20, width: 100, height: 60 }],
  ['non-finite dimensions', { left: 10, top: 20, width: Infinity, height: 60 }]
];

for (const [description, rect] of EMPTY_CASES) {
  test(`a crop ${description} is skipped before image decoding`, async (t) => {
    const { picker, draws, imageLoads } = loadCrop(t);

    assert.equal(await picker.cropScreenshot('data:image/png;base64,fixture', rect), null);
    assert.equal(imageLoads(), 0);
    assert.equal(draws.length, 0);
  });
}

test('crop scaling follows the actual bitmap rather than an assumed device pixel ratio', async (t) => {
  const { picker, draws } = loadCrop(t, { bitmapWidth: 400, bitmapHeight: 300, dpr: 2 });

  await picker.cropScreenshot('data:image/png;base64,fixture', { left: 10, top: 20, width: 100, height: 60 });

  assert.deepEqual(draws[0].args, [10, 20, 100, 60, 0, 0, 100, 60]);
});

test('fractional bounds are rounded by their edges, not by an independent width', async (t) => {
  const { picker, draws } = loadCrop(t, { bitmapWidth: 500, bitmapHeight: 375, dpr: 1.25 });

  await picker.cropScreenshot('data:image/png;base64,fixture', { left: 0.3, top: 0.3, width: 10.2, height: 10.2 });

  assert.deepEqual(draws[0].args, [0, 0, 13, 13, 0, 0, 13, 13]);
});

test('cropping uses the viewport dimensions captured with the screenshot', async (t) => {
  const { picker, window, draws } = loadCrop(t, { bitmapWidth: 400, bitmapHeight: 300 });
  window.innerWidth = 200;
  window.innerHeight = 150;

  await picker.cropScreenshot(
    'data:image/png;base64,fixture',
    { left: 10, top: 20, width: 100, height: 60 },
    { width: 400, height: 300 }
  );

  assert.deepEqual(draws[0].args, [10, 20, 100, 60, 0, 0, 100, 60]);
});
