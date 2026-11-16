import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { useBrandTheme } from "./app/brand";
import { router } from "./app/router";
import "./styles.css";

function App() {
  useBrandTheme();
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
