import { mount } from "svelte";
import App from "./app.svelte";
import { disableBrowserBehavior } from "./helpers/browser";
import "./styles/globals.css";

disableBrowserBehavior();
mount(App, { target: document.getElementById("app")! });
