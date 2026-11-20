import { mount } from "svelte";
import logo from "@/assets/logo.png";
import { disableBrowserBehavior } from "@/helpers/browser";
import "@/styles/globals.css";
import "./panel.css";
import { localeTag } from "./i18n.svelte";
import Panel from "./panel.svelte";

disableBrowserBehavior();

const icon = document.createElement("link");
icon.rel = "icon";
icon.href = logo;
document.head.append(icon);
document.documentElement.lang = localeTag();

mount(Panel, { target: document.getElementById("app")! });
