import { createClient } from "@/lib/supabase/server";
import { DealCard, type DealResumen } from "@/components/deals/deal-card";
import { SEGMENTOS, TIPOS_OPERACION } from "@/lib/catalogos";
import { cargarNombres } from "@/lib/search/nombres";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sb = createClient();
  const [{ data: deals, error: errDeals }, { data: estados, error: errEstados }] = await Promise.all([
    sb.from("deals").select("id,titulo,segmento,tipo_operacion,estado_clave,municipio_clave,precio,cap_rate,m2_construccion,m2_terreno,monto_capital_buscado,es_ejemplo,deal_photos(path,orden)")
      .in("status", ["publicado"]).order("published_at", { ascending: false, nullsFirst: false }).limit(6),
    sb.from("inegi_estados").select("clave,nombre").order("nombre"),
  ]);
  // Un esquema ausente (migraciones sin aplicar), una llave inválida o una red caída NO deben parecer "no hay deals":
  // el detalle va al log del servidor y al visitante se le muestra un aviso genérico (sin mensajes internos).
  const fallo = errDeals ?? errEstados;
  if (fallo) console.error("[home] no se pudieron cargar los datos de la portada:", fallo.message);
  const filas = deals ?? [];
  const nombres = await cargarNombres(sb, filas);
  const num = (x: unknown) => (x == null ? null : Number(x));
  const resumen: DealResumen[] = filas.map((d) => ({
    id: d.id, titulo: d.titulo, segmento: d.segmento, tipo_operacion: d.tipo_operacion,
    municipio_nombre: nombres.municipio(d.estado_clave, d.municipio_clave), estado_nombre: nombres.estado(d.estado_clave),
    precio: num(d.precio), cap_rate: num(d.cap_rate), m2_construccion: num(d.m2_construccion), m2_terreno: num(d.m2_terreno),
    monto_capital_buscado: num(d.monto_capital_buscado), es_ejemplo: d.es_ejemplo,
    foto: [...(d.deal_photos ?? [])].sort((a, b) => a.orden - b.orden)[0]?.path ?? null,
  }));
  const sel = "mt-1 w-full rounded-md border border-border p-2 text-sm";

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Oportunidades de inversión inmobiliaria en México</h1>
        <p className="text-muted-foreground">Teasers públicos; dirección exacta y documentos tras un NDA aprobado.</p>
        <form action="/buscar" method="get" className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-4" aria-label="Buscador">
          <label className="text-xs">Estado
            <select name="estado" className={sel}><option value="">Todos</option>{(estados ?? []).map((e) => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}</select>
          </label>
          <label className="text-xs">Segmento
            <select name="segmento" className={sel}><option value="">Todos</option>{Object.entries(SEGMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="text-xs">Operación
            <select name="operacion" className={sel}><option value="">Todas</option>{Object.entries(TIPOS_OPERACION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <button className="self-end rounded-md bg-primary p-2 text-primary-foreground">Buscar</button>
        </form>
      </section>
      <section aria-label="Segmentos" className="flex flex-wrap gap-2">
        {Object.entries(SEGMENTOS).map(([k, v]) => (
          <a key={k} href={`/buscar?segmento=${k}`} className="rounded-full border border-border px-4 py-1 text-sm hover:bg-muted">{v}</a>
        ))}
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">Deals destacados</h2>
        {fallo && <p role="alert" className="text-sm text-destructive">No pudimos cargar los deals. Intenta de nuevo en unos minutos.</p>}
        {resumen.length > 0
          ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{resumen.map((d) => <DealCard key={d.id} d={d} />)}</div>
          : !fallo && <p className="text-muted-foreground">Aún no hay deals publicados.</p>}
      </section>
    </div>
  );
}
