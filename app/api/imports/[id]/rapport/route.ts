import Papa from "papaparse";
import { requireUser } from "@/lib/auth/dal";
import { HttpError, assertObjectId, handler } from "@/lib/http";
import { importScope } from "@/lib/imports";
import { Import } from "@/models/Import";

/** GET /api/imports/:id/rapport — rapport de validation au format CSV (erreurs + avertissements). */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/imports/[id]/rapport">) => {
  const user = await requireUser("admin", "operator");
  const { id } = await ctx.params;
  assertObjectId(id);

  const imp = await Import.findOne({ _id: id, ...importScope(user) }).lean();
  if (!imp) throw new HttpError(404, "Import introuvable.");

  const lines = [
    ...imp.erreurs.map((e) => ({ type: "erreur", ...e })),
    ...imp.avertissements.map((e) => ({ type: "avertissement", ...e })),
  ].map((e) => ({
    type: e.type,
    ligne: e.ligne ?? "",
    colonne: e.colonne ?? "",
    valeur: e.valeur ?? "",
    message: e.message,
  }));

  const csv = Papa.unparse(lines, { columns: ["type", "ligne", "colonne", "valeur", "message"] });
  const name = imp.fileName.replace(/\.csv$/i, "").replace(/[^\w.-]+/g, "_");
  // BOM UTF-8 pour qu'Excel affiche correctement les accents.
  return new Response("﻿" + csv + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rapport_${name}.csv"`,
    },
  });
});
