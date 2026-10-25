import { z } from "zod";

/** Règles de mot de passe communes (création et réinitialisation de compte). */
export const PasswordSchema = z
  .string()
  .min(8, { error: "Le mot de passe doit contenir au moins 8 caractères." })
  .max(200)
  .regex(/[a-zA-Z]/, { error: "Le mot de passe doit contenir au moins une lettre." })
  .regex(/[0-9]/, { error: "Le mot de passe doit contenir au moins un chiffre." });
