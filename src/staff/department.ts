import { Crown } from "@phosphor-icons/react";
import type { Department } from "@/app/departments";

/** Vardil Works in the bottom bar and its short sidebar. Added to the app at run time, only for Vardil staff. */
export const department: Department = {
  key: "vardil", label: "Vardil Works", icon: Crown, home: "/vardil", inBar: true,
  groups: [
    { label: "Demo", items: [{ to: "/vardil", label: "Sign in as", end: true }, { to: "/vardil/features", label: "Features and access" }, { to: "/vardil/demo", label: "Demo tools" }] },
  ],
};
