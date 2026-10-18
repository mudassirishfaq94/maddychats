export type GroupRole = "owner" | "admin" | "member";
export type GroupAction = "addMembers" | "editInfo" | "sendMessages" | "managePermissions";
export interface GroupPolicy { adminOnlyAddingMembers: boolean; adminOnlyEditingInfo: boolean; adminOnlyMessaging: boolean }
export function groupAllows(role: string | null | undefined, policy: GroupPolicy, action: GroupAction): boolean {
  if (role === "owner" || role === "admin") return true;
  if (role !== "member" || action === "managePermissions") return false;
  return !policy[action === "addMembers" ? "adminOnlyAddingMembers" : action === "editInfo" ? "adminOnlyEditingInfo" : "adminOnlyMessaging"];
}
