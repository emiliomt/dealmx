import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Descarga del data room. Todo con la sesión del usuario: la fila de deal_documents y el objeto de
 * Storage están protegidos por RLS (dueño / admin / NDA aprobado). Si RLS dice no, no hay fila ni URL.
 * La URL firmada dura 60 s.
 */
export async function GET(_req: Request, { params }: { params: { id: string; docId: string } }) {
  if (!UUID.test(params.id) || !UUID.test(params.docId)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });

  const { data: doc } = await sb.from("deal_documents").select("storage_path,nombre").eq("id", params.docId).eq("deal_id", params.id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { data, error } = await sb.storage.from("data-room").createSignedUrl(doc.storage_path, 60, { download: doc.nombre });
  if (error || !data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, 302);
}
