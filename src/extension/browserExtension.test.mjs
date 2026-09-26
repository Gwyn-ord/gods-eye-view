// src/extension/browserExtension.test.mjs
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setExtensionHandlers,
  getExtensionHandler,
  clearExtensionHandlers,
} from './registry.js';
import { loadBrowserExtension, EXTENSION_NOTICE } from './browserLoader.js';
import { createGevActionRunner } from '../voice/gevActions.js';

afterEach(() => clearExtensionHandlers());

function fakeDoc() {
  const made = [];
  const el = (tag) => {
    const e = {
      tag,
      id: '',
      style: {},
      children: [],
      textContent: '',
      className: '',
      append(...c) {
        e.children.push(...c);
      },
      remove() {},
    };
    made.push(e);
    return e;
  };
  return { made, body: el('body'), createElement: el };
}
const text = (doc) => doc.made.map((e) => e.textContent).join('|');
const viewer = {
  clock: { onTick: { addEventListener: () => () => {} } },
  scene: { canvas: { addEventListener() {}, removeEventListener() {} } },
  camera: { moveEnd: { addEventListener() {} } },
};
const runner = () =>
  createGevActionRunner({ viewer, styleManager: {}, dataManager: {} });

test('handlers with GEV action names or non-functions are refused', () => {
  assert.throws(
    () => setExtensionHandlers({ fly_to_location: () => {} }),
    /clashes with GEV action: fly_to_location/,
  );
  assert.throws(
    () => setExtensionHandlers({ jobs_status: 'x' }),
    /not a function/,
  );
});

test('an unknown tool goes to the extension handler with args and signal', async () => {
  const signal = new AbortController().signal;
  setExtensionHandlers({
    jobs_status: async (args, opts) => ({
      ok: true,
      args,
      same: opts.signal === signal,
    }),
  });
  assert.deepEqual(await runner()('jobs_status', { a: 1 }, { signal }), {
    ok: true,
    args: { a: 1 },
    same: true,
  });
});

test('a tool with no GEV action and no handler still fails as upstream does', async () => {
  await assert.rejects(
    runner()('nope_tool', {}),
    /Unknown GEV tool: nope_tool/,
  );
});

test('a throwing handler rejects like a throwing GEV action', async () => {
  setExtensionHandlers({
    jobs_status: async () => {
      throw new Error('engine exploded');
    },
  });
  await assert.rejects(runner()('jobs_status', {}), /engine exploded/);
});

test('no url and no failure: nothing is mounted', async () => {
  const doc = fakeDoc();
  assert.equal(
    await loadBrowserExtension({ url: null, failed: false, doc }),
    null,
  );
  assert.equal(doc.body.children.length, 0);
});

test('a server-side failure shows the notice', async () => {
  const doc = fakeDoc();
  assert.equal(
    await loadBrowserExtension({ url: null, failed: true, doc }),
    null,
  );
  assert.match(text(doc), new RegExp(EXTENSION_NOTICE));
});

test('a module that fails to import shows the notice and registers nothing', async () => {
  const doc = fakeDoc();
  const errors = [];
  const out = await loadBrowserExtension({
    url: '/@fs/x/browser.mjs',
    failed: false,
    doc,
    importModule: async () => {
      throw new Error('404');
    },
    log: { error: (...a) => errors.push(a) },
  });
  assert.equal(out, null);
  assert.match(text(doc), new RegExp(EXTENSION_NOTICE));
  assert.equal(errors.length, 1);
  assert.equal(getExtensionHandler('jobs_status'), null);
});

test('a loaded module gets contract 1, a mount, notify and the viewer, and its handlers are registered', async () => {
  const doc = fakeDoc();
  let seen;
  const application = { getComponents: () => ({ scene: { viewer: 'V' } }) };
  await loadBrowserExtension({
    url: '/@fs/x/browser.mjs',
    failed: false,
    doc,
    application,
    importModule: async () => ({
      default: (gev) => {
        seen = gev;
        return { handlers: { jobs_status: () => 1 } };
      },
    }),
  });
  assert.equal(seen.contract, 1);
  assert.equal(seen.viewer, 'V');
  assert.equal(seen.mount.id, 'gev-extension');
  assert.equal(typeof seen.notify, 'function');
  assert.equal(typeof getExtensionHandler('jobs_status'), 'function');
});

test('a module returning a clashing handler shows the notice', async () => {
  const doc = fakeDoc();
  await loadBrowserExtension({
    url: '/@fs/x/browser.mjs',
    failed: false,
    doc,
    log: { error() {} },
    importModule: async () => ({
      default: () => ({ handlers: { zoom_to_globe: () => 1 } }),
    }),
  });
  assert.match(text(doc), new RegExp(EXTENSION_NOTICE));
});
