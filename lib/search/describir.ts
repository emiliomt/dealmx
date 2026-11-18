import type { Filtros } from "./filters";
import { SEGMENTOS, TIPOS_OPERACION } from "@/lib/catalogos";
import { formatMdp } from "@/lib/format";

/** Resumen legible de una búsqueda guardada (dashboard y, más adelante, correos de alerta). */
export function describirFiltros(f: Filtros, n: { estado?: string; municipio?: string } = {}): string {
  const p: string[] = [];
  if (f.estado) p.push(f.municipio && n.municipio ? `${n.municipio}, ${n.estado ?? ""}`.replace(/, $/, "") : (n.estado ?? `Estado ${f.estado}`));
  if (f.segmento.length) p.push(f.segmento.map((s) => SEGMENTOS[s]).join(" / "));
  if (f.operacion.length) p.push(f.operacion.map((o) => TIPOS_OPERACION[o]).join(" / "));
  if (f.precio_min !== undefined && f.precio_max !== undefined) p.push(`${formatMdp(f.precio_min)} a ${formatMdp(f.precio_max)}`);
  else if (f.precio_min !== undefined) p.push(`desde ${formatMdp(f.precio_min)}`);
  else if (f.precio_max !== undefined) p.push(`hasta ${formatMdp(f.precio_max)}`);
  if (f.cap_min !== undefined) p.push(`cap rate ≥ ${f.cap_min}%`);
  if (f.m2_min !== undefined && f.m2_max !== undefined) p.push(`${f.m2_min}–${f.m2_max} m²`);
  else if (f.m2_min !== undefined) p.push(`≥ ${f.m2_min} m²`);
  else if (f.m2_max !== undefined) p.push(`≤ ${f.m2_max} m²`);
  if (f.ocup_min !== undefined) p.push(`ocupación ≥ ${f.ocup_min}%`);
  if (f.solo_renta) p.push("solo con renta");
  return p.length ? p.join(" · ") : "Todos los deals";
}
