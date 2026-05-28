import { createApp } from "vue";
import App from "./App.vue";
import { registerPlugins } from "@/plugins";
import { initServices } from "@/services";
import "@/scss/tailwind.css";
import "@/scss/main.scss";

initServices();

const app = createApp(App);
registerPlugins(app);
app.mount("#app");
