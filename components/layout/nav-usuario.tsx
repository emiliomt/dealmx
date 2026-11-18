"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Solo presentación (lee la sesión local): la autorización real siempre ocurre en servidor/RLS. */
export function NavUsuario() {
  const router = useRouter();
  const [logueado, setLogueado] = useState<boolean | null>(null);
  useEffect(() => {
    const sb = createClient();
    sb.auth.getSession().then(({ data }) => setLogueado(!!data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setLogueado(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (logueado === null) return null;
  if (!logueado) return <a href="/auth/login">Entrar</a>;
  return (
    <>
      <a href="/dashboard">Mi panel</a>
      <button type="button" onClick={async () => { await createClient().auth.signOut(); router.push("/"); router.refresh(); }} className="underline">Salir</button>
    </>
  );
}
