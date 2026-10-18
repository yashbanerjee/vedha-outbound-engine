"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { ALL_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { fail, ok, safeAction, type ActionResult } from "@/lib/action-result";

const optionalId = z.string().optional().nullable().transform((v) => (v ? v : null));

function revalidateAdmin() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/roles");
  revalidatePath("/admin/sources");
  revalidatePath("/archive");
  revalidatePath("/", "layout");
}

function isUniqueError(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// ---------- Users ----------

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(200),
  roleId: z.string().min(1, "Choose a role"),
  teamId: optionalId,
  isActive: z.boolean().default(true),
});

/**
 * Prevents privilege escalation: someone without `admin.roles` can only grant
 * roles whose permissions are a subset of their own.
 */
async function assertCanGrantRole(actor: { permissions: string[] }, roleId: string): Promise<string | null> {
  if (actor.permissions.includes("admin.roles")) return null;
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true, permissions: true } });
  if (!role) return "Role not found.";
  const extra = role.permissions.filter((p) => !actor.permissions.includes(p));
  if (extra.length) return `You cannot grant the ${role.name} role because it has permissions you do not have (${extra.join(", ")}).`;
  return null;
}

export async function createUserAction(input: z.input<typeof userSchema> & { password: string }): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const actor = await assertPermission("admin.users");
    const parsed = userSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message, parsed.error.flatten().fieldErrors);
    if (!input.password || input.password.length < 8) return fail("Password must be at least 8 characters.", { password: ["Min 8 characters"] });
    const grantError = await assertCanGrantRole(actor, parsed.data.roleId);
    if (grantError) return fail(grantError);

    try {
      const user = await prisma.user.create({
        data: {
          ...parsed.data,
          email: parsed.data.email.toLowerCase(),
          passwordHash: await bcrypt.hash(input.password, 10),
        },
      });
      revalidateAdmin();
      return ok({ id: user.id }, `${user.name} created.`);
    } catch (err) {
      if (isUniqueError(err)) return fail("A user with that email already exists.");
      throw err;
    }
  });
}

export async function updateUserAction(
  userId: string,
  input: z.input<typeof userSchema> & { password?: string },
): Promise<ActionResult> {
  return safeAction(async () => {
    const actor = await assertPermission("admin.users");
    const parsed = userSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message, parsed.error.flatten().fieldErrors);

    if (actor.id === userId && !parsed.data.isActive) return fail("You cannot deactivate your own account.");
    const grantError = await assertCanGrantRole(actor, parsed.data.roleId);
    if (grantError) return fail(grantError);
    if (!actor.permissions.includes("admin.roles")) {
      // Non-role-admins may not edit users who hold permissions they lack.
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: { select: { permissions: true } } } });
      if (target?.role.permissions.some((p) => !actor.permissions.includes(p))) return fail("You cannot edit a user with more permissions than you.");
    }

    const data: Prisma.UserUpdateInput = {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      isActive: parsed.data.isActive,
      role: { connect: { id: parsed.data.roleId } },
      team: parsed.data.teamId ? { connect: { id: parsed.data.teamId } } : { disconnect: true },
    };
    if (input.password) {
      if (input.password.length < 8) return fail("Password must be at least 8 characters.", { password: ["Min 8 characters"] });
      data.passwordHash = await bcrypt.hash(input.password, 10);
    }

    try {
      await prisma.user.update({ where: { id: userId }, data });
      revalidateAdmin();
      return ok(undefined, "User updated.");
    } catch (err) {
      if (isUniqueError(err)) return fail("A user with that email already exists.");
      throw err;
    }
  });
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const actor = await assertPermission("admin.users");
    if (actor.id === userId) return fail("You cannot delete your own account.");
    if (!actor.permissions.includes("admin.roles")) {
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: { select: { permissions: true } } } });
      if (target?.role.permissions.some((p) => !actor.permissions.includes(p))) return fail("You cannot delete a user with more permissions than you.");
    }
    await prisma.user.delete({ where: { id: userId } });
    revalidateAdmin();
    return ok(undefined, "User deleted.");
  });
}

// ---------- Teams ----------

const teamSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  managerId: optionalId,
  memberIds: z.array(z.string()).optional(),
});

export async function saveTeamAction(teamId: string | null, input: z.input<typeof teamSchema>): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    await assertPermission("admin.teams");
    const parsed = teamSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message, parsed.error.flatten().fieldErrors);
    const { name, description, managerId, memberIds } = parsed.data;

    try {
      const id = await prisma.$transaction(async (tx) => {
        const team = teamId
          ? await tx.team.update({ where: { id: teamId }, data: { name, description: description || null, managerId } })
          : await tx.team.create({ data: { name, description: description || null, managerId } });
        if (memberIds) {
          await tx.user.updateMany({ where: { teamId: team.id, id: { notIn: memberIds } }, data: { teamId: null } });
          await tx.user.updateMany({ where: { id: { in: memberIds } }, data: { teamId: team.id } });
        }
        return team.id;
      });
      revalidateAdmin();
      return ok({ id }, teamId ? "Team updated." : "Team created.");
    } catch (err) {
      if (isUniqueError(err)) return fail("A team with that name already exists.");
      throw err;
    }
  });
}

export async function deleteTeamAction(teamId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await assertPermission("admin.teams");
    await prisma.team.delete({ where: { id: teamId } });
    revalidateAdmin();
    return ok(undefined, "Team deleted. Its members are now unassigned from any team.");
  });
}

// ---------- Roles ----------

const roleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(500).optional().nullable(),
  permissions: z.array(z.string()).transform((arr) => arr.filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p))),
});

export async function saveRoleAction(roleId: string | null, input: z.input<typeof roleSchema>): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    await assertPermission("admin.roles");
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message, parsed.error.flatten().fieldErrors);
    const { name, description, permissions } = parsed.data;

    if (roleId) {
      const existing = await prisma.role.findUnique({ where: { id: roleId } });
      if (!existing) return fail("Role not found.");
      if (existing.isSystem && existing.name === "Admin" && !permissions.includes("admin.roles")) {
        return fail("The Admin role must keep the 'admin.roles' permission.");
      }
    }

    try {
      const role = roleId
        ? await prisma.role.update({ where: { id: roleId }, data: { name, description: description || null, permissions } })
        : await prisma.role.create({ data: { name, description: description || null, permissions } });
      revalidateAdmin();
      return ok({ id: role.id }, roleId ? "Role updated." : "Role created.");
    } catch (err) {
      if (isUniqueError(err)) return fail("A role with that name already exists.");
      throw err;
    }
  });
}

export async function deleteRoleAction(roleId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await assertPermission("admin.roles");
    const role = await prisma.role.findUnique({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
    if (!role) return fail("Role not found.");
    if (role.isSystem) return fail("System roles cannot be deleted.");
    if (role._count.users > 0) return fail(`Reassign the ${role._count.users} user(s) with this role first.`);
    await prisma.role.delete({ where: { id: roleId } });
    revalidateAdmin();
    return ok(undefined, "Role deleted.");
  });
}

// ---------- Lead access rules ----------

const ruleSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    targetType: z.enum(["role", "team"]),
    targetId: z.string().min(1, "Choose a role or team"),
    sourceIds: z.array(z.string()).default([]),
    industries: z.array(z.string().trim()).default([]),
    countries: z.array(z.string().trim()).default([]),
    tags: z.array(z.string().trim()).default([]),
    minAiScore: z.number().int().min(0).max(100).nullable().optional(),
  })
  .transform((r) => ({
    ...r,
    industries: r.industries.filter(Boolean),
    countries: r.countries.filter(Boolean),
    tags: r.tags.filter(Boolean),
    minAiScore: r.minAiScore ?? null,
  }));

export async function saveAccessRuleAction(ruleId: string | null, input: z.input<typeof ruleSchema>): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    await assertPermission("admin.roles");
    const parsed = ruleSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message, parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    const data = {
      name: d.name,
      roleId: d.targetType === "role" ? d.targetId : null,
      teamId: d.targetType === "team" ? d.targetId : null,
      sourceIds: d.sourceIds,
      industries: d.industries,
      countries: d.countries,
      tags: d.tags,
      minAiScore: d.minAiScore,
    };
    const rule = ruleId ? await prisma.leadAccessRule.update({ where: { id: ruleId }, data }) : await prisma.leadAccessRule.create({ data });
    revalidateAdmin();
    return ok({ id: rule.id }, ruleId ? "Access rule updated." : "Access rule created.");
  });
}

export async function deleteAccessRuleAction(ruleId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await assertPermission("admin.roles");
    await prisma.leadAccessRule.delete({ where: { id: ruleId } });
    revalidateAdmin();
    return ok(undefined, "Access rule deleted.");
  });
}

// ---------- Sources ----------

const sourceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).optional().nullable(),
});

export async function saveSourceAction(sourceId: string | null, input: z.input<typeof sourceSchema>): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    await assertPermission("admin.sources");
    const parsed = sourceSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message, parsed.error.flatten().fieldErrors);
    const data = { name: parsed.data.name, description: parsed.data.description || null };
    try {
      const s = sourceId ? await prisma.leadSource.update({ where: { id: sourceId }, data }) : await prisma.leadSource.create({ data });
      revalidateAdmin();
      return ok({ id: s.id }, sourceId ? "Source updated." : "Source created.");
    } catch (err) {
      if (isUniqueError(err)) return fail("A source with that name already exists.");
      throw err;
    }
  });
}

export async function deleteSourceAction(sourceId: string): Promise<ActionResult> {
  return safeAction(async () => {
    await assertPermission("admin.sources");
    await prisma.leadSource.delete({ where: { id: sourceId } });
    revalidateAdmin();
    return ok(undefined, "Source deleted. Leads keep their data but no longer reference it.");
  });
}
