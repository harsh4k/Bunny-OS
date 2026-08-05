import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppsPanel } from "./components/AppsPanel";
import { FirstRunNotice } from "./components/FirstRunNotice";
import "./index.css";
import { applyIslandCssVars } from "./lib/islandGeometry";

// Before first paint — index.css defaults match TS, but lock vars anyway.
applyIslandCssVars();

const e2e = new URLSearchParams(window.location.search).get("e2e");
const root = ReactDOM.createRoot(document.getElementById("root")!);

if (e2e === "onboarding") {
  root.render(
    <React.StrictMode>
      <FirstRunNotice />
    </React.StrictMode>,
  );
} else if (e2e === "apps") {
  root.render(
    <React.StrictMode>
      <AppsPanel onClose={() => {}} />
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
