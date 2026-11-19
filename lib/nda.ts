import { isIP } from "node:net";
import { z } from "zod";

export const firmaSchema = z.object({
  dealId: z.string().uuid(),
  nombre: z.string().trim().min(5, "Escribe tu nombre completo").max(120)
    .refine((n) => n.split(/\s+/).length >= 2, "Escribe nombre y apellido"),
  acepto: z.literal(true, { errorMap: () => ({ message: "Debes aceptar el NDA" }) }),
});
export type FirmaInput = z.infer<typeof firmaSchema>;

/**
 * IP del firmante según el proxy de la plataforma (primer valor de x-forwarded-for).
 * Es evidencia razonable detrás de Vercel/Supabase, pero es un encabezado: solo es confiable si
 * la app corre detrás de un proxy que lo sobrescribe. Si no es una IP válida se guarda null.
 */
export function extraerIp(h: Headers): string | null {
  const candidata = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  return isIP(candidata) ? candidata : null;
}
