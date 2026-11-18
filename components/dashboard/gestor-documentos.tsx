"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Doc { id: string; nombre: string; storage_path: string }
const MAX = 25 * 1024 * 1024;

/** Alta y baja de documentos del data room de un deal ya creado (políticas de Storage: solo el dueño escribe). */
export function GestorDocumentos({ dealId, inicial }: { dealId: string; inicial: Doc[] }) {
  const sb = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState(inicial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function subir(files: FileList | null) {
    if (!files?.length) return;
    setMsg(null); setBusy(true);
    const fallos: string[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX) { fallos.push(`${f.name} (excede 25 MB)`); continue; }
      const path = `${dealId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
      const up = await sb.storage.from("data-room").upload(path, f, { contentType: f.type || undefined });
      if (up.error) { fallos.push(f.name); continue; }
      const { data, error } = await sb.from("deal_documents").insert({ deal_id: dealId, storage_path: path, nombre: f.name, tipo: f.type || null }).select("id,nombre,storage_path").single();
      if (error || !data) { await sb.storage.from("data-room").remove([path]); fallos.push(f.name); continue; }
      setDocs((d) => [...d, data]);
    }
    setBusy(false);
    if (fallos.length) setMsg(`No se pudieron subir: ${fallos.join(", ")}`);
  }

  async function quitar(d: Doc) {
    if (!confirm(`¿Eliminar "${d.nombre}" del data room?`)) return;
    setMsg(null);
    const { error } = await sb.from("deal_documents").delete().eq("id", d.id);
    if (error) return setMsg("No se pudo eliminar el documento");
    await sb.storage.from("data-room").remove([d.storage_path]);
    setDocs((x) => x.filter((y) => y.id !== d.id));
  }

  return (
    <div className="space-y-2 text-sm">
      <ul className="space-y-1">
        {docs.length === 0 && <li className="text-muted-foreground">Sin documentos.</li>}
        {docs.map((d) => <li key={d.id} className="flex items-center justify-between gap-2"><a className="underline" href={`/api/deals/${dealId}/documentos/${d.id}`}>{d.nombre}</a><button type="button" onClick={() => quitar(d)} className="text-xs text-destructive underline">Eliminar</button></li>)}
      </ul>
      <label className="block text-xs">Agregar documentos (máx. 25 MB c/u)
        <input type="file" multiple disabled={busy} onChange={(e) => { void subir(e.target.files); e.target.value = ""; }} className="mt-1 block w-full text-xs" />
      </label>
      {msg && <p role="alert" className="text-xs text-destructive">{msg}</p>}
    </div>
  );
}
