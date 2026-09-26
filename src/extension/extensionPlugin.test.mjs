import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionPlugin } from '../../server/extension/plugin.js';
import {
  createExtensionRouter,
  getServerExtension,
  setServerExtension,
} from '../../server/extension/load.js';
import standaloneConfig from '../../server/standalone/vite.config.js';

const ext = { tools: [], instructions: '', routes() {} };
const loader = (result) => async () => result;

function mounted(plugin) {
  const uses = [];
  plugin.configureServer({
    middlewares: { use: (path, fn) => uses.push({ path, fn }) },
  });
  return uses;
}

test('with GEV_EXTENSION unset the standalone config has no extension plugin', () => {
  const saved = process.env.GEV_EXTENSION;
  // Empty, not deleted: loadEnv only fills keys that are undefined.
  process.env.GEV_EXTENSION = '';
  try {
    const names = standaloneConfig({ mode: 'test' }).plugins.map((p) => p.name);
    assert.ok(!names.includes('gev-extension'));
  } finally {
    if (saved === undefined) delete process.env.GEV_EXTENSION;
    else process.env.GEV_EXTENSION = saved;
  }
});

test('with GEV_EXTENSION set the plugin sits just before api-not-found', () => {
  const saved = process.env.GEV_EXTENSION;
  process.env.GEV_EXTENSION = '/nonexistent/gev-ext';
  try {
    const names = standaloneConfig({ mode: 'test' }).plugins.map((p) => p.name);
    assert.deepEqual(names.slice(-2), ['gev-extension', 'api-not-found']);
  } finally {
    if (saved === undefined) delete process.env.GEV_EXTENSION;
    else process.env.GEV_EXTENSION = saved;
  }
});

test('a failed load is reported to the browser and nothing extra is allowed', async () => {
  const p = extensionPlugin({
    dir: '/x',
    root: '/r',
    load: loader({ extension: null, router: null, failed: true }),
  });
  const cfg = await p.config();
  assert.equal(cfg.define['import.meta.env.GEV_EXTENSION_BROWSER'], 'null');
  assert.equal(cfg.define['import.meta.env.GEV_EXTENSION_FAILED'], 'true');
  assert.equal(cfg.server, undefined);
  assert.equal(getServerExtension(), null);
  assert.deepEqual(mounted(p), []);
});

test('a loaded extension allows exactly the root and its own folder, and is registered', async () => {
  const p = extensionPlugin({
    dir: '/home/hermes/jarvis-gev/gev-ext',
    root: '/r',
    load: loader({
      extension: ext,
      router: createExtensionRouter(),
      failed: false,
    }),
  });
  try {
    const cfg = await p.config();
    assert.equal(
      cfg.define['import.meta.env.GEV_EXTENSION_BROWSER'],
      JSON.stringify('/@fs/home/hermes/jarvis-gev/gev-ext/browser.mjs'),
    );
    assert.equal(cfg.define['import.meta.env.GEV_EXTENSION_FAILED'], 'false');
    assert.deepEqual(cfg.server.fs.allow, [
      '/r',
      '/home/hermes/jarvis-gev/gev-ext',
    ]);
    assert.equal(getServerExtension(), ext);
  } finally {
    setServerExtension(null);
  }
});

test('routes are mounted under /api/ext only', async () => {
  const router = createExtensionRouter();
  router.get('/ping', (_q, res) => res.end('pong'));
  const p = extensionPlugin({
    dir: '/e',
    root: '/r',
    load: loader({ extension: ext, router, failed: false }),
  });
  try {
    await p.config();
    const uses = mounted(p);
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
  } finally {
    setServerExtension(null);
  }
});

test('a throwing route handler is passed to next(), not thrown', async () => {
  const router = createExtensionRouter();
  router.get('/boom', async () => {
    throw new Error('boom');
  });
  const p = extensionPlugin({
    dir: '/e',
    root: '/r',
    load: loader({ extension: ext, router, failed: false }),
  });
  try {
    await p.config();
    const [use] = mounted(p);
    let passed;
    await use.fn({ method: 'GET', url: '/boom' }, {}, (e) => {
      passed = e;
    });
    assert.equal(passed.message, 'boom');
  } finally {
    setServerExtension(null);
  }
});
