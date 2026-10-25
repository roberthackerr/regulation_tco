import { createHash } from "node:crypto";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { OPERATORS, REGIONS, SERVICES, type OperatorCode } from "@/lib/constants";
import { HttpError, clientIp, handler, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { analyserSentiment } from "@/lib/sentiment";
import { Feedback } from "@/models/Feedback";
import { Operator } from "@/models/Operator";

const Body = z.object({
  operateur: z.enum(OPERATORS.map((o) => o.code) as [OperatorCode, ...OperatorCode[]]),
  region: z.enum(REGIONS),
  service: z.enum(SERVICES),
  note: z.number().int().min(1).max(5),
  commentaire: z.string().trim().min(5, "Commentaire trop court.").max(1000, "Commentaire trop long (1 000 caractères max)."),
  // Champ piège invisible : rempli uniquement par les robots.
  site: z.string().max(0).optional(),
});

/**
 * POST /api/public/feedback — avis d'un usager, sans compte.
 * Limité à 5 avis par heure et par adresse IP (stockée uniquement sous forme d'empreinte).
 */
export const POST = handler(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  const ipHash = createHash("sha256").update(`${clientIp(req)}:${process.env.JWT_SECRET ?? ""}`).digest("hex");
  await rateLimit(`feedback:${ipHash}`, 5, 3600);

  await connectDb();
  const op = await Operator.findOne({ code: body.operateur }).select("_id").lean();
  if (!op) throw new HttpError(404, "Opérateur introuvable.");

  const now = new Date();
  const s = analyserSentiment(body.commentaire);
  await Feedback.create({
    operatorId: op._id,
    date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    region: body.region,
    service: body.service,
    note: body.note,
    commentaire: body.commentaire,
    langue: s.langue,
    sentiment: { label: s.label, score: s.score, source: "lexique" },
    status: "publie",
    source: "public",
    ipHash,
  });
  return Response.json({ ok: true, sentiment: s.label }, { status: 201 });
});
