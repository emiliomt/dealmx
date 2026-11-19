import { describe, expect, it } from "vitest";
import { irr } from "@/lib/finance/irr";
import { calcular, saldoCredito, servicioAnualDeuda, type Supuestos } from "@/lib/finance/metrics";
import { evaluarCoherencia } from "@/lib/finance/coherencia";

const sinPalancaPlano: Supuestos = { crecimientoRentaAnual: 0, vacanciaPct: 0, capexAnualPctNoi: 0, ltv: 0, tasaCredito: 0.12, plazoCreditoAnios: 15, gastosCierrePct: 0 };

describe("irr", () => {
  it("10% simple", () => expect(irr([-100, 110])).toBeCloseTo(0.1, 6));
  it("anualidad conocida", () => expect(irr([-1000, 500, 500, 500])).toBeCloseTo(0.2337, 3));
  it("sin cambio de signo -> null", () => expect(irr([100, 100])).toBeNull());
});

describe("crédito", () => {
  it("pago anual de 1 mdp al 12% a 15 años ≈ 144,020", () =>
    expect(servicioAnualDeuda(1_000_000, 0.12, 15)).toBeCloseTo(144020.2, 0));
  it("saldo inicial = principal y final = 0", () => {
    expect(saldoCredito(1_000_000, 0.12, 15, 0)).toBeCloseTo(1_000_000, 2);
    expect(saldoCredito(1_000_000, 0.12, 15, 15)).toBe(0);
  });
  it("tasa 0", () => expect(servicioAnualDeuda(1_200_000, 0, 10)).toBeCloseTo(120000, 6));
});

describe("calcular", () => {
  it("sin deuda, sin crecimiento: CoC = cap rate y TIR = cap rate", () => {
    const r = calcular({ precio: 10_000_000, noiAnual: 900_000 }, sinPalancaPlano);
    expect(r.capRate).toBeCloseTo(0.09, 8);
    expect(r.cashOnCash).toBeCloseTo(0.09, 8);
    expect(r.tir5).toBeCloseTo(0.09, 5);
    expect(r.tir10).toBeCloseTo(0.09, 5);
    expect(r.paybackAnios).toBeCloseTo(1 / 0.09, 5);
  });
  it("gastos de cierre reducen CoC", () => {
    const r = calcular({ precio: 10_000_000, noiAnual: 900_000 }, { ...sinPalancaPlano, gastosCierrePct: 0.03 });
    expect(r.cashOnCash).toBeCloseTo(900_000 / 10_300_000, 8);
  });
  it("con LTV 50%: capital propio = 50% del precio y flujo = NOI - deuda", () => {
    const s = { ...sinPalancaPlano, ltv: 0.5 };
    const r = calcular({ precio: 10_000_000, noiAnual: 900_000 }, s);
    expect(r.capitalPropio).toBe(5_000_000);
    expect(r.filas[0].flujo).toBeCloseTo(900_000 - servicioAnualDeuda(5_000_000, 0.12, 15), 4);
  });
  it("vacancia y capex reducen el flujo", () => {
    const r = calcular({ precio: 10_000_000, noiAnual: 1_000_000 }, { ...sinPalancaPlano, vacanciaPct: 0.1, capexAnualPctNoi: 0.1 });
    expect(r.filas[0].flujo).toBeCloseTo(1_000_000 * 0.9 * 0.9, 4);
  });
  it("crecimiento de rentas sube el NOI año con año", () => {
    const r = calcular({ precio: 10_000_000, noiAnual: 1_000_000 }, { ...sinPalancaPlano, crecimientoRentaAnual: 0.05 });
    expect(r.filas[1].noi).toBeCloseTo(1_050_000, 4);
    expect(r.tir10!).toBeGreaterThan(0.1);
  });
  it("entradas inválidas -> resultado vacío", () => {
    const r = calcular({ precio: 0, noiAnual: 1 }, sinPalancaPlano);
    expect(r.capRate).toBeNull();
    expect(r.tir5).toBeNull();
  });
  it("flujo negativo nunca recupera -> payback null", () => {
    const r = calcular({ precio: 10_000_000, noiAnual: 0 }, sinPalancaPlano);
    expect(r.paybackAnios).toBeNull();
  });
});

describe("coherencia NOI / precio / renta", () => {
  it("caso sano sin errores", () => {
    const c = evaluarCoherencia({ precio: 10_000_000, noi_anual: 900_000, renta_mensual_actual: 100_000 });
    expect(c.errores).toEqual([]);
    expect(c.capRateImplicito).toBeCloseTo(0.09);
  });
  it("NOI mayor a la renta anual bruta es error", () => {
    expect(evaluarCoherencia({ precio: 10e6, noi_anual: 1_300_000, renta_mensual_actual: 100_000 }).errores).toHaveLength(1);
  });
  it("cap rate > 30% es error de captura", () => {
    expect(evaluarCoherencia({ precio: 1_000_000, noi_anual: 400_000 }).errores.length).toBeGreaterThan(0);
  });
  it("cap rate 20% solo avisa", () => {
    const c = evaluarCoherencia({ precio: 1_000_000, noi_anual: 200_000 });
    expect(c.errores).toEqual([]);
    expect(c.avisos.length).toBeGreaterThan(0);
  });
  it("NOI negativo es error", () => {
    expect(evaluarCoherencia({ precio: 1e6, noi_anual: -5 }).errores.length).toBeGreaterThan(0);
  });
});
