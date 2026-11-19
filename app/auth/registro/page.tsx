"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { registroSchema } from "@/lib/schemas/auth";

export default function RegistroPage() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = registroSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    const { email, password, ...meta } = parsed.data;
    const { error } = await createClient().auth.signUp({
      email, password,
      options: { data: meta, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) return setError(error.message);
    setOk(true);
  }

  if (ok) return <p>Revisa tu correo para confirmar tu cuenta.</p>;
  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>
      <input name="nombre" placeholder="Nombre completo" className="w-full rounded-md border border-border p-2" />
      <input name="email" type="email" placeholder="Correo" className="w-full rounded-md border border-border p-2" />
      <input name="password" type="password" placeholder="Contraseña (mín. 8)" className="w-full rounded-md border border-border p-2" />
      <select name="rol" defaultValue="inversionista" className="w-full rounded-md border border-border p-2">
        <option value="inversionista">Soy inversionista</option>
        <option value="vendedor">Soy vendedor / broker</option>
      </select>
      <input name="empresa" placeholder="Empresa (opcional)" className="w-full rounded-md border border-border p-2" />
      <input name="telefono" placeholder="Teléfono (opcional)" className="w-full rounded-md border border-border p-2" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button className="w-full rounded-md bg-primary p-2 text-primary-foreground">Registrarme</button>
    </form>
  );
}
