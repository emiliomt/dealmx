import { describe, expect, it } from "vitest";
import { esElegible, desde, PERIODO_MS } from "@/lib/alertas/ventana";
import { firmarBaja, verificarBaja } from "@/lib/alertas/token";
import { esc, renderAlerta, type DealAlerta } from "@/lib/email/alertas";

const AHORA = new Date("2026-11-18T14:00:00Z");
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString();

describe("ventana de alertas", () => {
  it("la ventana empieza en last_sent_at, o en created_at si nunca se envió", () => {
    expect(desde({ frecuencia: "diaria", last_sent_at: "2026-11-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z" })).toBe("2026-11-01T00:00:00Z");
    expect(desde({ frecuencia: "diaria", last_sent_at: null, created_at: "2026-10-01T00:00:00Z" })).toBe("2026-10-01T00:00:00Z");
  });
  it.each([
    ["diaria", 30, true], ["diaria", 22, true], ["diaria", 21.9, false], ["diaria", 3, false],
    ["semanal", 24 * 7, true], ["semanal", 24 * 7 - 2, true], ["semanal", 24 * 6, false], ["semanal", 30, false],
  ] as const)("%s con %s h desde la ventana → elegible=%s", (frecuencia, h, esperado) => {
    expect(esElegible({ frecuencia, last_sent_at: hace(h), created_at: hace(1000) }, AHORA)).toBe(esperado);
    expect(esElegible({ frecuencia, last_sent_at: null, created_at: hace(h) }, AHORA)).toBe(esperado);
  });
  it("tolera desfase del cron: 23 h 59 min después sigue siendo diaria", () => expect(esElegible({ frecuencia: "diaria", last_sent_at: hace(23.98), created_at: hace(100) }, AHORA)).toBe(true));
  it("periodos documentados", () => { expect(PERIODO_MS.diaria).toBe(22 * 3_600_000); expect(PERIODO_MS.semanal).toBe(166 * 3_600_000); });
});

describe("token de baja", () => {
  const S = "secreto-de-prueba";
  const ID = "11111111-1111-4111-8111-111111111111";
  it("ida y vuelta (usuario y búsqueda)", () => {
    expect(verificarBaja(firmarBaja({ k: "u", id: ID }, S), S)).toEqual({ k: "u", id: ID });
    expect(verificarBaja(firmarBaja({ k: "s", id: ID }, S), S)).toEqual({ k: "s", id: ID });
  });
  it("rechaza secreto distinto, vacío o token ausente", () => {
    const t = firmarBaja({ k: "u", id: ID }, S);
    expect(verificarBaja(t, "otro")).toBeNull();
    expect(verificarBaja(t, "")).toBeNull();
    expect(verificarBaja(null, S)).toBeNull();
    expect(verificarBaja("", S)).toBeNull();
  });
  it("rechaza payload alterado aunque conserve la firma (no se puede dar de baja a otro usuario)", () => {
    const [, firma] = firmarBaja({ k: "u", id: ID }, S).split(".");
    const otro = Buffer.from(JSON.stringify({ k: "u", id: "22222222-2222-4222-8222-222222222222" })).toString("base64url");
    expect(verificarBaja(`${otro}.${firma}`, S)).toBeNull();
  });
  it("rechaza firma alterada, partes de más y basura", () => {
    const t = firmarBaja({ k: "u", id: ID }, S);
    expect(verificarBaja(t.slice(0, -2) + "xx", S)).toBeNull();
    expect(verificarBaja(t + ".extra", S)).toBeNull();
    expect(verificarBaja("basura", S)).toBeNull();
    expect(verificarBaja("a.b", S)).toBeNull();
  });
  it("rechaza ids que no son uuid o alcances desconocidos aunque estén bien firmados", () => {
    expect(verificarBaja(firmarBaja({ k: "u", id: "1 or 1=1" }, S), S)).toBeNull();
    expect(verificarBaja(firmarBaja({ k: "x", id: ID } as never, S), S)).toBeNull();
  });
});

describe("renderAlerta", () => {
  const deal = (o: Partial<DealAlerta> = {}): DealAlerta => ({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", titulo: "Nave industrial", segmento: "industrial", tipo_operacion: "venta",
    estado_nombre: "Nuevo León", municipio_nombre: "Apodaca", precio: 12_500_000, cap_rate: 0.09, m2_construccion: 2000, m2_terreno: null,
    monto_capital_buscado: null, es_ejemplo: false, ...o,
  });
  const base = (deals: DealAlerta[], total = deals.length) => ({
    nombre: "Ana", siteUrl: "https://dealmx.example", urlBajaTotal: "https://dealmx.example/api/alertas/baja?t=U", urlPanel: "https://dealmx.example/dashboard/inversionista",
    secciones: [{ nombre: "Naves en Apodaca", resumen: "Apodaca · Industrial", deals, totalCoincidencias: total, urlBusqueda: "https://dealmx.example/buscar?estado=19", urlBaja: "https://dealmx.example/api/alertas/baja?t=S" }],
  });

  it("esc neutraliza HTML", () => expect(esc(`<img src=x onerror="a('b')">&`)).toBe("&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;"));
  it("escapa títulos y nombres de usuarios (sin inyección de HTML)", () => {
    const { html } = renderAlerta({ ...base([deal({ titulo: '<script>alert(1)</script><img src=x onerror=alert(2)>' })]), nombre: "<b>Mal</b>" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Mal</b>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("incluye precio es-MX, ubicación, cap rate, enlace al deal, aviso legal y bajas", () => {
    const { html, text, subject } = renderAlerta(base([deal()]));
    expect(subject).toBe("DealMX: 1 oportunidad nueva para tus búsquedas");
    for (const t of [html, text]) {
      expect(t).toContain("$12,500,000 MXN");
      expect(t).toContain("https://dealmx.example/deal/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      expect(t).toContain("no es asesor de inversiones");
      expect(t).toContain("api/alertas/baja?t=U");
      expect(t).toContain("api/alertas/baja?t=S");
    }
    expect(html).toContain("Apodaca, Nuevo León");
    expect(html).toContain("Cap rate 9.00%");
  });
  it("plural en el asunto y 'ver todas' cuando hay más coincidencias que las mostradas", () => {
    const { html, subject } = renderAlerta(base(Array.from({ length: 10 }, () => deal()), 37));
    expect(subject).toContain("37 oportunidades nuevas");
    expect(html).toContain("Ver las 37 coincidencias");
  });
  it("marca los ejemplos ficticios", () => {
    const { html, text } = renderAlerta(base([deal({ es_ejemplo: true })]));
    expect(html).toContain("EJEMPLO FICTICIO"); expect(text).toContain("[EJEMPLO FICTICIO]");
  });
  it("deal de socio capitalista sin precio muestra el capital buscado", () => {
    const { text } = renderAlerta(base([deal({ precio: null, monto_capital_buscado: 8_000_000, tipo_operacion: "busca_socio_capital" })]));
    expect(text).toContain("Busca $8 mdp");
  });
  it("NUNCA renderiza campos privados aunque lleguen en el objeto", () => {
    const sucio = { ...deal(), direccion_exacta: "CALLE SECRETA 123", descripcion_completa: "DESCRIPCION SECRETA", lat: 25.123456, lng: -100.654321, telefono: "8112345678" } as DealAlerta;
    const { html, text } = renderAlerta(base([sucio]));
    for (const t of [html, text]) for (const secreto of ["CALLE SECRETA", "DESCRIPCION SECRETA", "25.123456", "-100.654321", "8112345678"]) expect(t).not.toContain(secreto);
  });
});
