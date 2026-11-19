import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Wizard } from "@/components/wizard/wizard";
import { valoresDesdeDeal } from "@/lib/schemas/deal";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Edición de un deal: solo su dueño (o un admin). Toda la autorización real la hacen RLS y los triggers de la BD; esto solo decide qué pantalla mostrar. */
export default async function Editar({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound();
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/deal/${params.id}/editar`)}`);

  const [{ data: deal }, { data: perfil }] = await Promise.all([
    sb.from("deals").select("*").eq("id", params.id).maybeSingle(),
    sb.from("profiles").select("rol").eq("id", user.id).maybeSingle(),
  ]);
  if (!deal) notFound();
  const esAdmin = perfil?.rol === "admin";
  if (deal.seller_id !== user.id && !esAdmin) notFound(); // no se revela que el deal existe
  if (deal.status === "cerrado") {
    return (
      <p>Este deal está cerrado y ya no se puede editar. <a className="underline" href={`/deal/${deal.id}`}>Volver a la ficha</a>.</p>
    );
  }

  const [{ data: privado }, { data: fotos }, { data: estados }] = await Promise.all([
    sb.from("deal_private").select("direccion_exacta,lat,lng,descripcion_completa").eq("deal_id", deal.id).maybeSingle(),
    sb.from("deal_photos").select("id,path,orden").eq("deal_id", deal.id).order("orden"),
    sb.from("inegi_estados").select("clave,nombre").order("nombre"),
  ]);

  return (
    <Wizard
      userId={user.id}
      estados={estados ?? []}
      edicion={{ id: deal.id, status: deal.status, esAdmin, valores: valoresDesdeDeal(deal, privado), fotos: fotos ?? [] }}
    />
  );
}
