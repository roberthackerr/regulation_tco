"""Configuration lue depuis le .env à la racine du projet (partagé avec Next.js)."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

MONGO_URI = os.environ.get("MONGO_URI") or os.environ.get("MONGODB_URI") or ""
INTERNAL_API_TOKEN = os.environ.get("INTERNAL_API_TOKEN", "")

KAGGLE_USERNAME = os.environ.get("KAGGLE_USERNAME", "")
KAGGLE_DATASET_SLUG = os.environ.get("KAGGLE_DATASET_SLUG", "telecom-satisfaction-madagascar")
KAGGLE_KERNEL_SLUG = os.environ.get("KAGGLE_KERNEL_SLUG", "telecom-satisfaction-training")
KAGGLE_ENABLE_GPU = os.environ.get("KAGGLE_ENABLE_GPU", "true").lower() == "true"

# Fenêtre de regroupement : un entraînement automatique attend ce délai sans nouvelle version.
TRAINING_DEBOUNCE_MINUTES = float(os.environ.get("TRAINING_DEBOUNCE_MINUTES", "30"))
# Délai maximum d'un entraînement sur Kaggle avant abandon.
TRAINING_TIMEOUT_MINUTES = float(os.environ.get("TRAINING_TIMEOUT_MINUTES", "90"))

ARTIFACTS_DIR = Path(os.environ.get("ML_ARTIFACTS_DIR", str(ROOT / "ml-service" / "artifacts")))
KAGGLE_DIR = ROOT / "kaggle"

# Catégories encodées en one-hot (miroir de lib/constants.ts).
CATEGORIES = {
    "operateur": ["YAS", "ORANGE", "AIRTEL"],
    "service": ["voix", "data", "sms", "mobile_money"],
    "region": [
        "Alaotra-Mangoro", "Amoron'i Mania", "Analamanga", "Analanjirofo", "Androy", "Anosy",
        "Atsimo-Andrefana", "Atsimo-Atsinanana", "Atsinanana", "Betsiboka", "Boeny", "Bongolava",
        "Diana", "Fitovinany", "Haute Matsiatra", "Ihorombe", "Itasy", "Melaky", "Menabe", "Sava",
        "Sofia", "Vakinankaratra", "Vatovavy",
    ],
}
