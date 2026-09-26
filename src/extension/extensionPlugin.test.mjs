// src/extension/extensionPlugin.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionPlugin } from '../../server/extension/plugin.js';
import { createExtensionRouter } from '../../server/extension/load.js';

const ext = { tools: [], instructions: '', routes() {} };

function mounted(plugin) {
  const uses = [];
  plugin.configureServer({
    middlewares: { use: (path, fn) => uses.push({ path, fn }) },
  });
  return uses;
}

test('with no extension the browser path is null and nothing extra is allowed', () => {
  const p = extensionPlugin({
    extension: null,
    router: null,
    failed: false,
    dir: '',
    root: '/r',
  });
  const cfg = p.config();
  assert.equal(cfg.define['import.meta.env.GEV_EXTENSION_BROWSER'], 'null');
  assert.equal(cfg.define['import.meta.env.GEV_EXTENSION_FAILED'], 'false');
  assert.equal(cfg.server, undefined);
  assert.deepEqual(mounted(p), []);
});

test('a failed load is reported to the browser', () => {
  const cfg = extensionPlugin({
    extension: null,
    router: null,
    failed: true,
    dir: '/x',
    root: '/r',
  }).config();
  assert.equal(cfg.define['import.meta.env.GEV_EXTENSION_FAILED'], 'true');
});

test('a loaded extension allows exactly the root and its own folder', () => {
  const cfg = extensionPlugin({
    extension: ext,
    router: createExtensionRouter(),
    failed: false,
    dir: '/home/hermes/jarvis-gev/gev-ext',
    root: '/r',
  }).config();
  assert.equal(
    cfg.define['import.meta.env.GEV_EXTENSION_BROWSER'],
    JSON.stringify('/@fs/home/hermes/jarvis-gev/gev-ext/browser.mjs'),
  );
  assert.deepEqual(cfg.server.fs.allow, [
    '/r',
    '/home/hermes/jarvis-gev/gev-ext',
  ]);
});

test('routes are mounted under /api/ext only', async () => {
  const router = createExtensionRouter();
  router.get('/ping', (_q, res) => res.end('pong'));
  const uses = mounted(
    extensionPlugin({
      extension: ext,
      router,
      failed: false,
      dir: '/e',
      root: '/r',
    }),
  );
  assert.deepEqual(
    uses.map((u) => u.path),
    ['/api/ext'],
  );
  let body;
  await uses[0].fn(
    { method: 'GET', url: '/ping' },
    {
      end: (b) => {
        body = b;
      },
    },
    () => {},
  );
  assert.equal(body, 'pong');
});

test('a throwing route handler is passed to next(), not thrown', async () => {
  const router = createExtensionRouter();
  router.get('/boom', async () => {
    throw new Error('boom');
  });
  const [use] = mounted(
    extensionPlugin({
      extension: ext,
      router,
      failed: false,
      dir: '/e',
      root: '/r',
    }),
  );
  let passed;
  await use.fn({ method: 'GET', url: '/boom' }, {}, (e) => {
    passed = e;
  });
  assert.equal(passed.message, 'boom');
});
