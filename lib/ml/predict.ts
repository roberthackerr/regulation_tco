/**
 * Inférence du modèle de satisfaction en TypeScript pur (serveur et navigateur).
 * Reproduit exactement l'encodage de kaggle/train.py puis le passage avant du MLP :
 *   entrée → Dense(64, relu) → Dense(32, relu) → { score: sigmoïde × 100, classe: softmax(3) }
 * Le dropout n'intervient pas à l'inférence.
 */

export type Preprocess = {
  features: string[];
  flags: string[];
  scaler: Record<string, { moyenne?: number; ecartType?: number }>;
  categories: Record<string, string[]>; // ordre : operateur, service, region
  class_names: string[];
  input_size: number;
};

export type DenseLayer = { W: number[][]; b: number[]; activation: "relu" | "sigmoid" | "softmax" | "linear" };
export type Weights = { d1: DenseLayer; d2: DenseLayer; score: DenseLayer; classe: DenseLayer };

export type PredictInput = {
  operateur: string;
  service: string;
  region: string;
  features: Record<string, number | null | undefined>;
};

export type Prediction = { score: number; classe: string; probas: Record<string, number> };

export function encode(p: Preprocess, input: PredictInput): number[] {
  const x: number[] = [];
  for (const f of p.features) {
    const v = input.features[f];
    const s = p.scaler[f] ?? {};
    const sd = s.ecartType || 1;
    x.push(v == null || !Number.isFinite(v) ? 0 : (v - (s.moyenne ?? 0)) / sd);
  }
  for (const f of p.flags) x.push(input.features[f] == null ? 1 : 0);
  for (const [cat, values] of Object.entries(p.categories)) {
    const val = (input as unknown as Record<string, string>)[cat];
    for (const v of values) x.push(val === v ? 1 : 0);
  }
  return x;
}

function dense(x: number[], layer: DenseLayer): number[] {
  const out = layer.b.slice();
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    if (xi === 0) continue;
    const row = layer.W[i];
    for (let j = 0; j < out.length; j++) out[j] += xi * row[j];
  }
  switch (layer.activation) {
    case "relu":
      return out.map((v) => (v > 0 ? v : 0));
    case "sigmoid":
      return out.map((v) => 1 / (1 + Math.exp(-v)));
    case "softmax": {
      const m = Math.max(...out);
      const e = out.map((v) => Math.exp(v - m));
      const t = e.reduce((a, b) => a + b, 0);
      return e.map((v) => v / t);
    }
    default:
      return out;
  }
}

export function predict(p: Preprocess, w: Weights, input: PredictInput): Prediction {
  const h = dense(dense(encode(p, input), w.d1), w.d2);
  const score = dense(h, w.score)[0] * 100;
  const probs = dense(h, w.classe);
  const probas = Object.fromEntries(p.class_names.map((c, i) => [c, probs[i]]));
  const best = probs.indexOf(Math.max(...probs));
  return { score, classe: p.class_names[best], probas };
}

/** Features nulles par construction selon le service (même règle que le pipeline). */
export const FEATURE_SERVICES: Record<string, string[]> = {
  debit_moyen_mbps: ["data"],
  latence_ms: ["voix", "data", "mobile_money"],
};
export const featureApplies = (feature: string, service: string) => !FEATURE_SERVICES[feature] || FEATURE_SERVICES[feature].includes(service);
