import { mount } from "svelte";
import { disableBrowserBehavior } from "@/helpers/browser";
import { localeTag } from "@/i18n";
import "@/styles/globals.css";
import Toasts from "./toasts.svelte";

disableBrowserBehavior();
document.documentElement.lang = localeTag();
mount(Toasts, { target: document.getElementById("toast")! });
