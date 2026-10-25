import "server-only";
import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import type { CurrentUser } from "@/lib/auth/dal";
import { validateCsv, type CleanRow, type Issue } from "@/lib/csv/validate";
import { HttpError } from "@/lib/http";
import { Import } from "@/models/Import";
import { OperatorMetric } from "@/models/OperatorMetric";

/** Nombre maximum d'anomalies conservées en base par import (le rapport reste lisible). */
const MAX_STORED_ISSUES = 1000;

const rowKey = (date: string | Date, region: string, service: string) =>
  `${typeof date === "string" ? date : date.toISOString().slice(0, 10)}|${region}|${service}`;

/**
 * Cherche les lignes du fichier déjà présentes :
 *  - dans les indicateurs validés de l'opérateur ;
 *  - dans un autre import du même opérateur encore en attente d'approbation.
 */
async function findExistingDuplicates(
  operatorId: string,
  rows: CleanRow[],
  excludeImportId?: string,
): Promise<Issue[]> {
  if (rows.length === 0) return [];
  const dates = [...new Set(rows.map((r) => r.date))].map((d) => new Date(`${d}T00:00:00Z`));
  const opId = new Types.ObjectId(operatorId);

  const existing = await OperatorMetric.find(
    { operatorId: opId, date: { $in: dates } },
    { date: 1, region: 1, service: 1 },
  ).lean();
  const inDb = new Set(existing.map((e) => rowKey(e.date, e.region, e.service)));

  const pending = await Import.find(
    {
      operatorId: opId,
      status: "recu",
      ...(excludeImportId ? { _id: { $ne: new Types.ObjectId(excludeImportId) } } : {}),
    },
    { fileName: 1, rows: 1 },
  )
    .select("+rows")
    .lean();
  const inPending = new Map<string, string>();
  for (const imp of pending) {
    for (const r of (imp.rows ?? []) as CleanRow[]) inPending.set(rowKey(r.date, r.region, r.service), imp.fileName);
  }

  const issues: Issue[] = [];
  for (const r of rows) {
    const key = rowKey(r.date, r.region, r.service);
    const valeur = `${r.date} / ${r.region} / ${r.service}`;
    if (inDb.has(key)) {
      issues.push({ ligne: r.ligne, colonne: null, valeur, message: "Données déjà importées et validées pour ce mois, cette région et ce service." });
    } else if (inPending.has(key)) {
      issues.push({ ligne: r.ligne, colonne: null, valeur, message: `Déjà présent dans l'import « ${inPending.get(key)} » en attente d'approbation.` });
    }
  }
  return issues;
}

/**
 * Traite un fichier envoyé par un opérateur : contrôle technique, validation,
 * détection des doublons, puis enregistrement de l'import avec son statut.
 */
export async function processUpload(user: CurrentUser, file: File) {
  if (!user.operatorId) throw new HttpError(403, "Seul un compte opérateur peut importer des données.");
  if (file.size === 0) throw new HttpError(400, "Le fichier est vide.");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Fichier trop volumineux (5 Mo maximum).");
  if (!/\.csv$/i.test(file.name)) throw new HttpError(400, "Seuls les fichiers .csv sont acceptés.");

  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    // `fatal: true` refuse un fichier qui n'est pas en UTF-8 valide.
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new HttpError(400, "Le fichier doit être encodé en UTF-8.");
  }
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const operatorId = new Types.ObjectId(user.operatorId);

  const base = {
    operatorId,
    userId: new Types.ObjectId(user.id),
    fileName: file.name.slice(0, 200),
    fileHash,
    fileSize: file.size,
  };

  // Fichier strictement identique à un import déjà accepté ou en attente : rejet immédiat.
  const same = await Import.findOne({ operatorId, fileHash, status: { $ne: "rejete" } }).lean();
  if (same) {
    const erreurs: Issue[] = [{
      ligne: null,
      colonne: null,
      valeur: null,
      message: `Fichier identique déjà envoyé le ${same.createdAt.toLocaleDateString("fr-FR")} (« ${same.fileName} »).`,
    }];
    return Import.create({ ...base, status: "rejete", erreurs, errorCount: 1 });
  }

  const result = validateCsv(text);
  const duplicates = await findExistingDuplicates(user.operatorId, result.rows);
  const erreurs = [...result.erreurs, ...duplicates].sort((a, b) => (a.ligne ?? 0) - (b.ligne ?? 0));
  const avertissements = result.avertissements;
  const accepted = erreurs.length === 0;

  const dates = result.rows.map((r) => r.date).sort();
  return Import.create({
    ...base,
    status: accepted ? "recu" : "rejete",
    rowCount: result.totalLignes,
    errorCount: erreurs.length,
    warningCount: avertissements.length,
    erreurs: erreurs.slice(0, MAX_STORED_ISSUES),
    avertissements: avertissements.slice(0, MAX_STORED_ISSUES),
    periodStart: dates.length ? new Date(`${dates[0]}T00:00:00Z`) : null,
    periodEnd: dates.length ? new Date(`${dates[dates.length - 1]}T00:00:00Z`) : null,
    // Les lignes ne sont gardées que si l'import est accepté (en attente d'approbation).
    rows: accepted ? result.rows : undefined,
  });
}

/**
 * Approbation par l'admin : les lignes passent dans `operator_metrics`.
 * Le changement de statut est atomique (recu → valide) pour éviter une double approbation.
 */
export async function approveImport(importId: string, adminId: string) {
  const imp = await Import.findOneAndUpdate(
    { _id: importId, status: "recu" },
    { status: "valide", reviewedBy: adminId, reviewedAt: new Date() },
    { returnDocument: "after" },
  ).select("+rows");
  if (!imp) {
    const exists = await Import.exists({ _id: importId });
    throw new HttpError(exists ? 409 : 404, exists ? "Seul un import au statut « Reçu » peut être approuvé." : "Import introuvable.");
  }

  const rows = (imp.rows ?? []) as CleanRow[];
  // Re-contrôle des doublons : un autre import a pu être approuvé entre-temps.
  const duplicates = await findExistingDuplicates(String(imp.operatorId), rows, String(imp._id));
  const blocking = duplicates.filter((d) => d.message.startsWith("Données déjà importées"));
  if (blocking.length > 0) {
    await Import.updateOne(
      { _id: imp._id },
      {
        status: "rejete",
        rejectReason: "Conflit : certaines lignes ont été validées entre-temps par un autre import.",
        erreurs: blocking.slice(0, MAX_STORED_ISSUES),
        errorCount: blocking.length,
        $unset: { rows: 1 },
      },
    );
    throw new HttpError(409, "Conflit : certaines lignes existent déjà. L'import a été rejeté.");
  }

  try {
    await OperatorMetric.insertMany(
      rows.map((r) => ({
        operatorId: imp.operatorId,
        importId: imp._id,
        date: new Date(`${r.date}T00:00:00Z`),
        region: r.region,
        service: r.service,
        nb_abonnes: r.nb_abonnes,
        taux_coupure: r.taux_coupure,
        debit_moyen_mbps: r.debit_moyen_mbps,
        latence_ms: r.latence_ms,
        taux_disponibilite: r.taux_disponibilite,
        nb_reclamations: r.nb_reclamations,
        tarif_moyen_ar: r.tarif_moyen_ar,
      })),
      { ordered: true },
    );
  } catch (err) {
    // Échec d'écriture : on annule ce qui a été inséré et on remet l'import en attente.
    await OperatorMetric.deleteMany({ importId: imp._id });
    await Import.updateOne({ _id: imp._id }, { status: "recu", reviewedBy: null, reviewedAt: null });
    throw err;
  }

  await Import.updateOne({ _id: imp._id }, { $unset: { rows: 1 } });
  // Le pipeline de traitement est lancé par la route d'approbation (en arrière-plan).
  return imp;
}

/** Refus par l'admin d'un import en attente. */
export async function rejectImport(importId: string, adminId: string, reason: string) {
  const imp = await Import.findOneAndUpdate(
    { _id: importId, status: "recu" },
    {
      status: "rejete",
      reviewedBy: adminId,
      reviewedAt: new Date(),
      rejectReason: reason,
      $unset: { rows: 1 },
    },
    { returnDocument: "after" },
  );
  if (!imp) {
    const exists = await Import.exists({ _id: importId });
    throw new HttpError(exists ? 409 : 404, exists ? "Seul un import au statut « Reçu » peut être refusé." : "Import introuvable.");
  }
  return imp;
}

/** Filtre MongoDB limitant les imports visibles à ceux de l'opérateur connecté. */
export function importScope(user: CurrentUser): Record<string, unknown> {
  return user.role === "admin" ? {} : { operatorId: new Types.ObjectId(user.operatorId!) };
}
