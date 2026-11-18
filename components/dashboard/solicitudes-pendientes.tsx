"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface Pendiente { nda_id: string; deal_id: string; titulo: string; nombre: string; empresa: string | null; firma_nombre: string | null; firmado_at: string | null }

/** Bandeja de NDAs firmados que esperan decisión, de todos los deals del vendedor. */
export function SolicitudesPendientes({ inicial }: { inicial: Pendiente[] }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [lista, setLista] = useState(inicial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decidir(p: Pendiente, estado: "aprobado" | "rechazado") {
    setError(null); setBusy(p.nda_id);
    // RLS + trigger: solo el dueño puede pasar firmado -> aprobado|rechazado.
    const { data, error } = await sb.from("ndas").update({ estado }).eq("id", p.nda_id).eq("estado", "firmado").select("id");
    setBusy(null);
    if (error || !data?.length) return setError("No se pudo actualizar la solicitud (¿ya fue resuelta?)");
    setLista((l) => l.filter((x) => x.nda_id !== p.nda_id));
    router.refresh();
  }

  if (lista.length === 0) return <p className="text-sm text-muted-foreground">No tienes solicitudes pendientes.</p>;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {lista.map((p) => (
          <li key={p.nda_id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div>
              <div className="font-medium">{p.nombre || "Sin nombre"}{p.empresa ? ` · ${p.empresa}` : ""}</div>
              <div className="text-xs text-muted-foreground">
                <a className="underline" href={`/deal/${p.deal_id}`}>{p.titulo}</a>
                {p.firma_nombre ? ` · firmó como “${p.firma_nombre}”` : ""}
                {p.firmado_at ? ` · ${new Date(p.firmado_at).toLocaleDateString("es-MX", { dateStyle: "medium" })}` : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <button disabled={busy === p.nda_id} onClick={() => decidir(p, "aprobado")} className="rounded-md bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50">Aprobar</button>
              <button disabled={busy === p.nda_id} onClick={() => decidir(p, "rechazado")} className="rounded-md border border-border px-3 py-1 disabled:opacity-50">Rechazar</button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
