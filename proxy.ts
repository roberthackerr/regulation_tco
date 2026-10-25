import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, homeForRole, verifySession } from "@/lib/auth/token";

/**
 * Redirections rapides selon le rôle (vérification « optimiste » du jeton).
 * Ce n'est PAS la protection principale : chaque route API et chaque espace
 * revérifient l'utilisateur en base (lib/auth/dal.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  // Déjà connecté : la page de connexion renvoie vers l'espace du rôle.
  if (pathname === "/login") {
    return session
      ? NextResponse.redirect(new URL(homeForRole(session.role), request.url))
      : NextResponse.next();
  }

  // Espaces protégés : connexion obligatoire.
  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  // Mauvais rôle pour cet espace : retour à son propre espace.
  const area = pathname.startsWith("/admin") ? "admin" : "operator";
  if (session.role !== area) {
    return NextResponse.redirect(new URL(homeForRole(session.role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/admin/:path*", "/operateur/:path*"],
};
