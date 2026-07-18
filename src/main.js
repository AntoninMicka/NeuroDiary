import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";
import { registerServiceWorker } from "./pwa.js";

createApp(App).mount("#app");
registerServiceWorker();
