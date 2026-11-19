import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ejecutarAlertas } from "@/lib/alertas/ejecutar";
import { repoSupabase } from "@/lib/alertas/repo-supabase";
import { crearEnviadorResend } from "@/lib/email/enviar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false; // sin secreto configurado el endpoint queda cerrado
  const dado = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

/**
 * Cron diario (vercel.json). Vercel envía `Authorization: Bearer $CRON_SECRET`.
 * `ALERTS_DRY_RUN=1` o `?dry=1`: calcula coincidencias sin enviar ni modificar nada.
 */
export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const secreto = process.env.UNSUBSCRIBE_SECRET;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!secreto || !siteUrl) return NextResponse.json({ error: "Faltan UNSUBSCRIBE_SECRET o NEXT_PUBLIC_SITE_URL" }, { status: 500 });

  const dryRun = process.env.ALERTS_DRY_RUN === "1" || new URL(req.url).searchParams.get("dry") === "1";
  let enviar = null;
  if (!dryRun) {
    try { enviar = crearEnviadorResend(); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Resend no configurado" }, { status: 500 }); }
  }
  try {
    const resumen = await ejecutarAlertas({ repo: repoSupabase(createServiceClient()), enviar, ahora: new Date(), siteUrl, secreto, dryRun });
    return NextResponse.json(resumen, { status: resumen.correosFallidos > 0 || resumen.errores.length > 0 ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al ejecutar alertas" }, { status: 500 });
  }
}
