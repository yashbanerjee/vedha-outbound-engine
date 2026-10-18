export type MailboxPreset = "gmail" | "microsoft" | "custom";

export const MAILBOX_PRESETS: Record<
  Exclude<MailboxPreset, "custom">,
  { label: string; smtpHost: string; smtpPort: number; smtpSecure: boolean; imapHost: string; imapPort: number; imapSecure: boolean; sentFolder: string }
> = {
  gmail: {
    label: "Gmail / Google Workspace",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
    sentFolder: "[Gmail]/Sent Mail",
  },
  microsoft: {
    label: "Microsoft 365 / Outlook",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecure: true,
    sentFolder: "Sent Items",
  },
};
