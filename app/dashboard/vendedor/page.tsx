import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MisDeals, type MiDeal } from "@/components/dashboard/mis-deals";
import { SolicitudesPendientes, type Pendiente } from "@/components/dashboard/solicitudes-pendientes";
import { MensajesVendedor, type Hilo } from "@/components/dashboard/mensajes-vendedor";

export const dynamic = "force-dynamic";
const num = (x: unknown) => (x == null ? null : Number(x));

export default async function DashboardVendedor() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/login?next=/dashboard/vendedor");
  const { data: perfil } = await sb.from("profiles").select("rol,nombre,estado_verificacion").eq("id", user.id).maybeSingle();
  if (perfil?.rol === "inversionista") redirect("/dashboard/inversionista");

  const [deals, stats, pendientes, hilos, docs] = await Promise.all([
    sb.from("deals").select("id,titulo,status,segmento,precio,es_ejemplo,motivo_rechazo").eq("seller_id", user.id).order("created_at", { ascending: false }),
    sb.rpc("deals_vendedor_stats"),
    sb.rpc("solicitudes_pendientes_vendedor"),
    sb.rpc("hilos_vendedor"),
    sb.from("deal_documents").select("id,deal_id,nombre,storage_path").order("created_at"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const porDeal = new Map(((stats.data ?? []) as any[]).map((s) => [s.deal_id, s]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docsPorDeal = (id: string) => ((docs.data ?? []) as any[]).filter((d) => d.deal_id === id).map((d) => ({ id: d.id, nombre: d.nombre, storage_path: d.storage_path }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const misDeals: MiDeal[] = ((deals.data ?? []) as any[]).map((d) => {
    const s = porDeal.get(d.id);
    return { id: d.id, titulo: d.titulo, status: d.status, segmento: d.segmento, precio: num(d.precio), es_ejemplo: d.es_ejemplo, motivo_rechazo: d.motivo_rechazo,
      vistas_total: Number(s?.vistas_total ?? 0), vistas_7d: Number(s?.vistas_7d ?? 0), ndas_pendientes: Number(s?.ndas_pendientes ?? 0),
      ndas_aprobados: Number(s?.ndas_aprobados ?? 0), mensajes: Number(s?.mensajes ?? 0), docs: docsPorDeal(d.id) };
  });
  const totales = misDeals.reduce((a, d) => ({ vistas: a.vistas + d.vistas_total, v7: a.v7 + d.vistas_7d, ndas: a.ndas + d.ndas_aprobados }), { vistas: 0, v7: 0, ndas: 0 });
  const activos = misDeals.filter((d) => d.status === "publicado" || d.status === "en_negociacion").length;
  const error = [deals, stats, pendientes, hilos].find((r) => r.error)?.error?.message;

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Panel del vendedor{perfil?.nombre ? ` · ${perfil.nombre}` : ""}</h1>
        {perfil?.estado_verificacion !== "verificado" && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">Tu perfil aún no está verificado; un administrador lo revisará.</p>}
        {error && <p role="alert" className="text-sm text-destructive">Algunos datos no se pudieron cargar: {error}</p>}
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[["Deals activos", activos], ["NDAs por decidir", (pendientes.data ?? []).length], ["Vistas (7 días)", totales.v7], ["NDAs aprobados", totales.ndas]].map(([k, v]) => (
            <div key={String(k)} className="rounded-md border border-border p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-xl font-semibold">{v}</dd></div>
          ))}
        </dl>
      </header>

      <section aria-labelledby="sol"><h2 id="sol" className="mb-3 text-xl font-bold">Solicitudes de NDA</h2><SolicitudesPendientes inicial={(pendientes.data ?? []) as Pendiente[]} /></section>
      <section aria-labelledby="deals"><h2 id="deals" className="mb-3 text-xl font-bold">Mis deals</h2><MisDeals inicial={misDeals} /></section>
      <section aria-labelledby="msgs"><h2 id="msgs" className="mb-3 text-xl font-bold">Mensajes</h2><MensajesVendedor hilos={(hilos.data ?? []) as Hilo[]} userId={user.id} /></section>
    </div>
  );
}
