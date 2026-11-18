"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type EstadoNda = "solicitado" | "firmado" | "aprobado" | "rechazado" | null;

/** Nivel 2 bloqueado: según el estado del NDA muestra firma, espera o rechazo. */
export function NdaPanel({ dealId, plantilla, estadoInicial, logueado, volver }: {
  dealId: string; plantilla: { version: number; texto: string } | null; estadoInicial: EstadoNda; logueado: boolean; volver: string;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoNda>(estadoInicial);
  const [nombre, setNombre] = useState("");
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function firmar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const r = await fetch("/api/nda/firmar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dealId, nombre, acepto }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setEstado("firmado"); router.refresh(); }
      else if (r.status === 409 && j.estado) { setEstado(j.estado); router.refresh(); }
      else setError(j.error ?? "No se pudo registrar la firma");
    } catch { setError("Error de red. Intenta de nuevo."); }
    finally { setBusy(false); }
  }

  const caja = "space-y-3 rounded-lg border border-dashed border-border p-4";
  const titulo = <h2 className="text-xl font-bold">Información confidencial</h2>;

  if (!logueado) return (
    <section className={caja}>{titulo}
      <p className="text-sm">Dirección exacta, descripción completa, data room y chat se desbloquean con un NDA aprobado por el vendedor.</p>
      <a className="inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" href={`/auth/login?next=${encodeURIComponent(volver)}`}>Inicia sesión para solicitar acceso</a>
    </section>
  );
  if (estado === "firmado" || estado === "aprobado") return (
    <section className={caja} aria-live="polite">{titulo}
      <p className="text-sm">NDA firmado. Esperando la aprobación del vendedor; verás aquí la información en cuanto la otorgue.</p>
    </section>
  );
  if (estado === "rechazado") return (
    <section className={caja}>{titulo}
      <p className="text-sm text-destructive">El vendedor no aprobó tu solicitud de acceso para este deal.</p>
    </section>
  );
  if (!plantilla) return <section className={caja}>{titulo}<p className="text-sm">El NDA no está disponible por el momento.</p></section>;

  return (
    <section className={caja}>{titulo}
      <p className="text-sm">Firma el NDA para solicitar acceso a la dirección exacta, la descripción completa, el data room y el chat. El vendedor decidirá si lo aprueba.</p>
      <form onSubmit={firmar} className="space-y-3">
        <div className="max-h-40 overflow-y-auto rounded-md bg-muted p-3 text-xs" tabIndex={0} aria-label={`Texto del NDA, versión ${plantilla.version}`}>{plantilla.texto}</div>
        <label className="block text-sm">Nombre completo (firma)
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" className="mt-1 w-full rounded-md border border-border p-2" />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-1" />
          He leído y acepto el NDA (v{plantilla.version}). Entiendo que se registrarán mi nombre, fecha, hora y dirección IP como constancia.
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={busy || !acepto || nombre.trim().length < 5} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy ? "Firmando…" : "Firmar NDA y solicitar acceso"}</button>
      </form>
    </section>
  );
}
