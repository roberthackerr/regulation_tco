"""
Accès à l'API officielle Kaggle (paquet `kaggle`), authentifiée par KAGGLE_API_TOKEN.

Cycle (docs/PROPOSITION_ARCHITECTURE.md, section 1) :
  1. publication d'une version du dataset      (kaggle datasets version)
  2. lancement du notebook d'entraînement      (kaggle kernels push)
  3. surveillance                              (kaggle kernels status)
  4. récupération des artefacts                (kaggle kernels output)
"""
from __future__ import annotations

import os
from functools import lru_cache

from . import config


@lru_cache(maxsize=1)
def api():
    if not os.environ.get("KAGGLE_API_TOKEN") and not (os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY")):
        raise RuntimeError("Identifiants Kaggle absents : renseignez KAGGLE_API_TOKEN dans .env")
    from kaggle.api.kaggle_api_extended import KaggleApi

    a = KaggleApi()
    a.authenticate()
    return a


@lru_cache(maxsize=1)
def username() -> str:
    name = config.KAGGLE_USERNAME or api().get_config_value("username") or ""
    if not name:
        raise RuntimeError("Nom d'utilisateur Kaggle introuvable : ajoutez KAGGLE_USERNAME dans .env")
    return name


def dataset_ref() -> str:
    return f"{username()}/{config.KAGGLE_DATASET_SLUG}"


def kernel_ref() -> str:
    return f"{username()}/{config.KAGGLE_KERNEL_SLUG}"


def dataset_url() -> str:
    return f"https://www.kaggle.com/datasets/{dataset_ref()}"


def kernel_url() -> str:
    return f"https://www.kaggle.com/code/{kernel_ref()}"


def dataset_exists() -> bool:
    try:
        api().dataset_status(dataset_ref())
        return True
    except Exception:
        return False


def dataset_status() -> str:
    return str(api().dataset_status(dataset_ref()) or "").lower()


def kernel_status() -> tuple[str, str | None]:
    """Renvoie (statut, message d'échec). Statuts : queued, running, complete, error, cancel…"""
    res = api().kernels_status(kernel_ref())
    status = getattr(res, "status", None)
    name = getattr(status, "name", None) or str(status)
    return name.lower(), (getattr(res, "failure_message", None) or None)
