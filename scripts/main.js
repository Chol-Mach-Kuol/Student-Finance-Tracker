// main.js
// Entry point. Wait for the DOM, then hand control to the UI module.
import { start } from "./ui.js";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
