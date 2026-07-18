import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";
import { registerServiceWorker } from "./pwa.js";

function updateBootstrapLog(message, level = "info") {
  const root = document.getElementById("bootstrap-log");
  const messageNode = document.getElementById("bootstrap-log-message");
  if (!root || !messageNode) {
    return;
  }

  messageNode.textContent = message;
  root.dataset.level = level;
}

function hideBootstrapLog() {
  const root = document.getElementById("bootstrap-log");
  root?.setAttribute("hidden", "hidden");
}

window.addEventListener("error", (event) => {
  updateBootstrapLog(`Bootstrap error: ${event.message}`, "error");
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  updateBootstrapLog(`Unhandled bootstrap rejection: ${reason}`, "error");
});

updateBootstrapLog("Creating Vue application instance.");

try {
  const app = createApp(App);
  updateBootstrapLog("Mounting Vue application.");
  app.mount("#app");
  updateBootstrapLog("Registering service worker.");
  registerServiceWorker();
  hideBootstrapLog();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  updateBootstrapLog(`Failed to start app: ${message}`, "error");
  throw error;
}
