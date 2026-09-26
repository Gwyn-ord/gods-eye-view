import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite';
import { createBrowserViteConfig } from '../../build/vite.js';
import { localProviderPlugins } from '../providers/local.js';
import { apiNotFoundPlugin } from './api-not-found.js';
import { loadServerExtension, setServerExtension } from '../extension/load.js';
import { extensionPlugin } from '../extension/plugin.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Load this checkout's configuration, its local provider middleware and any GEV_EXTENSION. */
export default defineConfig(async ({ command, mode }) => {
  const loaded = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  const dir = process.env.GEV_EXTENSION || '';
  const { extension, router, failed } = await loadServerExtension(dir);
  setServerExtension(extension);
  return createBrowserViteConfig({
    plugins: [
      ...localProviderPlugins(),
      extensionPlugin({
        extension,
        router,
        failed,
        dir,
        root: searchForWorkspaceRoot(root),
      }),
      apiNotFoundPlugin(),
    ],
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    cesiumToken: process.env.CESIUM_ION_TOKEN,
    host: process.env.HOST,
    port: process.env.PORT,
    command,
  });
});
