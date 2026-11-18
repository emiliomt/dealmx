import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Money } from "@/components/money-provider";
import { Calculadora } from "@/components/calculator/calculator";
import { BadgeEjemplo } from "@/components/deals/deal-card";
import { ViewTracker } from "@/components/deals/view-tracker";
import { NdaPanel, type EstadoNda } from "@/components/nda/nda-panel";
import { PanelVendedor, type Solicitante, type Vistas } from "@/components/nda/panel-vendedor";
import { DataRoom } from "@/components/deals/data-room";
import { Chat } from "@/components/chat/chat";
import { AccionesInversionista } from "@/components/dashboard/acciones-inversionista";
import { esEtapa } from "@/lib/pipeline";
import { puedeVerPrivado } from "@/lib/acceso";
import { PanelAdminDeal, type NdaAdmin } from "@/components/admin/panel-admin-deal";
import { AVISO_LEGAL } from "@/components/layout/legal-banner";
import { REGIMENES, SEGMENTOS, TIPOS_OPERACION, fotoUrl } from "@/lib/catalogos";
import { formatM2, formatPct } from "@/lib/format";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DealPage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound();
  const sb = createClient();

  // Todas estas consultas pasan por RLS: un deal no visible simplemente no existe para este usuario.
  const { data: deal } = await sb.from("deals").select("*").eq("id", params.id).maybeSingle();
  if (!deal) notFound();

  const [{ data: fotos }, { data: seller }, { data: privado }, { data: muni }, { data: { user } }] = await Promise.all([
    sb.from("deal_photos").select("path").eq("deal_id", deal.id).order("orden"),
    sb.from("seller_public").select("nombre,empresa,estado_verificacion,registro_asesor").eq("id", deal.seller_id).maybeSingle(),
    // Devuelve fila solo si dueño/admin/NDA aprobado (RLS). Nunca se filtra en el frontend.
    sb.from("deal_private").select("direccion_exacta,descripcion_completa").eq("deal_id", deal.id).maybeSingle(),
    sb.from("inegi_municipios").select("nombre").eq("estado_clave", deal.estado_clave).eq("clave", deal.municipio_clave).maybeSingle(),
    sb.auth.getUser(),
  ]);
  const { data: estado } = await sb.from("inegi_estados").select("nombre").eq("clave", deal.estado_clave).maybeSingle();
  const esDueno = !!user && user.id === deal.seller_id;
  const { data: miPerfil } = user ? await sb.from("profiles").select("rol").eq("id", user.id).maybeSingle() : { data: null };
  const esAdmin = miPerfil?.rol === "admin";
  // Todo con RLS: cada consulta solo devuelve filas si el usuario tiene derecho.
  const [{ data: miNda }, { data: plantilla }, { data: docs }, rpcSolicitantes, rpcVistas, { data: miFav }, { data: miPipe }] = await Promise.all([
    user && !esDueno ? sb.from("ndas").select("estado").eq("deal_id", deal.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    privado || !user || esDueno || esAdmin ? Promise.resolve({ data: null }) : sb.from("nda_templates").select("version,texto").eq("activo", true).maybeSingle(),
    // Sin depender de deal_private: RLS devuelve filas solo a dueño/admin/NDA aprobado (para el resto, lista vacía).
    user ? sb.from("deal_documents").select("id,nombre,tipo").eq("deal_id", deal.id).order("created_at") : Promise.resolve({ data: [] }),
    esDueno || esAdmin ? sb.rpc("solicitantes_nda", { p_deal: deal.id }) : Promise.resolve({ data: null }),
    esDueno ? sb.rpc("vistas_deal", { p_deal: deal.id }) : Promise.resolve({ data: null }),
    user && !esDueno ? sb.from("favorites").select("deal_id").eq("deal_id", deal.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user && !esDueno ? sb.from("pipeline_items").select("etapa").eq("deal_id", deal.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const verPrivado = puedeVerPrivado({ esDueno, esAdmin, ndaEstado: miNda?.estado, tienePrivado: !!privado });

  const kpis: [string, React.ReactNode][] = [
    ["Precio", deal.precio != null ? <Money value={Number(deal.precio)} /> : "—"],
    ["Precio por m²", deal.precio_m2 != null ? <Money value={Number(deal.precio_m2)} /> : "—"],
    ["Cap rate", deal.cap_rate != null ? formatPct(Number(deal.cap_rate)) : "—"],
    ["NOI anual", deal.noi_anual != null ? <Money value={Number(deal.noi_anual)} abreviado /> : "—"],
    ["Renta mensual actual", deal.renta_mensual_actual != null ? <Money value={Number(deal.renta_mensual_actual)} /> : "—"],
    ["Ocupación", deal.ocupacion_pct != null ? `${Number(deal.ocupacion_pct)}%` : "—"],
    ["Terreno", formatM2(deal.m2_terreno != null ? Number(deal.m2_terreno) : null)],
    ["Construcción", formatM2(deal.m2_construccion != null ? Number(deal.m2_construccion) : null)],
    ["Inquilinos", deal.num_inquilinos ?? "—"],
    ["Plazo prom. contratos", deal.plazo_promedio_contratos != null ? `${Number(deal.plazo_promedio_contratos)} años` : "—"],
  ];
  if (deal.tipo_operacion === "busca_socio_capital") {
    kpis.push(["Capital buscado", <Money key="c" value={Number(deal.monto_capital_buscado)} abreviado />]);
    kpis.push(["Participación ofrecida", deal.participacion_ofrecida_pct != null ? `${Number(deal.participacion_ofrecida_pct)}%` : "—"]);
    kpis.push(["TIR proyectada (vendedor)", deal.tir_proyectada != null ? `${Number(deal.tir_proyectada)}%` : "—"]);
  }

  return (
    <article className="space-y-6">
      <ViewTracker dealId={deal.id} />
      <header className="space-y-2">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-muted px-2 py-0.5">{SEGMENTOS[deal.segmento as keyof typeof SEGMENTOS]}</span>
          <span className="rounded bg-muted px-2 py-0.5">{TIPOS_OPERACION[deal.tipo_operacion as keyof typeof TIPOS_OPERACION]}</span>
          {deal.es_ejemplo && <BadgeEjemplo />}
          {deal.status !== "publicado" && <span className="rounded bg-muted px-2 py-0.5">Estatus: {deal.status}</span>}
        </div>
        <h1 className="text-3xl font-bold">{deal.titulo}</h1>
        <p className="text-muted-foreground">
          {[deal.colonia, muni?.nombre, estado?.nombre].filter(Boolean).join(", ")} · ubicación aproximada
        </p>
      </header>

      {deal.es_ejemplo && (
        <p role="note" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Este deal es un EJEMPLO FICTICIO con fines de demostración. No corresponde a un inmueble real.
        </p>
      )}

      {user && !esDueno && !esAdmin && <AccionesInversionista dealId={deal.id} userId={user.id} favorito={!!miFav} etapa={esEtapa(miPipe?.etapa) ? miPipe.etapa : null} />}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {fotos && fotos.length > 0
          ? fotos.map((f) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={f.path} src={fotoUrl(f.path)} alt="" className="h-40 w-full rounded-md object-cover" />)
          : <div className="col-span-full flex h-40 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">Sin fotos</div>}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Indicadores">
        {kpis.map(([k, v]) => (
          <div key={k} className="rounded-md border border-border p-3"><div className="text-xs text-muted-foreground">{k}</div><div className="font-semibold">{v}</div></div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Resumen</h2>
        <p className="whitespace-pre-line">{deal.descripcion_teaser}</p>
        <p className="text-sm text-muted-foreground">
          Régimen: {deal.regimen_propiedad ? REGIMENES[deal.regimen_propiedad as keyof typeof REGIMENES] : "—"}
          {deal.uso_suelo ? ` · Uso de suelo: ${deal.uso_suelo}` : ""}
        </p>
        {deal.zona_restringida && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">Zona restringida: puede aplicar regulación especial para inversión extranjera. Consulta a un abogado.</p>}
        {deal.regimen_propiedad === "ejido" && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">Propiedad ejidal: la transmisión requiere procesos agrarios específicos (dominio pleno). Valida con un especialista.</p>}
      </section>

      {seller && (
        <p className="text-sm text-muted-foreground">
          Publica: {seller.nombre}{seller.empresa ? ` (${seller.empresa})` : ""}
          {seller.estado_verificacion === "verificado" ? " · Perfil verificado" : " · Perfil sin verificar"}
          {seller.registro_asesor ? ` · Reg. asesor: ${seller.registro_asesor} (no validado por DealMX)` : ""}
        </p>
      )}

      {deal.precio != null && deal.noi_anual != null && Number(deal.noi_anual) >= 0
        ? <Calculadora precio={Number(deal.precio)} noiAnual={Number(deal.noi_anual)} />
        : <p className="text-sm text-muted-foreground">La calculadora requiere precio y NOI anual.</p>}

      {/* Nivel 2: se muestra según la autorización (dueño, admin o NDA aprobado); los datos los entrega RLS */}
      {verPrivado ? (
        <section className="space-y-4 rounded-lg border-2 border-primary p-4">
          <h2 className="text-xl font-bold">Información confidencial</h2>
          {privado ? (
            <>
              <p><strong>Dirección exacta:</strong> {privado.direccion_exacta}</p>
              <p className="whitespace-pre-line">{privado.descripcion_completa}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">El vendedor aún no ha capturado la dirección exacta ni la descripción completa.</p>
          )}
          <DataRoom dealId={deal.id} docs={docs ?? []} />
        </section>
      ) : esAdmin ? null : (
        <NdaPanel dealId={deal.id} plantilla={plantilla} estadoInicial={(miNda?.estado ?? null) as EstadoNda} logueado={!!user} volver={`/deal/${deal.id}`} />
      )}

      {user && !esDueno && miNda?.estado === "aprobado" && (
        <section className="space-y-2 rounded-lg border border-border p-4">
          <h2 className="text-xl font-bold">Chat con el vendedor</h2>
          <Chat dealId={deal.id} threadUserId={user.id} userId={user.id} etiquetaOtro={seller?.nombre ?? "Vendedor"} />
        </section>
      )}

      {esAdmin && <PanelAdminDeal dealId={deal.id} status={deal.status} ndas={(rpcSolicitantes.data ?? []) as NdaAdmin[]} />}

      {esDueno && user && <PanelVendedor dealId={deal.id} ownerId={user.id} solicitantes={(rpcSolicitantes.data ?? []) as Solicitante[]} vistas={(rpcVistas.data ?? null) as Vistas | null} />}

      <p role="note" className="text-xs text-muted-foreground"><strong>Aviso:</strong> {AVISO_LEGAL}</p>
    </article>
  );
}
