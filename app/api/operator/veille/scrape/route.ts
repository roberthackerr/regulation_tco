import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { resolveOperator } from "@/lib/auth/operatorScope";
import { handler } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { runScrape } from "@/lib/scraping/run";

/** POST /api/operator/veille/scrape — lance une collecte (réseaux sociaux + presse). */
export const POST = handler(async (req: Request) => {
  const user = await requireUser("admin", "operator");
  const { operatorId, code } = await resolveOperator(user, req);
  await rateLimit(`scrape:${code}`, 6, 10 * 60);
  const run = await runScrape(operatorId, code, user.id);
  await audit(user.id, "veille_scrape", null, { operator: code, nouveaux: run.nouveaux });
  return Response.json({ run }, { status: 201 });
});
