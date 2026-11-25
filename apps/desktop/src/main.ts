import { mount } from "svelte";
import App from "./app.svelte";
import { disableBrowserBehavior } from "./helpers/browser";
import { localeTag } from "./i18n";
import { startDesktop } from "./services/desktop";
import { captureErrors, setDiagnosticsEnabled } from "./services/diagnostics";
import { preferences } from "./stores/preferences.svelte";
import "./styles/globals.css";

captureErrors("app");
setDiagnosticsEnabled(preferences.values.errorReports);
disableBrowserBehavior();
document.documentElement.lang = localeTag();
mount(App, { target: document.getElementById("app")! });
startDesktop();
