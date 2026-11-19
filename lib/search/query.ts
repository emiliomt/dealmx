import type { Filtros, Orden } from "./filters";

export const ESTATUS_BUSCABLES = ["publicado", "en_negociacion"] as const;
export const COLUMNAS_LISTA =
  "id,titulo,segmento,tipo_operacion,estado_clave,municipio_clave,precio,cap_rate,m2_construccion,m2_terreno,monto_capital_buscado,es_ejemplo,published_at,deal_photos(path,orden)";
export const COLUMNAS_MAPA = "id,titulo,segmento,precio,cap_rate,lat_aprox,lng_aprox";

// El builder de PostgREST encadena con `this`; se tipa laxo para servir a la búsqueda y a las alertas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

/** Aplica estatus buscables + filtros. La visibilidad real la sigue decidiendo RLS. */
export function aplicarFiltros<T extends Q>(q: T, f: Filtros): T {
  let r: Q = (q as Q).in("status", [...ESTATUS_BUSCABLES]);
  if (f.estado) r = r.eq("estado_clave", f.estado);
  if (f.estado && f.municipio) r = r.eq("municipio_clave", f.municipio);
  if (f.segmento.length) r = r.in("segmento", f.segmento);
  if (f.operacion.length) r = r.in("tipo_operacion", f.operacion);
  if (f.precio_min !== undefined) r = r.gte("precio", f.precio_min);
  if (f.precio_max !== undefined) r = r.lte("precio", f.precio_max);
  if (f.cap_min !== undefined) r = r.gte("cap_rate", f.cap_min / 100);
  if (f.m2_min !== undefined) r = r.gte("m2_ref", f.m2_min);
  if (f.m2_max !== undefined) r = r.lte("m2_ref", f.m2_max);
  if (f.ocup_min !== undefined) r = r.gte("ocupacion_pct", f.ocup_min);
  if (f.solo_renta) r = r.gt("renta_mensual_actual", 0);
  return r;
}

export function aplicarOrden<T extends Q>(q: T, orden: Orden): T {
  const o: Q = q;
  switch (orden) {
    case "precio_asc": return o.order("precio", { ascending: true, nullsFirst: false }).order("id");
    case "precio_desc": return o.order("precio", { ascending: false, nullsFirst: false }).order("id");
    case "cap_desc": return o.order("cap_rate", { ascending: false, nullsFirst: false }).order("id");
    default: return o.order("published_at", { ascending: false, nullsFirst: false }).order("id");
  }
}
