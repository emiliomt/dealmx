"use client";
import { useState } from "react";
import { Chat } from "@/components/chat/chat";

export interface Hilo { deal_id: string; titulo: string; thread_user_id: string; nombre: string; empresa: string | null; ultimo_body: string; ultimo_sender: string; ultimo_at: string; total: number }

export function MensajesVendedor({ hilos, userId }: { hilos: Hilo[]; userId: string }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const clave = (h: Hilo) => `${h.deal_id}:${h.thread_user_id}`;
  const actual = hilos.find((h) => clave(h) === abierto);
  if (hilos.length === 0) return <p className="text-sm text-muted-foreground">Aún no hay conversaciones. El chat se habilita al aprobar un NDA.</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {hilos.map((h) => (
          <li key={clave(h)}>
            <button type="button" onClick={() => setAbierto(abierto === clave(h) ? null : clave(h))} aria-expanded={abierto === clave(h)} className="flex w-full flex-col items-start gap-0.5 p-3 text-left text-sm hover:bg-muted">
              <span className="font-medium">{h.nombre || "Inversionista"}{h.empresa ? ` · ${h.empresa}` : ""} <span className="font-normal text-muted-foreground">— {h.titulo}</span></span>
              <span className="text-xs text-muted-foreground">{h.ultimo_sender === userId ? "Tú: " : ""}{h.ultimo_body} · {new Date(h.ultimo_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</span>
            </button>
          </li>
        ))}
      </ul>
      {actual && <Chat key={clave(actual)} dealId={actual.deal_id} threadUserId={actual.thread_user_id} userId={userId} etiquetaOtro={actual.nombre || "Inversionista"} />}
    </div>
  );
}
