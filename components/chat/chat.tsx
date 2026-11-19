"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Mensaje { id: string; sender_id: string; body: string; created_at: string }

/**
 * Chat por deal entre un inversionista (thread_user_id) y el vendedor. RLS en la BD exige NDA aprobado:
 * si no lo hay, ni se leen ni se envían mensajes aunque se manipule este componente.
 * Los mensajes nuevos de la otra parte llegan por Realtime (requiere el servicio Realtime activo).
 */
export function Chat({ dealId, threadUserId, userId, etiquetaOtro }: { dealId: string; threadUserId: string; userId: string; etiquetaOtro: string }) {
  const sb = useMemo(() => createClient(), []);
  const [msgs, setMsgs] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  const agrega = (m: Mensaje) => setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));

  useEffect(() => {
    let vivo = true;
    sb.from("messages").select("id,sender_id,body,created_at").eq("deal_id", dealId).eq("thread_user_id", threadUserId)
      // Los 200 más RECIENTES (orden descendente) y luego se invierten para mostrarlos de más antiguo a más nuevo.
      .order("created_at", { ascending: false }).limit(200)
      .then(({ data, error }) => { if (!vivo) return; if (error) setError("No se pudieron cargar los mensajes"); else setMsgs([...(data ?? [])].reverse()); });
    const canal = sb.channel(`chat:${dealId}:${threadUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `deal_id=eq.${dealId}` }, (p) => {
        const m = p.new as Mensaje & { thread_user_id: string };
        if (m.thread_user_id === threadUserId) agrega(m);
      }).subscribe();
    return () => { vivo = false; void sb.removeChannel(canal); };
  }, [sb, dealId, threadUserId]);

  useEffect(() => { fin.current?.scrollIntoView?.({ block: "end" }); }, [msgs.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const body = texto.trim();
    if (!body) return;
    setBusy(true); setError(null);
    const { data, error } = await sb.from("messages").insert({ deal_id: dealId, thread_user_id: threadUserId, sender_id: userId, body }).select("id,sender_id,body,created_at").single();
    setBusy(false);
    if (error || !data) return setError("No se pudo enviar el mensaje");
    agrega(data); setTexto("");
  }

  return (
    <div className="space-y-2">
      <div className="h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3" role="log" aria-label={`Conversación con ${etiquetaOtro}`}>
        {msgs.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay mensajes.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`max-w-[80%] rounded-md p-2 text-sm ${m.sender_id === userId ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}>
            <div className="text-[10px] opacity-70">{m.sender_id === userId ? "Tú" : etiquetaOtro} · {new Date(m.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</div>
            <div className="whitespace-pre-wrap break-words">{m.body}</div>
          </div>
        ))}
        <div ref={fin} />
      </div>
      <form onSubmit={enviar} className="flex gap-2">
        <input value={texto} maxLength={4000} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe un mensaje…" aria-label="Mensaje" className="flex-1 rounded-md border border-border p-2 text-sm" />
        <button disabled={busy || !texto.trim()} className="rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">Enviar</button>
      </form>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
