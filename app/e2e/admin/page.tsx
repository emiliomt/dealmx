import { notFound } from "next/navigation";
import { ColaModeracion } from "@/components/admin/cola-moderacion";
import { VerificacionUsuarios } from "@/components/admin/verificacion-usuarios";
import { PanelAdminDeal } from "@/components/admin/panel-admin-deal";

/** Arnés SOLO para pruebas e2e (E2E_HARNESS=1): componentes de admin con red simulada por Playwright. */
export const dynamic = "force-dynamic";
export default function Harness() {
  if (process.env.E2E_HARNESS !== "1") notFound();
  return (
    <div className="space-y-10">
      <ColaModeracion inicial={[
        { id: "d1", titulo: "Nave Uno", segmento: "industrial", tipo_operacion: "venta", lugar: "Apodaca, Nuevo León", precio: 12_500_000, cap_rate: 0.09, vendedor: "Vendedor A", es_ejemplo: false, enviado: "2026-11-18T10:00:00Z", motivoPrevio: "Faltaban fotos", senales: [{ nivel: "alerta", texto: "No tiene fotos." }, { nivel: "aviso", texto: "El vendedor aún no está verificado." }] },
        { id: "d2", titulo: "Local Dos", segmento: "comercial", tipo_operacion: "venta", lugar: "Saltillo, Coahuila", precio: 8_000_000, cap_rate: null, vendedor: "Vendedor B", es_ejemplo: true, enviado: "2026-11-17T10:00:00Z", motivoPrevio: null, senales: [] },
      ]} />
      <VerificacionUsuarios inicial={[
        { id: "u1", rol: "vendedor", nombre: "Ana Vendedora", empresa: "Inmuebles SA", telefono: "8112345678", registro_asesor: "NL-123", estado_registro: "Nuevo León", estado: "pendiente", nota: null, creado: "2026-11-10T10:00:00Z" },
        { id: "u2", rol: "inversionista", nombre: "Beto Inversionista", empresa: null, telefono: null, registro_asesor: null, estado_registro: null, estado: "verificado", nota: null, creado: "2026-11-11T10:00:00Z" },
      ]} />
      <PanelAdminDeal dealId="d9" status="publicado" ndas={[
        { nda_id: "n1", nombre: "Carla", empresa: null, estado: "rechazado", firma_nombre: "Carla M", firmado_at: "2026-11-12T10:00:00Z" },
        { nda_id: "n2", nombre: "Dani", empresa: null, estado: "aprobado", firma_nombre: "Dani P", firmado_at: "2026-11-13T10:00:00Z" },
      ]} />
    </div>
  );
}
