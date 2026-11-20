import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { useBrandTheme } from "./app/brand";
import { router } from "./app/router";
import { initStaff } from "./app/staff";
import { applyLook, initWorkspace } from "./app/workspace";
import "./styles.css";

function App() {
  useBrandTheme();
  return <RouterProvider router={router} />;
}

// Vardil staff are recognised before anything is drawn, so their extra department is in place on the first screen.
// Then the client's look (20 Nov), which needs to know whether this is staff with a client's demo open.
void Promise.all([initStaff(), initWorkspace()]).finally(() => {
  applyLook();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
