export interface CoherenciaInput {
  precio?: number | null; noi_anual?: number | null; renta_mensual_actual?: number | null;
  ocupacion_pct?: number | null; tir_proyectada?: number | null;
}
export interface Coherencia { errores: string[]; avisos: string[]; capRateImplicito: number | null }

/** Reglas de coherencia NOI / precio / renta. Los errores bloquean el envío a revisión; los avisos no. */
export function evaluarCoherencia(d: CoherenciaInput): Coherencia {
  const errores: string[] = [];
  const avisos: string[] = [];
  const { precio, noi_anual: noi, renta_mensual_actual: renta } = d;
  const cap = precio && precio > 0 && noi != null ? noi / precio : null;

  if (noi != null && noi < 0) errores.push("El NOI anual no puede ser negativo.");
  if (noi != null && renta != null && renta > 0 && noi > renta * 12) {
    errores.push("El NOI anual no puede exceder la renta anual bruta (renta mensual × 12).");
  }
  if (cap != null && cap > 0.3) errores.push(`Cap rate implícito de ${(cap * 100).toFixed(1)}%: revisa precio y NOI (¿error de captura?).`);
  if (cap != null && cap >= 0 && cap < 0.03) avisos.push(`Cap rate implícito bajo (${(cap * 100).toFixed(1)}%).`);
  if (cap != null && cap > 0.15 && cap <= 0.3) avisos.push(`Cap rate implícito alto (${(cap * 100).toFixed(1)}%): se pedirá sustento.`);
  if (noi != null && renta != null && renta > 0 && noi <= renta * 12 && noi / (renta * 12) < 0.4) {
    avisos.push("El NOI es menor al 40% de la renta bruta: gastos operativos muy altos.");
  }
  if (renta != null && renta > 0 && d.ocupacion_pct === 0) avisos.push("Declaras renta actual con ocupación de 0%.");
  if (d.tir_proyectada != null && d.tir_proyectada > 60) avisos.push("TIR proyectada muy alta (>60%).");
  return { errores, avisos, capRateImplicito: cap };
}
