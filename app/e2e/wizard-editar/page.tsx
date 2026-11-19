import { notFound } from "next/navigation";
import { Wizard } from "@/components/wizard/wizard";
import { valoresDesdeDeal } from "@/lib/schemas/deal";

/** Arnés SOLO para pruebas e2e (E2E_HARNESS=1): el wizard en modo EDICIÓN con red simulada. ?status=borrador|en_revision|publicado|en_negociacion */
export const dynamic = "force-dynamic";
const DEAL = {
  titulo: "Nave industrial en Apodaca", tipo_operacion: "venta", segmento: "industrial", estado_clave: "19", municipio_clave: "006", colonia: null,
  precio: "10000000.00", m2_terreno: null, m2_construccion: 2000, renta_mensual_actual: 100000, noi_anual: "900000.00", ocupacion_pct: "95.00",
  num_inquilinos: 2, plazo_promedio_contratos: "3.0", regimen_propiedad: "escritura", uso_suelo: null, zona_restringida: false,
  monto_capital_buscado: null, participacion_ofrecida_pct: null, tir_proyectada: null,
  descripcion_teaser: "Nave industrial de prueba con acceso a vialidades principales y rentas vigentes.",
};
const PRIVADO = { direccion_exacta: "Calle Ejemplo 123, Apodaca", lat: 25.7818, lng: -100.1883, descripcion_completa: "Descripción completa de prueba con detalles confidenciales de la nave." };

export default function Harness({ searchParams }: { searchParams: { status?: string; admin?: string } }) {
  if (process.env.E2E_HARNESS !== "1") notFound();
  const status = (["borrador", "en_revision", "publicado", "en_negociacion"] as const).find((s) => s === searchParams.status) ?? "publicado";
  return (
    <Wizard
      userId="22222222-2222-4222-8222-222222222222"
      estados={[{ clave: "19", nombre: "Nuevo León" }]}
      edicion={{ id: "deal-1", status, esAdmin: searchParams.admin === "1", valores: valoresDesdeDeal(DEAL, PRIVADO), fotos: [{ id: "p1", path: "deal-1/a.jpg", orden: 0 }, { id: "p2", path: "deal-1/b.jpg", orden: 1 }] }}
    />
  );
}
