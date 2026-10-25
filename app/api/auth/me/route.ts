import { requireUser } from "@/lib/auth/dal";
import { handler } from "@/lib/http";

/** GET /api/auth/me — profil de l'utilisateur connecté. */
export const GET = handler(async () => {
  const user = await requireUser();
  return Response.json({ user });
});
