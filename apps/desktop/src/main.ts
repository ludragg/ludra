import { mount } from "svelte";
import App from "./app.svelte";
import { disableBrowserBehavior } from "./helpers/browser";
import { localeTag } from "./i18n";
import { startDesktop } from "./services/desktop";
import "./styles/globals.css";

disableBrowserBehavior();
document.documentElement.lang = localeTag();
mount(App, { target: document.getElementById("app")! });
startDesktop();
