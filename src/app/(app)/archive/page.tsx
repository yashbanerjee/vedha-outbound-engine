import Link from "next/link";
import { Suspense } from "react";
import { Upload } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getArchiveFilterOptions, getArchiveLeadIds, getArchiveLeads, getAssignableUsers, parseArchiveFilters } from "@/lib/leads/queries";
import { getAiSettings } from "@/lib/ai/queue";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import { ArchiveFilters } from "./archive-filters";
import { ArchiveTable } from "./archive-table";
import { AddLeadDialog } from "./add-lead-dialog";

export const dynamic = "force-dynamic";

export default async function ArchivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("leads.view_archive", "leads.view_all");
  const filters = parseArchiveFilters(await searchParams);

  const perms = {
    canAllocate: can(user, "leads.allocate"),
    canEdit: can(user, "leads.edit"),
    canScore: can(user, "ai.score"),
    canDelete: can(user, "leads.delete"),
  };

  const [result, options, users, allMatchingIds, aiSettings] = await Promise.all([
    getArchiveLeads(user, filters),
    getArchiveFilterOptions(user),
    perms.canAllocate ? getAssignableUsers() : Promise.resolve([]),
    getArchiveLeadIds(user, filters),
    getAiSettings(),
  ]);
  const aiEnabled = aiSettings.enabled;

  return (
    <>
      <PageHeader title="Lead archive" description="Every lead from every source, deduplicated and ready to allocate.">
        {can(user, "leads.create") && <AddLeadDialog sources={options.sources} />}
        {can(user, "leads.import") && (
          <Button size="sm" asChild>
            <Link href="/archive/import">
              <Upload />
              Import CSV
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="space-y-4">
        <Suspense>
          <ArchiveFilters sources={options.sources} industries={options.industries} countries={options.countries} aiEnabled={aiEnabled} />
        </Suspense>
        <ArchiveTable
          leads={result.leads}
          total={result.total}
          users={users}
          allMatchingIds={result.total > result.leads.length ? allMatchingIds : null}
          perms={perms}
          aiEnabled={aiEnabled}
        />
        <Suspense>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} />
        </Suspense>
      </div>
    </>
  );
}
