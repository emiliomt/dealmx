"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Quitar de favoritos desde el dashboard (la tarjeta desaparece al instante). */
export function AccionFavorito({ dealId, userId }: { dealId: string; userId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [quitado, setQuitado] = useState(false);
  const [error, setError] = useState(false);
  if (quitado) return <p className="text-xs text-muted-foreground">Quitado de favoritos (se actualizará al recargar).</p>;
  return (
    <>
      <button type="button" className="text-xs underline" onClick={async () => {
        setError(false);
        const { error } = await sb.from("favorites").delete().eq("user_id", userId).eq("deal_id", dealId);
        if (error) setError(true); else setQuitado(true);
      }}>Quitar de favoritos</button>
      {error && <span role="alert" className="ml-2 text-xs text-destructive">No se pudo quitar</span>}
    </>
  );
}
