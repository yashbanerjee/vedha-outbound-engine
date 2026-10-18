import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { deleteSourceAction } from "@/lib/admin/actions";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { SourceDialog } from "./source-dialog";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  await requirePermission("admin.sources");
  const sources = await prisma.leadSource.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { leads: true, importJobs: true } } },
  });

  return (
    <>
      <PageHeader title="Lead sources" description="Tag where leads came from so you can filter the archive and scope access rules per source.">
        <SourceDialog />
      </PageHeader>
      <div className="overflow-hidden rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Imports</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                  No sources yet.
                </TableCell>
              </TableRow>
            )}
            {sources.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.description ?? "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{s._count.leads}</TableCell>
                <TableCell className="text-right tabular-nums">{s._count.importJobs}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <SourceDialog source={s} />
                    <DeleteButton action={deleteSourceAction.bind(null, s.id)} confirmText={`Delete source ${s.name}? Leads will keep their data.`} />
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
