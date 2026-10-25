import { clearSessionCookie } from "@/lib/auth/dal";
import { handler } from "@/lib/http";

/** POST /api/auth/logout — supprime le cookie de session. */
export const POST = handler(async () => {
  await clearSessionCookie();
  return Response.json({ ok: true });
});
