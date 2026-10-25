import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { OPERATORS, ROLES } from "@/lib/constants";
import { HttpError, handler, readJson } from "@/lib/http";
import { serializeUser } from "@/lib/serialize";
import { PasswordSchema } from "@/lib/validation";
import { Operator } from "@/models/Operator";
import { User } from "@/models/User";

/** GET /api/admin/users — liste des comptes. */
export const GET = handler(async () => {
  await requireUser("admin");
  const users = await User.find()
    .populate("operatorId", "code")
    .sort({ role: 1, email: 1 })
    .lean();
  return Response.json({ users: users.map(serializeUser) });
});

const CreateBody = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email({ error: "Email invalide." })),
    nom: z.string().trim().min(2, { error: "Nom trop court." }).max(100),
    password: PasswordSchema,
    role: z.enum(ROLES),
    operatorCode: z.enum(OPERATORS.map((o) => o.code)).optional().nullable(),
  })
  .refine((b) => b.role !== "operator" || !!b.operatorCode, {
    error: "Un compte opérateur doit être rattaché à un opérateur.",
    path: ["operatorCode"],
  });

/** POST /api/admin/users — crée un compte admin ou opérateur. */
export const POST = handler(async (req: Request) => {
  const admin = await requireUser("admin");
  const body = CreateBody.parse(await readJson(req));

  let operatorId = null;
  if (body.role === "operator") {
    const op = await Operator.findOne({ code: body.operatorCode }).lean();
    if (!op) throw new HttpError(400, "Opérateur introuvable. Lancez d'abord le script d'initialisation (npm run seed).");
    operatorId = op._id;
    if (await User.exists({ role: "operator", operatorId })) {
      throw new HttpError(409, `Un compte existe déjà pour l'opérateur ${body.operatorCode} (un seul compte par opérateur).`);
    }
  }
  if (await User.exists({ email: body.email })) {
    throw new HttpError(409, "Un compte existe déjà avec cet email.");
  }

  const user = await User.create({
    email: body.email,
    nom: body.nom,
    passwordHash: await bcrypt.hash(body.password, 10),
    role: body.role,
    operatorId,
  });
  await audit(admin.id, "user_create", body.email, { role: body.role, operator: body.operatorCode ?? null });

  const created = await User.findById(user._id).populate("operatorId", "code").lean();
  return Response.json({ user: serializeUser(created!) }, { status: 201 });
});
