import { requireUser } from "@/lib/auth/dal";
import { csvTemplate } from "@/lib/csv/validate";
import { handler } from "@/lib/http";

/** GET /api/imports/template — modèle CSV à remplir (en-tête + exemples). */
export const GET = handler(async () => {
  await requireUser("admin", "operator");
  return new Response(csvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modele_indicateurs.csv"',
    },
  });
});
