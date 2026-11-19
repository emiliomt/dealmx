import type { SupabaseClient } from "@supabase/supabase-js";
import { aplicarFiltros, aplicarOrden } from "@/lib/search/query";
import { cargarNombres } from "@/lib/search/nombres";
import type { Repo } from "./ejecutar";
import type { DealAlerta } from "@/lib/email/alertas";

/** Solo columnas del teaser público. El cron usa service role (sin RLS), así que se elige explícitamente qué se lee. */
export const COLUMNAS_ALERTA = "id,titulo,segmento,tipo_operacion,estado_clave,municipio_clave,precio,cap_rate,m2_construccion,m2_terreno,monto_capital_buscado,es_ejemplo,published_at";
const num = (x: unknown) => (x == null ? null : Number(x));

export function repoSupabase(sb: SupabaseClient): Repo {
  return {
    async busquedasActivas(limite) {
      const { data, error } = await sb.from("saved_searches").select("id,user_id,nombre,filtros,frecuencia,last_sent_at,created_at")
        .eq("activa", true).order("last_sent_at", { ascending: true, nullsFirst: true }).limit(limite);
      if (error) throw new Error(`saved_searches: ${error.message}`);
      return data ?? [];
    },
    async dealsNuevos(f, desdeISO, limite) {
      const q = aplicarFiltros(sb.from("deals").select(COLUMNAS_ALERTA, { count: "exact" }), f).gt("published_at", desdeISO);
      const { data, count, error } = await aplicarOrden(q, "recientes").limit(limite);
      if (error) throw new Error(`deals: ${error.message}`);
      const filas = data ?? [];
      const nombres = await cargarNombres(sb, filas);
      const deals: DealAlerta[] = filas.map((d) => ({
        id: d.id, titulo: d.titulo, segmento: d.segmento, tipo_operacion: d.tipo_operacion,
        estado_nombre: nombres.estado(d.estado_clave), municipio_nombre: nombres.municipio(d.estado_clave, d.municipio_clave),
        precio: num(d.precio), cap_rate: num(d.cap_rate), m2_construccion: num(d.m2_construccion), m2_terreno: num(d.m2_terreno),
        monto_capital_buscado: num(d.monto_capital_buscado), es_ejemplo: !!d.es_ejemplo,
      }));
      return { deals, total: count ?? deals.length };
    },
    async destinatario(userId) {
      const { data, error } = await sb.auth.admin.getUserById(userId);
      const u = data?.user;
      // Solo correos confirmados: evita que alguien registre un correo ajeno y lo llene de alertas.
      if (error || !u?.email || !u.email_confirmed_at) return null;
      const { data: p } = await sb.from("profiles").select("nombre").eq("id", userId).maybeSingle();
      return { email: u.email, nombre: p?.nombre ?? "" };
    },
    async marcarEnviado(ids, cuando) {
      if (!ids.length) return;
      const { error } = await sb.from("saved_searches").update({ last_sent_at: cuando }).in("id", ids);
      if (error) throw new Error(`last_sent_at: ${error.message}`);
    },
  };
}
