import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { hideQuickAddWindow } from "./platform";
import { StoreProvider } from "./store";
import { QuickAdd } from "./ui/QuickAdd";

// The Mac shell opens a small second window at "#quick" for the global shortcut.
const isQuickWindow = window.location.hash === "#quick";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      {isQuickWindow ? <QuickAdd variant="window" closeOnSave defaults={{}} onClose={() => void hideQuickAddWindow()} /> : <App />}
    </StoreProvider>
  </StrictMode>,
);
