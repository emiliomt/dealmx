export const SEGMENTOS = { industrial: "Industrial", comercial: "Comercial", oficinas: "Oficinas", multifamiliar: "Multifamiliar", hotelero: "Hotelero", terreno: "Terreno", mixto: "Mixto" } as const;
export const TIPOS_OPERACION = { venta: "Venta", busca_socio_capital: "Busca socio capitalista", remate: "Remate", negocio_con_inmueble: "Negocio con inmueble" } as const;
export const REGIMENES = { escritura: "Escritura", ejido: "Ejido", fideicomiso: "Fideicomiso", condominio: "Condominio" } as const;
export const ESTATUS = { borrador: "Borrador", en_revision: "En revisión", publicado: "Publicado", en_negociacion: "En negociación", cerrado: "Cerrado" } as const;
export type SegmentoKey = keyof typeof SEGMENTOS;
export type TipoOperacionKey = keyof typeof TIPOS_OPERACION;
export type RegimenKey = keyof typeof REGIMENES;

export function fotoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/deal-photos/${path}`;
}
