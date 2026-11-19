import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { useBrandTheme } from "./app/brand";
import { router } from "./app/router";
import { initStaff } from "./app/staff";
import { initWorkspace } from "./app/workspace";
import "./styles.css";

function App() {
  useBrandTheme();
  return <RouterProvider router={router} />;
}

// Vardil staff are recognised before anything is drawn, so their extra department is in place on the first screen.
void Promise.all([initStaff(), initWorkspace()]).finally(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
