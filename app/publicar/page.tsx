import { createClient } from "@/lib/supabase/server";
import { Wizard } from "@/components/wizard/wizard";

export const dynamic = "force-dynamic";

export default async function Publicar() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: perfil } = user ? await sb.from("profiles").select("rol").eq("id", user.id).maybeSingle() : { data: null };
  if (!perfil || !["vendedor", "admin"].includes(perfil.rol)) {
    return <p>Solo las cuentas de vendedor/broker pueden publicar. Regístrate como vendedor para continuar.</p>;
  }
  const { data: estados } = await sb.from("inegi_estados").select("clave,nombre").order("nombre");
  return <Wizard userId={user!.id} estados={estados ?? []} />;
}
