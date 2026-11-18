"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MOTIVO_MIN } from "./cola-moderacion";

export interface NdaAdmin { nda_id: string; nombre: string; empresa: string | null; estado: string; firma_nombre: string | null; firmado_at: string | null }

/** Panel del admin en la ficha: despublicar con motivo y reabrir NDAs rechazados. Autorización en la BD (moderar_deal / reabrir_nda). */
export function PanelAdminDeal({ dealId, status, ndas }: { dealId: string; status: string; ndas: NdaAdmin[] }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [motivo, setMotivo] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null); // "despublicar" | nda_id
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const puedeDespublicar = status === "publicado" || status === "en_negociacion";

  async function llamar(fn: "moderar_deal" | "reabrir_nda", args: Record<string, unknown>, okTexto: string) {
    setBusy(true); setMsg(null);
    const { error } = await sb.rpc(fn, args);
    setBusy(false);
    if (error) return setMsg({ ok: false, texto: error.message });
    setMsg({ ok: true, texto: okTexto }); setAbierto(null); setMotivo("");
    router.refresh();
  }
  const caja = (id: string, etiqueta: string, accion: () => void) => abierto === id && (
    <div className="mt-2 space-y-2 rounded-md bg-muted p-2">
      <label className="block text-xs">Motivo (mínimo {MOTIVO_MIN} caracteres)
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={500} className="mt-1 w-full rounded border border-border p-1 text-sm" />
      </label>
      <button disabled={busy || motivo.trim().length < MOTIVO_MIN} onClick={accion} className="rounded-md bg-destructive px-3 py-1 text-xs text-destructive-foreground disabled:opacity-50">{etiqueta}</button>
    </div>
  );

  return (
    <section className="space-y-4 rounded-lg border-2 border-amber-400 p-4" aria-label="Panel de administración">
      <h2 className="text-xl font-bold">Administración</h2>
      <div>
        <h3 className="font-semibold">Estado: {status}</h3>
        {puedeDespublicar
          ? <button onClick={() => { setAbierto(abierto === "despublicar" ? null : "despublicar"); setMotivo(""); }} className="mt-1 rounded-md border border-border px-3 py-1 text-sm">Despublicar…</button>
          : <p className="text-xs text-muted-foreground">Las aprobaciones y rechazos se hacen desde la cola en /admin.</p>}
        {caja("despublicar", "Confirmar despublicación", () => llamar("moderar_deal", { p_deal: dealId, p_accion: "despublicar", p_motivo: motivo.trim() }, "Deal despublicado: vuelve a borrador con tu motivo."))}
      </div>
      <div>
        <h3 className="font-semibold">NDAs</h3>
        {ndas.length === 0 && <p className="text-sm text-muted-foreground">Sin NDAs.</p>}
        <ul className="divide-y divide-border text-sm">
          {ndas.map((n) => (
            <li key={n.nda_id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{n.nombre || "Sin nombre"}{n.empresa ? ` · ${n.empresa}` : ""} — <strong>{n.estado}</strong>{n.firmado_at ? ` · ${new Date(n.firmado_at).toLocaleDateString("es-MX", { dateStyle: "medium" })}` : ""}</span>
                {n.estado === "rechazado" && <button onClick={() => { setAbierto(abierto === n.nda_id ? null : n.nda_id); setMotivo(""); }} className="rounded-md border border-border px-2 py-1 text-xs">Reabrir…</button>}
              </div>
              {caja(n.nda_id, "Confirmar reapertura", () => llamar("reabrir_nda", { p_nda: n.nda_id, p_motivo: motivo.trim() }, "NDA reabierto: el vendedor volverá a decidir."))}
            </li>
          ))}
        </ul>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-green-700" : "text-destructive"}`}>{msg.texto}</p>}
    </section>
  );
}
