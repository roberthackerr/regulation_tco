# Observatoire Télécoms — plateforme de régulation des télécommunications

Projet académique (régulation des télécommunications). La plateforme reproduit le système d'information
d'une autorité de régulation (type ARTEC, Madagascar) qui supervise trois opérateurs mobiles :
**Yas (ex-Telma)**, **Orange** et **Airtel**.

Les opérateurs envoient leurs indicateurs, le public donne son avis, et un modèle de deep learning
(entraîné sur Kaggle) prédit la satisfaction des usagers par opérateur, région et service.

> **Données réelles uniquement** (depuis le 25/10/2026) : le générateur synthétique a été supprimé.
> Indicateurs transmis par les opérateurs (imports CSV), avis du formulaire public, et contenus publics
> collectés par la veille (avis App Store, presse en ligne, YouTube / Facebook / X avec clés officielles).
> Sauvegarde de l'ancienne base synthétique : `data/backup/2026-10-25/` (EJSON, restaurable avec `mongoimport --jsonArray`).

Architecture détaillée : [`docs/PROPOSITION_ARCHITECTURE.md`](docs/PROPOSITION_ARCHITECTURE.md).

---

## Avancement

| Phase | Contenu | État |
|---|---|---|
| 1 | Authentification, rôles, import et validation CSV | ✅ terminée |
| 2 | Pipeline de traitement et base de données | ✅ terminée |
| 3 | Intégration Kaggle (entraînement + récupération du modèle) | ✅ terminée |
| 4 | Prédiction et tableau de bord admin | ✅ terminée |
| 5 | Feedback usagers et collecte publique | formulaire d'avis fait, signalements à faire |
| 6 | Web scraping (veille réelle : App Store, presse, YouTube, Facebook, X) | ✅ terminée |

---

## Prérequis

- Node.js 20 ou plus (testé avec Node 24)
- Une base MongoDB (MongoDB Atlas ou locale)

## Installation

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env
#    puis renseigner MONGO_URI et JWT_SECRET (générer le secret : openssl rand -hex 32)

# 3. Opérateurs et comptes de démonstration
npm run seed
```

`npm run seed` crée :

| Compte | Mot de passe | Rôle |
|---|---|---|
| `admin@artec.mg` | `Admin2026!` | Admin (autorité) |
| `yas@operateur.mg` | `Operateur2026!` | Opérateur Yas |
| `orange@operateur.mg` | `Operateur2026!` | Opérateur Orange |
| `airtel@operateur.mg` | `Operateur2026!` | Opérateur Airtel |

Les mots de passe se changent avec `SEED_ADMIN_PASSWORD` et `SEED_OPERATOR_PASSWORD` dans `.env`
(avant le premier `npm run seed`), ou ensuite depuis la page **Utilisateurs** de l'admin.

## Lancement

```bash
npm run dev          # développement : http://localhost:3000
# ou
npm run build && npm start   # production
```

Autres commandes : `npm run lint`, `npm run typecheck`.

---

## Tester la phase 1

Les opérateurs déposent leurs **vrais** indicateurs mensuels (modèle CSV : **Mes imports → Télécharger le modèle**).

1. **Import valide** : se connecter avec `yas@operateur.mg` → **Mes imports** → déposer un CSV conforme.
   Résultat : statut **Reçu** (en attente d'approbation).
2. **Rapport d'erreurs** : un fichier non conforme est **Rejeté** avec le détail ligne par ligne
   (date, région, service, nombre, bornes, doublon, date future, virgule décimale…), téléchargeable en CSV.
3. **Renvoi du même fichier** : rejeté automatiquement (« fichier identique déjà envoyé »).
4. **Approbation** : se connecter avec `admin@artec.mg` → **Imports** → **Approuver**.
   Les données apparaissent dans **Indicateurs** (admin) et **Mes indicateurs** (opérateur).
5. **Refus** : côté admin, **Refuser** un import avec un motif.
   Le motif s'affiche chez l'opérateur, qui peut renvoyer le fichier.
6. **Doublons** : réimporter des mois déjà validés → chaque ligne est signalée comme déjà importée.
7. **Cloisonnement** : connecté en Orange, aucun import ni indicateur de Yas n'est visible
   (les URL directes renvoient 404). Un opérateur qui ouvre `/admin` est renvoyé vers son espace.
8. **Gestion des comptes** : désactiver un compte opérateur → il perd l'accès immédiatement,
   même avec une session ouverte.

---

## Tester la phase 2

1. Connecté en admin, ouvrir **Pipeline & données** (ou `Ctrl K` → « Pipeline »).
2. Les avis viennent du formulaire public et de la veille (**Veille sociale → Lancer la collecte**).
3. Cliquer **Lancer le pipeline** : les 7 étapes s'allument en direct ; cliquer une étape affiche son journal.
4. À la fin, **Explorer le dataset** : satisfaction par opérateur et par service, matrice de corrélation
   (survol), facteurs liés à la satisfaction, histogramme de chaque feature, aperçu filtrable et triable.
5. Exporter la version en **CSV** ou **JSON + scaler** (c'est ce fichier qui partira sur Kaggle en phase 3).
6. Approuver un nouvel import : le pipeline se relance tout seul et crée la version suivante.
   Relancer sans changement de données → « données identiques », aucune nouvelle version.

## Phase 3 : entraînement sur Kaggle

Pas de service Python : **Next.js parle directement à l'API REST de Kaggle** (`lib/kaggle/client.ts`).

1. Renseigner `KAGGLE_USERNAME` et `KAGGLE_API_TOKEN` dans `.env`, redémarrer `npm run dev`.
2. Admin → **Modèle IA** → « Entraîner sur Kaggle » (ou Ctrl K → « Entraîner le modèle »).
3. Suivi en direct : publication de `dataset.csv` + `meta.json` (dataset privé) → traitement Kaggle →
   exécution de `kaggle/train.py` (Keras/TensorFlow) → récupération de `metrics.json`, `preprocess.json`, `weights.json`.
4. Le modèle est stocké dans MongoDB (`models`) ; il est activé seulement s'il fait mieux (MAE) que le modèle en service.
   Retour arrière possible depuis l'historique.
5. **Simulateur** : le MLP s'exécute en TypeScript (`lib/ml/predict.ts`), dans le navigateur — prédiction instantanée,
   comparaison des opérateurs, courbe de sensibilité, scénarios automatiques.

La tâche d'entraînement est une machine à états en base (`training_jobs`) : chaque consultation de son statut
la fait avancer d'un cran, sous verrou. Un redémarrage du serveur ne perd rien.

## Ce que fait la phase 2

Le pipeline est écrit en TypeScript dans Next.js (`lib/pipeline/run.ts`) plutôt que dans le service Python
prévu : pas de service supplémentaire à lancer. Le service Python reste prévu pour TensorFlow (phases 3–4).

| Étape | Ce qu'elle fait |
|---|---|
| Extraction | indicateurs des imports approuvés + avis publiés |
| Nettoyage | doublons, bornes, valeurs sans objet vidées, valeurs manquantes imputées (médiane opérateur × service × mois) |
| Sentiment | lexique FR/MG (`lib/sentiment.ts`) : expressions, négations (`pas`, `tsy`), intensifs (`très`, `be`, `loatra`), nuances ; justesse mesurée contre l'étiquette de référence |
| Normalisation | noms de régions harmonisés, valeurs extrêmes plafonnées aux percentiles 1/99 par service |
| Features | 17 variables : réclamations ‰, log(abonnés), part de marché, écart au tarif du marché, indice qualité (percentiles), variations 1 mois, moyennes 3 mois, satisfaction M-1, saison cyclonique, saisonnalité |
| Fusion & cible | satisfaction = 75 % note moyenne + 25 % sentiment moyen (0–100), classes 65/45 ; les avis du mois ne sont jamais des features (pas de fuite) |
| Versionnage | empreinte SHA-256, version vN seulement si les données changent, statistiques, corrélations, scaler, score qualité ; imports passés à « Traité » |

- Déclenchement automatique après chaque approbation (en arrière-plan avec `after()`), ou manuel.
  Un seul passage à la fois ; s'il reste des imports à traiter à la fin, un nouveau passage démarre.
- Collections ajoutées : `feedbacks`, `pipeline_runs`, `dataset_versions`, `dataset_rows`
  (lignes conservées pour les 5 dernières versions).
- **Palette de commandes** `Ctrl K` / `⌘K` dans les deux espaces : navigation et actions (lancer le pipeline,
  exporter le dernier dataset, télécharger le modèle CSV…).

---

## Ce que fait la phase 1

### Rôles et sécurité

- **Admin** (autorité) : gère les comptes, approuve ou refuse les imports, consulte les indicateurs de tous les opérateurs.
- **Opérateur** (un seul compte par opérateur) : importe ses CSV, suit leur statut, consulte ses propres indicateurs.
- **Public** : pas de compte (formulaires publics en phase 5).

Contrôle d'accès :

- Session dans un cookie `httpOnly` (JWT signé HS256, valable 8 h). Mots de passe hachés avec bcrypt.
- `proxy.ts` redirige rapidement selon le rôle. **La vraie vérification** est faite à chaque appel API
  par `requireUser()` (`lib/auth/dal.ts`), qui relit le compte en base.
- Un opérateur ne voit jamais les données d'un autre : son identifiant d'opérateur vient de la session,
  jamais de la requête.
- Limite de 10 tentatives de connexion par IP et par quart d'heure. Les actions sensibles sont
  journalisées dans `audit_logs`.

### Import CSV

Format : voir `docs/PROPOSITION_ARCHITECTURE.md` (section « Schéma CSV »), ou le modèle téléchargeable
depuis l'espace opérateur.

Cycle de vie d'un import :

```
envoi ──► validation automatique ──► erreurs ? ──oui──► Rejeté
                                         │
                                        non
                                         ▼
                                      Reçu ──► admin refuse ──► Rejeté
                                         │
                                    admin approuve
                                         ▼
                                      Validé ──► (phase 2) pipeline ──► Traité
```

**Erreurs bloquantes :**
- colonnes manquantes, inconnues ou en double ;
- types invalides, valeurs hors bornes ;
- date pas au 1er du mois, ou dans le futur ;
- région ou service inconnu ;
- valeurs manquantes ;
- doublons dans le fichier, avec les données déjà validées, ou avec un autre import en attente ;
- fichier identique déjà envoyé ;
- encodage non UTF-8 ;
- taille supérieure à 5 Mo.

**Avertissements (non bloquants) :**
- valeur sans objet, par exemple un débit renseigné pour un SMS (la valeur est ignorée) ;
- valeur aberrante : isolée statistiquement (score z robuste sur le logarithme, médiane/MAD > 3,5)
  **et** au moins 3 fois plus grande ou plus petite que la médiane du service.

### Interface

- **Page publique** (`/`) : comparaison open data des 3 opérateurs (coupures, disponibilité, débit,
  latence ; la meilleure valeur est signalée) et évolution du taux de coupure national.
- **Espace autorité** (`/admin`) :
  - *Vue d'ensemble* : imports à approuver, couverture des données (opérateur × mois), état de la chaîne de traitement, tendance nationale ;
  - *Imports* : filtres par statut et opérateur, approbation et refus avec motif (boîtes de dialogue) ;
  - *Indicateurs* : comparaison des 3 opérateurs par service et par indicateur, plus une fiche détaillée par opérateur ;
  - *Utilisateurs* : création, désactivation, réinitialisation de mot de passe, suppression.
- **Espace opérateur** (`/operateur`) :
  - indicateurs du dernier mois avec variation mensuelle, évolution par service, classement des régions ;
  - envoi des CSV par glisser-déposer, avec retour immédiat de la validation.
- **Détail d'un import** : parcours (reçu → validation → décision → traitement) et rapport d'anomalies filtrable par colonne.
- Interface **responsive** (menu latéral sur ordinateur, tiroir sur mobile), notifications, états de chargement et page 404.

**Graphiques** (Recharts) :
- chaque opérateur a une couleur fixe (Yas bleu, Orange orange, Airtel aqua), validée pour les daltonismes ;
- chaque graphique a une infobulle et un bouton « Tableau » qui affiche les mêmes valeurs en clair.

### Sources de données (réelles)

- **Indicateurs** : imports CSV des opérateurs, validés automatiquement puis approuvés par l'autorité.
- **Avis** : formulaire public « Donner mon avis » (anonyme, limité à 5 par heure et par IP).
- **Veille** (`lib/scraping/`) : avis App Store des applis officielles (flux RSS d'Apple, sans clé),
  presse en ligne (flux RSS Google Actualités, filtre anti-homonymes), commentaires YouTube
  (`YOUTUBE_API_KEY`), page Facebook officielle (`FACEBOOK_PAGE_ID_*` / `TOKEN_*`), X (`X_BEARER_TOKEN`).
  Aucune simulation : une source sans accès officiel est simplement désactivée.
- **Cible du modèle** : satisfaction = 75 % note + 25 % sentiment des avis réels rattachés à une ligne
  d'indicateurs (opérateur × mois × région × service) ; les publications de la veille qui citent une
  région et un service (réseau → voix, internet → data, mobile money) comptent aussi.

---

## Structure du code

```
app/
  api/                  routes API (auth, admin, imports, indicateurs)
  admin/                espace autorité (vue d'ensemble, imports, indicateurs, utilisateurs)
  operateur/            espace opérateur (indicateurs, imports)
  login/                connexion
  page.tsx              page publique
components/             interface (tableaux, formulaires, cadre des espaces)
lib/
  auth/                 jeton de session (token.ts) et contrôle d'accès (dal.ts)
  csv/validate.ts       validation des CSV (fonction pure)
  imports.ts            envoi, approbation, refus, détection des doublons
  constants.ts          opérateurs, 23 régions, services, colonnes CSV
models/                 schémas MongoDB (Mongoose)
proxy.ts                redirections selon le rôle
scripts/seed.mjs        initialisation de la base
data/backup/            sauvegarde de l'ancienne base synthétique (EJSON)
docs/                   architecture
```

### Notes techniques (Next.js 16)

- `middleware.ts` s'appelle désormais `proxy.ts`.
- `cacheComponents` est activé : les composants qui lisent la session sont placés sous `<Suspense>`,
  et les routes API appellent `connection()` pour toujours s'exécuter à la requête.
# regulation_tco
