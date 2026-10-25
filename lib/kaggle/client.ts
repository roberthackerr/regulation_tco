import "server-only";

/**
 * Client de l'API REST officielle de Kaggle (https://www.kaggle.com/api/v1),
 * appelée directement depuis Next.js — aucun service Python intermédiaire.
 *
 * Authentification (variables d'environnement, jamais dans le code) :
 *   - KAGGLE_API_TOKEN               jeton API (en-tête Bearer), ou
 *   - KAGGLE_USERNAME + KAGGLE_KEY   ancienne clé (authentification Basic).
 * KAGGLE_USERNAME est nécessaire dans les deux cas pour nommer le dataset et le notebook.
 */

const BASE = "https://www.kaggle.com/api/v1";

export class KaggleError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export const kaggleConfig = () => {
  const username = process.env.KAGGLE_USERNAME?.trim() ?? "";
  const token = process.env.KAGGLE_API_TOKEN?.trim() ?? "";
  const key = process.env.KAGGLE_KEY?.trim() ?? "";
  const datasetSlug = process.env.KAGGLE_DATASET_SLUG?.trim() || "telecom-satisfaction-madagascar";
  const kernelSlug = process.env.KAGGLE_KERNEL_SLUG?.trim() || "telecom-satisfaction-training";
  return {
    username,
    hasCredentials: Boolean(token || (username && key)),
    configured: Boolean(username && (token || key)),
    gpu: (process.env.KAGGLE_ENABLE_GPU ?? "false").toLowerCase() === "true",
    timeoutMinutes: Number(process.env.TRAINING_TIMEOUT_MINUTES ?? 90) || 90,
    datasetSlug,
    kernelSlug,
    datasetRef: `${username}/${datasetSlug}`,
    kernelRef: `${username}/${kernelSlug}`,
    datasetUrl: username ? `https://www.kaggle.com/datasets/${username}/${datasetSlug}` : null,
    kernelUrl: username ? `https://www.kaggle.com/code/${username}/${kernelSlug}` : null,
  };
};

function authHeader(): string {
  const token = process.env.KAGGLE_API_TOKEN?.trim();
  if (token) return `Bearer ${token}`;
  const { username } = kaggleConfig();
  const key = process.env.KAGGLE_KEY?.trim();
  if (username && key) return `Basic ${Buffer.from(`${username}:${key}`).toString("base64")}`;
  throw new KaggleError("Identifiants Kaggle absents : renseignez KAGGLE_API_TOKEN (ou KAGGLE_KEY) dans .env.");
}

async function call<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method: init.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* réponse texte brute */
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && ("message" in data ? (data as { message: string }).message : "error" in data ? (data as { error: string }).error : null)) ||
      (typeof data === "string" && data.slice(0, 200)) ||
      res.statusText;
    const hint = res.status === 401 || res.status === 403 ? " (jeton Kaggle invalide ou expiré ?)" : "";
    throw new KaggleError(`Kaggle ${res.status} sur ${path.split("?")[0]} : ${msg}${hint}`, res.status);
  }
  return data as T;
}

/* ------------------------------------------------------------------ Datasets */

/** Envoie un fichier dans le stockage temporaire de Kaggle et renvoie son jeton. */
export async function uploadBlob(name: string, content: string | Uint8Array, contentType: string): Promise<string> {
  const body = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const { token, createUrl } = await call<{ token: string; createUrl: string }>("/blobs/upload", {
    method: "POST",
    json: {
      type: "DATASET",
      name,
      contentLength: body.byteLength,
      contentType,
      lastModifiedEpochSeconds: Math.floor(Date.now() / 1000),
    },
  });
  // URL signée (Google Cloud Storage) : pas d'en-tête d'authentification Kaggle ici.
  const put = await fetch(createUrl, { method: "PUT", body: body as BodyInit, headers: { "Content-Type": contentType }, signal: AbortSignal.timeout(120_000) });
  if (!put.ok) throw new KaggleError(`Échec de l'envoi de ${name} (${put.status}).`, put.status);
  return token;
}

type CreateResult = { ref?: string; url?: string; status?: string; error?: string | null };

/** Statut de traitement d'un dataset : "ready", "pending", "error"… ou null s'il n'existe pas. */
export async function datasetStatus(): Promise<string | null> {
  const { username, datasetSlug } = kaggleConfig();
  try {
    const s = await call<string | { status?: string }>(`/datasets/status/${username}/${datasetSlug}`);
    const v = typeof s === "string" ? s : s?.status ?? "";
    return v.toLowerCase().replace(/^dataset_status_/, "");
  } catch (e) {
    // Kaggle répond 403 (et non 404) pour un dataset privé qui n'existe pas encore :
    // il ne révèle pas l'existence des datasets. On le traite donc comme « absent ».
    if (e instanceof KaggleError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

/** Numéro de la version courante du dataset sur Kaggle (si l'API le fournit). */
export async function datasetVersionNumber(): Promise<number | null> {
  const { username, datasetSlug } = kaggleConfig();
  try {
    const d = await call<{ currentVersionNumber?: number; versions?: { versionNumber: number }[] }>(`/datasets/view/${username}/${datasetSlug}`);
    return d.currentVersionNumber ?? d.versions?.[0]?.versionNumber ?? null;
  } catch {
    return null;
  }
}

/** Publie les fichiers : crée le dataset (privé) s'il n'existe pas, sinon en ajoute une version. */
export async function publishDataset(files: { name: string; token: string }[], notes: string): Promise<{ created: boolean; url: string | null }> {
  const cfg = kaggleConfig();
  const exists = (await datasetStatus()) !== null;
  const tokens = files.map((f) => ({ token: f.token }));
  let res: CreateResult;
  if (exists) {
    res = await call<CreateResult>(`/datasets/create/version/${cfg.username}/${cfg.datasetSlug}`, {
      method: "POST",
      json: { versionNotes: notes, deleteOldVersions: false, convertToCsv: false, files: tokens, categoryIds: [] },
    });
  } else {
    res = await call<CreateResult>("/datasets/create/new", {
      method: "POST",
      json: {
        ownerSlug: cfg.username,
        slug: cfg.datasetSlug,
        title: "Satisfaction télécoms Madagascar",
        subtitle: "Jeu d'entraînement versionné de l'observatoire de régulation",
        description: notes,
        licenseName: "CC0-1.0",
        isPrivate: true,
        convertToCsv: false,
        files: tokens,
        categoryIds: [],
      },
    });
  }
  if (res.error) throw new KaggleError(`Publication du dataset refusée : ${res.error}`);
  return { created: !exists, url: res.url ?? cfg.datasetUrl };
}

/* ------------------------------------------------------------------ Notebooks */

/** Envoie le script d'entraînement comme nouvelle version du notebook : Kaggle l'exécute aussitôt. */
export async function pushKernel(source: string): Promise<{ versionNumber: number | null; url: string | null }> {
  const cfg = kaggleConfig();
  const res = await call<{ ref?: string; url?: string; versionNumber?: number; error?: string | null; invalidDatasetSources?: string[] }>("/kernels/push", {
    method: "POST",
    json: {
      slug: cfg.kernelRef,
      newTitle: cfg.kernelSlug,
      text: source,
      language: "python",
      kernelType: "script",
      isPrivate: true,
      enableGpu: cfg.gpu,
      enableTpu: false,
      enableInternet: false,
      datasetDataSources: [cfg.datasetRef],
      competitionDataSources: [],
      kernelDataSources: [],
      modelDataSources: [],
      categoryIds: [],
    },
  });
  if (res.error) throw new KaggleError(`Lancement du notebook refusé : ${res.error}`);
  if (res.invalidDatasetSources?.length) throw new KaggleError(`Dataset non reconnu par Kaggle : ${res.invalidDatasetSources.join(", ")}`);
  return { versionNumber: res.versionNumber ?? null, url: res.url ?? cfg.kernelUrl };
}

export type KernelState = "queued" | "running" | "complete" | "error" | "cancelled" | "unknown";

/** Statut de la dernière exécution du notebook. */
export async function kernelStatus(): Promise<{ status: KernelState; raw: string; failure: string | null }> {
  const { username, kernelSlug } = kaggleConfig();
  const res = await call<{ status?: string; failureMessage?: string | null }>(`/kernels/status?userName=${encodeURIComponent(username)}&kernelSlug=${encodeURIComponent(kernelSlug)}`);
  const raw = String(res.status ?? "").toLowerCase().replace(/^kernel_worker_status_/, "");
  const status: KernelState = raw.includes("cancel")
    ? "cancelled"
    : (["queued", "running", "complete", "error"] as const).find((s) => raw.includes(s)) ?? "unknown";
  return { status, raw, failure: res.failureMessage || null };
}

/** Fichiers produits par la dernière exécution (URLs signées) et journal brut. */
export async function kernelOutput(): Promise<{ files: { fileName: string; url: string }[]; log: string }> {
  const { username, kernelSlug } = kaggleConfig();
  const res = await call<{ files?: { fileName: string; url: string }[]; log?: string }>(
    `/kernels/output?userName=${encodeURIComponent(username)}&kernelSlug=${encodeURIComponent(kernelSlug)}`,
  );
  return { files: res.files ?? [], log: res.log ?? "" };
}

/** Télécharge un fichier de sortie et le lit en JSON. */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new KaggleError(`Téléchargement impossible (${res.status}).`, res.status);
  return (await res.json()) as T;
}

/** Le journal Kaggle est un tableau JSON de { stream_name, time, data } : on le remet en lignes. */
export function parseKernelLog(log: string): string[] {
  if (!log) return [];
  try {
    const entries = JSON.parse(log) as { data?: string }[];
    return entries.map((e) => e.data ?? "").join("").split("\n").map((l) => l.trimEnd()).filter(Boolean);
  } catch {
    return log.split("\n").filter(Boolean);
  }
}
