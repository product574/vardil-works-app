import { Crown } from "@phosphor-icons/react";
import type { Department } from "@/app/departments";

/**
 * Vardil HQ in the bottom bar and its short sidebar (called Vardil Works until 19 Nov, when that
 * name went to the page every client sees in Admin). Added to the app at run time, only for
 * Vardil staff.
 */
export const department: Department = {
  key: "vardil", label: "Vardil HQ", icon: Crown, home: "/vardil", inBar: true,
  groups: [
    { label: "This demo", items: [{ to: "/vardil", label: "Sign in as", end: true }, { to: "/vardil/features", label: "Packages and access" }, { to: "/vardil/demo", label: "Demo tools" }] },
    { label: "Our clients", items: [{ to: "/vardil/clients", label: "Clients" }, { to: "/vardil/announcements", label: "Announcements" }, { to: "/vardil/requests", label: "App requests" }] },
  ],
};
