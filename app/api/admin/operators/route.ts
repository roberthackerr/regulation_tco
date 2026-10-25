import { requireUser } from "@/lib/auth/dal";
import { handler } from "@/lib/http";
import { Operator } from "@/models/Operator";

/** GET /api/admin/operators — liste des opérateurs (pour les formulaires admin). */
export const GET = handler(async () => {
  await requireUser("admin");
  const operators = await Operator.find().sort({ code: 1 }).lean();
  return Response.json({
    operators: operators.map((o) => ({ id: String(o._id), code: o.code, nom: o.nom, actif: o.actif })),
  });
});
