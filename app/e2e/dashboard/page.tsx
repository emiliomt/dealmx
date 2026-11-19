import { notFound } from "next/navigation";
import { Kanban, type ItemPipeline } from "@/components/dashboard/kanban";
import { BusquedasGuardadas } from "@/components/dashboard/busquedas-guardadas";
import { SolicitudesPendientes } from "@/components/dashboard/solicitudes-pendientes";
import { MisDeals } from "@/components/dashboard/mis-deals";
import { AccionesInversionista } from "@/components/dashboard/acciones-inversionista";

/** Arnés SOLO para pruebas e2e (E2E_HARNESS=1): componentes de dashboard con red simulada por Playwright. */
export const dynamic = "force-dynamic";
const ITEMS: ItemPipeline[] = [
  { id: "p1", deal_id: "d1", etapa: "visto", notas: null, titulo: "Nave Uno", segmento: "industrial", precio: 12_500_000 },
  { id: "p2", deal_id: "d2", etapa: "nda", notas: "Pedir rent roll", titulo: "Local Dos", segmento: "comercial", precio: 8_000_000 },
];
export default function Harness() {
  if (process.env.E2E_HARNESS !== "1") notFound();
  return (
    <div className="space-y-10">
      <Kanban inicial={ITEMS} />
      <BusquedasGuardadas inicial={[{ id: "s1", nombre: "Naves en Apodaca", frecuencia: "diaria", activa: true, resumen: "Apodaca · Industrial", href: "/buscar?estado=19" }]} />
      <SolicitudesPendientes inicial={[{ nda_id: "n1", deal_id: "d1", titulo: "Nave Uno", nombre: "Ana Inversionista", empresa: "Capital SA", firma_nombre: "Ana López", firmado_at: "2026-11-18T10:00:00Z" }]} />
      <MisDeals inicial={[{ id: "d1", titulo: "Nave Uno", status: "publicado", segmento: "industrial", precio: 12_500_000, es_ejemplo: false, motivo_rechazo: null, vistas_total: 10, vistas_7d: 4, ndas_pendientes: 1, ndas_aprobados: 0, mensajes: 0, docs: [] }]} />
      <AccionesInversionista dealId="d9" userId="u1" favorito={false} etapa={null} />
    </div>
  );
}
