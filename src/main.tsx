import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { useBrandTheme } from "./app/brand";
import { router } from "./app/router";
import { initStaff } from "./app/staff";
import { DemoEnded } from "./app/AuthPages";
import { applyLook, initWorkspace, noteVisit, useWorkspace } from "./app/workspace";
import "./styles.css";

function App() {
  useBrandTheme();
  // (The ended page has no theme of its own to apply; it uses the plain one.)
  return <RouterProvider router={router} />;
}

// Vardil staff are recognised before anything is drawn, so their extra department is in place on the first screen.
// Then the client's look (20 Nov), which needs to know whether this is staff with a client's demo open.
void Promise.all([initStaff(), initWorkspace()]).finally(() => {
  applyLook();
  // A prospect whose demo is over sees only that (decision 210); anyone else, the demo, and their visit is noted.
  const ended = useWorkspace.getState().ended;
  if (!ended) noteVisit();
  createRoot(document.getElementById("root")!).render(<StrictMode>{ended ? <DemoEnded /> : <App />}</StrictMode>);
});
