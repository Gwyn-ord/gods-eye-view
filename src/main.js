import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import { loadBrowserExtension } from './extension/browserLoader.js';

const application = createStandaloneApplication({
  googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,
  allowQaRegistration: import.meta.env.DEV,
});

application
  .start()
  .then(() =>
    loadBrowserExtension({
      url: import.meta.env.GEV_EXTENSION_BROWSER,
      failed: import.meta.env.GEV_EXTENSION_FAILED,
      application,
    }),
  )
  .catch((error) => {
    console.error("God's Eye View initialization failed:", error);
    const loaderStatus = document.querySelector(
      '#loading-screen .loader-status',
    );
    loaderStatus.textContent = `Error: ${describeError(error)}`;
    loaderStatus.style.color = '#ff4444';
  });

export { application };
