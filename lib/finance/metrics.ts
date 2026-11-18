import { irr } from "./irr";

export interface Supuestos {
  crecimientoRentaAnual: number; // crecimiento anual del NOI (rentas)
  vacanciaPct: number;           // ajuste de vacancia aplicado sobre el NOI declarado
  capexAnualPctNoi: number;      // capex anual como % del NOI
  ltv: number;                   // 0..0.95
  tasaCredito: number;           // anual
  plazoCreditoAnios: number;
  gastosCierrePct: number;       // % del precio, a cargo del capital propio
}

export interface Entrada { precio: number; noiAnual: number }

export interface FilaAnual { anio: number; noi: number; capex: number; servicioDeuda: number; flujo: number }

export interface Resultado {
  capRate: number | null;        // NOI declarado / precio
  capitalPropio: number | null;
  prestamo: number;
  cashOnCash: number | null;     // flujo año 1 / capital propio
  paybackAnios: number | null;   // años para recuperar capital propio con flujo operativo (sin venta)
  tir5: number | null;
  tir10: number | null;
  filas: FilaAnual[];            // 10 años
}

/** Servicio anual de deuda con amortización mensual (sistema francés). */
export function servicioAnualDeuda(principal: number, tasaAnual: number, anios: number): number {
  const n = Math.round(anios * 12);
  if (principal <= 0 || n <= 0) return 0;
  const r = tasaAnual / 12;
  const mensual = r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  return mensual * 12;
}

/** Saldo del crédito tras `anios` años de pagos mensuales. */
export function saldoCredito(principal: number, tasaAnual: number, plazoAnios: number, anios: number): number {
  const n = Math.round(plazoAnios * 12);
  const k = Math.min(Math.round(anios * 12), n);
  if (principal <= 0 || n <= 0) return 0;
  if (k >= n) return 0;
  const r = tasaAnual / 12;
  if (r === 0) return principal * (1 - k / n);
  return (principal * (Math.pow(1 + r, n) - Math.pow(1 + r, k))) / (Math.pow(1 + r, n) - 1);
}

const HORIZONTE_PAYBACK = 40;

export function calcular(entrada: Entrada, s: Supuestos): Resultado {
  const { precio, noiAnual } = entrada;
  const vacio: Resultado = { capRate: null, capitalPropio: null, prestamo: 0, cashOnCash: null, paybackAnios: null, tir5: null, tir10: null, filas: [] };
  if (!(precio > 0) || !Number.isFinite(noiAnual)) return vacio;

  const ltv = Math.min(Math.max(s.ltv, 0), 0.95);
  const prestamo = precio * ltv;
  const capitalPropio = precio * (1 - ltv) + precio * s.gastosCierrePct;
  const capRate = noiAnual / precio;
  const servicio = servicioAnualDeuda(prestamo, s.tasaCredito, s.plazoCreditoAnios);

  const noiEn = (t: number) => noiAnual * Math.pow(1 + s.crecimientoRentaAnual, t - 1) * (1 - s.vacanciaPct);
  const flujoEn = (t: number) => {
    const noi = noiEn(t);
    const capex = noi * s.capexAnualPctNoi;
    const deuda = t <= s.plazoCreditoAnios ? servicio : 0;
    return { anio: t, noi, capex, servicioDeuda: deuda, flujo: noi - capex - deuda };
  };

  const filas = Array.from({ length: 10 }, (_, i) => flujoEn(i + 1));

  // Salida al año N: NOI del año N+1 capitalizado al cap rate de entrada, menos saldo del crédito.
  const tir = (n: number): number | null => {
    if (!(capitalPropio > 0) || capRate <= 0) return null;
    const venta = noiEn(n + 1) / capRate;
    const neto = venta - saldoCredito(prestamo, s.tasaCredito, s.plazoCreditoAnios, n);
    const flujos = [-capitalPropio];
    for (let t = 1; t <= n; t++) flujos.push(flujoEn(t).flujo + (t === n ? neto : 0));
    return irr(flujos);
  };

  let payback: number | null = null;
  if (capitalPropio > 0) {
    let acum = 0;
    for (let t = 1; t <= HORIZONTE_PAYBACK; t++) {
      const f = flujoEn(t).flujo;
      if (acum + f >= capitalPropio) { payback = t - 1 + (capitalPropio - acum) / f; break; }
      acum += f;
    }
  }

  return {
    capRate,
    capitalPropio,
    prestamo,
    cashOnCash: capitalPropio > 0 ? filas[0].flujo / capitalPropio : null,
    paybackAnios: payback,
    tir5: tir(5),
    tir10: tir(10),
    filas,
  };
}
