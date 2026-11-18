"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Money } from "@/components/money-provider";
import { SEGMENTOS, TIPOS_OPERACION } from "@/lib/catalogos";
import { formatPct } from "@/lib/format";
import type { Senal } from "@/lib/moderacion";

export interface DealEnCola {
  id: string; titulo: string; segmento: keyof typeof SEGMENTOS; tipo_operacion: keyof typeof TIPOS_OPERACION; lugar: string;
  precio: number | null; cap_rate: number | null; vendedor: string; es_ejemplo: boolean; enviado: string; motivoPrevio: string | null; senales: Senal[];
}
export const MOTIVO_MIN = 10;

/** Cola de moderación. Las reglas de transición y la autorización viven en la función SQL `moderar_deal`; aquí solo se invoca. */
export function ColaModeracion({ inicial }: { inicial: DealEnCola[] }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [cola, setCola] = useState(inicial);
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function moderar(d: DealEnCola, accion: "aprobar" | "rechazar") {
    setError(null); setBusy(d.id);
    const { error } = await sb.rpc("moderar_deal", { p_deal: d.id, p_accion: accion, p_motivo: accion === "rechazar" ? motivo.trim() : null });
    setBusy(null);
    if (error) return setError(`No se pudo ${accion} “${d.titulo}”: ${error.message}`);
    setCola((c) => c.filter((x) => x.id !== d.id));
    setRechazando(null); setMotivo("");
    router.refresh();
  }

  if (cola.length === 0) return <p className="text-sm text-muted-foreground">No hay deals pendientes de revisión. 🎉</p>;
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <ul className="space-y-3">
        {cola.map((d) => (
          <li key={d.id} className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <a className="font-semibold underline" href={`/deal/${d.id}`}>{d.titulo}</a>
                {d.es_ejemplo && <span className="ml-2 rounded bg-amber-100 px-1 text-xs text-amber-900">EJEMPLO</span>}
                <div className="text-xs text-muted-foreground">
                  {SEGMENTOS[d.segmento]} · {TIPOS_OPERACION[d.tipo_operacion]} · {d.lugar}
                  {d.precio != null && <> · <Money value={d.precio} abreviado /></>}{d.cap_rate != null && ` · cap rate ${formatPct(d.cap_rate)}`}
                </div>
                <div className="text-xs text-muted-foreground">Vendedor: {d.vendedor} · enviado {new Date(d.enviado).toLocaleDateString("es-MX", { dateStyle: "medium" })}</div>
                {d.motivoPrevio && <div className="text-xs text-amber-800">Rechazo previo: {d.motivoPrevio}</div>}
              </div>
              <div className="flex gap-2">
                <button disabled={busy === d.id} onClick={() => moderar(d, "aprobar")} className="rounded-md bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50">Aprobar y publicar</button>
                <button disabled={busy === d.id} onClick={() => { setRechazando(rechazando === d.id ? null : d.id); setMotivo(""); }} className="rounded-md border border-border px-3 py-1 disabled:opacity-50">Rechazar…</button>
              </div>
            </div>
            {d.senales.length > 0 && (
              <ul className="space-y-0.5 text-xs" aria-label="Señales para el moderador">
                {d.senales.map((s) => <li key={s.texto} className={s.nivel === "alerta" ? "text-destructive" : "text-amber-800"}>{s.nivel === "alerta" ? "⚠ " : "• "}{s.texto}</li>)}
              </ul>
            )}
            {rechazando === d.id && (
              <div className="space-y-2 rounded-md bg-muted p-2">
                <label className="block text-xs">Motivo (lo verá el vendedor; mínimo {MOTIVO_MIN} caracteres)
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={500} className="mt-1 w-full rounded border border-border p-1 text-sm" />
                </label>
                <button disabled={busy === d.id || motivo.trim().length < MOTIVO_MIN} onClick={() => moderar(d, "rechazar")} className="rounded-md bg-destructive px-3 py-1 text-xs text-destructive-foreground disabled:opacity-50">Confirmar rechazo</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
