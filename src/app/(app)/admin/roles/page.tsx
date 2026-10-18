import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { deleteAccessRuleAction, deleteRoleAction } from "@/lib/admin/actions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { RoleDialog } from "./role-dialog";
import { AccessRuleDialog } from "./access-rule-dialog";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  await requirePermission("admin.roles");
  const [roles, teams, sources, rules] = await Promise.all([
    prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], include: { _count: { select: { users: true } } } }),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.leadSource.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.leadAccessRule.findMany({
      orderBy: { createdAt: "asc" },
      include: { role: { select: { name: true } }, team: { select: { name: true } } },
    }),
  ]);
  const sourceName = new Map(sources.map((s) => [s.id, s.name]));
  const roleOptions = roles.map((r) => ({ id: r.id, name: r.name }));

  return (
    <>
      <PageHeader title="Roles & access" description="Roles define what people can do. Access rules define which leads they can see.">
        <RoleDialog />
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  {r.name}
                  {r.isSystem && (
                    <Badge variant="outline" className="text-[10px]">
                      system
                    </Badge>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <RoleDialog role={{ id: r.id, name: r.name, description: r.description, isSystem: r.isSystem, permissions: r.permissions }} />
                  {!r.isSystem && <DeleteButton action={deleteRoleAction.bind(null, r.id)} confirmText={`Delete role ${r.name}?`} />}
                </span>
              </CardTitle>
              <CardDescription>
                {r.description || "No description"} &middot; {r._count.users} user{r._count.users === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {r.permissions.length === 0 && <span className="text-xs text-muted-foreground">No permissions</span>}
                {r.permissions.map((p) => (
                  <Badge key={p} variant="secondary" className="font-mono text-[10px]">
                    {p}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-10">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Lead access rules</h2>
            <p className="text-sm text-muted-foreground">
              Without rules, anyone with archive access sees every lead. Add a rule to narrow a role or team to specific sources, industries, countries, tags or AI
              scores. Admins (leads.view_all) bypass rules; assignees always see their own leads.
            </p>
          </div>
          <AccessRuleDialog roles={roleOptions} teams={teams} sources={sources} />
        </div>
        <div className="overflow-hidden rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Filters</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
                    No access rules. Everyone with archive access currently sees all leads.
                  </TableCell>
                </TableRow>
              )}
              {rules.map((rule) => {
                const filters: string[] = [];
                if (rule.sourceIds.length) filters.push(`Sources: ${rule.sourceIds.map((id) => sourceName.get(id) ?? "?").join(", ")}`);
                if (rule.industries.length) filters.push(`Industries: ${rule.industries.join(", ")}`);
                if (rule.countries.length) filters.push(`Countries: ${rule.countries.join(", ")}`);
                if (rule.tags.length) filters.push(`Tags: ${rule.tags.join(", ")}`);
                if (rule.minAiScore != null) filters.push(`AI score >= ${rule.minAiScore}`);
                return (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{rule.role ? `Role: ${rule.role.name}` : rule.team ? `Team: ${rule.team.name}` : "Unattached"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {filters.length === 0 ? (
                        <span className="text-muted-foreground">No filters (grants everything)</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {filters.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <AccessRuleDialog rule={rule} roles={roleOptions} teams={teams} sources={sources} />
                        <DeleteButton action={deleteAccessRuleAction.bind(null, rule.id)} confirmText={`Delete rule ${rule.name}?`} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
