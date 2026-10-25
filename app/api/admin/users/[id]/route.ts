import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { HttpError, assertObjectId, handler, readJson } from "@/lib/http";
import { serializeUser } from "@/lib/serialize";
import { User } from "@/models/User";
import { PasswordSchema } from "@/lib/validation";

const PatchBody = z
  .object({
    nom: z.string().trim().min(2).max(100).optional(),
    actif: z.boolean().optional(),
    password: PasswordSchema.optional(),
  })
  .strict();

/** PATCH /api/admin/users/:id — modifie le nom, active/désactive, ou réinitialise le mot de passe. */
export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/admin/users/[id]">) => {
  const admin = await requireUser("admin");
  const { id } = await ctx.params;
  assertObjectId(id);
  const body = PatchBody.parse(await readJson(req));

  if (id === admin.id && body.actif === false) {
    throw new HttpError(400, "Vous ne pouvez pas désactiver votre propre compte.");
  }

  const update: Record<string, unknown> = {};
  if (body.nom !== undefined) update.nom = body.nom;
  if (body.actif !== undefined) update.actif = body.actif;
  if (body.password !== undefined) update.passwordHash = await bcrypt.hash(body.password, 10);

  const user = await User.findByIdAndUpdate(id, update, { returnDocument: "after" })
    .populate("operatorId", "code")
    .lean();
  if (!user) throw new HttpError(404, "Utilisateur introuvable.");

  await audit(admin.id, "user_update", user.email, {
    nom: body.nom,
    actif: body.actif,
    passwordReset: body.password !== undefined,
  });
  return Response.json({ user: serializeUser(user) });
});

/** DELETE /api/admin/users/:id — supprime un compte (sauf le sien). */
export const DELETE = handler(async (_req: Request, ctx: RouteContext<"/api/admin/users/[id]">) => {
  const admin = await requireUser("admin");
  const { id } = await ctx.params;
  assertObjectId(id);
  if (id === admin.id) throw new HttpError(400, "Vous ne pouvez pas supprimer votre propre compte.");

  const user = await User.findByIdAndDelete(id).lean();
  if (!user) throw new HttpError(404, "Utilisateur introuvable.");

  await audit(admin.id, "user_delete", user.email);
  return Response.json({ ok: true });
});
