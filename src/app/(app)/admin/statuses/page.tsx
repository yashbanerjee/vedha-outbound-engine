import { requirePermission } from "@/lib/auth/session";
import { getStatusLabels } from "@/lib/leads/status-labels";
import { PageHeader } from "@/components/page-header";
import { StatusForm } from "./status-form";

export const dynamic = "force-dynamic";

export default async function LeadStatusesPage() {
  await requirePermission("leads.statuses", "leads.view_all");
  const labels = await getStatusLabels();

  return (
    <>
      <PageHeader title="Lead statuses" description="Change the words used for each step in the lead pipeline." />
      <StatusForm initial={labels} />
    </>
  );
}
