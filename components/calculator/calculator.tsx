"use client";
import { useMemo, useState } from "react";
import { calcular, type Supuestos } from "@/lib/finance/metrics";
import { DEFAULT_ASSUMPTIONS } from "@/config/finance";
import { Money } from "@/components/money-provider";
import { formatPct } from "@/lib/format";

const CAMPOS: { k: keyof Supuestos; label: string; pct: boolean; step: number; max?: number }[] = [
  { k: "crecimientoRentaAnual", label: "Crecimiento anual de rentas (%)", pct: true, step: 0.5 },
  { k: "vacanciaPct", label: "Vacancia sobre el NOI (%)", pct: true, step: 0.5, max: 100 },
  { k: "capexAnualPctNoi", label: "Capex anual (% del NOI)", pct: true, step: 0.5, max: 100 },
  { k: "ltv", label: "Apalancamiento LTV (%)", pct: true, step: 5, max: 95 },
  { k: "tasaCredito", label: "Tasa del crédito anual (%) — editable, no es TIIE", pct: true, step: 0.25 },
  { k: "plazoCreditoAnios", label: "Plazo del crédito (años)", pct: false, step: 1, max: 40 },
  { k: "gastosCierrePct", label: "Gastos de cierre (% del precio)", pct: true, step: 0.5, max: 20 },
];

export function Calculadora({ precio, noiAnual }: { precio: number; noiAnual: number }) {
  const [s, setS] = useState<Supuestos>({ ...DEFAULT_ASSUMPTIONS });
  const r = useMemo(() => calcular({ precio, noiAnual }, s), [precio, noiAnual, s]);

  const set = (k: keyof Supuestos, raw: string, pct: boolean) => {
    const n = Number(raw);
    if (raw === "" || Number.isNaN(n)) return;
    setS((prev) => ({ ...prev, [k]: pct ? n / 100 : n }));
  };

  const kpi = (label: string, valor: React.ReactNode) => (
    <div className="rounded-md border border-border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold">{valor}</div></div>
  );

  return (
    <section aria-labelledby="calc" className="space-y-4 rounded-lg border border-border p-4">
      <h2 id="calc" className="text-xl font-bold">Calculadora de inversión</h2>
      <p className="text-sm text-muted-foreground">
        Proyección ilustrativa a partir de cifras del vendedor no verificadas y de los supuestos que captures. Salida al cap rate de entrada. No es asesoría de inversión.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {CAMPOS.map((c) => (
          <label key={c.k} className="text-sm">
            <span className="block">{c.label}</span>
            <input type="number" inputMode="decimal" step={c.step} min={0} max={c.max}
              value={Number((c.pct ? s[c.k] * 100 : s[c.k]).toFixed(4))}
              onChange={(e) => set(c.k, e.target.value, c.pct)}
              className="mt-1 w-full rounded-md border border-border p-2" />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {kpi("Cap rate (declarado)", formatPct(r.capRate))}
        {kpi("Capital propio", <Money value={r.capitalPropio} abreviado />)}
        {kpi("Cash-on-cash (año 1)", formatPct(r.cashOnCash))}
        {kpi("Payback (operativo)", r.paybackAnios == null ? "No se recupera" : `${r.paybackAnios.toFixed(1)} años`)}
        {kpi("TIR a 5 años", formatPct(r.tir5))}
        {kpi("TIR a 10 años", formatPct(r.tir10))}
      </div>
      <details>
        <summary className="cursor-pointer text-sm underline">Ver flujo anual</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left"><th>Año</th><th>NOI</th><th>Capex</th><th>Deuda</th><th>Flujo</th></tr></thead>
            <tbody>{r.filas.map((f) => (
              <tr key={f.anio}><td>{f.anio}</td><td><Money value={f.noi} /></td><td><Money value={f.capex} /></td><td><Money value={f.servicioDeuda} /></td><td><Money value={f.flujo} /></td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
