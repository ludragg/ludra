import { mount } from "svelte";
import { disableBrowserBehavior } from "@/helpers/browser";
import { localeTag } from "@/i18n";
import "@/styles/globals.css";
import TrayMenu from "./tray-menu.svelte";

disableBrowserBehavior();
document.documentElement.lang = localeTag();
mount(TrayMenu, { target: document.getElementById("tray")! });
