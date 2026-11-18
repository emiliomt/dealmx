"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ORDENES, filtrosToParams, parseFiltros, type Filtros } from "@/lib/search/filters";
import { SEGMENTOS, TIPOS_OPERACION } from "@/lib/catalogos";

type Estado = { clave: string; nombre: string };
const c = "mt-1 w-full rounded-md border border-border p-2 text-sm";
const str = (n: number | undefined) => (n === undefined ? "" : String(n));

export function FiltrosForm({ inicial, estados, municipiosIniciales }: { inicial: Filtros; estados: Estado[]; municipiosIniciales: Estado[] }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [v, setV] = useState({
    estado: inicial.estado ?? "", municipio: inicial.municipio ?? "",
    segmento: inicial.segmento as string[], operacion: inicial.operacion as string[],
    precio_min: str(inicial.precio_min), precio_max: str(inicial.precio_max), cap_min: str(inicial.cap_min),
    m2_min: str(inicial.m2_min), m2_max: str(inicial.m2_max), ocup_min: str(inicial.ocup_min),
    renta: inicial.solo_renta, orden: inicial.orden as string,
  });
  const [munis, setMunis] = useState(municipiosIniciales);

  // Si la URL cambia (atrás/adelante, limpiar) se sincroniza el formulario.
  useEffect(() => {
    setV({ estado: inicial.estado ?? "", municipio: inicial.municipio ?? "", segmento: inicial.segmento, operacion: inicial.operacion,
      precio_min: str(inicial.precio_min), precio_max: str(inicial.precio_max), cap_min: str(inicial.cap_min),
      m2_min: str(inicial.m2_min), m2_max: str(inicial.m2_max), ocup_min: str(inicial.ocup_min), renta: inicial.solo_renta, orden: inicial.orden });
    setMunis(municipiosIniciales);
  }, [inicial, municipiosIniciales]);

  async function cambiaEstado(clave: string) {
    setV((p) => ({ ...p, estado: clave, municipio: "" }));
    if (!clave) return setMunis([]);
    const { data } = await sb.from("inegi_municipios").select("clave,nombre").eq("estado_clave", clave).order("nombre");
    setMunis(data ?? []);
  }
  const toggle = (k: "segmento" | "operacion", val: string) =>
    setV((p) => ({ ...p, [k]: p[k].includes(val) ? p[k].filter((x) => x !== val) : [...p[k], val] }));

  function aplicar(e?: React.FormEvent) {
    e?.preventDefault();
    const f = parseFiltros({ ...v, renta: v.renta ? "1" : undefined, pagina: 1 });
    const qs = filtrosToParams(f).toString();
    router.push(qs ? `/buscar?${qs}` : "/buscar");
  }

  const num = (k: keyof typeof v, label: string, ph?: string) => (
    <label className="block text-xs">{label}
      <input type="number" min={0} inputMode="decimal" placeholder={ph} className={c} value={String(v[k])} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} />
    </label>
  );

  return (
    <form onSubmit={aplicar} className="space-y-3 rounded-lg border border-border p-3" aria-label="Filtros de búsqueda">
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">Estado
          <select className={c} value={v.estado} onChange={(e) => cambiaEstado(e.target.value)}>
            <option value="">Todos</option>{estados.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
          </select>
        </label>
        <label className="block text-xs">Municipio
          <select className={c} value={v.municipio} disabled={!v.estado} onChange={(e) => setV((p) => ({ ...p, municipio: e.target.value }))}>
            <option value="">Todos</option>{munis.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
          </select>
        </label>
      </div>
      <fieldset><legend className="text-xs">Segmento</legend>
        <div className="mt-1 flex flex-wrap gap-2">{Object.entries(SEGMENTOS).map(([k, n]) => (
          <label key={k} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
            <input type="checkbox" checked={v.segmento.includes(k)} onChange={() => toggle("segmento", k)} />{n}</label>))}</div>
      </fieldset>
      <fieldset><legend className="text-xs">Tipo de operación</legend>
        <div className="mt-1 flex flex-wrap gap-2">{Object.entries(TIPOS_OPERACION).map(([k, n]) => (
          <label key={k} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
            <input type="checkbox" checked={v.operacion.includes(k)} onChange={() => toggle("operacion", k)} />{n}</label>))}</div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        {num("precio_min", "Precio mín. (MXN)")}{num("precio_max", "Precio máx. (MXN)")}
        {num("m2_min", "m² mín.")}{num("m2_max", "m² máx.")}
        {num("cap_min", "Cap rate mín. (%)", "8")}{num("ocup_min", "Ocupación mín. (%)", "90")}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.renta} onChange={(e) => setV((p) => ({ ...p, renta: e.target.checked }))} />Solo con renta</label>
      <label className="block text-xs">Ordenar por
        <select className={c} value={v.orden} onChange={(e) => setV((p) => ({ ...p, orden: e.target.value }))}>
          {Object.entries(ORDENES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <button className="flex-1 rounded-md bg-primary p-2 text-sm text-primary-foreground">Aplicar filtros</button>
        <button type="button" onClick={() => router.push("/buscar")} className="rounded-md border border-border px-3 text-sm">Limpiar</button>
      </div>
    </form>
  );
}
