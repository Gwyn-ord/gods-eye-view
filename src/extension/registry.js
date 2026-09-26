import { GEV_ACTION_SCHEMAS } from '../voice/actionSchemas.js';

const GEV_NAMES = new Set(GEV_ACTION_SCHEMAS.map((schema) => schema.name));
let handlers = new Map();

/** Replace the extension's tool handlers. GEV actions can never be overridden. */
export function setExtensionHandlers(map = {}) {
  const next = new Map();
  for (const [name, handler] of Object.entries(map)) {
    if (GEV_NAMES.has(name))
      throw new Error(`Extension handler clashes with GEV action: ${name}`);
    if (typeof handler !== 'function')
      throw new TypeError(`Extension handler is not a function: ${name}`);
    next.set(name, handler);
  }
  handlers = next;
}

/** The extension handler for a tool name, or null. */
export function getExtensionHandler(name) {
  return handlers.get(name) ?? null;
}

export function clearExtensionHandlers() {
  handlers = new Map();
}
