"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface BusquedaGuardada { id: string; nombre: string; frecuencia: "diaria" | "semanal"; activa: boolean; resumen: string; href: string; ultimoEnvio?: string | null }

export function BusquedasGuardadas({ inicial }: { inicial: BusquedaGuardada[] }) {
  const sb = useMemo(() => createClient(), []);
  const [lista, setLista] = useState(inicial);
  const [error, setError] = useState<string | null>(null);

  async function actualizar(id: string, cambios: Partial<Pick<BusquedaGuardada, "frecuencia" | "activa">>) {
    setError(null);
    const antes = lista;
    setLista((l) => l.map((b) => (b.id === id ? { ...b, ...cambios } : b)));
    const { data, error } = await sb.from("saved_searches").update(cambios).eq("id", id).select("id");
    if (error || !data?.length) { setLista(antes); setError("No se pudo actualizar la búsqueda"); }
  }
  async function borrar(id: string) {
    if (!confirm("¿Eliminar esta búsqueda guardada?")) return;
    setError(null);
    const antes = lista;
    setLista((l) => l.filter((b) => b.id !== id));
    const { error } = await sb.from("saved_searches").delete().eq("id", id);
    if (error) { setLista(antes); setError("No se pudo eliminar la búsqueda"); }
  }

  if (lista.length === 0) return <p className="text-sm text-muted-foreground">No tienes búsquedas guardadas. Usa “Guardar búsqueda y recibir alertas” en <a className="underline" href="/buscar">Buscar</a>.</p>;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {lista.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div className="min-w-0">
              <a className="font-medium underline" href={b.href}>{b.nombre}</a>
              <div className="text-xs text-muted-foreground">{b.resumen}</div>
              <div className="text-xs text-muted-foreground">{b.activa ? (b.ultimoEnvio ? `Último correo: ${new Date(b.ultimoEnvio).toLocaleDateString("es-MX", { dateStyle: "medium" })}` : "Sin correos enviados aún") : "Alertas en pausa"}</div>
            </div>
            <div className="flex items-center gap-2">
              <select aria-label={`Frecuencia de ${b.nombre}`} value={b.frecuencia} onChange={(e) => actualizar(b.id, { frecuencia: e.target.value as "diaria" | "semanal" })} className="rounded border border-border p-1 text-xs">
                <option value="diaria">Diaria</option><option value="semanal">Semanal</option>
              </select>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={b.activa} onChange={(e) => actualizar(b.id, { activa: e.target.checked })} />Alertas</label>
              <button type="button" onClick={() => borrar(b.id)} className="text-xs text-destructive underline">Eliminar</button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
