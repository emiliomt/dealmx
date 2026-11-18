import type { SupabaseClient } from "@supabase/supabase-js";

/** Nombres de estado/municipio INEGI para un conjunto de deals (2 consultas, sin N+1). */
export async function cargarNombres(sb: SupabaseClient, deals: { estado_clave: string; municipio_clave: string }[]) {
  const estados = [...new Set(deals.map((d) => d.estado_clave))];
  const munis = [...new Set(deals.map((d) => d.municipio_clave))];
  if (!estados.length) return { estado: () => undefined as string | undefined, municipio: () => undefined as string | undefined };
  const [{ data: e }, { data: m }] = await Promise.all([
    sb.from("inegi_estados").select("clave,nombre").in("clave", estados),
    sb.from("inegi_municipios").select("estado_clave,clave,nombre").in("estado_clave", estados).in("clave", munis),
  ]);
  return {
    estado: (c: string) => e?.find((x) => x.clave === c)?.nombre as string | undefined,
    municipio: (ec: string, c: string) => m?.find((x) => x.estado_clave === ec && x.clave === c)?.nombre as string | undefined,
  } as { estado: (c: string) => string | undefined; municipio: (ec: string, c: string) => string | undefined };
}
