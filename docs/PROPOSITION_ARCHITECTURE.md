# Plateforme de régulation des télécommunications — Proposition d'architecture

> Projet académique (régulation des télécommunications). Simulation du système d'information d'une autorité de régulation (type ARTEC, Madagascar) supervisant les opérateurs **Yas (ex-Telma)**, **Orange** et **Airtel**.
>
> Statut : **validée** — phases 1 à 4 et 6 réalisées. Depuis le 25/10/2026, **plus aucune donnée synthétique** : la plateforme ne traite que des données réelles. Les choix par défaut retenus pour les questions ouvertes sont indiqués en section 8.

---

## Sommaire

1. [Contexte technique du projet](#0-contexte-technique-du-projet)
2. [Architecture globale](#1-architecture-globale)
3. [Modèle de données (collections MongoDB)](#2-modèle-de-données-collections-mongodb)
4. [Schéma CSV exact](#3-schéma-csv-exact)
5. [Endpoints API](#4-endpoints-api)
6. [Modèles de deep learning](#5-modèles-de-deep-learning)
7. [Plan de développement par phases](#6-plan-de-développement-par-phases)
8. [Variables d'environnement](#7-variables-denvironnement)
9. [Questions ouvertes](#8-questions-ouvertes-à-valider)

---

## 0. Contexte technique du projet

| Élément | Version |
|---|---|
| Next.js | 16.4.2 (App Router) |
| React | 19.3.0 |
| Tailwind CSS | v4 |
| TypeScript | 5 |
| Node.js | 24 |
| Python | 3.13 |
| Base de données | MongoDB |
| Deep learning | TensorFlow (entraînement sur Kaggle) |

**À noter pour Next.js 16** : `middleware.ts` est déprécié et remplacé par `proxy.ts`. Il sert uniquement aux redirections rapides selon le rôle ; le vrai contrôle d'accès est fait dans chaque route API (recommandation officielle de Next.js).

---

## 1. Architecture globale

```
┌────────────────────────── Next.js 16 (my-app/) ──────────────────────────┐
│  Pages : /  (public)  /login  /admin/*  /operateur/*  /avis  /signaler     │
│  API (route handlers) : auth, comptes, import CSV, feedbacks, stats…       │
│  Pipeline de données (TypeScript) → dataset versionné                      │
│  Orchestrateur Kaggle (API REST officielle) + inférence du MLP en TS       │
└───────────────┬──────────────────────────────────────┬─────────────────────┘
                ▼                                       ▼
        ┌──── MongoDB ────┐                    ┌──────── Kaggle ────────┐
        │ toutes les      │                    │ dataset privé vN       │
        │ collections     │                    │ notebook TensorFlow    │
        └─────────────────┘                    │ (kaggle/train.py)      │
                                               └────────────────────────┘
```

> **Décision (oct. 2026)** : pas de service Python / FastAPI. Next.js appelle directement l'API REST
> de Kaggle ; Python ne sert qu'au notebook exécuté *sur* Kaggle. Le modèle (MLP) revient sous forme
> de poids JSON et l'inférence est faite en TypeScript, côté serveur comme dans le navigateur.

### Répartition des responsabilités

- **Next.js** : interface, authentification, rôles, CSV, pipeline de données, orchestration Kaggle, inférence.
- **Kaggle** : entraînement TensorFlow (notebook `kaggle/train.py`), GPU en option.
- **MongoDB** : base unique.

### File d'attente des entraînements

- Stockée dans MongoDB (collection `training_jobs`) — pas de Redis, pour garder l'installation simple.
- Les imports validés s'accumulent ; un entraînement est lancé après une **fenêtre de regroupement** (ex. 30 min sans nouvel import, configurable).
- **Un seul entraînement à la fois** (quotas GPU Kaggle limités).

### Cycle Kaggle

1. `kaggle datasets version` — publication de la nouvelle version du dataset.
2. `kaggle kernels push` — lancement du notebook d'entraînement avec GPU.
3. `kaggle kernels status` — surveillance périodique.
4. `kaggle kernels output` — récupération du modèle (`.keras`), du scaler et de `metrics.json`.
5. Enregistrement du modèle `vN` ; **mise en production seulement si la MAE de validation est meilleure** que celle du modèle actuel.

Les identifiants Kaggle sont lus depuis les variables d'environnement, jamais écrits dans le code.

### Organisation des dossiers

```
my-app/
  app/              pages + app/api/*
  lib/              connexion db (mongoose), auth, rbac, validation CSV
  models/           schémas Mongoose
  proxy.ts          redirections selon le rôle
  kaggle/           train.py (poussé tel quel sur Kaggle par lib/kaggle/client.ts)
  data/backup/      sauvegarde de l'ancienne base synthétique (générateur supprimé le 25/10/2026)
  docs/             documentation
  .env.example      modèle des variables d'environnement
```

---

## 2. Modèle de données (collections MongoDB)

| Collection | Champs principaux |
|---|---|
| `operators` | `code` (YAS / ORANGE / AIRTEL), `nom`, `actif` |
| `users` | `email`, `passwordHash`, `role` (admin / operator), `operatorId` (si opérateur), `actif`, `lastLogin` |
| `imports` | `operatorId`, `userId`, `fileName`, `fileHash`, `status` (recu / valide / rejete / traite), `rowCount`, `errors[]` (ligne, colonne, message), `warnings[]`, `validatedBy`, dates |
| `operator_metrics` | une ligne CSV nettoyée : `operatorId`, `importId`, `date`, `region`, `service`, mesures… — index unique sur opérateur + date + région + service |
| `feedbacks` | `operatorId`, `service`, `region`, `note` (1–5), `commentaire`, `sentiment` {label, score}, `status` (en_attente / publie / rejete), `ipHash`, `deviceHash` |
| `reports` (signalements) | `operatorId`, `type` (coupure / zone_sans_reseau / debit_faible), `region`, `location` (GeoJSON Point), `description`, `status`, `ipHash` |
| `scraped_raw` | `source`, `url`, `fetchedAt`, `httpStatus`, contenu brut |
| `scraped_offers` | `operatorId`, `nomOffre`, `service`, `prixAr`, `volume`, `validite`, `scrapedAt` (données nettoyées) |
| `scraped_reviews` | `operatorId`, `source`, `texte`, `date`, `sentiment` (données nettoyées) |
| `scrape_runs` | `source`, `startedAt`, `status`, `nbPages`, `erreurs` |
| `dataset_versions` | `version`, `importIds[]`, `nbLignes`, `features[]`, `kaggleVersion`, `checksum`, `createdAt` |
| `training_jobs` | `status` (en_file / envoi_dataset / entrainement / recuperation / termine / echec), `datasetVersionId`, `kaggleKernelVersion`, `logs`, dates |
| `models` | `version` (v1, v2…), `datasetVersionId`, `metrics` {mae, rmse, r2, accuracy_classes}, `artifactPath`, `isProduction`, `createdAt` |
| `predictions` | `modelVersion`, `operatorId`, `region`, `service`, `periode`, `score` (0–100), `classe`, `facteurs[]` {feature, impact} |
| `rate_limits` | `cle` (ip / appareil + action), `count`, `expiresAt` (index TTL) |
| `audit_logs` | `userId`, `action`, `cible`, `date` |

### Données brutes vs nettoyées

- Scraping : `scraped_raw` (brut) est séparé de `scraped_offers` / `scraped_reviews` (nettoyé).
- Imports : le fichier d'origine est référencé dans `imports` ; les lignes nettoyées vont dans `operator_metrics`.

### Cible d'entraînement (en l'absence de vraies données)

- Satisfaction = moyenne des notes de feedback (× 20) ajustée par le sentiment des commentaires, agrégée par **opérateur × région × service × mois**.
- Le générateur synthétique produit des feedbacks **corrélés aux indicateurs de qualité de service** (avec du bruit), pour que le modèle ait une relation réelle à apprendre.
- Classes :
  - **satisfait** : score ≥ 65
  - **neutre** : 45 ≤ score < 65
  - **insatisfait** : score < 45

---

## 3. Schéma CSV exact

- Encodage **UTF-8**, séparateur **`,`**, en-tête obligatoire.
- Une ligne par **mois × région × service**.
- L'opérateur **n'est pas dans le fichier** : il est déduit du compte connecté (un opérateur ne peut pas importer au nom d'un autre).

| Colonne | Type | Contraintes |
|---|---|---|
| `date` | `YYYY-MM-DD` | 1er jour du mois, pas dans le futur |
| `region` | texte | une des 23 régions officielles de Madagascar |
| `service` | texte | `voix`, `data`, `sms`, `mobile_money` |
| `nb_abonnes` | entier | ≥ 0 |
| `taux_coupure` | décimal (%) | 0 – 100 |
| `debit_moyen_mbps` | décimal | > 0 si `data`, vide sinon |
| `latence_ms` | entier | 1 – 5000, vide pour `sms` |
| `taux_disponibilite` | décimal (%) | 0 – 100 |
| `nb_reclamations` | entier | ≥ 0 |
| `tarif_moyen_ar` | décimal (Ariary) | > 0 |

### Les 23 régions

Alaotra-Mangoro, Amoron'i Mania, Analamanga, Analanjirofo, Androy, Anosy, Atsimo-Andrefana, Atsimo-Atsinanana, Atsinanana, Betsiboka, Boeny, Bongolava, Diana, Haute Matsiatra, Ihorombe, Itasy, Melaky, Menabe, Sava, Sofia, Vakinankaratra, Vatovavy, Fitovinany.

> Remarque : depuis 2021, le découpage officiel compte 23 régions avec la scission de Vatovavy-Fitovinany. La liste sera vérifiée et centralisée dans un seul fichier de configuration.

### Exemple

```csv
date,region,service,nb_abonnes,taux_coupure,debit_moyen_mbps,latence_ms,taux_disponibilite,nb_reclamations,tarif_moyen_ar
2025-11-01,Analamanga,data,1250000,1.8,12.4,45,99.2,320,2500
2025-11-01,Analamanga,voix,1800000,2.1,,60,99.5,210,120
2025-11-01,Analamanga,sms,1700000,0.4,,,99.7,35,50
2025-11-01,Analamanga,mobile_money,950000,0.9,,120,99.1,410,300
```

### Règles de validation

**Erreurs bloquantes** (l'import est rejeté) :
- colonne manquante ou en trop ;
- type invalide (texte au lieu d'un nombre, date mal formée) ;
- valeur hors bornes ;
- région ou service inconnu ;
- doublon (date + région + service) dans le fichier ou déjà importé ;
- fichier identique déjà envoyé (comparaison par hash).

**Avertissements non bloquants** :
- valeurs aberrantes statistiques (IQR / z-score > 3 par service), ex. un débit 10× supérieur à la médiane de la région. Les lignes sont signalées sans être rejetées.

**Rapport** : liste ligne / colonne / message, affichée à l'opérateur et téléchargeable en CSV.

### Statuts d'un import

- `recu` : validation automatique réussie, en attente d'approbation par l'admin ;
- `rejete` : erreurs de validation, ou refus de l'admin (avec motif) ;
- `valide` : approuvé par l'admin, lignes enregistrées dans `operator_metrics` ;
- `traite` : passé dans le pipeline (phase 2).

---

## 4. Endpoints API

### Next.js (`/api`)

Le rôle requis est indiqué entre crochets.

**Authentification**
```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
```

**Gestion des utilisateurs** [admin]
```
GET    /api/admin/users
POST   /api/admin/users
PATCH  /api/admin/users/:id
DELETE /api/admin/users/:id
```

**Imports CSV**
```
GET    /api/imports/template                    [operator]
POST   /api/imports            (multipart)      [operator]
GET    /api/imports                             [operator : les siens | admin : tous]
GET    /api/imports/:id                         [operator propriétaire | admin]
GET    /api/imports/:id/rapport                 [operator propriétaire | admin]  (CSV)
POST   /api/admin/imports/:id/approve           [admin]
POST   /api/admin/imports/:id/reject            [admin]
```

**Espace opérateur** (filtré sur son propre opérateur)
```
GET    /api/operator/metrics                    [operator]
GET    /api/operator/predictions                [operator]
```

**Administration : données, entraînements, modèles, prédictions** [admin]
```
GET    /api/admin/overview
GET    /api/admin/operators
GET    /api/admin/datasets
GET    /api/admin/trainings
POST   /api/admin/trainings                     (lancement manuel)
GET    /api/admin/trainings/:id
GET    /api/admin/models
POST   /api/admin/models/:id/promote
GET    /api/admin/predictions?operator=&region=&service=&from=&to=
```

**Modération et collecte** [admin]
```
GET    /api/admin/feedbacks
PATCH  /api/admin/feedbacks/:id                 (modération)
GET    /api/admin/reports
PATCH  /api/admin/reports/:id
GET    /api/admin/scraping/runs
POST   /api/admin/scraping/run
GET    /api/admin/scraping/offers
GET    /api/admin/export?collection=…&format=csv|json
```

**Public** (avec limite de débit par IP / appareil)
```
GET    /api/public/captcha
POST   /api/public/feedbacks
POST   /api/public/reports
GET    /api/public/stats                        (agrégats open data, sans données sensibles)
```

### Service Python (interne, en-tête `X-Internal-Token`)

```
POST /internal/pipeline/run          {importIds}  → nettoyage → dataset vN → mise en file
POST /internal/training/enqueue
GET  /internal/training/{id}
POST /internal/predict               {operator, region, service, features} → score, classe, facteurs
POST /internal/predictions/refresh   recalcule toutes les prédictions avec le modèle en production
POST /internal/sentiment             {texts[]}
POST /internal/scrape/run            {source}
GET  /health
```

---

## 5. Modèles de deep learning

### Prédiction de la satisfaction

- **MLP tabulaire** (TensorFlow / Keras) : features normalisées + encodage de l'opérateur, de la région et du service.
  - Sortie 1 : régression du score 0–100.
  - Sortie 2 : classe (satisfait / neutre / insatisfait).
- **LSTM (option)** : séquences mensuelles par opérateur × région × service, pour l'évolution dans le temps.
- **Facteurs explicatifs** : *gradient × input* (ou permutation importance), calculés au moment de l'inférence.
- **Métriques** : MAE, RMSE, R² (score) ; accuracy et F1 (classe).

### Analyse de sentiment (proposition)

- Petit modèle TensorFlow (embedding + BiLSTM) entraîné dans le même notebook Kaggle, sur des commentaires synthétiques étiquetés en **français et malgache**.
- Lexique FR/MG de secours si le modèle n'est pas encore disponible.

### Pipeline de traitement

Déclenché à chaque nouvel import validé :

1. **Nettoyage** : types, valeurs manquantes, bornes.
2. **Normalisation** : unités, noms de régions, mise à l'échelle.
3. **Feature engineering** : réclamations pour 1 000 abonnés, variations mois sur mois, moyennes glissantes, écart au tarif moyen du marché…
4. **Fusion** : feedbacks + sentiment, signalements citoyens, offres et avis scrapés.
5. **Dataset versionné** : enregistré dans `dataset_versions` et publié sur Kaggle.

---

## 6. Plan de développement par phases

| Phase | Contenu |
|---|---|
| 1 | Authentification, rôles, import et validation CSV, générateur de données synthétiques |
| 2 | Pipeline de traitement et base de données |
| 3 | Intégration Kaggle (entraînement + récupération du modèle) |
| 4 | Prédiction et tableau de bord admin |
| 5 | Feedback usagers et collecte publique (signalements, open data) |
| 6 | Web scraping |

À la fin de chaque phase : résumé de ce qui est fait, comment le tester, ce qui reste.

---

## 7. Variables d'environnement

À placer dans `.env` à la racine (jamais commité, voir `.env.example`) :

```env
MONGO_URI=
JWT_SECRET=
INTERNAL_API_TOKEN=
ML_SERVICE_URL=http://localhost:8000
KAGGLE_USERNAME=
KAGGLE_KEY=
```

Un fichier `.env.example` (sans valeurs) sera fourni.

---

## 8. Questions ouvertes

> Sans réponse explicite, les propositions ci-dessous ont été retenues par défaut. Elles restent modifiables.
> Point 1 appliqué en phase 1 (approbation admin obligatoire).

1. **Validation des imports** : validation automatique → **approbation par l'admin** → pipeline (proposé, conforme à « l'admin valide les données »). Ou bien pipeline lancé directement après la validation automatique ?
2. **Scraping des réseaux sociaux** : les CGU de Facebook, X et TikTok interdisent le scraping. Proposition :
   - sites des opérateurs (offres et tarifs), en respectant robots.txt ;
   - avis publics via une source qui l'autorise ou une API officielle (avec jeton) ;
   - ~~sinon, une source simulée~~ → **abandonné** (25/10/2026) : uniquement du réel. Sources retenues : avis App Store (flux RSS Apple), presse (RSS Google Actualités), YouTube / page Facebook / X via API officielles.
3. **Analyse de sentiment** : modèle TensorFlow BiLSTM entraîné sur Kaggle + lexique FR/MG de secours — d'accord ?
4. **Kaggle** : compte avec jeton API (`KAGGLE_USERNAME` / `KAGGLE_KEY`) et téléphone vérifié (obligatoire pour activer le GPU) ?
5. **Opérateurs** : voient-ils les prédictions de satisfaction pour leur propre opérateur, ou seulement leurs indicateurs bruts ? → **appliqué** : chaque opérateur voit ses propres prédictions (page « Satisfaction prédite »), jamais celles des concurrents.
