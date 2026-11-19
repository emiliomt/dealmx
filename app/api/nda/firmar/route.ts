import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { extraerIp, firmaSchema } from "@/lib/nda";

/**
 * Firma de NDA. La firma (nombre + timestamp + IP + texto exacto) la escribe el SERVIDOR con service role:
 * el trigger guard_nda_transition impide que el cliente toque esos campos. Quien decide el acceso
 * es el vendedor (solicitado/firmado -> aprobado) y lo hace cumplir RLS.
 */
export async function POST(req: Request) {
  const entrada = firmaSchema.safeParse(await req.json().catch(() => null));
  if (!entrada.success) return NextResponse.json({ error: entrada.error.issues[0].message }, { status: 400 });
  const { dealId, nombre } = entrada.data;

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para firmar" }, { status: 401 });

  const { data: perfil } = await sb.from("profiles").select("rol").eq("id", user.id).maybeSingle();
  if (!perfil || perfil.rol === "admin") return NextResponse.json({ error: "Tu cuenta no puede firmar NDAs" }, { status: 403 });

  // Consultas con la sesión del usuario: un deal no visible para él no existe aquí.
  const { data: deal } = await sb.from("deals").select("id,seller_id,status").eq("id", dealId).maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
  if (deal.seller_id === user.id) return NextResponse.json({ error: "No puedes firmar el NDA de tu propio deal" }, { status: 400 });
  if (!["publicado", "en_negociacion"].includes(deal.status)) return NextResponse.json({ error: "Este deal no acepta NDAs" }, { status: 409 });

  const { data: plantilla } = await sb.from("nda_templates").select("version,texto").eq("activo", true).maybeSingle();
  if (!plantilla) return NextResponse.json({ error: "No hay plantilla de NDA activa" }, { status: 500 });

  const { data: existente } = await sb.from("ndas").select("id,estado").eq("deal_id", dealId).eq("user_id", user.id).maybeSingle();
  if (existente && existente.estado !== "solicitado") {
    return NextResponse.json({ error: "Ya existe un NDA para este deal", estado: existente.estado }, { status: 409 });
  }

  const firma = {
    estado: "firmado",
    template_version: plantilla.version,
    texto_snapshot: plantilla.texto,          // el texto lo pone el servidor, nunca el cliente
    firma_nombre: nombre,
    firmado_at: new Date().toISOString(),
    firma_ip: extraerIp(req.headers),
  };
  const admin = createServiceClient();
  const { error } = existente
    ? await admin.from("ndas").update(firma).eq("id", existente.id)
    : await admin.from("ndas").insert({ deal_id: dealId, user_id: user.id, ...firma });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Ya existe un NDA para este deal" }, { status: 409 });
    return NextResponse.json({ error: "No se pudo registrar la firma" }, { status: 500 });
  }
  return NextResponse.json({ estado: "firmado" }, { status: 201 });
}
