'use strict';

// Loads background.js the way Chrome does: as a plain service-worker script
// evaluated against a `chrome` global. The file registers its listeners at the
// top level and exposes nothing, so the harness captures those listeners
// through the stub and drives them directly. background.js is not modified to
// make it testable.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BACKGROUND_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

// Swallows the worker's diagnostic output so a deliberate failure path does not
// look like a broken test run. Recorded so tests can assert on it if needed.
function createQuietConsole(log) {
  const capture = (level) => (...args) => log.push({ level, args });
  return { log: capture('log'), warn: capture('warn'), error: capture('error'), debug: capture('debug') };
}

function loadBackground({ tabs = {}, toggleResults = [true], captureFails = false } = {}) {
  const calls = [];
  const consoleLog = [];
  const listeners = new Map();
  const alarms = new Map();
  const timers = new Set();

  const tabState = new Map(Object.entries(tabs).map(([id, tab]) => [Number(id), tab]));
  const pendingToggles = [...toggleResults];

  const record = (name, arg) => calls.push({ name, arg });
  const listenerSlot = (key) => ({ addListener: (fn) => listeners.set(key, fn) });

  const chrome = {
    action: {
      onClicked: listenerSlot('action.onClicked'),
      async setBadgeText(arg) { record('setBadgeText', arg); },
      async setBadgeBackgroundColor(arg) { record('setBadgeBackgroundColor', arg); },
      async setTitle(arg) { record('setTitle', arg); }
    },
    runtime: {
      onMessage: listenerSlot('runtime.onMessage'),
      lastError: null
    },
    tabs: {
      onRemoved: listenerSlot('tabs.onRemoved'),
      onUpdated: listenerSlot('tabs.onUpdated'),
      async get(tabId) {
        const tab = tabState.get(tabId);
        if (!tab) {
          throw new Error(`No tab with id ${tabId}`);
        }
        return { id: tabId, ...tab };
      },
      async captureVisibleTab(windowId, options) {
        record('captureVisibleTab', { windowId, options });
        if (captureFails) {
          throw new Error('capture refused');
        }
        return 'data:image/png;base64,STUB';
      }
    },
    scripting: {
      async executeScript(options) {
        if (options.files) {
          record('injectScript', options.files);
          return [{ result: undefined }];
        }

        record('executeFunc', options.target);
        const next = pendingToggles.length > 1 ? pendingToggles.shift() : pendingToggles[0];
        return [{ result: next }];
      }
    },
    alarms: {
      onAlarm: listenerSlot('alarms.onAlarm'),
      async create(name, info) {
        alarms.set(name, info);
        record('alarmCreate', name);
      },
      async clear(name) {
        record('alarmClear', name);
        return alarms.delete(name);
      },
      async getAll() {
        return [...alarms.keys()].map((name) => ({ name }));
      }
    }
  };

  // Track timers so a test can leave nothing pending behind it.
  const trackedSetTimeout = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const trackedClearTimeout = (id) => {
    timers.delete(id);
    return clearTimeout(id);
  };

  const context = vm.createContext({
    chrome,
    console: createQuietConsole(consoleLog),
    setTimeout: trackedSetTimeout,
    clearTimeout: trackedClearTimeout
  });

  vm.runInContext(BACKGROUND_SOURCE, context, { filename: 'background.js' });

  const fire = (key, ...args) => {
    const listener = listeners.get(key);
    if (!listener) {
      throw new Error(`background.js registered no listener for ${key}`);
    }
    return listener(...args);
  };

  return {
    calls,
    consoleLog,
    alarms,
    fire,
    // Names of the badge-clear alarms created so far, newest last.
    alarmNames: () => calls.filter((call) => call.name === 'alarmCreate').map((call) => call.arg),
    badgeTexts: () => calls.filter((call) => call.name === 'setBadgeText').map((call) => call.arg.text),
    titles: () => calls.filter((call) => call.name === 'setTitle').map((call) => call.arg.title),
    dispose: () => {
      for (const id of timers) {
        clearTimeout(id);
      }
      timers.clear();
    }
  };
}

// Lets the worker's floating promises settle. The listeners dispatch work with
// dispatchBestEffort, so there is nothing to await from the caller's side.
// setImmediate drains the whole microtask queue between turns, which a chain of
// resolved promises does not.
async function flush(turns = 12) {
  for (let index = 0; index < turns; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// Objects built inside the vm realm carry that realm's prototypes, so a direct
// deepEqual against a host literal fails on reference equality. Re-wrap first.
function plain(value) {
  return value === undefined || value === null ? value : { ...value };
}

module.exports = { loadBackground, flush, plain };
