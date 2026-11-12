import { mount } from "svelte";
import App from "./app.svelte";
import "./styles/globals.css";

mount(App, { target: document.getElementById("app")! });
