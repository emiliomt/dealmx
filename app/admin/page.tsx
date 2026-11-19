import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ColaModeracion, type DealEnCola } from "@/components/admin/cola-moderacion";
import { VerificacionUsuarios, type EstadoVerif, type UsuarioVerif } from "@/components/admin/verificacion-usuarios";
import { senalesModeracion } from "@/lib/moderacion";
import { cargarNombres } from "@/lib/search/nombres";

export const dynamic = "force-dynamic";
const num = (x: unknown) => (x == null ? null : Number(x));
/** `deal_private` llega como objeto (relación 1:1) o null; se tolera también un arreglo. */
function privadosCompletos(p: unknown): boolean {
  const f = (Array.isArray(p) ? p[0] : p) as { direccion_exacta?: string | null; descripcion_completa?: string | null; lat?: unknown; lng?: unknown } | null | undefined;
  return !!f && !!f.direccion_exacta?.trim() && !!f.descripcion_completa?.trim();
}
function sinCoordenadas(p: unknown): boolean {
  const f = (Array.isArray(p) ? p[0] : p) as { lat?: unknown; lng?: unknown } | null | undefined;
  return !f || f.lat == null || f.lng == null;
}
const FILTROS: EstadoVerif[] = ["pendiente", "verificado", "rechazado"];
const ETIQ_ACCION: Record<string, string> = { aprobar: "aprobó", rechazar: "rechazó", despublicar: "despublicó", reabrir: "reabrió el NDA de", verificado: "verificó a", rechazado: "rechazó la verificación de", pendiente: "regresó a pendiente a" };

export default async function Admin({ searchParams }: { searchParams: { verif?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) notFound(); // el middleware ya redirige a login; esto cubre cualquier otro camino
  const { data: perfil } = await sb.from("profiles").select("rol,nombre").eq("id", user.id).maybeSingle();
  if (perfil?.rol !== "admin") notFound(); // no se revela que la sección existe

  const filtro = (FILTROS as string[]).includes(searchParams.verif ?? "") ? (searchParams.verif as EstadoVerif) : "pendiente";
  const [resumen, cola, usuarios, auditoria] = await Promise.all([
    sb.rpc("admin_resumen"),
    sb.from("deals").select("id,titulo,segmento,tipo_operacion,estado_clave,municipio_clave,precio,noi_anual,renta_mensual_actual,ocupacion_pct,tir_proyectada,cap_rate,zona_restringida,regimen_propiedad,descripcion_teaser,es_ejemplo,updated_at,motivo_rechazo,vendedor:profiles!seller_id(nombre,empresa,estado_verificacion),deal_photos(id),deal_documents(id),deal_private(direccion_exacta,descripcion_completa,lat,lng)")
      .eq("status", "en_revision").order("updated_at", { ascending: true }).limit(100),
    sb.from("profiles").select("id,rol,nombre,empresa,telefono,registro_asesor,estado_registro,estado_verificacion,nota_verificacion,created_at")
      .eq("estado_verificacion", filtro).neq("rol", "admin").order("created_at", { ascending: false }).limit(100),
    sb.from("admin_audit").select("id,created_at,entidad,accion,detalle,admin:profiles!admin_id(nombre)").order("created_at", { ascending: false }).limit(15),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filasCola = (cola.data ?? []) as any[];
  const nombres = await cargarNombres(sb, filasCola);
  const enCola: DealEnCola[] = filasCola.map((d) => ({
    id: d.id, titulo: d.titulo, segmento: d.segmento, tipo_operacion: d.tipo_operacion,
    lugar: [nombres.municipio(d.estado_clave, d.municipio_clave), nombres.estado(d.estado_clave)].filter(Boolean).join(", "),
    precio: num(d.precio), cap_rate: num(d.cap_rate), vendedor: [d.vendedor?.nombre, d.vendedor?.empresa].filter(Boolean).join(" · ") || "—",
    es_ejemplo: d.es_ejemplo, enviado: d.updated_at, motivoPrevio: d.motivo_rechazo,
    senales: senalesModeracion(
      { precio: num(d.precio), noi_anual: num(d.noi_anual), renta_mensual_actual: num(d.renta_mensual_actual), ocupacion_pct: num(d.ocupacion_pct), tir_proyectada: num(d.tir_proyectada),
        zona_restringida: d.zona_restringida, regimen_propiedad: d.regimen_propiedad, descripcion_teaser: d.descripcion_teaser ?? "" },
      { fotos: d.deal_photos?.length ?? 0, documentos: d.deal_documents?.length ?? 0, vendedorVerificado: d.vendedor?.estado_verificacion === "verificado", datosPrivadosCompletos: privadosCompletos(d.deal_private), sinCoordenadas: sinCoordenadas(d.deal_private) },
    ),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usrs: UsuarioVerif[] = ((usuarios.data ?? []) as any[]).map((u) => ({ id: u.id, rol: u.rol, nombre: u.nombre, empresa: u.empresa, telefono: u.telefono, registro_asesor: u.registro_asesor, estado_registro: u.estado_registro, estado: u.estado_verificacion, nota: u.nota_verificacion, creado: u.created_at }));
  const r = (resumen.data ?? {}) as { deals?: Record<string, number>; usuarios?: Record<string, number>; ndas_firmados?: number };
  const error = [resumen, cola, usuarios, auditoria].find((x) => x.error)?.error?.message;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold">Administración{perfil?.nombre ? ` · ${perfil.nombre}` : ""}</h1>
        {error && <p role="alert" className="text-sm text-destructive">Algunos datos no se pudieron cargar: {error}</p>}
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[["En revisión", r.deals?.en_revision ?? 0], ["Publicados", (r.deals?.publicado ?? 0) + (r.deals?.en_negociacion ?? 0)], ["Usuarios por verificar", r.usuarios?.pendiente ?? 0], ["NDAs por decidir", r.ndas_firmados ?? 0]].map(([k, v]) => (
            <div key={String(k)} className="rounded-md border border-border p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-xl font-semibold">{v}</dd></div>
          ))}
        </dl>
      </header>

      <section aria-labelledby="cola"><h2 id="cola" className="mb-3 text-xl font-bold">Cola de moderación</h2><ColaModeracion inicial={enCola} /></section>

      <section aria-labelledby="usr">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="usr" className="text-xl font-bold">Verificación de usuarios</h2>
          <nav className="flex gap-2 text-sm" aria-label="Filtro de verificación">
            {FILTROS.map((f) => <Link key={f} href={`/admin?verif=${f}`} aria-current={f === filtro ? "page" : undefined} className={`rounded-full border px-3 py-1 ${f === filtro ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{f === "pendiente" ? "Pendientes" : f === "verificado" ? "Verificados" : "Rechazados"}{f === filtro ? "" : ""}</Link>)}
          </nav>
        </div>
        <VerificacionUsuarios key={filtro} inicial={usrs} />
      </section>

      <section aria-labelledby="aud">
        <h2 id="aud" className="mb-3 text-xl font-bold">Actividad reciente</h2>
        {(auditoria.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Sin actividad todavía.</p> : (
          <ul className="space-y-1 text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {((auditoria.data ?? []) as any[]).map((a) => (
              <li key={a.id} className="text-muted-foreground">
                {new Date(a.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })} — {a.admin?.nombre || "Admin"} {ETIQ_ACCION[a.accion] ?? a.accion}{" "}
                {a.entidad === "deal" ? <>el deal <em>{a.detalle?.titulo ?? ""}</em></> : a.entidad === "usuario" ? <>{a.detalle?.nombre ?? "un usuario"}</> : "un NDA"}
                {a.detalle?.motivo ? <> · “{a.detalle.motivo}”</> : a.detalle?.nota ? <> · “{a.detalle.nota}”</> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
