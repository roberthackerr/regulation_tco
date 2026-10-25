import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { IMPORT_STATUSES, isOperatorCode, type ImportStatus } from "@/lib/constants";
import { HttpError, handler } from "@/lib/http";
import { importScope, processUpload } from "@/lib/imports";
import { serializeImport } from "@/lib/serialize";
import { Import } from "@/models/Import";
import { Operator } from "@/models/Operator";
import "@/models/User";

/**
 * GET /api/imports — historique des imports.
 * Un opérateur ne voit que les siens ; l'admin voit tout et peut filtrer
 * par ?operator=YAS et ?status=recu.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser("admin", "operator");
  const url = new URL(req.url);
  const filter: Record<string, unknown> = { ...importScope(user) };

  const status = url.searchParams.get("status");
  if (status) {
    if (!IMPORT_STATUSES.includes(status as ImportStatus)) throw new HttpError(400, "Statut inconnu.");
    filter.status = status;
  }
  const operator = url.searchParams.get("operator");
  if (operator && user.role === "admin") {
    if (!isOperatorCode(operator)) throw new HttpError(400, "Opérateur inconnu.");
    const op = await Operator.findOne({ code: operator }).lean();
    filter.operatorId = op?._id ?? null;
  }

  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
  const imports = await Import.find(filter)
    .populate("operatorId", "code")
    .populate("userId", "email")
    .populate("reviewedBy", "email")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return Response.json({ imports: imports.map((i) => serializeImport(i)) });
});

/** POST /api/imports — envoi d'un fichier CSV (multipart, champ « file »). Réservé aux opérateurs. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser("operator");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Envoi multipart/form-data attendu.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Champ « file » manquant.");

  const imp = await processUpload(user, file);
  await audit(user.id, "import_upload", String(imp._id), { fileName: imp.fileName, status: imp.status });

  const full = await Import.findById(imp._id)
    .populate("operatorId", "code")
    .populate("userId", "email")
    .lean();
  return Response.json({ import: serializeImport(full!, true) }, { status: 201 });
});
