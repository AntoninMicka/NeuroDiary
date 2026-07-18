import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";
import { registerServiceWorker } from "./pwa.js";
import {
  appendBootstrapLog,
  getBootstrapLogEntries,
  getLatestBootstrapLogEntry,
} from "./services/bootstrapLogger.js";

function renderBootstrapLog() {
  const root = document.getElementById("bootstrap-log");
  const messageNode = document.getElementById("bootstrap-log-message");
  const listNode = document.getElementById("bootstrap-log-list");
  const latestEntry = getLatestBootstrapLogEntry();

  if (!root || !messageNode || !listNode || !latestEntry) {
    return;
  }

  messageNode.textContent = latestEntry.message;
  root.dataset.level = latestEntry.level;
  listNode.replaceChildren(
    ...getBootstrapLogEntries().map((entry) => {
      const item = document.createElement("li");
      item.className = "bootstrap-log-entry";

      const time = document.createElement("span");
      time.className = "bootstrap-log-entry-time";
      time.textContent = entry.timeLabel;

      const text = document.createElement("span");
      text.className = "bootstrap-log-entry-message";
      text.textContent = entry.message;

      item.append(time, text);
      return item;
    }),
  );
}

function updateBootstrapLog(message, level = "info") {
  appendBootstrapLog(message, level);
  renderBootstrapLog();
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
