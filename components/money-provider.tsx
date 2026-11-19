"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { formatMoney, formatMdp, type Moneda } from "@/lib/format";
import { FX_USD_MXN } from "@/config/finance";

interface Ctx { moneda: Moneda; setMoneda: (m: Moneda) => void; fx: number | null }
const MoneyCtx = createContext<Ctx>({ moneda: "MXN", setMoneda: () => {}, fx: null });

export function MoneyProvider({ children }: { children: React.ReactNode }) {
  const [moneda, setMonedaState] = useState<Moneda>("MXN");
  useEffect(() => {
    try { if (FX_USD_MXN && localStorage.getItem("dealmx.moneda") === "USD") setMonedaState("USD"); } catch {}
  }, []);
  const setMoneda = (m: Moneda) => {
    setMonedaState(m);
    try { localStorage.setItem("dealmx.moneda", m); } catch {}
  };
  return <MoneyCtx.Provider value={{ moneda, setMoneda, fx: FX_USD_MXN }}>{children}</MoneyCtx.Provider>;
}
export const useMoney = () => useContext(MoneyCtx);

/** Monto en MXN; se convierte a USD si el usuario lo eligió y hay tipo de cambio configurado. */
export function Money({ value, abreviado = false }: { value: number | null | undefined; abreviado?: boolean }) {
  const { moneda, fx } = useMoney();
  if (abreviado && moneda === "MXN") return <>{formatMdp(value)}</>;
  return <>{formatMoney(value, moneda, fx)}</>;
}

/** Toggle MXN/USD: no se renderiza si no hay NEXT_PUBLIC_FX_USD_MXN. */
export function CurrencyToggle() {
  const { moneda, setMoneda, fx } = useMoney();
  if (!fx) return null;
  return (
    <button type="button" onClick={() => setMoneda(moneda === "MXN" ? "USD" : "MXN")}
      className="rounded-md border border-border px-2 py-1 text-xs" aria-label="Cambiar moneda">
      {moneda === "MXN" ? "MXN → USD" : "USD → MXN"}
    </button>
  );
}
