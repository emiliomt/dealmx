import { beforeEach, describe, expect, it, vi } from "vitest";
import { extraerIp, firmaSchema } from "@/lib/nda";

const DEAL = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

// ---- clientes Supabase simulados ----
const h = vi.hoisted(() => ({
  cfg: {} as Record<string, unknown>,
  user: null as { id: string } | null,
  calls: [] as { op: string; table: string; values: Record<string, unknown>; id?: unknown }[],
  adminError: null as { code?: string } | null,
}));
vi.mock("@/lib/supabase/server", () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {
      select: () => b, eq: () => b,
      maybeSingle: () => Promise.resolve({ data: h.cfg[table] ?? null, error: null }),
    };
    return b;
  };
  return {
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) }, from: builder }),
    createServiceClient: () => ({
      from: (table: string) => ({
        insert: (values: Record<string, unknown>) => { h.calls.push({ op: "insert", table, values }); return Promise.resolve({ error: h.adminError }); },
        update: (values: Record<string, unknown>) => ({ eq: (_c: string, id: unknown) => { h.calls.push({ op: "update", table, values, id }); return Promise.resolve({ error: h.adminError }); } }),
      }),
    }),
  };
});
import { POST } from "@/app/api/nda/firmar/route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost/api/nda/firmar", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const valido = { dealId: DEAL, nombre: "Ana López Pérez", acepto: true };

beforeEach(() => {
  h.user = { id: USER };
  h.calls = [];
  h.adminError = null;
  h.cfg = {
    profiles: { rol: "inversionista" },
    deals: { id: DEAL, seller_id: "99999999-9999-4999-8999-999999999999", status: "publicado" },
    nda_templates: { version: 3, texto: "TEXTO OFICIAL DEL NDA" },
    ndas: null,
  };
});

describe("firmaSchema / extraerIp", () => {
  it("exige nombre y apellido, aceptación y uuid", () => {
    expect(firmaSchema.safeParse(valido).success).toBe(true);
    expect(firmaSchema.safeParse({ ...valido, nombre: "Ana" }).success).toBe(false);
    expect(firmaSchema.safeParse({ ...valido, nombre: "Anaaaaaaa" }).success).toBe(false);
    expect(firmaSchema.safeParse({ ...valido, acepto: false }).success).toBe(false);
    expect(firmaSchema.safeParse({ ...valido, dealId: "x" }).success).toBe(false);
  });
  it("toma la primera IP de x-forwarded-for y valida formato", () => {
    expect(extraerIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(extraerIp(new Headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(extraerIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(extraerIp(new Headers({ "x-forwarded-for": "'; drop table ndas;--" }))).toBeNull();
    expect(extraerIp(new Headers())).toBeNull();
  });
});

describe("POST /api/nda/firmar", () => {
  it("firma: inserta con texto y versión del SERVIDOR, nombre, timestamp e IP", async () => {
    const r = await post({ ...valido, texto_snapshot: "TEXTO FALSO DEL CLIENTE", estado: "aprobado" }, { "x-forwarded-for": "203.0.113.7" });
    expect(r.status).toBe(201);
    expect(h.calls).toHaveLength(1);
    const { op, table, values } = h.calls[0];
    expect([op, table]).toEqual(["insert", "ndas"]);
    expect(values).toMatchObject({ deal_id: DEAL, user_id: USER, estado: "firmado", template_version: 3, texto_snapshot: "TEXTO OFICIAL DEL NDA", firma_nombre: "Ana López Pérez", firma_ip: "203.0.113.7" });
    expect(Date.parse(String(values.firmado_at))).toBeGreaterThan(Date.now() - 5000);
  });
  it("nunca deja que el cliente fije el estado 'aprobado'", async () => {
    await post({ ...valido, estado: "aprobado" });
    expect(h.calls[0].values.estado).toBe("firmado");
  });
  it("sin IP válida guarda null", async () => {
    await post(valido);
    expect(h.calls[0].values.firma_ip).toBeNull();
  });
  it("actualiza una solicitud previa 'solicitado' en vez de duplicar", async () => {
    h.cfg.ndas = { id: "nda-1", estado: "solicitado" };
    expect((await post(valido)).status).toBe(201);
    expect(h.calls[0]).toMatchObject({ op: "update", id: "nda-1" });
  });
  it.each(["firmado", "aprobado", "rechazado"])("409 si ya hay un NDA %s (no se re-firma ni se revierte un rechazo)", async (estado) => {
    h.cfg.ndas = { id: "nda-1", estado };
    const r = await post(valido);
    expect(r.status).toBe(409);
    expect((await r.json()).estado).toBe(estado);
    expect(h.calls).toHaveLength(0);
  });
  it("400 con cuerpo inválido, sin tocar la BD", async () => {
    expect((await post({ ...valido, acepto: false })).status).toBe(400);
    expect((await post("basura")).status).toBe(400);
    expect(h.calls).toHaveLength(0);
  });
  it("401 sin sesión", async () => {
    h.user = null;
    expect((await post(valido)).status).toBe(401);
    expect(h.calls).toHaveLength(0);
  });
  it("403 para admin", async () => {
    h.cfg.profiles = { rol: "admin" };
    expect((await post(valido)).status).toBe(403);
  });
  it("404 si el deal no es visible para el usuario (RLS)", async () => {
    h.cfg.deals = null;
    expect((await post(valido)).status).toBe(404);
  });
  it("400 si el vendedor intenta firmar su propio deal", async () => {
    h.cfg.deals = { id: DEAL, seller_id: USER, status: "publicado" };
    expect((await post(valido)).status).toBe(400);
    expect(h.calls).toHaveLength(0);
  });
  it("409 si el deal está cerrado", async () => {
    h.cfg.deals = { id: DEAL, seller_id: "99999999-9999-4999-8999-999999999999", status: "cerrado" };
    expect((await post(valido)).status).toBe(409);
  });
  it("500 sin plantilla activa", async () => {
    h.cfg.nda_templates = null;
    expect((await post(valido)).status).toBe(500);
  });
  it("carrera: violación de unicidad -> 409", async () => {
    h.adminError = { code: "23505" };
    expect((await post(valido)).status).toBe(409);
  });
  it("otro error de BD -> 500 sin filtrar detalles", async () => {
    h.adminError = { code: "XX000" };
    const r = await post(valido);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("XX000");
  });
});
