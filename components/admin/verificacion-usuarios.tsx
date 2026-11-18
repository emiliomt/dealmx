"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type EstadoVerif = "pendiente" | "verificado" | "rechazado";
export interface UsuarioVerif { id: string; rol: string; nombre: string; empresa: string | null; telefono: string | null; registro_asesor: string | null; estado_registro: string | null; estado: EstadoVerif; nota: string | null; creado: string }

export function VerificacionUsuarios({ inicial }: { inicial: UsuarioVerif[] }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [lista, setLista] = useState(inicial);
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decidir(u: UsuarioVerif, estado: EstadoVerif, texto: string | null) {
    setError(null); setBusy(u.id);
    const { error } = await sb.rpc("verificar_usuario", { p_user: u.id, p_estado: estado, p_nota: texto });
    setBusy(null);
    if (error) return setError(`No se pudo actualizar a ${u.nombre || "el usuario"}: ${error.message}`);
    setLista((l) => l.filter((x) => x.id !== u.id)); // sale de este filtro; al recargar aparece en el que corresponda
    setRechazando(null); setNota("");
    router.refresh();
  }

  if (lista.length === 0) return <p className="text-sm text-muted-foreground">No hay usuarios en este filtro.</p>;
  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {lista.map((u) => (
          <li key={u.id} className="space-y-2 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{u.nombre || "Sin nombre"}{u.empresa ? ` · ${u.empresa}` : ""} <span className="rounded bg-muted px-1 text-xs font-normal">{u.rol}</span></div>
                <div className="text-xs text-muted-foreground">
                  {u.telefono ? `Tel. ${u.telefono}` : "Sin teléfono"}
                  {u.registro_asesor ? ` · Reg. asesor ${u.registro_asesor}${u.estado_registro ? ` (${u.estado_registro})` : ""}` : ""}
                  {` · alta ${new Date(u.creado).toLocaleDateString("es-MX", { dateStyle: "medium" })}`}
                </div>
                {u.nota && <div className="text-xs text-muted-foreground">Nota: {u.nota}</div>}
              </div>
              <div className="flex gap-2">
                {u.estado !== "verificado" && <button disabled={busy === u.id} onClick={() => decidir(u, "verificado", null)} className="rounded-md bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50">Verificar</button>}
                {u.estado !== "rechazado" && <button disabled={busy === u.id} onClick={() => { setRechazando(rechazando === u.id ? null : u.id); setNota(""); }} className="rounded-md border border-border px-3 py-1 disabled:opacity-50">{u.estado === "verificado" ? "Revocar…" : "Rechazar…"}</button>}
                {u.estado === "verificado" && <button disabled={busy === u.id} onClick={() => decidir(u, "pendiente", null)} className="rounded-md border border-border px-3 py-1 disabled:opacity-50">Volver a pendiente</button>}
              </div>
            </div>
            {rechazando === u.id && (
              <div className="space-y-2 rounded-md bg-muted p-2">
                <label className="block text-xs">Motivo (lo verá el usuario)
                  <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} className="mt-1 w-full rounded border border-border p-1 text-sm" />
                </label>
                <button disabled={busy === u.id || nota.trim().length < 3} onClick={() => decidir(u, "rechazado", nota.trim())} className="rounded-md bg-destructive px-3 py-1 text-xs text-destructive-foreground disabled:opacity-50">Confirmar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
