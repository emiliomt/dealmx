import { notFound } from "next/navigation";
import { Wizard } from "@/components/wizard/wizard";

/** Arnés SOLO para pruebas e2e (E2E_HARNESS=1): el wizard completo con red simulada por Playwright. */
export const dynamic = "force-dynamic";
export default function Harness() {
  if (process.env.E2E_HARNESS !== "1") notFound();
  return <Wizard userId="22222222-2222-4222-8222-222222222222" estados={[{ clave: "19", nombre: "Nuevo León" }]} />;
}
