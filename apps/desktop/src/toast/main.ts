import { mount } from "svelte";
import { disableBrowserBehavior } from "@/helpers/browser";
import { localeTag } from "@/i18n";
import { captureErrors } from "@/services/diagnostics";
import "@/styles/globals.css";
import Toasts from "./toasts.svelte";

captureErrors("toast");
disableBrowserBehavior();
document.documentElement.lang = localeTag();
mount(Toasts, { target: document.getElementById("toast")! });
