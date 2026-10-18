export const PERMISSIONS = {
  "leads.view_all": "View every lead in the archive (bypasses access rules)",
  "leads.view_archive": "Open the lead archive (filtered by access rules)",
  "leads.create": "Add leads manually",
  "leads.import": "Import leads from CSV",
  "leads.edit": "Edit lead details",
  "leads.delete": "Delete leads",
  "leads.allocate": "Allocate leads to BDEs",
  "leads.update_status": "Change the status of leads",
  "leads.comment": "Add comments to leads",
  "ai.score": "Trigger AI scoring on leads",
  "ai.settings": "Change AI pre-filter settings",
  "admin.users": "Manage users",
  "admin.teams": "Manage teams",
  "admin.roles": "Manage roles, permissions and access rules",
  "admin.sources": "Manage lead sources",
  "email.send": "Send email to leads from the shared mailbox",
  "email.manage": "Configure the shared mailbox and email templates",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  Admin: ALL_PERMISSIONS,
  Manager: [
    "leads.view_archive",
    "leads.create",
    "leads.import",
    "leads.edit",
    "leads.allocate",
    "leads.update_status",
    "leads.comment",
    "ai.score",
    "admin.teams",
    "admin.users",
    "email.send",
  ],
  BDE: ["leads.update_status", "leads.comment", "email.send"],
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  teamId: string | null;
  permissions: string[];
};

export function can(user: SessionUser | null | undefined, permission: Permission) {
  if (!user) return false;
  return user.permissions.includes(permission);
}

export function canAny(user: SessionUser | null | undefined, ...permissions: Permission[]) {
  return permissions.some((p) => can(user, p));
}
