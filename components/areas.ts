/** Espaces connectés et leurs libellés (module partagé serveur/client). */
export type Area = "admin" | "operator";

export const AREA_TITLES: Record<Area, string> = {
  admin: "Autorité de régulation",
  operator: "Espace opérateur",
};
