/**
 * Initialise la base : les 3 opérateurs, un compte admin et un compte par opérateur.
 * Idempotent : peut être relancé sans créer de doublons (les mots de passe
 * existants ne sont pas modifiés).
 *
 * Usage : npm run seed
 * Mots de passe modifiables via SEED_ADMIN_PASSWORD et SEED_OPERATOR_PASSWORD.
 */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const uri = process.env.MONGO_URI ?? process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGO_URI manquant. Renseignez-le dans .env.");
  process.exit(1);
}

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin2026!";
const OPERATOR_PASSWORD = process.env.SEED_OPERATOR_PASSWORD ?? "Operateur2026!";

const OPERATORS = [
  { code: "YAS", nom: "Yas (ex-Telma)", email: "yas@operateur.mg" },
  { code: "ORANGE", nom: "Orange Madagascar", email: "orange@operateur.mg" },
  { code: "AIRTEL", nom: "Airtel Madagascar", email: "airtel@operateur.mg" },
];

await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
const db = mongoose.connection.db;
const operators = db.collection("operators");
const users = db.collection("users");
const now = new Date();

// Index uniques (aussi créés par Mongoose au démarrage de l'app, mais on les garantit ici).
await operators.createIndex({ code: 1 }, { unique: true });
await users.createIndex({ email: 1 }, { unique: true });
await users.createIndex({ operatorId: 1 }, { unique: true, partialFilterExpression: { role: "operator" } });

async function ensureUser({ email, nom, role, operatorId, password }) {
  const existing = await users.findOne({ email });
  if (existing) {
    console.log(`  = ${email} existe déjà`);
    return;
  }
  await users.insertOne({
    email,
    nom,
    role,
    operatorId,
    passwordHash: await bcrypt.hash(password, 10),
    actif: true,
    lastLogin: null,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`  + ${email} (mot de passe : ${password})`);
}

console.log("Opérateurs :");
for (const op of OPERATORS) {
  await operators.updateOne(
    { code: op.code },
    { $setOnInsert: { code: op.code, nom: op.nom, actif: true, createdAt: now, updatedAt: now } },
    { upsert: true },
  );
  console.log(`  ✓ ${op.code}`);
}

console.log("Comptes :");
await ensureUser({ email: "admin@artec.mg", nom: "Administrateur ARTEC", role: "admin", operatorId: null, password: ADMIN_PASSWORD });
for (const op of OPERATORS) {
  const doc = await operators.findOne({ code: op.code });
  await ensureUser({ email: op.email, nom: `Compte ${op.nom}`, role: "operator", operatorId: doc._id, password: OPERATOR_PASSWORD });
}

await mongoose.disconnect();
console.log("Terminé.");
