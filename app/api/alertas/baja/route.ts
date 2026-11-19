import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verificarBaja } from "@/lib/alertas/token";

export const dynamic = "force-dynamic";

const pagina = (titulo: string, cuerpo: string) =>
  new Response(`<!doctype html><html lang="es-MX"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><body style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:48px auto;padding:0 16px">${cuerpo}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

/**
 * GET solo MUESTRA una confirmación: los escáneres de enlaces de los clientes de correo hacen GET y no deben dar de baja a nadie.
 * La baja se ejecuta con POST (botón de esta página o "List-Unsubscribe-Post: One-Click" de Gmail/Apple Mail).
 */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t");
  const a = verificarBaja(t, process.env.UNSUBSCRIBE_SECRET ?? "");
  if (!a) return pagina("Enlace no válido", `<h1>Enlace no válido</h1><p>Puedes administrar tus alertas desde tu panel en DealMX.</p>`);
  const que = a.k === "u" ? "todas tus alertas por correo" : "esta alerta";
  return pagina("Dar de baja", `<h1>¿Dejar de recibir ${que}?</h1><form method="post" action="/api/alertas/baja?t=${encodeURIComponent(t!)}"><button style="padding:10px 16px">Sí, dar de baja</button></form><p style="font-size:13px;color:#555">Puedes reactivarlas desde Mi panel.</p>`);
}

export async function POST(req: Request) {
  const a = verificarBaja(new URL(req.url).searchParams.get("t"), process.env.UNSUBSCRIBE_SECRET ?? "");
  if (!a) return pagina("Enlace no válido", `<h1>Enlace no válido</h1>`);
  try {
    const sb = createServiceClient();
    const { error } = await (a.k === "u"
      ? sb.from("saved_searches").update({ activa: false }).eq("user_id", a.id)
      : sb.from("saved_searches").update({ activa: false }).eq("id", a.id));
    if (error) throw new Error(error.message);
  } catch {
    // Configuración incompleta (p. ej. sin service role) o BD caída: respuesta controlada, sin detalles internos.
    return NextResponse.json({ error: "No se pudo procesar la baja" }, { status: 500 });
  }
  // Respuesta idéntica exista o no la búsqueda (no revela qué ids existen).
  return pagina("Listo", `<h1>Listo</h1><p>No recibirás más correos de ${a.k === "u" ? "alertas" : "esta alerta"}.</p>`);
}
