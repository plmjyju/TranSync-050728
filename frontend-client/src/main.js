import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/utilities.css";
import "./styles/components/toolbar.css";
import "./styles/components/table.css";
import App from "./App.vue";
import router from "./router";
import { vPermission } from "./permissions";

const app = createApp(App);
app.use(createPinia()).use(router).use(ElementPlus);
app.directive("permission", vPermission);
app.mount("#app");
