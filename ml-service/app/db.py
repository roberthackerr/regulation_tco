"""Connexion MongoDB partagée avec Next.js (mêmes collections)."""
from pymongo import MongoClient

from .config import MONGO_URI

if not MONGO_URI:
    raise RuntimeError("MONGO_URI manquant dans .env")

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=20_000, tz_aware=True)
try:
    db = client.get_default_database()
except Exception:  # URI sans nom de base : même défaut que Mongoose
    db = client["test"]

training_jobs = db["training_jobs"]
models = db["models"]
predictions = db["predictions"]
dataset_versions = db["dataset_versions"]
dataset_rows = db["dataset_rows"]
