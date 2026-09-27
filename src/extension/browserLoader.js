import { setExtensionHandlers } from './registry.js';

export const EXTENSION_NOTICE = 'Jarvis extension not loaded';
const TOAST_MS = 6000;
const MOUNT_STYLE = 'position:fixed;inset:0;pointer-events:none;z-index:900';
const TOAST_STYLE =
  'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);pointer-events:auto;' +
  'background:rgba(20,24,28,.92);color:#e8f0f4;font:13px system-ui,sans-serif;padding:8px 14px;' +
  'border:1px solid rgba(120,200,255,.35);border-radius:6px';

function createMount(doc) {
  const mount = doc.createElement('div');
  mount.id = 'gev-extension';
  mount.style.cssText = MOUNT_STYLE;
  doc.body.append(mount);
  return mount;
}

function toast(doc, mount, text) {
  const note = doc.createElement('div');
  note.className = 'gev-extension-toast';
  note.style.cssText = TOAST_STYLE;
  note.textContent = String(text);
  mount.append(note);
  const timer = setTimeout(() => note.remove(), TOAST_MS);
  timer?.unref?.(); // Node tests only; a number in the browser
}

/** Load GEV_EXTENSION's browser module after GEV has started. Never throws. */
export async function loadBrowserExtension({
  url,
  failed,
  application,
  doc = globalThis.document,
  importModule = (href) => import(/* @vite-ignore */ href),
  log = console,
}) {
  if (!url && !failed) return null;
  const mount = createMount(doc);
  const notify = (text) => toast(doc, mount, text);
  if (!url) {
    notify(EXTENSION_NOTICE);
    return null;
  }
  try {
    const module = await importModule(url);
    const viewer = application?.getComponents?.().scene?.viewer ?? null;
    const voice = () =>
      application?.getComponents?.().tools?.voiceCommands ?? null;
    const started = await module.default({
      contract: 2,
      mount,
      notify,
      viewer,
      announce: (data) => voice()?.announce?.(data) ?? false,
      lastUserTurnAt: () => voice()?.lastUserTurnAt ?? 0,
      onVoiceReady: (cb) =>
        voice()?.session?.subscribe?.((event) => {
          if (event?.type === 'state' && event.state === 'listening') cb();
        }) ?? (() => {}),
    });
    setExtensionHandlers(started?.handlers ?? {});
    return started;
  } catch (error) {
    log.error('[gev-extension] browser module not loaded:', error);
    notify(EXTENSION_NOTICE);
    return null;
  }
}
