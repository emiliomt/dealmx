import { createClient } from "@/lib/supabase/server";
import { DealCard, type DealResumen } from "@/components/deals/deal-card";
import { SEGMENTOS } from "@/lib/catalogos";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sb = createClient();
  const [{ data: deals }, { data: munis }, { data: estados }] = await Promise.all([
    sb.from("deals").select("id,titulo,segmento,tipo_operacion,estado_clave,municipio_clave,precio,cap_rate,m2_construccion,m2_terreno,monto_capital_buscado,es_ejemplo,deal_photos(path,orden)")
      .eq("status", "publicado").order("published_at", { ascending: false }).limit(6),
    sb.from("inegi_municipios").select("estado_clave,clave,nombre").in("estado_clave", ["19", "05"]),
    sb.from("inegi_estados").select("clave,nombre"),
  ]);
  const muniNombre = (e: string, m: string) => munis?.find((x) => x.estado_clave === e && x.clave === m)?.nombre;
  const estNombre = (e: string) => estados?.find((x) => x.clave === e)?.nombre;
  const resumen: DealResumen[] = (deals ?? []).map((d: any) => ({
    ...d, precio: d.precio != null ? Number(d.precio) : null, cap_rate: d.cap_rate != null ? Number(d.cap_rate) : null,
    m2_construccion: d.m2_construccion != null ? Number(d.m2_construccion) : null, m2_terreno: d.m2_terreno != null ? Number(d.m2_terreno) : null,
    monto_capital_buscado: d.monto_capital_buscado != null ? Number(d.monto_capital_buscado) : null,
    municipio_nombre: muniNombre(d.estado_clave, d.municipio_clave), estado_nombre: estNombre(d.estado_clave),
    foto: [...(d.deal_photos ?? [])].sort((a: any, b: any) => a.orden - b.orden)[0]?.path ?? null,
  }));

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-bold">Oportunidades de inversión inmobiliaria en México</h1>
        <p className="mt-2 text-muted-foreground">Teasers públicos; dirección exacta y documentos tras un NDA aprobado.</p>
        <p className="mt-2 text-sm text-muted-foreground">El buscador con filtros y mapa llega en la Fase 3.</p>
      </section>
      <section aria-label="Segmentos" className="flex flex-wrap gap-2">
        {Object.entries(SEGMENTOS).map(([k, v]) => (
          <a key={k} href={`/buscar?segmento=${k}`} className="rounded-full border border-border px-4 py-1 text-sm hover:bg-muted">{v}</a>
        ))}
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">Deals destacados</h2>
        {resumen.length === 0 ? <p className="text-muted-foreground">Aún no hay deals publicados.</p> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{resumen.map((d) => <DealCard key={d.id} d={d} />)}</div>
        )}
      </section>
    </div>
  );
}
