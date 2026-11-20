/**
 * Everything Vardil HQ is made of, in one entry file so the build can put all of it in /staff/.
 * Nothing outside src/staff/ may import from here except src/app/staff.ts and the router, which
 * load it on demand and only for Vardil staff.
 */
export { department } from "./department";
export { StaffBar, StaffRoleEntry } from "./Bar";
export { Overview } from "./Overview";
export { Features } from "./Features";
export { DemoTools } from "./DemoTools";
export { Announcements, AppRequests, ClientApps } from "./Clients";
export { ClientPage } from "./ClientPage";
