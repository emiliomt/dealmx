"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GuardarBusqueda({ filtros, hayFiltros, logueado, volver }: { filtros: Record<string, unknown>; hayFiltros: boolean; logueado: boolean; volver: string }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [frecuencia, setFrecuencia] = useState<"diaria" | "semanal">("diaria");
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const btn = "w-full rounded-md border border-primary p-2 text-sm font-medium text-primary";
  if (!logueado) {
    return <a className={`${btn} block text-center`} href={`/auth/login?next=${encodeURIComponent(volver)}`}>Guardar búsqueda y recibir alertas</a>;
  }
  if (!hayFiltros) {
    return <button type="button" disabled className={`${btn} opacity-50`} title="Aplica al menos un filtro">Guardar búsqueda y recibir alertas</button>;
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setEstado(null);
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setBusy(false); return setEstado({ ok: false, texto: "Tu sesión expiró. Vuelve a iniciar sesión." }); }
    const { error } = await sb.from("saved_searches").insert({ user_id: user.id, nombre: nombre.trim() || "Mi búsqueda", filtros, frecuencia });
    setBusy(false);
    setEstado(error ? { ok: false, texto: "No se pudo guardar: " + error.message }
      : { ok: true, texto: "Búsqueda guardada. Puedes administrarla en tu dashboard." });
    if (!error) setAbierto(false);
  }

  return (
    <div className="space-y-2">
      {!abierto && <button type="button" onClick={() => { setAbierto(true); setEstado(null); }} className={btn}>Guardar búsqueda y recibir alertas</button>}
      {abierto && (
        <form onSubmit={guardar} className="space-y-2 rounded-md border border-border p-3">
          <label className="block text-xs">Nombre
            <input value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} placeholder="Naves en Apodaca" className="mt-1 w-full rounded-md border border-border p-2 text-sm" />
          </label>
          <label className="block text-xs">Frecuencia de alerta
            <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as "diaria" | "semanal")} className="mt-1 w-full rounded-md border border-border p-2 text-sm">
              <option value="diaria">Diaria</option><option value="semanal">Semanal</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button disabled={busy} className="flex-1 rounded-md bg-primary p-2 text-sm text-primary-foreground">{busy ? "Guardando…" : "Guardar"}</button>
            <button type="button" onClick={() => setAbierto(false)} className="rounded-md border border-border px-3 text-sm">Cancelar</button>
          </div>
        </form>
      )}
      {estado && <p role="status" className={`text-xs ${estado.ok ? "text-green-700" : "text-destructive"}`}>{estado.texto}</p>}
    </div>
  );
}
