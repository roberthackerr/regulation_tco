import "server-only";
import mongoose from "mongoose";

/**
 * Connexion MongoDB unique, réutilisée entre les requêtes.
 * En développement, le rechargement à chaud recrée les modules : on garde
 * donc la connexion sur `globalThis` pour ne pas en ouvrir une par rechargement.
 */
const globalForMongo = globalThis as unknown as {
  mongoosePromise?: Promise<typeof mongoose>;
};

export async function connectDb(): Promise<typeof mongoose> {
  const uri = process.env.MONGO_URI ?? process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Variable d'environnement MONGO_URI manquante (voir .env.example).");
  }
  if (!globalForMongo.mongoosePromise) {
    globalForMongo.mongoosePromise = mongoose.connect(uri, {
      // Tolère les coupures réseau passagères vers Atlas avant d'abandonner une requête.
      serverSelectionTimeoutMS: 20_000,
      // Requêtes mises en attente pendant une reconnexion (au lieu d'échouer tout de suite).
      bufferTimeoutMS: 20_000,
    } as mongoose.ConnectOptions);
    // Si la connexion échoue, on oublie la promesse pour réessayer au prochain appel.
    globalForMongo.mongoosePromise.catch(() => {
      globalForMongo.mongoosePromise = undefined;
    });
  }
  return globalForMongo.mongoosePromise;
}
