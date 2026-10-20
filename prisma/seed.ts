import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ROLE_PERMISSIONS } from "../src/lib/auth/permissions";

const prisma = new PrismaClient();

async function main() {
  // Roles
  const roles: Record<string, { id: string }> = {};
  for (const [name, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    roles[name] = await prisma.role.upsert({
      where: { name },
      update: { permissions },
      create: {
        name,
        permissions,
        isSystem: true,
        description:
          name === "Admin"
            ? "Full access to everything."
            : name === "Manager"
              ? "Imports, allocates and manages a team."
              : "Works assigned leads: status updates and comments.",
      },
    });
  }

  // Admin user
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, name: "Admin", passwordHash, roleId: roles.Admin.id },
  });

  // Demo team + BDEs (only when seeding demo data)
  if (process.env.SEED_DEMO !== "false") {
    const team = await prisma.team.upsert({
      where: { name: "Outbound Team A" },
      update: {},
      create: { name: "Outbound Team A", description: "Default outbound team" },
    });
    const demoHash = await bcrypt.hash("password123", 10);
    await prisma.user.upsert({
      where: { email: "manager@example.com" },
      update: {},
      create: { email: "manager@example.com", name: "Maya Manager", passwordHash: demoHash, roleId: roles.Manager.id, teamId: team.id },
    });
    for (const [email, name] of [
      ["bde1@example.com", "Ben BDE"],
      ["bde2@example.com", "Bella BDE"],
    ]) {
      await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, name, passwordHash: demoHash, roleId: roles.BDE.id, teamId: team.id },
      });
    }
    const manager = await prisma.user.findUnique({ where: { email: "manager@example.com" } });
    if (manager) await prisma.team.update({ where: { id: team.id }, data: { managerId: manager.id } });
  }

  // Sources
  for (const [name, description] of [
    ["Apollo", "Exported from Apollo.io"],
    ["LinkedIn Sales Navigator", "Manual research on LinkedIn"],
    ["Clutch", "Agencies listed on Clutch.co"],
    ["Referral", "Introduced by an existing client or partner"],
  ]) {
    await prisma.leadSource.upsert({ where: { name }, update: {}, create: { name, description } });
  }

  // AI settings
  await prisma.aiSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      idealCustomerProfile:
        "B2B companies with 10-500 employees that sell software or professional services and have an active, modern website. They should appear to be growing (hiring, recent blog posts, case studies) and operate in English-speaking markets.",
      scoringCriteria:
        "- Strong fit (+): clear B2B offering, pricing or 'book a demo' CTA, careers page with open roles, recent content.\n- Weak fit (-): consumer-only business, parked or outdated website, non-profit, government, very small local shop.\n- Disqualify: site unreachable, adult content, direct competitor.",
    },
  });

  await prisma.mailSettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });

  if ((await prisma.emailTemplate.count()) === 0) {
    await prisma.emailTemplate.createMany({
      data: [
        {
          name: "First contact",
          subject: "{{companyName}} + us",
          bodyHtml:
            "<p>Hi {{contactName}},</p><p>I came across {{companyName}} and thought it was worth a quick note.</p><p>Would you be open to a short conversation this week?</p><p>Best,<br>{{senderName}}</p>",
        },
        {
          name: "Follow-up",
          subject: "Re: {{companyName}}",
          bodyHtml:
            "<p>Hi {{contactName}},</p><p>Just following up on my last note. Happy to work around your schedule if a quick call would be useful.</p><p>Best,<br>{{senderName}}</p>",
        },
      ],
    });
  }

  console.log("Seed complete.");
  if (existingAdmin) {
    console.log(`Admin already exists: ${adminEmail} (password left unchanged)`);
  } else {
    console.log(`Admin created: ${adminEmail} / ${adminPassword}`);
  }
  if (process.env.SEED_DEMO !== "false") {
    console.log("Demo logins: manager@example.com, bde1@example.com, bde2@example.com / password123");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
