export const ETAPAS = ["visto", "nda", "oferta", "due_diligence", "cierre", "descartado"] as const;
export type Etapa = (typeof ETAPAS)[number];
export const ETAPA_LABEL: Record<Etapa, string> = {
  visto: "Visto", nda: "NDA", oferta: "Oferta", due_diligence: "Due diligence", cierre: "Cierre", descartado: "Descartado",
};
export const esEtapa = (x: unknown): x is Etapa => typeof x === "string" && (ETAPAS as readonly string[]).includes(x);

/** Devuelve una lista nueva con el item movido; la misma referencia si no hay cambio. */
export function mover<T extends { id: string; etapa: Etapa }>(items: T[], id: string, etapa: Etapa): T[] {
  const i = items.find((x) => x.id === id);
  if (!i || i.etapa === etapa) return items;
  return items.map((x) => (x.id === id ? { ...x, etapa } : x));
}

export function agrupar<T extends { etapa: Etapa }>(items: T[]): Record<Etapa, T[]> {
  const out = Object.fromEntries(ETAPAS.map((e) => [e, [] as T[]])) as Record<Etapa, T[]>;
  for (const it of items) if (esEtapa(it.etapa)) out[it.etapa].push(it);
  return out;
}
