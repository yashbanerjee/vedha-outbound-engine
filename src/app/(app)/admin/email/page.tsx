import { formatDistanceToNowStrict } from "date-fns";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getMailSettings } from "@/lib/mail/settings";
import { PageHeader } from "@/components/page-header";
import { MailboxForm } from "./mailbox-form";
import { TemplateManager } from "./template-manager";

export const dynamic = "force-dynamic";

export default async function EmailAdminPage() {
  await requirePermission("email.manage");
  const [settings, templates] = await Promise.all([
    getMailSettings(),
    prisma.emailTemplate.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Email"
        description="The shared mailbox everyone sends from, and the templates they start with. Replies are read from this inbox and passed to the employee handling the lead."
      />
      <div className="space-y-6">
        <MailboxForm
          hasPassword={!!settings.passwordEnc}
          lastPolledAt={settings.lastPolledAt ? formatDistanceToNowStrict(settings.lastPolledAt, { addSuffix: true }) : null}
          lastPollError={settings.lastPollError}
          initial={{
            enabled: settings.enabled,
            fromAddress: settings.fromAddress,
            fromName: settings.fromName,
            smtpHost: settings.smtpHost,
            smtpPort: settings.smtpPort,
            smtpSecure: settings.smtpSecure,
            imapHost: settings.imapHost,
            imapPort: settings.imapPort,
            imapSecure: settings.imapSecure,
            username: settings.username,
            password: "",
            sentFolder: settings.sentFolder,
          }}
        />
        <TemplateManager templates={templates} />
      </div>
    </>
  );
}
