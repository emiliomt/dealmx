"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ESTATUS, SEGMENTOS } from "@/lib/catalogos";
import { Money } from "@/components/money-provider";
import { GestorDocumentos, type Doc } from "./gestor-documentos";

export interface MiDeal {
  id: string; titulo: string; status: keyof typeof ESTATUS; segmento: keyof typeof SEGMENTOS; precio: number | null; es_ejemplo: boolean; motivo_rechazo: string | null;
  vistas_total: number; vistas_7d: number; ndas_pendientes: number; ndas_aprobados: number; mensajes: number; docs: Doc[];
}
/** Transiciones que permite el trigger guard_deal_status al vendedor (la BD las hace cumplir; aquí solo se ofrecen). */
const ACCIONES: Record<string, { a: MiDeal["status"]; label: string }[]> = {
  borrador: [{ a: "en_revision", label: "Enviar a revisión" }],
  en_revision: [{ a: "borrador", label: "Volver a borrador" }],
  publicado: [{ a: "en_negociacion", label: "Marcar en negociación" }, { a: "cerrado", label: "Cerrar" }],
  en_negociacion: [{ a: "publicado", label: "Volver a publicado" }, { a: "cerrado", label: "Cerrar" }],
  cerrado: [],
};

export function MisDeals({ inicial }: { inicial: MiDeal[] }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [deals, setDeals] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function cambiar(d: MiDeal, status: MiDeal["status"]) {
    if (status === "cerrado" && !confirm("Al cerrar el deal dejará de aceptar NDAs y no podrás reabrirlo. ¿Continuar?")) return;
    setError(null); setBusy(d.id);
    const { data, error } = await sb.from("deals").update({ status }).eq("id", d.id).select("id");
    setBusy(null);
    if (error || !data?.length) return setError(`No se pudo cambiar “${d.titulo}”: ${error?.message ?? "sin permiso"}`);
    setDeals((l) => l.map((x) => (x.id === d.id ? { ...x, status } : x)));
    router.refresh();
  }
  async function eliminar(d: MiDeal) {
    if (!confirm(`¿Eliminar el borrador “${d.titulo}”? No se puede deshacer.`)) return;
    setError(null); setBusy(d.id);
    const { data, error } = await sb.from("deals").delete().eq("id", d.id).select("id");
    setBusy(null);
    if (error || !data?.length) return setError("No se pudo eliminar (solo se eliminan borradores y deals en revisión)");
    setDeals((l) => l.filter((x) => x.id !== d.id));
  }

  if (deals.length === 0) return <p className="text-sm text-muted-foreground">Aún no has publicado deals. <a className="underline" href="/publicar">Publicar el primero</a>.</p>;
  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <ul className="space-y-3">
        {deals.map((d) => (
          <li key={d.id} className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <a className="font-semibold underline" href={`/deal/${d.id}`}>{d.titulo}</a>
                {d.es_ejemplo && <span className="ml-2 rounded bg-amber-100 px-1 text-xs text-amber-900">EJEMPLO</span>}
                <div className="text-xs text-muted-foreground">{SEGMENTOS[d.segmento]}{d.precio != null && <> · <Money value={d.precio} abreviado /></>} · <strong>{ESTATUS[d.status]}</strong></div>
                {d.motivo_rechazo && d.status === "borrador" && <div className="text-xs text-destructive">Moderación: {d.motivo_rechazo}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {d.status !== "cerrado" && <a href={`/deal/${d.id}/editar`} className="rounded-md border border-border px-2 py-1 text-xs">Editar</a>}
                {(ACCIONES[d.status] ?? []).map((x) => <button key={x.a} disabled={busy === d.id} onClick={() => cambiar(d, x.a)} className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50">{x.label}</button>)}
                {(d.status === "borrador" || d.status === "en_revision") && <button disabled={busy === d.id} onClick={() => eliminar(d)} className="rounded-md border border-border px-2 py-1 text-xs text-destructive disabled:opacity-50">Eliminar</button>}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
              <span>{d.vistas_total} vistas ({d.vistas_7d} en 7 días)</span>
              <span>{d.ndas_pendientes} NDA pendiente{d.ndas_pendientes === 1 ? "" : "s"}</span>
              <span>{d.ndas_aprobados} aprobado{d.ndas_aprobados === 1 ? "" : "s"}</span>
              <span>{d.mensajes} mensaje{d.mensajes === 1 ? "" : "s"}</span>
            </div>
            <details>
              <summary className="cursor-pointer text-xs underline">Data room ({d.docs.length})</summary>
              <div className="mt-2"><GestorDocumentos dealId={d.id} inicial={d.docs} /></div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
