// src/extension/serverExtension.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateServerExtension,
  loadServerExtension,
  createExtensionRouter,
  withExtensionInstructions,
  setServerExtension,
} from '../../server/extension/load.js';
import { createRealtimeTokenHandler } from '../../server/providers/openai/realtime.js';
import { realtimeInstructions } from '../../server/providers/openai/instructions.js';
import { GEV_REALTIME_TOOLS } from '../../server/providers/openai/tools.js';

const tool = (name) => ({
  type: 'function',
  name,
  description: 'd',
  parameters: { type: 'object', properties: {} },
});
const good = () => ({
  contract: 2,
  tools: [tool('jobs_status')],
  instructions: 'Extra.',
  routes() {},
});
const quiet = { error() {} };

function extensionDir(source) {
  const dir = mkdtempSync(join(tmpdir(), 'gev-ext-'));
  writeFileSync(join(dir, 'server.mjs'), source);
  return dir;
}

async function mint(extension) {
  let sent;
  const handler = createRealtimeTokenHandler({
    extension,
    resolveApiKey: () => 'k',
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return new Response('{}', { status: 200 });
    },
  });
  const res = { statusCode: 0, setHeader() {}, end() {} };
  await handler(
    { method: 'POST', url: '/api/realtime/token', headers: {}, socket: {} },
    res,
  );
  return sent;
}

test('a valid extension passes validation', () => {
  assert.equal(validateServerExtension(good()).tools[0].name, 'jobs_status');
});

test('wrong contract, clashing, duplicate or malformed tools are refused', () => {
  assert.throws(
    () => validateServerExtension({ ...good(), contract: 1 }),
    /contract/,
  );
  assert.throws(
    () => validateServerExtension({ ...good(), contract: 3 }),
    /contract/,
  );
  assert.throws(
    () =>
      validateServerExtension({ ...good(), tools: [tool('fly_to_location')] }),
    /clashes with GEV action: fly_to_location/,
  );
  assert.throws(
    () =>
      validateServerExtension({ ...good(), tools: [tool('a_b'), tool('a_b')] }),
    /duplicate/,
  );
  assert.throws(
    () =>
      validateServerExtension({
        ...good(),
        tools: [{ type: 'function', name: 'x_y', description: 'd' }],
      }),
    /parameters/,
  );
  assert.throws(
    () => validateServerExtension({ ...good(), tools: [tool('Bad Name')] }),
    /name/,
  );
  assert.throws(
    () => validateServerExtension({ ...good(), instructions: 7 }),
    /instructions/,
  );
  assert.throws(
    () => validateServerExtension({ ...good(), routes: null }),
    /routes/,
  );
});

test('no GEV_EXTENSION means no extension and no failure', async () => {
  assert.deepEqual(await loadServerExtension('', { log: quiet }), {
    extension: null,
    router: null,
    failed: false,
  });
});

test('a missing, broken or clashing extension is not loaded and is marked failed', async () => {
  const clash =
    "export default { contract: 2, tools: [{ type: 'function', name: 'zoom_to_globe', description: 'd', parameters: { type: 'object', properties: {} } }], instructions: '', routes() {} }";
  for (const dir of [
    '/nonexistent/gev-ext',
    extensionDir('export default {'),
    extensionDir(clash),
  ]) {
    const errors = [];
    const out = await loadServerExtension(dir, {
      log: { error: (m) => errors.push(m) },
    });
    assert.equal(out.extension, null);
    assert.equal(out.failed, true);
    assert.match(errors[0], /\[gev-extension\] not loaded/);
  }
});

test('an extension whose routes() throws is not loaded', async () => {
  const dir = extensionDir(
    `export default { contract: 2, tools: [], instructions: '', routes() { throw new Error('boom') } }`,
  );
  const out = await loadServerExtension(dir, { log: quiet });
  assert.equal(out.failed, true);
});

test('a relative GEV_EXTENSION path is refused', async () => {
  assert.equal(
    (await loadServerExtension('gev-ext', { log: quiet })).failed,
    true,
  );
});

test('a loaded extension exposes its routes through the router', async () => {
  const dir =
    extensionDir(`export default { contract: 2, tools: [], instructions: 'x',
    routes(r) { r.get('/ping', (req, res) => res.end('pong')) } }`);
  const { extension, router } = await loadServerExtension(dir, { log: quiet });
  assert.ok(extension);
  let body;
  await router.handle(
    { method: 'GET', url: '/ping?x=1' },
    {
      end: (b) => {
        body = b;
      },
    },
  );
  assert.equal(body, 'pong');
});

test('the router 404s unknown paths and wrong methods, and refuses bad paths', async () => {
  const r = createExtensionRouter();
  r.get('/a', () => {});
  for (const req of [
    { method: 'GET', url: '/b' },
    { method: 'POST', url: '/a' },
  ]) {
    let status;
    await r.handle(req, {
      writeHead: (s) => {
        status = s;
      },
      end() {},
    });
    assert.equal(status, 404);
  }
  assert.throws(() => r.get('a', () => {}), /Bad extension route/);
  assert.throws(() => r.get('/../x', () => {}), /Bad extension route/);
});

test("with no extension the minted session carries exactly GEV's tools and instructions", async () => {
  const body = await mint(null);
  assert.deepEqual(body.session.tools, GEV_REALTIME_TOOLS);
  assert.equal(body.session.instructions, realtimeInstructions());
});

test('with an extension the session appends its tools and paragraph', async () => {
  const ext = validateServerExtension(good());
  const body = await mint(ext);
  assert.deepEqual(body.session.tools, [...GEV_REALTIME_TOOLS, ...ext.tools]);
  assert.equal(
    body.session.instructions,
    withExtensionInstructions(realtimeInstructions(), ext),
  );
  assert.ok(body.session.instructions.endsWith('\nExtra.'));
});

test('the handler reads the registered extension at request time', async () => {
  setServerExtension(validateServerExtension(good()));
  try {
    const body = await mint(undefined);
    assert.ok(body.session.tools.some((t) => t.name === 'jobs_status'));
  } finally {
    setServerExtension(null);
  }
});
