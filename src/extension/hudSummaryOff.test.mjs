import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleHudSummary } from '../../server/providers/openai/hud-summary.js';

function post() {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(body) {
        resolve({ status: this.statusCode, body: JSON.parse(body) });
      },
    };
    handleHudSummary(
      { method: 'POST', url: '/', headers: {}, socket: {} },
      res,
    );
  });
}

test('GEV_HUD_SUMMARY=off answers "not configured" without calling OpenAI, even with a key', async () => {
  const saved = {
    key: process.env.OPENAI_API_KEY,
    off: process.env.GEV_HUD_SUMMARY,
    fetch: globalThis.fetch,
  };
  const calls = [];
  process.env.OPENAI_API_KEY = 'k';
  process.env.GEV_HUD_SUMMARY = 'off';
  globalThis.fetch = async (...args) => {
    calls.push(args);
    throw new Error('OpenAI must not be called');
  };
  try {
    const out = await post();
    assert.equal(out.status, 200);
    assert.equal(out.body.configured, false);
    assert.equal(calls.length, 0);
  } finally {
    for (const [name, value] of [
      ['OPENAI_API_KEY', saved.key],
      ['GEV_HUD_SUMMARY', saved.off],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    globalThis.fetch = saved.fetch;
  }
});
