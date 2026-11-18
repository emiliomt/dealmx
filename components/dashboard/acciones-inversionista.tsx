"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ETAPAS, ETAPA_LABEL, esEtapa, type Etapa } from "@/lib/pipeline";

/** En la ficha: guardar en favoritos y seguir el deal en el pipeline. Todo bajo RLS (filas propias). */
export function AccionesInversionista({ dealId, userId, favorito, etapa }: { dealId: string; userId: string; favorito: boolean; etapa: Etapa | null }) {
  const sb = useMemo(() => createClient(), []);
  const [fav, setFav] = useState(favorito);
  const [et, setEt] = useState<Etapa | null>(etapa);
  const [error, setError] = useState<string | null>(null);

  async function toggleFav() {
    setError(null);
    const quiere = !fav; setFav(quiere);
    const { error } = quiere
      ? await sb.from("favorites").upsert({ user_id: userId, deal_id: dealId }, { onConflict: "user_id,deal_id" })
      : await sb.from("favorites").delete().eq("user_id", userId).eq("deal_id", dealId);
    if (error) { setFav(!quiere); setError("No se pudo actualizar favoritos"); }
  }
  async function cambiaEtapa(v: string) {
    setError(null);
    const anterior = et;
    if (v === "") return; // "No seguir" no existe: se descarta con la etapa 'descartado'
    if (!esEtapa(v)) return;
    setEt(v);
    const { error } = await sb.from("pipeline_items").upsert({ user_id: userId, deal_id: dealId, etapa: v }, { onConflict: "user_id,deal_id" });
    if (error) { setEt(anterior); setError("No se pudo actualizar tu pipeline"); }
  }

  return (
    <div className="flex flex-wrap items-center gap-3" aria-label="Acciones del inversionista">
      <button type="button" onClick={toggleFav} aria-pressed={fav} className={`rounded-md border px-3 py-1 text-sm ${fav ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
        {fav ? "★ En favoritos" : "☆ Guardar en favoritos"}
      </button>
      <label className="flex items-center gap-2 text-sm">Mi pipeline
        <select value={et ?? ""} onChange={(e) => cambiaEtapa(e.target.value)} className="rounded-md border border-border p-1 text-sm">
          {et === null && <option value="">No lo sigo</option>}
          {et === null && <option disabled>──────</option>}
          {(et === null ? (["visto", "descartado"] as Etapa[]) : [...ETAPAS]).map((x) => <option key={x} value={x}>{et === null && x === "visto" ? "Seguir (visto)" : ETAPA_LABEL[x]}</option>)}
        </select>
      </label>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
