import { AVISO_LEGAL } from "@/components/layout/legal-banner";
import { SEGMENTOS, TIPOS_OPERACION, type SegmentoKey, type TipoOperacionKey } from "@/lib/catalogos";
import { formatM2, formatMdp, formatMoney, formatPct } from "@/lib/format";

export interface DealAlerta {
  id: string; titulo: string; segmento: SegmentoKey; tipo_operacion: TipoOperacionKey;
  estado_nombre?: string; municipio_nombre?: string;
  precio: number | null; cap_rate: number | null; m2_construccion: number | null; m2_terreno: number | null;
  monto_capital_buscado: number | null; es_ejemplo: boolean;
}
export interface SeccionAlerta {
  nombre: string; resumen: string; deals: DealAlerta[]; totalCoincidencias: number;
  urlBusqueda: string; urlBaja: string;
}
export interface EntradaAlerta { nombre: string; secciones: SeccionAlerta[]; siteUrl: string; urlBajaTotal: string; urlPanel: string }

/** Escapa texto de usuarios (títulos de vendedores, nombres) antes de ponerlo en HTML. */
export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const MAX_POR_SECCION = 10;

function lineaPrecio(d: DealAlerta): string {
  if (d.precio != null) return formatMoney(d.precio);
  if (d.monto_capital_buscado != null) return `Busca ${formatMdp(d.monto_capital_buscado)}`;
  return "Precio no indicado";
}

/**
 * Correo resumen. Usa SOLO campos del teaser público elegidos explícitamente: aunque el objeto traiga
 * más propiedades (dirección, descripción completa…) nunca se renderizan.
 */
export function renderAlerta(e: EntradaAlerta): { subject: string; html: string; text: string } {
  const total = e.secciones.reduce((a, s) => a + s.totalCoincidencias, 0);
  const subject = `DealMX: ${total} oportunidad${total === 1 ? "" : "es"} nueva${total === 1 ? "" : "s"} para tus búsquedas`;

  const htmlSecciones = e.secciones.map((s) => {
    const mostrados = s.deals.slice(0, MAX_POR_SECCION);
    const items = mostrados.map((d) => {
      const lugar = [d.municipio_nombre, d.estado_nombre].filter(Boolean).join(", ");
      const meta = [SEGMENTOS[d.segmento], TIPOS_OPERACION[d.tipo_operacion], lugar, formatM2(d.m2_construccion ?? d.m2_terreno), d.cap_rate != null ? `Cap rate ${formatPct(d.cap_rate)}` : ""].filter((x) => x && x !== "—");
      return `<li style="margin:0 0 14px"><a href="${esc(`${e.siteUrl}/deal/${d.id}`)}" style="font-weight:600;color:#1d4ed8">${esc(d.titulo)}</a>${d.es_ejemplo ? ' <span style="background:#fef3c7;color:#78350f;padding:1px 6px;border-radius:4px;font-size:11px">EJEMPLO FICTICIO</span>' : ""}<br><span style="font-size:15px">${esc(lineaPrecio(d))}</span><br><span style="color:#555;font-size:13px">${esc(meta.join(" · "))}</span></li>`;
    }).join("");
    const mas = s.totalCoincidencias > mostrados.length ? `<p style="margin:0 0 8px"><a href="${esc(s.urlBusqueda)}">Ver las ${s.totalCoincidencias} coincidencias</a></p>` : "";
    return `<h2 style="font-size:16px;margin:24px 0 4px">${esc(s.nombre)}</h2><p style="margin:0 0 12px;color:#555;font-size:13px">${esc(s.resumen)}</p><ul style="padding-left:18px;margin:0">${items}</ul>${mas}<p style="margin:0;font-size:12px"><a href="${esc(s.urlBaja)}" style="color:#555">Pausar esta búsqueda</a></p>`;
  }).join("");

  const html = `<!doctype html><html lang="es-MX"><body style="font-family:system-ui,Arial,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:16px">
<h1 style="font-size:20px">Hola${e.nombre ? `, ${esc(e.nombre)}` : ""}: hay oportunidades nuevas</h1>${htmlSecciones}
<hr style="margin:28px 0;border:none;border-top:1px solid #ddd">
<p style="font-size:12px;color:#555"><strong>Aviso:</strong> ${esc(AVISO_LEGAL)}</p>
<p style="font-size:12px;color:#555"><a href="${esc(e.urlPanel)}">Administrar mis alertas</a> · <a href="${esc(e.urlBajaTotal)}">Dejar de recibir todas las alertas</a></p>
</body></html>`;

  const text = [
    `Hola${e.nombre ? `, ${e.nombre}` : ""}: hay oportunidades nuevas`, "",
    ...e.secciones.flatMap((s) => [
      `== ${s.nombre} (${s.resumen}) ==`,
      ...s.deals.slice(0, MAX_POR_SECCION).map((d) => `- ${d.titulo}${d.es_ejemplo ? " [EJEMPLO FICTICIO]" : ""} — ${lineaPrecio(d)}\n  ${e.siteUrl}/deal/${d.id}`),
      s.totalCoincidencias > MAX_POR_SECCION ? `Ver las ${s.totalCoincidencias} coincidencias: ${s.urlBusqueda}` : "",
      `Pausar esta búsqueda: ${s.urlBaja}`, "",
    ]),
    `Aviso: ${AVISO_LEGAL}`, "",
    `Administrar mis alertas: ${e.urlPanel}`, `Dejar de recibir todas las alertas: ${e.urlBajaTotal}`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");

  return { subject, html, text };
}
