import "server-only";
import { Types } from "mongoose";
import { OPERATORS, REGIONS, SERVICES } from "@/lib/constants";
import { DatasetRow, type DatasetRowDoc } from "@/models/DatasetRow";

type VersionLike = { _id: unknown; version: number; features: string[]; checksum: string; scaler?: unknown };

const csvCell = (v: unknown) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function loadRows(versionId: unknown): Promise<DatasetRowDoc[]> {
  return DatasetRow.find({ versionId: new Types.ObjectId(String(versionId)) }).sort({ operateur: 1, date: 1, region: 1, service: 1 }).lean();
}

/** Colonnes : clés, features (dans l'ordre de la version), nb_avis, cible, classe. */
export function rowsToCsv(v: VersionLike, rows: DatasetRowDoc[]): string {
  const header = ["operateur", "date", "region", "service", ...v.features, "nb_avis", "satisfaction", "classe"];
  const lines = rows.map((r) =>
    [r.operateur, r.date.toISOString().slice(0, 10), r.region, r.service, ...v.features.map((f) => (r.features as Record<string, unknown>)[f]), r.nbAvis, r.satisfaction, r.classe]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}

/** meta.json lu par le notebook Kaggle : features, normalisation et catégories à encoder. */
export function buildMeta(v: VersionLike) {
  return {
    version: v.version,
    checksum: v.checksum,
    features: v.features,
    target: "satisfaction",
    scaler: v.scaler ?? {},
    categories: {
      operateur: OPERATORS.map((o) => o.code),
      service: [...SERVICES],
      region: [...REGIONS],
    },
  };
}
