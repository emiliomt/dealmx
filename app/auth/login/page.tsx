"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loginSchema } from "@/lib/schemas/auth";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = loginSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    const { error } = await createClient().auth.signInWithPassword(parsed.data);
    if (error) return setError("Correo o contraseña incorrectos");
    const next = params.get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Iniciar sesión</h1>
      <input name="email" type="email" placeholder="Correo" className="w-full rounded-md border border-border p-2" />
      <input name="password" type="password" placeholder="Contraseña" className="w-full rounded-md border border-border p-2" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button className="w-full rounded-md bg-primary p-2 text-primary-foreground">Entrar</button>
      <p className="text-sm">¿No tienes cuenta? <a className="underline" href="/auth/registro">Regístrate</a></p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
