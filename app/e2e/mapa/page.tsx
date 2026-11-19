import { notFound } from "next/navigation";
import { MapaDeals, type Punto } from "@/components/map/mapa-deals";

/** Arnés SOLO para pruebas e2e (E2E_HARNESS=1): mapa con datos fijos, sin base de datos. */
export const dynamic = "force-dynamic";
const PUNTOS: Punto[] = [
  { id: "00000000-0000-4000-8000-000000000001", titulo: "<img src=x onerror=alert(1)> Nave A", lat: 25.6866, lng: -100.3161, precio: 12_500_000, segmento: "industrial" },
  { id: "00000000-0000-4000-8000-000000000002", titulo: "Local B", lat: 25.6911, lng: -100.3099, precio: 8_000_000, segmento: "comercial" },
  { id: "00000000-0000-4000-8000-000000000003", titulo: "Oficinas C", lat: 25.6511, lng: -100.4029, precio: 30_000_000, segmento: "oficinas" },
  { id: "00000000-0000-4000-8000-000000000004", titulo: "Terreno D", lat: 25.4232, lng: -101.0053, precio: 5_000_000, segmento: "terreno" },
  { id: "00000000-0000-4000-8000-000000000005", titulo: "Hotel E", lat: 25.54, lng: -100.95, precio: 45_000_000, segmento: "hotelero" },
];
export default function Harness() {
  if (process.env.E2E_HARNESS !== "1") notFound();
  return <MapaDeals puntos={PUNTOS} className="h-[500px] w-full" />;
}
