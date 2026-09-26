/** Vite plugin: serve extension routes at /api/ext and tell the browser where its module is. */
export function extensionPlugin({ extension, router, failed, dir, root }) {
  const browserUrl = extension ? `/@fs${dir}/browser.mjs` : null;
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
    config: () => ({
      define: {
        'import.meta.env.GEV_EXTENSION_BROWSER': JSON.stringify(browserUrl),
        'import.meta.env.GEV_EXTENSION_FAILED': JSON.stringify(Boolean(failed)),
      },
      ...(extension ? { server: { fs: { allow: [root, dir] } } } : {}),
    }),
    configureServer: install,
    configurePreviewServer: install,
  };
}
