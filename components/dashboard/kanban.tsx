"use client";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ETAPAS, ETAPA_LABEL, agrupar, esEtapa, mover, type Etapa } from "@/lib/pipeline";
import { Money } from "@/components/money-provider";
import { SEGMENTOS } from "@/lib/catalogos";

export interface ItemPipeline { id: string; deal_id: string; etapa: Etapa; notas: string | null; titulo: string; segmento: keyof typeof SEGMENTOS | null; precio: number | null }

/**
 * Kanban del inversionista. Arrastrar y soltar nativo (HTML5) + un <select> por tarjeta para teclado/móvil.
 * Optimista con reversión: si la BD (RLS) rechaza el cambio, la tarjeta vuelve a su columna.
 */
export function Kanban({ inicial }: { inicial: ItemPipeline[] }) {
  const sb = useMemo(() => createClient(), []);
  const [items, setItems] = useState(inicial);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<Etapa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const prev = useRef(items);
  const cols = agrupar(items);

  async function cambiarEtapa(id: string, etapa: Etapa) {
    const antes = items;
    const despues = mover(items, id, etapa);
    if (despues === antes) return;
    prev.current = antes; setItems(despues); setError(null);
    const { data, error } = await sb.from("pipeline_items").update({ etapa }).eq("id", id).select("id");
    if (error || !data?.length) { setItems((cur) => mover(cur, id, antes.find((x) => x.id === id)!.etapa)); setError("No se pudo mover la tarjeta. Intenta de nuevo."); }
  }

  async function guardarNota(id: string, notas: string) {
    const actual = items.find((x) => x.id === id);
    if (!actual || (actual.notas ?? "") === notas) return setEditando(null);
    const { data, error } = await sb.from("pipeline_items").update({ notas: notas || null }).eq("id", id).select("id");
    if (error || !data?.length) return setError("No se pudo guardar la nota.");
    setItems((cur) => cur.map((x) => (x.id === id ? { ...x, notas: notas || null } : x)));
    setEditando(null); setError(null);
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground">Tu pipeline está vacío. Sigue un deal desde su ficha para empezar.</p>;
  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 overflow-x-auto pb-2 [grid-template-columns:repeat(6,minmax(11rem,1fr))]">
        {ETAPAS.map((etapa) => (
          <section key={etapa} aria-label={`Etapa ${ETAPA_LABEL[etapa]}`} data-etapa={etapa}
            onDragOver={(e) => { e.preventDefault(); setSobre(etapa); }}
            onDragLeave={() => setSobre((s) => (s === etapa ? null : s))}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || arrastrando; setSobre(null); setArrastrando(null); if (id) void cambiarEtapa(id, etapa); }}
            className={`min-h-[8rem] rounded-lg border p-2 ${sobre === etapa ? "border-primary bg-muted" : "border-border"} ${etapa === "descartado" ? "opacity-80" : ""}`}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide">{ETAPA_LABEL[etapa]} <span className="text-muted-foreground">({cols[etapa].length})</span></h3>
            <ul className="space-y-2">
              {cols[etapa].map((it) => (
                <li key={it.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", it.id); e.dataTransfer.effectAllowed = "move"; setArrastrando(it.id); }}
                  onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                  className={`cursor-grab rounded-md border border-border bg-background p-2 text-sm shadow-sm ${arrastrando === it.id ? "opacity-50" : ""}`}>
                  <a href={`/deal/${it.deal_id}`} className="font-medium underline">{it.titulo}</a>
                  <div className="text-xs text-muted-foreground">{it.segmento ? SEGMENTOS[it.segmento] : ""}{it.precio != null && <> · <Money value={it.precio} abreviado /></>}</div>
                  <select aria-label={`Mover ${it.titulo} a otra etapa`} value={it.etapa} onChange={(e) => esEtapa(e.target.value) && void cambiarEtapa(it.id, e.target.value)} className="mt-1 w-full rounded border border-border p-1 text-xs">
                    {ETAPAS.map((x) => <option key={x} value={x}>{ETAPA_LABEL[x]}</option>)}
                  </select>
                  {editando === it.id
                    ? <textarea autoFocus defaultValue={it.notas ?? ""} maxLength={2000} rows={3} aria-label={`Notas de ${it.titulo}`} onBlur={(e) => void guardarNota(it.id, e.target.value.trim())} className="mt-1 w-full rounded border border-border p-1 text-xs" />
                    : <button type="button" onClick={() => setEditando(it.id)} className="mt-1 block w-full text-left text-xs text-muted-foreground underline-offset-2 hover:underline">{it.notas ? it.notas : "Agregar nota"}</button>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
