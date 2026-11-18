import { createHmac, timingSafeEqual } from "node:crypto";

/** Enlaces de baja firmados (HMAC-SHA256). No caducan: una baja nunca debe dejar de funcionar. */
export type AlcanceBaja = { k: "u"; id: string } | { k: "s"; id: string }; // usuario (todas) | búsqueda

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const firma = (payload: string, secreto: string) => createHmac("sha256", secreto).update(payload).digest("base64url");

export function firmarBaja(a: AlcanceBaja, secreto: string): string {
  const p = b64(JSON.stringify(a));
  return `${p}.${firma(p, secreto)}`;
}

export function verificarBaja(token: string | null | undefined, secreto: string): AlcanceBaja | null {
  if (!token || !secreto) return null;
  const [p, f, ...resto] = token.split(".");
  if (!p || !f || resto.length) return null;
  const esperado = Buffer.from(firma(p, secreto));
  const recibido = Buffer.from(f);
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return null;
  try {
    const a = JSON.parse(Buffer.from(p, "base64url").toString());
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if ((a?.k === "u" || a?.k === "s") && typeof a.id === "string" && uuid.test(a.id)) return { k: a.k, id: a.id };
  } catch { /* token mal formado */ }
  return null;
}
