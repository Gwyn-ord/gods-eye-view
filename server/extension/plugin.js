import { loadServerExtension, setServerExtension } from './load.js';

/**
 * Vite plugin: load GEV_EXTENSION, serve its routes at /api/ext and tell the
 * browser where its module is. Loading happens in the async config hook so the
 * standalone config itself stays synchronous.
 */
export function extensionPlugin({ dir, root, load = loadServerExtension }) {
  let router = null;
  const install = (server) => {
    if (!router) return;
    server.middlewares.use('/api/ext', (req, res, next) =>
      Promise.resolve()
        .then(() => router.handle(req, res))
        .catch(next),
    );
  };
  return {
    name: 'gev-extension',
    async config() {
      const loaded = await load(dir);
      setServerExtension(loaded.extension);
      router = loaded.router;
      return {
        define: {
          'import.meta.env.GEV_EXTENSION_BROWSER': JSON.stringify(
            loaded.extension ? `/@fs${dir}/browser.mjs` : null,
          ),
          'import.meta.env.GEV_EXTENSION_FAILED': JSON.stringify(
            Boolean(loaded.failed),
          ),
        },
        ...(loaded.extension ? { server: { fs: { allow: [root, dir] } } } : {}),
      };
    },
    configureServer: install,
    configurePreviewServer: install,
  };
}
