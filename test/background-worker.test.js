'use strict';

// Coverage for the service worker. background.js had no tests at all, so the
// badge generation scheme — the thing standing between a stale timer and a
// wrong toolbar badge — was entirely unverified.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackground, flush, plain } = require('../test-support/load-background.js');

const HTTP_TAB = { id: 1, url: 'https://example.com/', active: true, windowId: 10 };

test('an unsupported page is rejected without injecting anything', async (t) => {
  const worker = loadBackground();
  t.after(() => worker.dispose());

  await worker.fire('action.onClicked', { id: 1, url: 'chrome://extensions', windowId: 10 });
  await flush();

  assert.ok(worker.badgeTexts().includes('NO'), 'should flash the unsupported badge');
  assert.ok(
    !worker.calls.some((call) => call.name === 'injectScript'),
    'must not inject into a chrome:// page'
  );
});

test('activating the picker injects once and shows the active badge', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB }, toggleResults: [true] });
  t.after(() => worker.dispose());

  await worker.fire('action.onClicked', HTTP_TAB);
  await flush();

  assert.ok(worker.badgeTexts().includes('ON'));
  assert.equal(worker.calls.filter((call) => call.name === 'injectScript').length, 1);
  assert.ok(worker.titles().some((title) => title.includes('active')));
});

test('the picker script is injected into all frames', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB } });
  t.after(() => worker.dispose());

  await worker.fire('action.onClicked', HTTP_TAB);
  await flush();

  const target = worker.calls.find((call) => call.name === 'executeFunc');
  assert.equal(target.arg.allFrames, true);
});

test('toggling the picker off clears the badge', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB }, toggleResults: [false] });
  t.after(() => worker.dispose());

  await worker.fire('action.onClicked', HTTP_TAB);
  await flush();

  assert.ok(worker.badgeTexts().includes(''), 'an inactive picker should clear the badge');
  assert.ok(!worker.badgeTexts().includes('ON'));
});

test('a picker that never initialises surfaces the error badge', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB }, toggleResults: [null] });
  t.after(() => worker.dispose());

  await worker.fire('action.onClicked', HTTP_TAB);
  await flush();

  assert.ok(worker.badgeTexts().includes('ERR'));
});

test('a second click while the first is in flight is ignored', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB } });
  t.after(() => worker.dispose());

  const first = worker.fire('action.onClicked', HTTP_TAB);
  const second = worker.fire('action.onClicked', HTTP_TAB);
  await Promise.all([first, second]);
  await flush();

  assert.equal(
    worker.calls.filter((call) => call.name === 'injectScript').length,
    1,
    'the processing guard should collapse concurrent clicks'
  );
});

test('a state message toggles the badge in both directions', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB } });
  t.after(() => worker.dispose());

  const sender = { tab: HTTP_TAB };
  worker.fire('runtime.onMessage', { type: 'frameofreference:state', active: true }, sender, () => {});
  await flush();
  assert.ok(worker.badgeTexts().includes('ON'));

  worker.fire('runtime.onMessage', { type: 'frameofreference:state', active: false }, sender, () => {});
  await flush();
  assert.ok(worker.badgeTexts().includes(''));
});

test('a message from something other than a tab is refused', async (t) => {
  const worker = loadBackground();
  t.after(() => worker.dispose());

  let response;
  worker.fire('runtime.onMessage', { type: 'frameofreference:state' }, {}, (value) => {
    response = value;
  });

  assert.deepEqual(plain(response), { ok: false });
});

test('an unknown message type is refused', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB } });
  t.after(() => worker.dispose());

  let response;
  worker.fire('runtime.onMessage', { type: 'nope' }, { tab: HTTP_TAB }, (value) => {
    response = value;
  });

  assert.deepEqual(plain(response), { ok: false });
});

test('a capture request keeps the channel open and answers with a data URL', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB } });
  t.after(() => worker.dispose());

  let response;
  const kept = worker.fire('runtime.onMessage', { type: 'frameofreference:capture' }, { tab: HTTP_TAB }, (value) => {
    response = value;
  });

  assert.equal(kept, true, 'must return true so sendResponse stays valid');

  await flush();
  assert.equal(response.ok, true);
  assert.match(response.dataUrl, /^data:image\/png/);
});

test('a capture for a backgrounded tab is refused without capturing', async (t) => {
  const worker = loadBackground({ tabs: { 1: { ...HTTP_TAB, active: false } } });
  t.after(() => worker.dispose());

  let response;
  worker.fire('runtime.onMessage', { type: 'frameofreference:capture' }, { tab: HTTP_TAB }, (value) => {
    response = value;
  });
  await flush();

  assert.deepEqual(plain(response), { ok: false, dataUrl: null });
  assert.ok(!worker.calls.some((call) => call.name === 'captureVisibleTab'));
});

test('a failing capture still answers rather than hanging', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB }, captureFails: true });
  t.after(() => worker.dispose());

  let response;
  worker.fire('runtime.onMessage', { type: 'frameofreference:capture' }, { tab: HTTP_TAB }, (value) => {
    response = value;
  });
  await flush();

  assert.deepEqual(plain(response), { ok: false, dataUrl: null });
});

test('a stale badge alarm does not clear a newer badge', async (t) => {
  // The generation counter exists for exactly this race: a flash schedules a
  // clear, the user re-activates before it fires, and the old alarm must not
  // wipe the new badge.
  const worker = loadBackground({ tabs: { 1: HTTP_TAB } });
  t.after(() => worker.dispose());

  worker.fire('runtime.onMessage', { type: 'frameofreference:result', kind: 'copied' }, { tab: HTTP_TAB }, () => {});
  await flush();

  const staleAlarm = worker.alarmNames().at(-1);
  assert.ok(staleAlarm, 'the success flash should have scheduled a clear');

  worker.fire('runtime.onMessage', { type: 'frameofreference:state', active: true }, { tab: HTTP_TAB }, () => {});
  await flush();

  const beforeAlarm = worker.badgeTexts().length;
  worker.fire('alarms.onAlarm', { name: staleAlarm });
  await flush();

  const added = worker.badgeTexts().slice(beforeAlarm);
  assert.ok(!added.includes(''), `a stale generation cleared a live badge: ${JSON.stringify(added)}`);
});

test('an alarm that is not a badge alarm is ignored', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB } });
  t.after(() => worker.dispose());

  worker.fire('alarms.onAlarm', { name: 'something-else' });
  await flush();

  assert.equal(worker.badgeTexts().length, 0);
});

test('a malformed badge alarm name is ignored', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB } });
  t.after(() => worker.dispose());

  for (const name of ['frameofreference-clear-badge:', 'frameofreference-clear-badge:abc:x', 'frameofreference-clear-badge:1:']) {
    worker.fire('alarms.onAlarm', { name });
  }
  await flush();

  assert.equal(worker.badgeTexts().length, 0);
});

test('closing a tab drops its injection state so the next open re-injects', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB } });
  t.after(() => worker.dispose());

  await worker.fire('action.onClicked', HTTP_TAB);
  await flush();
  assert.equal(worker.calls.filter((call) => call.name === 'injectScript').length, 1);

  worker.fire('tabs.onRemoved', 1);
  await flush();

  await worker.fire('action.onClicked', HTTP_TAB);
  await flush();
  assert.equal(
    worker.calls.filter((call) => call.name === 'injectScript').length,
    2,
    'a reopened tab has no content script, so it must be injected again'
  );
});

test('navigating a tab drops its injection state', async (t) => {
  const worker = loadBackground({ tabs: { 1: HTTP_TAB } });
  t.after(() => worker.dispose());

  await worker.fire('action.onClicked', HTTP_TAB);
  await flush();

  worker.fire('tabs.onUpdated', 1, { status: 'loading' });
  await flush();

  await worker.fire('action.onClicked', HTTP_TAB);
  await flush();
  assert.equal(worker.calls.filter((call) => call.name === 'injectScript').length, 2);
});
