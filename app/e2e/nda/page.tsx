import { notFound } from "next/navigation";
import { NdaPanel } from "@/components/nda/nda-panel";
import { Chat } from "@/components/chat/chat";

/** Arnés SOLO para pruebas e2e (E2E_HARNESS=1): componentes con red simulada por Playwright. */
export const dynamic = "force-dynamic";
export default function Harness() {
  if (process.env.E2E_HARNESS !== "1") notFound();
  return (
    <div className="space-y-8">
      <NdaPanel dealId="11111111-1111-4111-8111-111111111111" plantilla={{ version: 1, texto: "Texto de NDA de prueba" }} estadoInicial={null} logueado volver="/" />
      <Chat dealId="11111111-1111-4111-8111-111111111111" threadUserId="22222222-2222-4222-8222-222222222222" userId="22222222-2222-4222-8222-222222222222" etiquetaOtro="Vendedor" />
    </div>
  );
}
