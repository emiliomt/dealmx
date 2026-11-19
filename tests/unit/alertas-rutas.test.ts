import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  updates: [] as { table: string; values: unknown; col: string; val: unknown }[],
  dbError: null as { message: string } | null,
  clienteLanza: false,
  resumen: { busquedasRevisadas: 1, elegibles: 1, conCoincidencias: 1, correosEnviados: 1, correosFallidos: 0, sinCorreoConfirmado: 0, sinFiltros: 0, dryRun: false, truncado: false, errores: [] as string[] },
  llamadas: [] as unknown[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => { if (h.clienteLanza) throw new Error("supabaseKey is required."); return { from: (table: string) => ({ update: (values: unknown) => ({ eq: (col: string, val: unknown) => { h.updates.push({ table, values, col, val }); return Promise.resolve({ error: h.dbError }); } }) }) }; },
}));
vi.mock("@/lib/alertas/repo-supabase", () => ({ repoSupabase: () => ({}) }));
vi.mock("@/lib/alertas/ejecutar", () => ({ ejecutarAlertas: async (o: unknown) => { h.llamadas.push(o); return h.resumen; } }));

import { GET as cron } from "@/app/api/cron/alerts/route";
import { GET as bajaGet, POST as bajaPost } from "@/app/api/alertas/baja/route";
import { firmarBaja } from "@/lib/alertas/token";

const UID = "11111111-1111-4111-8111-111111111111";
const peticion = (auth?: string, url = "http://localhost/api/cron/alerts") => new Request(url, { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  h.updates = []; h.dbError = null; h.clienteLanza = false; h.llamadas = []; h.resumen = { ...h.resumen, correosFallidos: 0, errores: [], dryRun: false };
  vi.stubEnv("CRON_SECRET", "cron-secret"); vi.stubEnv("UNSUBSCRIBE_SECRET", "unsub-secret"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dealmx.example/");
  vi.stubEnv("RESEND_API_KEY", "re_test"); vi.stubEnv("MAIL_FROM", "DealMX <a@dealmx.example>"); vi.stubEnv("ALERTS_DRY_RUN", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/alerts", () => {
  it("401 sin Authorization, con secreto equivocado o sin esquema Bearer", async () => {
    for (const a of [undefined, "Bearer otro", "cron-secret", "Bearer cron-secre", "Bearer cron-secret-x"]) expect((await cron(peticion(a))).status).toBe(401);
    expect(h.llamadas).toHaveLength(0);
  });
  it("401 si CRON_SECRET no está configurado (endpoint cerrado, aunque el cliente mande 'Bearer undefined')", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await cron(peticion("Bearer "))).status).toBe(401);
    expect((await cron(peticion("Bearer undefined"))).status).toBe(401);
  });
  it("500 si falta UNSUBSCRIBE_SECRET o el sitio (sin ellos no se pueden firmar bajas)", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    expect((await cron(peticion("Bearer cron-secret"))).status).toBe(500);
    expect(h.llamadas).toHaveLength(0);
  });
  it("500 si no hay Resend configurado y no es dry-run (no finge enviar)", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const r = await cron(peticion("Bearer cron-secret"));
    expect(r.status).toBe(500); expect(JSON.stringify(await r.json())).toMatch(/RESEND/);
    expect(h.llamadas).toHaveLength(0);
  });
  it("200 y resumen cuando todo sale bien; normaliza la URL del sitio", async () => {
    const r = await cron(peticion("Bearer cron-secret"));
    expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ correosEnviados: 1 });
    expect(h.llamadas[0]).toMatchObject({ siteUrl: "https://dealmx.example", secreto: "unsub-secret", dryRun: false });
  });
  it("dry-run por ?dry=1 o ALERTS_DRY_RUN=1 funciona incluso sin Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await cron(peticion("Bearer cron-secret", "http://localhost/api/cron/alerts?dry=1"))).status).toBe(200);
    expect(h.llamadas[0]).toMatchObject({ dryRun: true, enviar: null });
    vi.stubEnv("ALERTS_DRY_RUN", "1");
    expect((await cron(peticion("Bearer cron-secret"))).status).toBe(200);
    expect(h.llamadas[1]).toMatchObject({ dryRun: true });
  });
  it("207 si hubo envíos fallidos o errores parciales", async () => {
    h.resumen = { ...h.resumen, correosFallidos: 1, errores: ["x"] };
    expect((await cron(peticion("Bearer cron-secret"))).status).toBe(207);
  });
});

describe("/api/alertas/baja", () => {
  const url = (t: string) => `http://localhost/api/alertas/baja?t=${encodeURIComponent(t)}`;
  it("GET con token válido SOLO muestra la confirmación (los escáneres de correo no dan de baja a nadie)", async () => {
    const t = firmarBaja({ k: "u", id: UID }, "unsub-secret");
    const r = await bajaGet(new Request(url(t)));
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("<form method=\"post\""); expect(html).toContain("todas tus alertas");
    expect(h.updates).toHaveLength(0);
  });
  it("POST de usuario desactiva TODAS sus búsquedas (y solo las suyas)", async () => {
    const r = await bajaPost(new Request(url(firmarBaja({ k: "u", id: UID }, "unsub-secret")), { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(r.status).toBe(200);
    expect(h.updates).toEqual([{ table: "saved_searches", values: { activa: false }, col: "user_id", val: UID }]);
  });
  it("POST de búsqueda desactiva solo esa búsqueda", async () => {
    await bajaPost(new Request(url(firmarBaja({ k: "s", id: UID }, "unsub-secret")), { method: "POST" }));
    expect(h.updates).toEqual([{ table: "saved_searches", values: { activa: false }, col: "id", val: UID }]);
  });
  it("token inválido, de otro secreto o ausente: no modifica nada", async () => {
    for (const t of ["basura", firmarBaja({ k: "u", id: UID }, "otro-secreto"), ""]) {
      const r = await bajaPost(new Request(url(t), { method: "POST" }));
      expect(await r.text()).toContain("no válido");
    }
    expect((await bajaPost(new Request("http://localhost/api/alertas/baja", { method: "POST" }))).status).toBe(200);
    expect(h.updates).toHaveLength(0);
    expect(await (await bajaGet(new Request(url("basura")))).text()).toContain("no válido");
  });
  it("error de BD -> 500", async () => {
    h.dbError = { message: "x" };
    expect((await bajaPost(new Request(url(firmarBaja({ k: "u", id: UID }, "unsub-secret")), { method: "POST" }))).status).toBe(500);
  });
  it("si el cliente de BD no se puede crear (falta service role) responde 500 JSON controlado, sin detalles", async () => {
    h.clienteLanza = true;
    const r = await bajaPost(new Request(url(firmarBaja({ k: "u", id: UID }, "unsub-secret")), { method: "POST" }));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "No se pudo procesar la baja" });
  });
  it("las páginas no se indexan ni se cachean", async () => {
    const r = await bajaGet(new Request(url("basura")));
    expect(r.headers.get("cache-control")).toBe("no-store"); expect(r.headers.get("x-robots-tag")).toBe("noindex");
  });
});
