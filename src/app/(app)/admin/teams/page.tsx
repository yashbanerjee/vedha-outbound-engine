import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { deleteTeamAction } from "@/lib/admin/actions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/delete-button";
import { TeamDialog } from "./team-dialog";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  await requirePermission("admin.teams");
  const [teams, users] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        manager: { select: { id: true, name: true } },
        members: { select: { id: true, name: true, role: { select: { name: true } } }, orderBy: { name: "asc" } },
        _count: { select: { accessRules: true } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, teamId: true, role: { select: { name: true } } },
    }),
  ]);
  const userOptions = users.map((u) => ({ id: u.id, name: u.name, email: u.email, roleName: u.role.name, teamId: u.teamId }));

  return (
    <>
      <PageHeader title="Teams" description="Group BDEs under a manager. Lead access rules can target a whole team.">
        <TeamDialog users={userOptions} />
      </PageHeader>
      {teams.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No teams yet. Create one to start grouping your BDEs.</CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>{t.name}</span>
                <span className="flex items-center gap-1">
                  <TeamDialog
                    team={{ id: t.id, name: t.name, description: t.description, managerId: t.managerId, memberIds: t.members.map((m) => m.id) }}
                    users={userOptions}
                  />
                  <DeleteButton action={deleteTeamAction.bind(null, t.id)} confirmText={`Delete team ${t.name}? Members will be left without a team.`} />
                </span>
              </CardTitle>
              <CardDescription>
                {t.description || "No description"}
                {" · "}Manager: {t.manager?.name ?? "none"}
                {t._count.accessRules > 0 && ` · ${t._count.accessRules} access rule${t._count.accessRules === 1 ? "" : "s"}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {t.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {t.members.map((m) => (
                    <Badge key={m.id} variant="secondary">
                      {m.name} <span className="text-muted-foreground">&middot; {m.role.name}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
