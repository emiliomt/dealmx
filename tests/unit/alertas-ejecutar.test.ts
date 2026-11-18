import { beforeEach, describe, expect, it, vi } from "vitest";
import { ejecutarAlertas, type BusquedaGuardadaDB, type Repo } from "@/lib/alertas/ejecutar";
import { verificarBaja } from "@/lib/alertas/token";
import type { DealAlerta } from "@/lib/email/alertas";
import type { CorreoSaliente, Enviador } from "@/lib/email/enviar";

const AHORA = new Date("2026-11-18T14:00:00Z");
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString();
const SECRETO = "s3cr3t";
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

const deal = (n: number): DealAlerta => ({ id: `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`, titulo: `Deal ${n}`, segmento: "industrial", tipo_operacion: "venta", precio: 1e7, cap_rate: 0.09, m2_construccion: 1000, m2_terreno: null, monto_capital_buscado: null, es_ejemplo: false });
const busq = (id: string, user: string, o: Partial<BusquedaGuardadaDB> = {}): BusquedaGuardadaDB => ({
  id, user_id: user, nombre: `Búsqueda ${id}`, filtros: { estado: "19", segmento: ["industrial"], m2_min: id.charCodeAt(0) }, frecuencia: "diaria", last_sent_at: hace(30), created_at: hace(500), ...o,
});

let busquedas: BusquedaGuardadaDB[];
let dealsPorBusqueda: Record<string, { deals: DealAlerta[]; total: number } | Error>;
let destinatarios: Record<string, { email: string; nombre: string } | null>;
let consultas: { filtros: unknown; desde: string }[];
let marcas: { ids: string[]; cuando: string }[];
let marcarFalla: boolean;
let correos: CorreoSaliente[];
let enviarResp: { ok: true } | { ok: false; error: string };

const repo: Repo = {
  busquedasActivas: async (limite) => busquedas.slice(0, limite),
  dealsNuevos: async (f, desde) => {
    consultas.push({ filtros: f, desde });
    const r = dealsPorBusqueda[String.fromCharCode(f.m2_min!)]; // el doble identifica la búsqueda por sus propios filtros
    if (r instanceof Error) throw r;
    return r ?? { deals: [], total: 0 };
  },
  destinatario: async (id) => destinatarios[id] ?? null,
  marcarEnviado: async (ids, cuando) => { if (marcarFalla) throw new Error("db caída"); marcas.push({ ids, cuando }); },
};
const enviar: Enviador = async (c) => { correos.push(c); return enviarResp; };

const correr = (o: Partial<Parameters<typeof ejecutarAlertas>[0]> = {}) =>
  ejecutarAlertas({ repo, enviar, ahora: AHORA, siteUrl: "https://dealmx.example", secreto: SECRETO, ...o });

beforeEach(() => {
  busquedas = []; dealsPorBusqueda = {}; destinatarios = { [U1]: { email: "ana@example.com", nombre: "Ana" }, [U2]: { email: "beto@example.com", nombre: "Beto" } };
  consultas = []; marcas = []; marcarFalla = false; correos = []; enviarResp = { ok: true };
});

describe("ejecutarAlertas", () => {
  it("manda UN correo por usuario con una sección por búsqueda y marca solo las incluidas", async () => {
    busquedas = [busq("a", U1), busq("b", U1), busq("c", U1), busq("d", U2)];
    dealsPorBusqueda = { a: { deals: [deal(1), deal(2)], total: 2 }, b: { deals: [deal(3)], total: 1 }, c: { deals: [], total: 0 }, d: { deals: [deal(4)], total: 1 } };
    const r = await correr();
    expect(correos.map((c) => c.to).sort()).toEqual(["ana@example.com", "beto@example.com"]);
    const ana = correos.find((c) => c.to === "ana@example.com")!;
    expect(ana.html).toContain("Búsqueda a"); expect(ana.html).toContain("Búsqueda b"); expect(ana.html).not.toContain("Búsqueda c");
    expect(ana.subject).toContain("3 oportunidades nuevas");
    expect(marcas.map((m) => m.ids.sort())).toEqual([["a", "b"], ["d"]]);
    expect(marcas.every((m) => m.cuando === AHORA.toISOString())).toBe(true);
    expect(r).toMatchObject({ elegibles: 4, conCoincidencias: 3, correosEnviados: 2, correosFallidos: 0 });
  });

  it("consulta desde last_sent_at, o desde created_at si nunca se envió", async () => {
    busquedas = [busq("a", U1, { last_sent_at: hace(30) }), busq("b", U1, { last_sent_at: null, created_at: hace(48) })];
    await correr();
    expect(consultas.map((c) => c.desde)).toEqual([hace(30), hace(48)]);
  });

  it("no consulta ni envía búsquedas que aún no toca (diaria <22 h, semanal <6d22h)", async () => {
    busquedas = [busq("a", U1, { last_sent_at: hace(5) }), busq("b", U1, { frecuencia: "semanal", last_sent_at: hace(48) })];
    const r = await correr();
    expect(consultas).toHaveLength(0); expect(correos).toHaveLength(0); expect(r.elegibles).toBe(0);
  });

  it("sin coincidencias: no envía y no toca last_sent_at (la ventana sigue creciendo)", async () => {
    busquedas = [busq("a", U1)];
    const r = await correr();
    expect(correos).toHaveLength(0); expect(marcas).toHaveLength(0); expect(r.conCoincidencias).toBe(0);
  });

  it("omite búsquedas sin filtros útiles (coincidirían con todo) y lo reporta", async () => {
    busquedas = [busq("a", U1, { filtros: {} }), busq("b", U1, { filtros: { segmento: ["casa-inventada"], orden: "x" } }), busq("c", U1, { filtros: null })];
    const r = await correr();
    expect(r.sinFiltros).toBe(3); expect(correos).toHaveLength(0);
  });

  it("usuario sin correo confirmado: no se envía ni se marca", async () => {
    busquedas = [busq("a", U1)]; dealsPorBusqueda = { a: { deals: [deal(1)], total: 1 } }; destinatarios[U1] = null;
    const r = await correr();
    expect(correos).toHaveLength(0); expect(marcas).toHaveLength(0); expect(r.sinCorreoConfirmado).toBe(1);
  });

  it("fallo de envío: no se marca (se reintenta mañana) y se reporta sin abortar a los demás", async () => {
    busquedas = [busq("a", U1), busq("d", U2)];
    dealsPorBusqueda = { a: { deals: [deal(1)], total: 1 }, d: { deals: [deal(2)], total: 1 } };
    const envios: string[] = [];
    const r = await ejecutarAlertas({ repo, ahora: AHORA, siteUrl: "https://x", secreto: SECRETO, enviar: async (c) => { envios.push(c.to); return c.to.startsWith("ana") ? { ok: false, error: "rate limit" } : { ok: true }; } });
    expect(envios.sort()).toEqual(["ana@example.com", "beto@example.com"]);
    expect(r).toMatchObject({ correosEnviados: 1, correosFallidos: 1 });
    expect(r.errores.join()).toContain("rate limit");
    expect(marcas.map((m) => m.ids)).toEqual([["d"]]);
  });

  it("si marcar falla tras enviar: cuenta como enviado y deja el error (la idempotencia evita duplicar)", async () => {
    busquedas = [busq("a", U1)]; dealsPorBusqueda = { a: { deals: [deal(1)], total: 1 } }; marcarFalla = true;
    const r = await correr();
    expect(r.correosEnviados).toBe(1); expect(r.errores.join()).toContain("db caída");
  });

  it("error consultando una búsqueda no detiene las demás", async () => {
    busquedas = [busq("a", U1), busq("d", U2)];
    dealsPorBusqueda = { a: new Error("timeout"), d: { deals: [deal(1)], total: 1 } };
    const r = await correr();
    expect(correos.map((c) => c.to)).toEqual(["beto@example.com"]);
    expect(r.errores.join()).toContain("timeout");
  });

  it("dry-run: calcula coincidencias pero no envía ni modifica nada", async () => {
    busquedas = [busq("a", U1)]; dealsPorBusqueda = { a: { deals: [deal(1)], total: 1 } };
    const r = await correr({ dryRun: true, enviar: null });
    expect(r).toMatchObject({ dryRun: true, conCoincidencias: 1, correosEnviados: 0 });
    expect(correos).toHaveLength(0); expect(marcas).toHaveLength(0);
  });

  it("sin enviador y sin dry-run lanza (nunca finge que envió)", async () => {
    await expect(correr({ enviar: null })).rejects.toThrow(/enviador/i);
  });

  it("respeta el máximo de búsquedas por corrida y avisa del truncado", async () => {
    busquedas = [busq("a", U1), busq("b", U1), busq("c", U1)];
    const r = await correr({ maxBusquedas: 2 });
    expect(r.truncado).toBe(true); expect(r.busquedasRevisadas).toBe(2);
  });

  it("el correo trae List-Unsubscribe (one-click) con un token válido del usuario, e idempotencia estable", async () => {
    busquedas = [busq("a", U1)]; dealsPorBusqueda = { a: { deals: [deal(1)], total: 1 } };
    await correr();
    const c = correos[0];
    expect(c.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const url = c.headers!["List-Unsubscribe"].replace(/^<|>$/g, "");
    expect(verificarBaja(new URL(url).searchParams.get("t"), SECRETO)).toEqual({ k: "u", id: U1 });
    expect(c.html).toContain("/api/alertas/baja?t=");
    const clave1 = c.idempotencyKey;
    correos = []; consultas = []; await correr();
    expect(correos[0].idempotencyKey).toBe(clave1);
  });
});
