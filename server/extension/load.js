import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GEV_ACTION_SCHEMAS } from '../../src/voice/actionSchemas.js';

/** Version of the GEV extension contract this fork implements. */
export const EXTENSION_CONTRACT = 2;
const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_INSTRUCTIONS = 4000;
const GEV_NAMES = new Set(GEV_ACTION_SCHEMAS.map((schema) => schema.name));
let current = null;

function validateTool(tool, seen) {
  if (!tool || typeof tool !== 'object')
    throw new Error('tool must be an object');
  if (tool.type !== 'function')
    throw new Error(`tool ${tool.name}: type must be "function"`);
  if (typeof tool.name !== 'string' || !TOOL_NAME.test(tool.name))
    throw new Error(`tool name must match ${TOOL_NAME}: ${tool.name}`);
  if (GEV_NAMES.has(tool.name))
    throw new Error(`tool clashes with GEV action: ${tool.name}`);
  if (seen.has(tool.name)) throw new Error(`duplicate tool: ${tool.name}`);
  if (typeof tool.description !== 'string')
    throw new Error(`tool ${tool.name}: description must be text`);
  if (tool.parameters?.type !== 'object')
    throw new Error(`tool ${tool.name}: parameters must be an object schema`);
  seen.add(tool.name);
}

/** Check an extension's server module against contract 2. */
export function validateServerExtension(ext) {
  if (!ext || typeof ext !== 'object')
    throw new Error('default export must be an object');
  if (ext.contract !== EXTENSION_CONTRACT)
    throw new Error(
      `contract must be ${EXTENSION_CONTRACT}, got ${ext.contract}`,
    );
  if (!Array.isArray(ext.tools)) throw new Error('tools must be an array');
  const seen = new Set();
  for (const tool of ext.tools) validateTool(tool, seen);
  if (
    typeof ext.instructions !== 'string' ||
    ext.instructions.length > MAX_INSTRUCTIONS
  )
    throw new Error(
      `instructions must be text up to ${MAX_INSTRUCTIONS} characters`,
    );
  if (typeof ext.routes !== 'function')
    throw new Error('routes must be a function');
  return Object.freeze({
    tools: structuredClone(ext.tools),
    instructions: ext.instructions,
    routes: ext.routes,
  });
}

function notFound(res) {
  res.writeHead(404, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify({ error: 'Unknown extension route' }));
}

/** A tiny exact-path router for extension routes mounted under /api/ext. */
export function createExtensionRouter() {
  const routes = new Map();
  const add = (method) => (path, handler) => {
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      path.includes('..')
    )
      throw new Error(`Bad extension route: ${path}`);
    if (typeof handler !== 'function')
      throw new Error(`Bad extension handler: ${path}`);
    routes.set(`${method} ${path}`, handler);
  };
  return {
    get: add('GET'),
    post: add('POST'),
    handle(req, res) {
      const path = new URL(req.url || '/', 'http://extension.invalid').pathname;
      const handler = routes.get(`${req.method} ${path}`);
      return handler ? handler(req, res) : notFound(res);
    },
  };
}

/** Load GEV_EXTENSION's server module. Never throws: failure means GEV runs without it. */
export async function loadServerExtension(
  dir,
  { log = console, importModule = (url) => import(url) } = {},
) {
  if (!dir) return { extension: null, router: null, failed: false };
  try {
    if (!isAbsolute(dir))
      throw new Error('GEV_EXTENSION must be an absolute path');
    const module = await importModule(
      pathToFileURL(join(dir, 'server.mjs')).href,
    );
    const extension = validateServerExtension(module.default);
    const router = createExtensionRouter();
    extension.routes(router);
    return { extension, router, failed: false };
  } catch (error) {
    log.error(`[gev-extension] not loaded: ${error.message}`);
    return { extension: null, router: null, failed: true };
  }
}

/** Register the loaded extension for the Realtime token handler. */
export function setServerExtension(extension) {
  current = extension;
}
export function getServerExtension() {
  return current;
}

/** Append the extension's paragraph to GEV's voice instructions. */
export function withExtensionInstructions(base, extension) {
  return extension?.instructions ? `${base}\n${extension.instructions}` : base;
}
