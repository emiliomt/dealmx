import { Resend } from "resend";

export interface CorreoSaliente {
  to: string; subject: string; html: string; text: string;
  headers?: Record<string, string>;
  /** Evita duplicados si el cron se dispara dos veces o un reintento sigue a un envío exitoso (ventana de Resend: 24 h). */
  idempotencyKey?: string;
}
export type Enviador = (c: CorreoSaliente) => Promise<{ ok: true; id?: string } | { ok: false; error: string }>;

/** Enviador real (Resend). Lanza si falta RESEND_API_KEY o MAIL_FROM: mejor fallar fuerte que "enviar" a la nada. */
export function crearEnviadorResend(env: Record<string, string | undefined> = process.env): Enviador {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new Error("Faltan RESEND_API_KEY o MAIL_FROM");
  const resend = new Resend(env.RESEND_API_KEY);
  const from = env.MAIL_FROM;
  return async (c) => {
    try {
      const { data, error } = await resend.emails.send(
        { from, to: c.to, subject: c.subject, html: c.html, text: c.text, headers: c.headers },
        c.idempotencyKey ? { idempotencyKey: c.idempotencyKey } : undefined,
      );
      return error ? { ok: false, error: error.message } : { ok: true, id: data?.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "error desconocido" };
    }
  };
}
