import { formatDistanceToNowStrict } from "date-fns";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { deleteUserAction } from "@/lib/admin/actions";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { UserDialog } from "./user-dialog";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requirePermission("admin.users");
  const [users, roles, teams] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        role: { select: { name: true } },
        team: { select: { name: true } },
        _count: { select: { assignments: true } },
      },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader title="Users" description="Accounts that can sign in. Roles control permissions; teams control lead access and allocation.">
        <UserDialog roles={roles} teams={teams} />
      </PageHeader>
      <div className="overflow-hidden rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Leads assigned</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={!u.isActive ? "opacity-60" : undefined}>
                <TableCell>
                  <p className="font-medium">
                    {u.name}
                    {u.id === me.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{u.role.name}</Badge>
                </TableCell>
                <TableCell className="text-sm">{u.team?.name ?? <span className="text-muted-foreground">-</span>}</TableCell>
                <TableCell className="text-sm tabular-nums">{u._count.assignments}</TableCell>
                <TableCell>
                  {u.isActive ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDistanceToNowStrict(u.createdAt, { addSuffix: true })}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <UserDialog user={{ id: u.id, name: u.name, email: u.email, isActive: u.isActive, roleId: u.roleId, teamId: u.teamId }} roles={roles} teams={teams} />
                    {u.id !== me.id && (
                      <DeleteButton
                        action={deleteUserAction.bind(null, u.id)}
                        confirmText={`Delete ${u.name}? Their assignments and comments will be removed. Consider deactivating instead.`}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
