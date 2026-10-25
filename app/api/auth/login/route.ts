import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { setSessionCookie } from "@/lib/auth/dal";
import { homeForRole, signSession } from "@/lib/auth/token";
import type { OperatorCode, Role } from "@/lib/constants";
import { connectDb } from "@/lib/db";
import { HttpError, clientIp, handler, readJson } from "@/lib/http";
import { rateLimit, resetRateLimit } from "@/lib/rateLimit";
import { User } from "@/models/User";
import "@/models/Operator"; // enregistre le modèle pour populate()

const Body = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Email invalide." })),
  password: z.string().min(1, { error: "Mot de passe requis." }).max(200),
});

// Hash factice : on compare quand même si l'email n'existe pas, pour que le temps
// de réponse ne révèle pas quels emails ont un compte.
const DUMMY_HASH = bcrypt.hashSync("mot-de-passe-factice", 10);

/** POST /api/auth/login — connexion par email et mot de passe. */
export const POST = handler(async (req: Request) => {
  const ip = clientIp(req);
  // 10 tentatives par IP toutes les 15 minutes.
  await rateLimit(`login:${ip}`, 10, 15 * 60);

  const { email, password } = Body.parse(await readJson(req));
  await connectDb();

  const user = await User.findOne({ email })
    .select("+passwordHash")
    .populate<{ operatorId: { _id: unknown; code: OperatorCode } | null }>("operatorId", "code");

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.actif) {
    await audit(user ? String(user._id) : null, "login_echec", email, { ip });
    throw new HttpError(401, "Email ou mot de passe incorrect.");
  }

  const role = user.role as Role;
  const token = await signSession({
    sub: String(user._id),
    role,
    operatorId: user.operatorId ? String(user.operatorId._id) : null,
    operatorCode: user.operatorId?.code ?? null,
  });
  await setSessionCookie(token);

  await User.updateOne({ _id: user._id }, { lastLogin: new Date() });
  await resetRateLimit(`login:${ip}`);
  await audit(String(user._id), "login", email, { ip });

  return Response.json({ role, redirect: homeForRole(role) });
});
