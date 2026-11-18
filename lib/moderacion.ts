import { evaluarCoherencia } from "@/lib/finance/coherencia";

export interface DealParaModerar {
  precio: number | null; noi_anual: number | null; renta_mensual_actual: number | null; ocupacion_pct: number | null; tir_proyectada: number | null;
  zona_restringida: boolean; regimen_propiedad: string | null; descripcion_teaser: string;
}
export interface ContextoModeracion { fotos: number; documentos: number; vendedorVerificado: boolean }
export interface Senal { nivel: "alerta" | "aviso"; texto: string }

/**
 * Señales automáticas para ayudar al moderador. NO deciden nada: la aprobación siempre es humana.
 * "alerta" = probable problema; "aviso" = vale la pena revisar.
 */
export function senalesModeracion(d: DealParaModerar, c: ContextoModeracion): Senal[] {
  const out: Senal[] = [];
  const coh = evaluarCoherencia(d);
  coh.errores.forEach((texto) => out.push({ nivel: "alerta", texto }));
  coh.avisos.forEach((texto) => out.push({ nivel: "aviso", texto }));
  if (c.fotos === 0) out.push({ nivel: "alerta", texto: "No tiene fotos." });
  if (c.documentos === 0) out.push({ nivel: "aviso", texto: "El data room está vacío." });
  if (!c.vendedorVerificado) out.push({ nivel: "aviso", texto: "El vendedor aún no está verificado." });
  if (d.zona_restringida) out.push({ nivel: "aviso", texto: "Marcado como zona restringida: revisar implicaciones para inversión extranjera." });
  if (d.regimen_propiedad === "ejido") out.push({ nivel: "aviso", texto: "Propiedad ejidal: confirmar dominio pleno." });
  if (d.descripcion_teaser.trim().length < 80) out.push({ nivel: "aviso", texto: "El teaser es muy corto." });
  return out;
}
