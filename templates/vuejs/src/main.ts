import { registerPlugins } from "@/plugins";
import { initServices } from "@/services";
import { createApp } from "vue";
import App from "@/App.vue";
import "@/scss/tailwind.css";
import "@/scss/main.scss";

initServices();

const app = createApp(App);
registerPlugins(app);
app.mount("#app");
