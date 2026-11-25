import { mount } from "svelte";
import { disableBrowserBehavior } from "@/helpers/browser";
import { localeTag } from "@/i18n";
import { captureErrors } from "@/services/diagnostics";
import "@/styles/globals.css";
import TrayMenu from "./tray-menu.svelte";

captureErrors("tray");
disableBrowserBehavior();
document.documentElement.lang = localeTag();
mount(TrayMenu, { target: document.getElementById("tray")! });
