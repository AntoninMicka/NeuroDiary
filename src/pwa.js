import { appUrl } from "./services/appUrl.js";

const SERVICE_WORKER_URL = appUrl("/sw.js");
const UPDATE_READY_EVENT = "pwa:update-ready";
const OFFLINE_READY_EVENT = "pwa:offline-ready";

function dispatchPwaEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function observeInstallingWorker(worker, registration) {
  worker.addEventListener("statechange", () => {
    if (worker.state !== "installed") {
      return;
    }

    if (navigator.serviceWorker.controller) {
      dispatchPwaEvent(UPDATE_READY_EVENT, { registration });
      return;
    }

    dispatchPwaEvent(OFFLINE_READY_EVENT, { registration });
  });
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);

      if (registration.waiting) {
        dispatchPwaEvent(UPDATE_READY_EVENT, { registration });
      }

      if (registration.installing) {
        observeInstallingWorker(registration.installing, registration);
      }

      registration.addEventListener("updatefound", () => {
        if (registration.installing) {
          observeInstallingWorker(registration.installing, registration);
        }
      });
    } catch (error) {
      console.error("Service worker registration failed", error);
    }
  });
}

export function activateServiceWorkerUpdate(registration) {
  registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
}

export { OFFLINE_READY_EVENT, UPDATE_READY_EVENT };
