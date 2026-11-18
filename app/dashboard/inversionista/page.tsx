import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DealCard, type DealResumen } from "@/components/deals/deal-card";
import { Kanban, type ItemPipeline } from "@/components/dashboard/kanban";
import { BusquedasGuardadas, type BusquedaGuardada } from "@/components/dashboard/busquedas-guardadas";
import { AccionFavorito } from "@/components/dashboard/accion-favorito";
import { filtrosToParams, parseFiltros } from "@/lib/search/filters";
import { describirFiltros } from "@/lib/search/describir";
import { cargarNombres } from "@/lib/search/nombres";
import { ESTATUS } from "@/lib/catalogos";

export const dynamic = "force-dynamic";
const num = (x: unknown) => (x == null ? null : Number(x));
const ESTADO_NDA: Record<string, string> = { solicitado: "Sin firmar", firmado: "Firmado · esperando al vendedor", aprobado: "Aprobado", rechazado: "Rechazado" };

export default async function DashboardInversionista() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/login?next=/dashboard/inversionista");
  const { data: perfil } = await sb.from("profiles").select("rol,nombre").eq("id", user.id).maybeSingle();
  if (perfil?.rol === "vendedor") redirect("/dashboard/vendedor");

  const COL = "id,titulo,segmento,tipo_operacion,estado_clave,municipio_clave,precio,cap_rate,m2_construccion,m2_terreno,monto_capital_buscado,es_ejemplo,status,deal_photos(path,orden)";
  const [fav, busquedas, ndas, pipe] = await Promise.all([
    sb.from("favorites").select(`created_at,deals(${COL})`).order("created_at", { ascending: false }),
    sb.from("saved_searches").select("id,nombre,filtros,frecuencia,activa").order("created_at", { ascending: false }),
    sb.from("ndas").select("id,estado,firmado_at,deals(id,titulo,status)").order("created_at", { ascending: false }),
    sb.from("pipeline_items").select("id,deal_id,etapa,notas,deals(titulo,segmento,precio)").order("updated_at", { ascending: false }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dealsFav = ((fav.data ?? []) as any[]).map((f) => f.deals).filter(Boolean);
  const nombres = await cargarNombres(sb, dealsFav);
  const favoritos: DealResumen[] = dealsFav.map((d) => ({
    id: d.id, titulo: d.titulo, segmento: d.segmento, tipo_operacion: d.tipo_operacion,
    municipio_nombre: nombres.municipio(d.estado_clave, d.municipio_clave), estado_nombre: nombres.estado(d.estado_clave),
    precio: num(d.precio), cap_rate: num(d.cap_rate), m2_construccion: num(d.m2_construccion), m2_terreno: num(d.m2_terreno),
    monto_capital_buscado: num(d.monto_capital_buscado), es_ejemplo: d.es_ejemplo,
    foto: [...(d.deal_photos ?? [])].sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden)[0]?.path ?? null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = (busquedas.data ?? []) as any[];
  const filtrosParseados = filas.map((b) => parseFiltros(b.filtros ?? {}));
  const nb = await cargarNombres(sb, filtrosParseados.filter((f) => f.estado).map((f) => ({ estado_clave: f.estado!, municipio_clave: f.municipio ?? "000" })));
  const guardadas: BusquedaGuardada[] = filas.map((b, i) => {
    const f = filtrosParseados[i];
    const qs = filtrosToParams(f).toString();
    return { id: b.id, nombre: b.nombre, frecuencia: b.frecuencia, activa: b.activa,
      resumen: describirFiltros(f, { estado: f.estado ? nb.estado(f.estado) : undefined, municipio: f.estado && f.municipio ? nb.municipio(f.estado, f.municipio) : undefined }),
      href: qs ? `/buscar?${qs}` : "/buscar" };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: ItemPipeline[] = ((pipe.data ?? []) as any[]).filter((p) => p.deals).map((p) => ({
    id: p.id, deal_id: p.deal_id, etapa: p.etapa, notas: p.notas, titulo: p.deals.titulo, segmento: p.deals.segmento, precio: num(p.deals.precio),
  }));

  const error = [fav, busquedas, ndas, pipe].find((r) => r.error)?.error?.message;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listaNdas = ((ndas.data ?? []) as any[]).filter((n) => n.deals);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-bold">Mi panel{perfil?.nombre ? ` · ${perfil.nombre}` : ""}</h1>
        {error && <p role="alert" className="mt-2 text-sm text-destructive">Algunos datos no se pudieron cargar: {error}</p>}
      </header>

      <section aria-labelledby="pipe"><h2 id="pipe" className="mb-3 text-xl font-bold">Pipeline</h2><Kanban inicial={items} /></section>

      <section aria-labelledby="ndas"><h2 id="ndas" className="mb-3 text-xl font-bold">Mis NDAs</h2>
        {listaNdas.length === 0 ? <p className="text-sm text-muted-foreground">Aún no has firmado NDAs.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {listaNdas.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <a className="font-medium underline" href={`/deal/${n.deals.id}`}>{n.deals.titulo}</a>
                <span className="text-xs text-muted-foreground">{ESTADO_NDA[n.estado] ?? n.estado}{n.deals.status === "cerrado" ? ` · deal ${ESTATUS.cerrado.toLowerCase()}` : ""}{n.firmado_at ? ` · ${new Date(n.firmado_at).toLocaleDateString("es-MX", { dateStyle: "medium" })}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="busq"><h2 id="busq" className="mb-3 text-xl font-bold">Búsquedas guardadas</h2><BusquedasGuardadas inicial={guardadas} /></section>

      <section aria-labelledby="favs"><h2 id="favs" className="mb-3 text-xl font-bold">Favoritos</h2>
        {favoritos.length === 0 ? <p className="text-sm text-muted-foreground">Aún no tienes favoritos. Guarda deals desde su ficha.</p> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {favoritos.map((d) => <div key={d.id} className="space-y-1"><DealCard d={d} /><AccionFavorito dealId={d.id} userId={user.id} /></div>)}
          </div>
        )}
      </section>
    </div>
  );
}
