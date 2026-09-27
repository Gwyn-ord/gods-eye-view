// src/extension/announceHook.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeTurns } from '../voice/realtimeTurns.js';

function turns({ open = true } = {}) {
  const sent = [];
  const dc = { readyState: open ? 'open' : 'closed' };
  const t = new RealtimeTurns({
    readActionExecutor: () => null, readRunner: () => null, readChannel: () => dc,
    readDataManager: () => null, readRadioLayer: () => null,
    radio: { pendingRadioPlaybackResult: null, clearTools() {}, clearPendingPlayback() {} },
    viewport: {},
    operations: {
      sendRealtimeEvent: (event) => { sent.push(event); return true; },
      debugLog() {}, setVoiceSpeaker() {}, pauseRadioForVoice() {}, setStatus() {},
      cancelRadioHandoff() {}, emitSessionEvent() {}, connectionDiagnostics: () => ({}),
      recordUsage() {},
    },
  });
  return { t, sent, dc };
}
const payload = { kind: 'job_result', job: 'E2E trivial check', state: 'done', summary: 'ok', heldWhileAway: false };
const creates = (sent) => sent.filter((e) => e.type === 'response.create');

test('announce with no open session sends nothing and returns false', () => {
  const { t, sent } = turns({ open: false });
  assert.equal(t.announce(payload), false);
  assert.equal(sent.length, 0);
});

test('announce when idle adds a system JSON item and asks for one spoken reply', () => {
  const { t, sent } = turns();
  assert.equal(t.announce(payload), true);
  assert.equal(sent[0].type, 'conversation.item.create');
  assert.equal(sent[0].item.role, 'system');
  assert.deepEqual(JSON.parse(sent[0].item.content[0].text), payload);
  assert.equal(creates(sent).length, 1);
  assert.match(creates(sent)[0].response.instructions, /data/i);
  assert.equal(creates(sent)[0].response.tool_choice, 'none');
});

test('while a response is active the reply waits, then goes after response.done', () => {
  const { t, sent } = turns();
  t.updateResponseState({ type: 'response.created', response: { id: 'r1' } });
  t.announce(payload);
  assert.equal(creates(sent).length, 0);
  t.updateResponseState({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
  assert.equal(creates(sent).length, 1);
});

test('while Gwyn is speaking the reply is held, not dropped, until the model is idle', () => {
  const { t, sent } = turns();
  t.userTurnPending = true; // set by input_audio_buffer.speech_started
  t.announce(payload);
  assert.equal(creates(sent).length, 0);
  t.updateResponseState({ type: 'response.created', response: { id: 'r2' } }); // his answer starts
  assert.equal(creates(sent).length, 0);
  t.updateResponseState({ type: 'response.done', response: { id: 'r2', status: 'completed' } });
  assert.equal(creates(sent).length, 1);
});

test('several announcements before the model is free get one spoken reply', () => {
  const { t, sent } = turns();
  t.updateResponseState({ type: 'response.created', response: { id: 'r3' } });
  t.announce(payload); t.announce({ ...payload, job: 'Second' });
  t.updateResponseState({ type: 'response.done', response: { id: 'r3', status: 'completed' } });
  assert.equal(sent.filter((e) => e.type === 'conversation.item.create').length, 2);
  assert.equal(creates(sent).length, 1);
});

test('lastUserTurnAt moves on speech_stopped and on a typed command', () => {
  const { t } = turns();
  assert.equal(t.lastUserTurnAt, 0);
  const before = Date.now();
  t.updateResponseState({ type: 'input_audio_buffer.speech_stopped' });
  assert.ok(t.lastUserTurnAt >= before);
  const spoken = t.lastUserTurnAt;
  t.sendTextCommand('yes');
  assert.ok(t.lastUserTurnAt >= spoken);
});
