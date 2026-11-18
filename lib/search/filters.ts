import { z } from "zod";
import { SEGMENTOS, TIPOS_OPERACION, type SegmentoKey, type TipoOperacionKey } from "@/lib/catalogos";

export const ORDENES = {
  recientes: "Más recientes",
  precio_asc: "Precio: menor a mayor",
  precio_desc: "Precio: mayor a menor",
  cap_desc: "Mayor cap rate",
} as const;
export type Orden = keyof typeof ORDENES;
export const POR_PAGINA = 20;

export interface Filtros {
  estado?: string;            // clave INEGI 2 dígitos
  municipio?: string;         // clave INEGI 3 dígitos (requiere estado)
  segmento: SegmentoKey[];
  operacion: TipoOperacionKey[];
  precio_min?: number;        // MXN
  precio_max?: number;
  cap_min?: number;           // en porcentaje: 8 = 8%
  m2_min?: number;
  m2_max?: number;
  ocup_min?: number;          // porcentaje
  solo_renta: boolean;
  orden: Orden;
  pagina: number;
}

/** Entrada cruda: query string de Next, URLSearchParams o JSON guardado en saved_searches. */
export type Crudo = URLSearchParams | Record<string, unknown>;

const get = (c: Crudo, k: string): unknown => (c instanceof URLSearchParams ? c.get(k) ?? undefined : c[k]);
const primero = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const vacio = (v: unknown) => v === undefined || v === null || v === "";

function numero(v: unknown, max = Number.MAX_SAFE_INTEGER): number | undefined {
  v = primero(v);
  if (vacio(v)) return undefined;
  const r = z.coerce.number().finite().min(0).max(max).safeParse(v);
  return r.success ? r.data : undefined;
}
function lista<T extends string>(v: unknown, validos: Record<string, string>): T[] {
  const items = Array.isArray(v) ? v.flatMap((x) => String(x).split(",")) : typeof v === "string" ? v.split(",") : [];
  return [...new Set(items.map((s) => s.trim()).filter((s) => s in validos))] as T[];
}

/** Normaliza cualquier entrada: valores inválidos se descartan (nunca rompen la página). */
export function parseFiltros(c: Crudo): Filtros {
  const estado = z.string().regex(/^\d{2}$/).safeParse(primero(get(c, "estado")));
  const muni = z.string().regex(/^\d{3}$/).safeParse(primero(get(c, "municipio")));
  const orden = primero(get(c, "orden"));
  let precio_min = numero(get(c, "precio_min"));
  let precio_max = numero(get(c, "precio_max"));
  if (precio_min !== undefined && precio_max !== undefined && precio_min > precio_max) [precio_min, precio_max] = [precio_max, precio_min];
  let m2_min = numero(get(c, "m2_min"));
  let m2_max = numero(get(c, "m2_max"));
  if (m2_min !== undefined && m2_max !== undefined && m2_min > m2_max) [m2_min, m2_max] = [m2_max, m2_min];
  const renta = primero(get(c, "renta"));
  const pagina = Math.floor(numero(get(c, "pagina"), 1000) ?? 1);
  return {
    estado: estado.success ? estado.data : undefined,
    municipio: estado.success && muni.success ? muni.data : undefined,
    segmento: lista<SegmentoKey>(get(c, "segmento"), SEGMENTOS),
    operacion: lista<TipoOperacionKey>(get(c, "operacion"), TIPOS_OPERACION),
    precio_min, precio_max,
    cap_min: numero(get(c, "cap_min"), 100),
    m2_min, m2_max,
    ocup_min: numero(get(c, "ocup_min"), 100),
    solo_renta: renta === "1" || renta === "true" || renta === true,
    orden: typeof orden === "string" && orden in ORDENES ? (orden as Orden) : "recientes",
    pagina: pagina < 1 ? 1 : pagina,
  };
}

/** Filtros -> query string estable y mínima (omite defaults). */
export function filtrosToParams(f: Filtros): URLSearchParams {
  const p = new URLSearchParams();
  if (f.estado) p.set("estado", f.estado);
  if (f.estado && f.municipio) p.set("municipio", f.municipio);
  if (f.segmento.length) p.set("segmento", f.segmento.join(","));
  if (f.operacion.length) p.set("operacion", f.operacion.join(","));
  for (const k of ["precio_min", "precio_max", "cap_min", "m2_min", "m2_max", "ocup_min"] as const) {
    if (f[k] !== undefined) p.set(k, String(f[k]));
  }
  if (f.solo_renta) p.set("renta", "1");
  if (f.orden !== "recientes") p.set("orden", f.orden);
  if (f.pagina > 1) p.set("pagina", String(f.pagina));
  return p;
}

/** JSON para saved_searches.filtros (sin orden ni paginación). Se vuelve a leer con parseFiltros. */
export function filtrosToJson(f: Filtros): Record<string, unknown> {
  const p = filtrosToParams({ ...f, orden: "recientes", pagina: 1 });
  const out: Record<string, unknown> = {};
  p.forEach((v, k) => { out[k] = ["segmento", "operacion"].includes(k) ? v.split(",") : ["estado", "municipio"].includes(k) ? v : k === "renta" ? true : Number(v); });
  return out;
}

export function tieneFiltros(f: Filtros): boolean {
  return Boolean(f.estado || f.segmento.length || f.operacion.length || f.solo_renta ||
    f.precio_min !== undefined || f.precio_max !== undefined || f.cap_min !== undefined ||
    f.m2_min !== undefined || f.m2_max !== undefined || f.ocup_min !== undefined);
}
