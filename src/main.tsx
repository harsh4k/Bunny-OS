import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyIslandCssVars } from "./lib/islandGeometry";

// Before first paint — index.css defaults match TS, but lock vars anyway.
applyIslandCssVars();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
