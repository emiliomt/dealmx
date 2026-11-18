import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DealCard, type DealResumen } from "@/components/deals/deal-card";
import { FiltrosForm } from "@/components/search/filtros-form";
import { GuardarBusqueda } from "@/components/search/guardar-busqueda";
import { MapaDeals, type Punto } from "@/components/map/mapa-deals";
import { POR_PAGINA, filtrosToJson, filtrosToParams, parseFiltros, tieneFiltros } from "@/lib/search/filters";
import { COLUMNAS_LISTA, COLUMNAS_MAPA, aplicarFiltros, aplicarOrden } from "@/lib/search/query";
import { cargarNombres } from "@/lib/search/nombres";

export const dynamic = "force-dynamic";
const MAX_PUNTOS_MAPA = 500;
const n = (x: unknown) => (x == null ? null : Number(x));

export default async function Buscar({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const f = parseFiltros(searchParams);
  const sb = createClient();
  const desde = (f.pagina - 1) * POR_PAGINA;

  const [lista, mapa, estados, municipios, { data: { user } }] = await Promise.all([
    aplicarOrden(aplicarFiltros(sb.from("deals").select(COLUMNAS_LISTA, { count: "exact" }), f), f.orden).range(desde, desde + POR_PAGINA - 1),
    aplicarFiltros(sb.from("deals").select(COLUMNAS_MAPA), f).not("lat_aprox", "is", null).limit(MAX_PUNTOS_MAPA),
    sb.from("inegi_estados").select("clave,nombre").order("nombre"),
    f.estado ? sb.from("inegi_municipios").select("clave,nombre").eq("estado_clave", f.estado).order("nombre") : Promise.resolve({ data: [] as { clave: string; nombre: string }[] }),
    sb.auth.getUser(),
  ]);

  const filas = lista.data ?? [];
  const total = lista.count ?? 0;
  const nombres = await cargarNombres(sb, filas);
  const deals: DealResumen[] = filas.map((d) => ({
    id: d.id, titulo: d.titulo, segmento: d.segmento, tipo_operacion: d.tipo_operacion,
    municipio_nombre: nombres.municipio(d.estado_clave, d.municipio_clave), estado_nombre: nombres.estado(d.estado_clave),
    precio: n(d.precio), cap_rate: n(d.cap_rate), m2_construccion: n(d.m2_construccion), m2_terreno: n(d.m2_terreno),
    monto_capital_buscado: n(d.monto_capital_buscado), es_ejemplo: d.es_ejemplo,
    foto: [...(d.deal_photos ?? [])].sort((a, b) => a.orden - b.orden)[0]?.path ?? null,
  }));
  const puntos: Punto[] = (mapa.data ?? []).map((d) => ({ id: d.id, titulo: d.titulo, segmento: d.segmento, precio: n(d.precio), lat: Number(d.lat_aprox), lng: Number(d.lng_aprox) }));

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const hrefPagina = (p: number) => { const q = filtrosToParams({ ...f, pagina: p }).toString(); return q ? `/buscar?${q}` : "/buscar"; };
  const urlActual = hrefPagina(1);
  const error = lista.error?.message ?? mapa.error?.message;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <FiltrosForm inicial={f} estados={estados.data ?? []} municipiosIniciales={municipios.data ?? []} />
        <GuardarBusqueda filtros={filtrosToJson(f)} hayFiltros={tieneFiltros(f)} logueado={!!user} volver={urlActual} />
        {error && <p role="alert" className="text-sm text-destructive">No se pudo cargar la búsqueda: {error}</p>}
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {total === 0 ? "Sin resultados con estos filtros." : `${total.toLocaleString("es-MX")} oportunidad${total === 1 ? "" : "es"}`}
          {puntos.length >= MAX_PUNTOS_MAPA && ` · el mapa muestra las primeras ${MAX_PUNTOS_MAPA}`}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">{deals.map((d) => <DealCard key={d.id} d={d} />)}</div>
        {paginas > 1 && (
          <nav className="flex items-center justify-between text-sm" aria-label="Paginación">
            {f.pagina > 1 ? <Link className="underline" href={hrefPagina(f.pagina - 1)}>← Anterior</Link> : <span />}
            <span>Página {f.pagina} de {paginas}</span>
            {f.pagina < paginas ? <Link className="underline" href={hrefPagina(f.pagina + 1)}>Siguiente →</Link> : <span />}
          </nav>
        )}
      </div>
      <div className="order-first h-[45vh] lg:order-none lg:sticky lg:top-4 lg:h-[calc(100vh-6rem)]">
        <MapaDeals puntos={puntos} className="h-full w-full overflow-hidden rounded-lg border border-border" />
        <p className="mt-1 text-xs text-muted-foreground">Ubicaciones aproximadas (±1–2 km). La dirección exacta se revela con un NDA aprobado.</p>
      </div>
    </div>
  );
}
