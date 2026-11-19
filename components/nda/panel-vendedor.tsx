"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Chat } from "@/components/chat/chat";

export interface Solicitante { nda_id: string; user_id: string; nombre: string; empresa: string | null; estado: string; firma_nombre: string | null; firmado_at: string | null }
export interface Vistas { total: number; ult7: number; ult30: number; anonimas: number; identificados: { user_id: string; nombre: string; empresa: string | null; vistas: number; ultima: string }[] }

const ETIQUETA: Record<string, string> = { solicitado: "Sin firmar", firmado: "Firmado · pendiente de tu decisión", aprobado: "Aprobado", rechazado: "Rechazado" };

/** Panel del dueño del deal: solicitudes de NDA, chat por inversionista y analítica de vistas. */
export function PanelVendedor({ dealId, ownerId, solicitantes, vistas }: { dealId: string; ownerId: string; solicitantes: Solicitante[]; vistas: Vistas | null }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [chatCon, setChatCon] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function decidir(s: Solicitante, estado: "aprobado" | "rechazado") {
    setError(null); setBusy(s.nda_id);
    // RLS + trigger de BD: solo el dueño/admin puede pasar firmado -> aprobado/rechazado.
    const { data, error } = await sb.from("ndas").update({ estado }).eq("id", s.nda_id).eq("estado", "firmado").select("id");
    setBusy(null);
    if (error || !data?.length) return setError("No se pudo actualizar la solicitud (¿ya fue resuelta?)");
    router.refresh();
  }

  const elegido = solicitantes.find((s) => s.user_id === chatCon && s.estado === "aprobado");
  return (
    <section className="space-y-4 rounded-lg border border-border p-4" aria-label="Panel del vendedor">
      <h2 className="text-xl font-bold">Panel del vendedor</h2>

      <div className="space-y-2">
        <h3 className="font-semibold">Solicitudes de NDA</h3>
        {solicitantes.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay solicitudes.</p>}
        <ul className="divide-y divide-border">
          {solicitantes.map((s) => (
            <li key={s.nda_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <div className="font-medium">{s.nombre || "Sin nombre"}{s.empresa ? ` · ${s.empresa}` : ""}</div>
                <div className="text-xs text-muted-foreground">
                  {ETIQUETA[s.estado] ?? s.estado}
                  {s.firma_nombre ? ` · firmó como “${s.firma_nombre}”` : ""}
                  {s.firmado_at ? ` · ${new Date(s.firmado_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                {s.estado === "firmado" && <>
                  <button disabled={busy === s.nda_id} onClick={() => decidir(s, "aprobado")} className="rounded-md bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50">Aprobar</button>
                  <button disabled={busy === s.nda_id} onClick={() => decidir(s, "rechazado")} className="rounded-md border border-border px-3 py-1 disabled:opacity-50">Rechazar</button>
                </>}
                {s.estado === "aprobado" && <button onClick={() => setChatCon(chatCon === s.user_id ? null : s.user_id)} className="rounded-md border border-border px-3 py-1">{chatCon === s.user_id ? "Cerrar chat" : "Abrir chat"}</button>}
              </div>
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>

      {elegido && (
        <div className="space-y-2">
          <h3 className="font-semibold">Chat con {elegido.nombre || "inversionista"}</h3>
          <Chat key={elegido.user_id} dealId={dealId} threadUserId={elegido.user_id} userId={ownerId} etiquetaOtro={elegido.nombre || "Inversionista"} />
        </div>
      )}

      {vistas && (
        <div className="space-y-2">
          <h3 className="font-semibold">Vistas</h3>
          <p className="text-sm">{vistas.total} totales · {vistas.ult7} en 7 días · {vistas.ult30} en 30 días · {vistas.anonimas} anónimas</p>
          {vistas.identificados.length > 0 && (
            <ul className="text-sm text-muted-foreground">
              {vistas.identificados.slice(0, 10).map((v) => (
                <li key={v.user_id}>{v.nombre || "Usuario"}{v.empresa ? ` · ${v.empresa}` : ""} — {v.vistas} vista{v.vistas === 1 ? "" : "s"}, última {new Date(v.ultima).toLocaleDateString("es-MX")}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
