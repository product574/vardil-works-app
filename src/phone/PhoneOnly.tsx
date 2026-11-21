/**
 * The phone app as an app of its own (21 Nov): the entry of the build that is packaged for the
 * App Store and Google Play (`npm run build:phone`, then Capacitor). No office screens, no demo
 * sign-in page and no role page: it opens straight on the phone app. Navigation is kept in memory,
 * since a packaged app has no web address to speak of.
 */
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { useBrandTheme } from "@/app/brand";
import { StandalonePhone } from "@/modules/site/PhoneApp";
import { Toaster } from "@/ui/toast";

function Screen() {
  return (
    <>
      <StandalonePhone />
      <Toaster />
    </>
  );
}

const router = createMemoryRouter([{ path: "*", element: <Screen /> }]);

export function PhoneOnly() {
  useBrandTheme();
  return <RouterProvider router={router} />;
}
