"""
Entraînement du modèle de satisfaction — exécuté sur Kaggle (notebook de type script).

Entrée  : /kaggle/input/**/dataset.csv + meta.json (publiés par Next.js via l'API Kaggle)
Sortie  : /kaggle/working/
            model.keras       modèle Keras complet
            weights.json      poids des couches denses (inférence en TypeScript côté Next.js)
            preprocess.json   colonnes, scaler, catégories (pour reproduire l'entrée)
            metrics.json      MAE, RMSE, R², accuracy, F1, courbes, importance, matrice de confusion

Modèle : MLP tabulaire à deux sorties
  - "score"  : régression de la satisfaction (sigmoïde × 100)
  - "classe" : insatisfait / neutre / satisfait (softmax)
Validation temporelle : les 2 derniers mois servent de jeu de validation
(on évalue comme en conditions réelles : prédire le futur à partir du passé).
"""
import glob
import json
import os
import time

import numpy as np
import pandas as pd

# Keras 3 : TensorFlow si présent dans l'image Kaggle, sinon PyTorch (même code).
try:
    import tensorflow as tf  # noqa: F401
    os.environ.setdefault("KERAS_BACKEND", "tensorflow")
except ImportError:
    os.environ.setdefault("KERAS_BACKEND", "torch")
import keras  # noqa: E402

SEED = 42
np.random.seed(SEED)
keras.utils.set_random_seed(SEED)
OUT = "/kaggle/working"
CLASS_NAMES = ["insatisfait", "neutre", "satisfait"]
started = time.time()

# ------------------------------------------------------------------ Données
csv_path = sorted(glob.glob("/kaggle/input/**/dataset.csv", recursive=True))[0]
meta = json.load(open(os.path.join(os.path.dirname(csv_path), "meta.json"), encoding="utf-8"))
print(f"Dataset v{meta['version']} ({meta['checksum'][:12]}) : {csv_path}")

df = pd.read_csv(csv_path)
df = df[df["satisfaction"].notna()].reset_index(drop=True)
print(f"{len(df)} lignes étiquetées")

features = meta["features"]
scaler = meta["scaler"]
categories = meta["categories"]  # {"operateur": [...], "service": [...], "region": [...]}
# Indicateurs de valeur manquante pour les features qui en ont (débit, latence, variations…).
flags = [f for f in features if df[f].isna().any()]


def encode(frame: pd.DataFrame) -> np.ndarray:
    cols = []
    for f in features:
        s = scaler.get(f, {})
        sd = s.get("ecartType") or 1.0
        cols.append(((frame[f].astype(float) - s.get("moyenne", 0.0)) / sd).fillna(0.0).to_numpy())
    for f in flags:
        cols.append(frame[f].isna().astype(float).to_numpy())
    for cat, values in categories.items():
        for v in values:
            cols.append((frame[cat] == v).astype(float).to_numpy())
    return np.stack(cols, axis=1).astype("float32")


X = encode(df)
y_score = (df["satisfaction"].to_numpy() / 100.0).astype("float32")
y_cls = df["classe"].map({c: i for i, c in enumerate(CLASS_NAMES)}).to_numpy().astype("int32")

months = sorted(df["date"].unique())
if len(months) >= 4:
    val_months = months[-2:]
    is_val = df["date"].isin(val_months).to_numpy()
else:  # trop peu de mois : découpage aléatoire 80 / 20
    val_months = []
    is_val = np.random.rand(len(df)) < 0.2
Xtr, Xva = X[~is_val], X[is_val]
print(f"Entraînement : {len(Xtr)} lignes · validation : {len(Xva)} lignes {val_months}")

# ------------------------------------------------------------------ Modèle
inp = keras.Input(shape=(X.shape[1],), name="entree")
h = keras.layers.Dense(64, activation="relu", name="d1")(inp)
h = keras.layers.Dropout(0.2)(h)
h = keras.layers.Dense(32, activation="relu", name="d2")(h)
h = keras.layers.Dropout(0.1)(h)
out_score = keras.layers.Dense(1, activation="sigmoid", name="score")(h)
out_cls = keras.layers.Dense(3, activation="softmax", name="classe")(h)
model = keras.Model(inp, [out_score, out_cls])
model.compile(
    optimizer=keras.optimizers.Adam(1e-3),
    loss={"score": "mse", "classe": "sparse_categorical_crossentropy"},
    loss_weights={"score": 1.0, "classe": 0.2},
    metrics={"score": ["mae"], "classe": ["accuracy"]},
)
hist = model.fit(
    Xtr,
    {"score": y_score[~is_val], "classe": y_cls[~is_val]},
    validation_data=(Xva, {"score": y_score[is_val], "classe": y_cls[is_val]}),
    epochs=300,
    batch_size=64,
    verbose=2,
    callbacks=[keras.callbacks.EarlyStopping(monitor="val_loss", patience=25, restore_best_weights=True)],
)

# ------------------------------------------------------------------ Évaluation
def predict(x):
    s, c = model.predict(x, verbose=0)
    return s.reshape(-1) * 100.0, c


yv = y_score[is_val] * 100.0
pv, cv = predict(Xva)
mae = float(np.mean(np.abs(pv - yv)))
rmse = float(np.sqrt(np.mean((pv - yv) ** 2)))
r2 = float(1 - np.sum((pv - yv) ** 2) / max(np.sum((yv - yv.mean()) ** 2), 1e-9))
baseline_mae = float(np.mean(np.abs(y_score[~is_val].mean() * 100.0 - yv)))

pred_cls = cv.argmax(axis=1)
true_cls = y_cls[is_val]
accuracy = float((pred_cls == true_cls).mean())
confusion = [[int(((true_cls == i) & (pred_cls == j)).sum()) for j in range(3)] for i in range(3)]
f1s = []
for i in range(3):
    tp = confusion[i][i]
    fp = sum(confusion[k][i] for k in range(3)) - tp
    fn = sum(confusion[i]) - tp
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f1s.append(2 * p * r / (p + r) if p + r else 0.0)
f1_macro = float(np.mean(f1s))

# Importance par permutation : hausse de la MAE quand on mélange une feature (et son indicateur).
rng = np.random.default_rng(SEED)
importance = []
for i, f in enumerate(features):
    Xp = Xva.copy()
    perm = rng.permutation(len(Xp))
    Xp[:, i] = Xp[perm, i]
    if f in flags:
        j = len(features) + flags.index(f)
        Xp[:, j] = Xp[perm, j]
    pp, _ = predict(Xp)
    importance.append({"feature": f, "impact": round(float(np.mean(np.abs(pp - yv)) - mae), 4)})
importance.sort(key=lambda d: -d["impact"])

print(f"MAE {mae:.2f} (référence {baseline_mae:.2f}) · RMSE {rmse:.2f} · R² {r2:.3f} · accuracy {accuracy:.3f} · F1 {f1_macro:.3f}")

# ------------------------------------------------------------------ Sauvegarde
model.save(os.path.join(OUT, "model.keras"))
ACTIVATIONS = {"d1": "relu", "d2": "relu", "score": "sigmoid", "classe": "softmax"}
weights = {}
for name, act in ACTIVATIONS.items():
    W, b = model.get_layer(name).get_weights()
    weights[name] = {
        "W": np.round(np.asarray(W, dtype="float64"), 7).tolist(),
        "b": np.round(np.asarray(b, dtype="float64"), 7).tolist(),
        "activation": act,
    }
json.dump(weights, open(os.path.join(OUT, "weights.json"), "w"))

json.dump(
    {"features": features, "flags": flags, "scaler": scaler, "categories": categories, "class_names": CLASS_NAMES, "input_size": int(X.shape[1])},
    open(os.path.join(OUT, "preprocess.json"), "w", encoding="utf-8"),
    ensure_ascii=False,
)

h = hist.history
gpu = False
try:
    import tensorflow as tf  # noqa: F811
    gpu = bool(tf.config.list_physical_devices("GPU"))
except Exception:
    try:
        import torch
        gpu = bool(torch.cuda.is_available())
    except Exception:
        pass

json.dump(
    {
        "dataset_version": meta["version"],
        "dataset_checksum": meta["checksum"],
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "r2": round(r2, 4),
        "baseline_mae": round(baseline_mae, 4),
        "accuracy": round(accuracy, 4),
        "f1_macro": round(f1_macro, 4),
        "confusion": confusion,
        "class_names": CLASS_NAMES,
        "importance": importance,
        "history": {
            "loss": [round(float(v), 5) for v in h.get("loss", [])],
            "val_loss": [round(float(v), 5) for v in h.get("val_loss", [])],
            "mae": [round(float(v) * 100, 3) for v in h.get("score_mae", [])],
            "val_mae": [round(float(v) * 100, 3) for v in h.get("val_score_mae", [])],
        },
        "epochs": len(h.get("loss", [])),
        "n_train": int(len(Xtr)),
        "n_val": int(len(Xva)),
        "val_months": list(val_months),
        "backend": keras.backend.backend(),
        "keras_version": keras.__version__,
        "gpu": gpu,
        "duration_s": round(time.time() - started, 1),
    },
    open(os.path.join(OUT, "metrics.json"), "w", encoding="utf-8"),
    ensure_ascii=False,
)
print("Artefacts écrits dans", OUT)
