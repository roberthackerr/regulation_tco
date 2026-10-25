import Link from "next/link";

/** Logo : trois barres de signal dans un carré bleu nuit. */
export function BrandMark({ size = 32, tone = "dark" }: { size?: number; tone?: "dark" | "light" }) {
  // "light" : carré blanc et barres bleu nuit, pour les fonds sombres.
  const bg = tone === "dark" ? "#13294b" : "#ffffff";
  const fg = tone === "dark" ? "#ffffff" : "#13294b";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" fill={bg} />
      <rect x="8" y="18" width="4" height="6" rx="1.5" fill={fg} opacity="0.55" />
      <rect x="14" y="13" width="4" height="11" rx="1.5" fill={fg} opacity="0.8" />
      <rect x="20" y="8" width="4" height="16" rx="1.5" fill={fg} />
    </svg>
  );
}

export function Brand({ href = "/", subtitle = "Régulation · Madagascar" }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg">
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight text-ink">Observatoire Télécoms</span>
        <span className="block text-[11px] text-muted">{subtitle}</span>
      </span>
    </Link>
  );
}
