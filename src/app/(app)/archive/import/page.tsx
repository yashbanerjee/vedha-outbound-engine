import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai/queue";
import { PageHeader } from "@/components/page-header";
import { ImportWizard } from "./import-wizard";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requirePermission("leads.import");
  const [sources, settings, recent] = await Promise.all([
    prisma.leadSource.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getAiSettings(),
    prisma.importJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        fileName: true,
        createdAt: true,
        importedCount: true,
        skippedCount: true,
        errorCount: true,
        totalRows: true,
        source: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader title="Import leads" description="Upload a CSV, map its columns, review duplicates and commit to the archive." />
      <ImportWizard
        sources={sources}
        aiEnabled={settings.enabled}
        autoScoreDefault={settings.autoScoreOnImport}
        recent={recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
      />
    </>
  );
}
