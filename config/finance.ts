/**
 * Supuestos precargados de la calculadora. SON EDITABLES y NO son datos de mercado.
 * En particular DEFAULT_LOAN_RATE es un valor de partida arbitrario, no la TIIE vigente:
 * el usuario debe capturar la tasa real de su crédito.
 */
export const DEFAULT_LOAN_RATE = 0.12; // anual, placeholder editable
export const DEFAULT_ASSUMPTIONS = {
  crecimientoRentaAnual: 0.03,
  vacanciaPct: 0.05,
  capexAnualPctNoi: 0.05,
  ltv: 0.5,
  tasaCredito: DEFAULT_LOAN_RATE,
  plazoCreditoAnios: 15,
  gastosCierrePct: 0.03,
  crecimientoValorAnual: 0.03,
} as const;

/** Tipo de cambio opcional; si no está configurado el toggle USD no se muestra. */
export const FX_USD_MXN: number | null = (() => {
  const v = Number(process.env.NEXT_PUBLIC_FX_USD_MXN);
  return Number.isFinite(v) && v > 0 ? v : null;
})();
