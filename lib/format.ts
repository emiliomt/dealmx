export type Moneda = "MXN" | "USD";

/** "$12,500,000 MXN" (es-MX). Con USD convierte con el tipo de cambio dado. */
export function formatMoney(valorMxn: number | null | undefined, moneda: Moneda = "MXN", fx?: number | null): string {
  if (valorMxn == null || Number.isNaN(valorMxn)) return "—";
  const usd = moneda === "USD" && fx;
  const v = usd ? valorMxn / (fx as number) : valorMxn;
  const n = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(Math.round(v));
  return `$${n} ${usd ? "USD" : "MXN"}`;
}

/** Abreviatura en millones de pesos: "$12.5 mdp". Bajo 1 millón usa formato completo. */
export function formatMdp(valorMxn: number | null | undefined): string {
  if (valorMxn == null || Number.isNaN(valorMxn)) return "—";
  if (Math.abs(valorMxn) < 1_000_000) return formatMoney(valorMxn);
  const mdp = valorMxn / 1_000_000;
  const s = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(mdp);
  return `$${s} mdp`;
}

export function formatM2(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(v)} m²`;
}

/** Fracción -> porcentaje: 0.0875 -> "8.75%" */
export function formatPct(fraccion: number | null | undefined, decimales = 2): string {
  if (fraccion == null || Number.isNaN(fraccion)) return "—";
  return `${(fraccion * 100).toFixed(decimales)}%`;
}
