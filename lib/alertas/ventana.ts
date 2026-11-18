export type Frecuencia = "diaria" | "semanal";
const H = 3_600_000;
/** Periodo mínimo entre correos, con 2 h de tolerancia para el desfase del cron (p. ej. Vercel Hobby). */
export const PERIODO_MS: Record<Frecuencia, number> = { diaria: 24 * H - 2 * H, semanal: 7 * 24 * H - 2 * H };

export interface BusquedaVentana { frecuencia: Frecuencia; last_sent_at: string | null; created_at: string }

/** Inicio de la ventana de deals "nuevos": desde el último envío o, si nunca se envió, desde que se creó la búsqueda. */
export const desde = (b: BusquedaVentana): string => b.last_sent_at ?? b.created_at;

/**
 * Una búsqueda toca correo si ya pasó su periodo desde el inicio de su ventana. Solo se envía si además hay
 * coincidencias; si no las hay, nada se actualiza y la ventana sigue creciendo (no se pierde ningún deal).
 */
export function esElegible(b: BusquedaVentana, ahora: Date): boolean {
  return ahora.getTime() - new Date(desde(b)).getTime() >= PERIODO_MS[b.frecuencia];
}
