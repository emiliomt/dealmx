import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/login?next=/dashboard");
  const { data: p } = await sb.from("profiles").select("rol").eq("id", user.id).maybeSingle();
  redirect(p?.rol === "vendedor" ? "/dashboard/vendedor" : p?.rol === "admin" ? "/admin" : "/dashboard/inversionista");
}
