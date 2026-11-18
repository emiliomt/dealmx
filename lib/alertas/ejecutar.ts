import type { Filtros } from "@/lib/search/filters";
import { filtrosToParams, parseFiltros, tieneFiltros } from "@/lib/search/filters";
import { describirFiltros } from "@/lib/search/describir";
import { desde, esElegible, type Frecuencia } from "./ventana";
import { firmarBaja } from "./token";
import { renderAlerta, type DealAlerta, type SeccionAlerta } from "@/lib/email/alertas";
import type { Enviador } from "@/lib/email/enviar";

export interface BusquedaGuardadaDB { id: string; user_id: string; nombre: string; filtros: unknown; frecuencia: Frecuencia; last_sent_at: string | null; created_at: string }
export interface Destinatario { email: string; nombre: string }

/** Acceso a datos inyectable: en producción Supabase (service role); en pruebas, un doble en memoria. */
export interface Repo {
  busquedasActivas(limite: number): Promise<BusquedaGuardadaDB[]>;
  dealsNuevos(f: Filtros, desdeISO: string, limite: number): Promise<{ deals: DealAlerta[]; total: number }>;
  destinatario(userId: string): Promise<Destinatario | null>;   // null = sin correo confirmado
  marcarEnviado(busquedaIds: string[], cuando: string): Promise<void>;
}

export interface Opciones {
  repo: Repo; enviar: Enviador | null; ahora: Date; siteUrl: string; secreto: string;
  dryRun?: boolean; maxBusquedas?: number; maxDealsPorSeccion?: number;
}
export interface Resumen {
  busquedasRevisadas: number; elegibles: number; conCoincidencias: number; correosEnviados: number; correosFallidos: number;
  sinCorreoConfirmado: number; sinFiltros: number; dryRun: boolean; truncado: boolean; errores: string[];
}

/**
 * Cruza deals nuevos con búsquedas guardadas y envía UN correo resumen por usuario.
 * - Ventana: desde last_sent_at (o created_at si nunca se envió) hasta `ahora`.
 * - last_sent_at se fija en `ahora` (inicio de la corrida) y SOLO tras un envío exitoso, y solo en las búsquedas
 *   incluidas en el correo; así un deal publicado durante la corrida no se pierde.
 * - En dry-run no se envía ni se modifica nada.
 */
export async function ejecutarAlertas(o: Opciones): Promise<Resumen> {
  const max = o.maxBusquedas ?? 500;
  const limiteSeccion = o.maxDealsPorSeccion ?? 10;
  const r: Resumen = { busquedasRevisadas: 0, elegibles: 0, conCoincidencias: 0, correosEnviados: 0, correosFallidos: 0, sinCorreoConfirmado: 0, sinFiltros: 0, dryRun: !!o.dryRun, truncado: false, errores: [] };
  if (!o.dryRun && !o.enviar) throw new Error("Sin enviador: configura Resend o usa dry-run");

  const todas = await o.repo.busquedasActivas(max + 1);
  r.truncado = todas.length > max;
  const busquedas = todas.slice(0, max);
  r.busquedasRevisadas = busquedas.length;
  const elegibles = busquedas.filter((b) => esElegible(b, o.ahora));
  r.elegibles = elegibles.length;

  // Agrupa por usuario (un correo por usuario)
  const porUsuario = new Map<string, { b: BusquedaGuardadaDB; f: Filtros; sec: SeccionAlerta }[]>();
  for (const b of elegibles) {
    try {
      const f = parseFiltros((b.filtros ?? {}) as Record<string, unknown>);
      // Filtros vacíos o corruptos coincidirían con TODO: nunca se envía spam; se omite y se reporta.
      if (!tieneFiltros(f)) { r.sinFiltros++; continue; }
      const { deals, total } = await o.repo.dealsNuevos(f, desde(b), limiteSeccion);
      if (total === 0 || deals.length === 0) continue;
      r.conCoincidencias++;
      const qs = filtrosToParams(f).toString();
      const sec: SeccionAlerta = {
        nombre: b.nombre, resumen: describirFiltros(f), deals, totalCoincidencias: total,
        urlBusqueda: `${o.siteUrl}/buscar${qs ? `?${qs}` : ""}`,
        urlBaja: `${o.siteUrl}/api/alertas/baja?t=${firmarBaja({ k: "s", id: b.id }, o.secreto)}`,
      };
      (porUsuario.get(b.user_id) ?? porUsuario.set(b.user_id, []).get(b.user_id)!).push({ b, f, sec });
    } catch (e) {
      r.errores.push(`búsqueda ${b.id}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  for (const [userId, items] of porUsuario) {
    try {
      const dest = await o.repo.destinatario(userId);
      if (!dest) { r.sinCorreoConfirmado++; continue; }
      if (o.dryRun) continue;
      const urlBajaTotal = `${o.siteUrl}/api/alertas/baja?t=${firmarBaja({ k: "u", id: userId }, o.secreto)}`;
      const { subject, html, text } = renderAlerta({ nombre: dest.nombre, secciones: items.map((i) => i.sec), siteUrl: o.siteUrl, urlBajaTotal, urlPanel: `${o.siteUrl}/dashboard/inversionista` });
      const res = await o.enviar!({
        to: dest.email, subject, html, text,
        headers: { "List-Unsubscribe": `<${urlBajaTotal}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        idempotencyKey: `alertas-${userId}-${o.ahora.toISOString().slice(0, 10)}-${items.map((i) => i.b.id).sort().join("").slice(0, 40)}`,
      });
      if (!res.ok) { r.correosFallidos++; r.errores.push(`usuario ${userId}: ${res.error}`); continue; }
      r.correosEnviados++;
      try { await o.repo.marcarEnviado(items.map((i) => i.b.id), o.ahora.toISOString()); }
      catch (e) { r.errores.push(`marcarEnviado ${userId}: ${e instanceof Error ? e.message : "error"} (el correo SÍ salió; la clave de idempotencia evita duplicados ese día)`); }
    } catch (e) {
      r.correosFallidos++;
      r.errores.push(`usuario ${userId}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return r;
}
