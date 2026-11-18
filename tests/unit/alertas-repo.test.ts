import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { COLUMNAS_ALERTA, repoSupabase } from "@/lib/alertas/repo-supabase";
import { parseFiltros } from "@/lib/search/filters";

const UID = "11111111-1111-4111-8111-111111111111";
const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** supabase-js real con fetch capturado: verifica las peticiones HTTP exactas que haría el cron. */
function cliente(respuestas: (url: string, metodo: string, cuerpo: string | null) => Response) {
  const peticiones: { url: string; metodo: string; cuerpo: string | null }[] = [];
  const sb = createClient("http://localhost:54321", "service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (u, init) => {
      const url = decodeURIComponent(String(u)); const metodo = init?.method ?? "GET"; const cuerpo = typeof init?.body === "string" ? init.body : null;
      peticiones.push({ url, metodo, cuerpo });
      return respuestas(url, metodo, cuerpo);
    } },
  });
  return { sb, peticiones };
}
const filaDeal = { id: "dddddddd-dddd-4ddd-8ddd-000000000001", titulo: "Nave", segmento: "industrial", tipo_operacion: "venta", estado_clave: "19", municipio_clave: "006", precio: "12500000.00", cap_rate: "0.0900", m2_construccion: "2000.00", m2_terreno: null, monto_capital_buscado: null, es_ejemplo: true, published_at: "2026-11-18T10:00:00Z" };

describe("repoSupabase.dealsNuevos", () => {
  it("consulta solo columnas del teaser, publicados/en negociación, con filtros y published_at > desde", async () => {
    const { sb, peticiones } = cliente((url) => {
      if (url.includes("/rest/v1/deals")) return json([filaDeal], { "content-range": "0-0/37" });
      if (url.includes("inegi_estados")) return json([{ clave: "19", nombre: "Nuevo León" }]);
      if (url.includes("inegi_municipios")) return json([{ estado_clave: "19", clave: "006", nombre: "Apodaca" }]);
      return json([]);
    });
    const f = parseFiltros(new URLSearchParams("estado=19&segmento=industrial&cap_min=8&precio_max=20000000"));
    const r = await repoSupabase(sb).dealsNuevos(f, "2026-11-17T14:00:00.000Z", 10);

    const q = peticiones.find((p) => p.url.includes("/rest/v1/deals"))!.url;
    expect(q).toContain(`select=${COLUMNAS_ALERTA}`);
    for (const parte of ["status=in.(publicado,en_negociacion)", "estado_clave=eq.19", "segmento=in.(industrial)", "cap_rate=gte.0.08", "precio=lte.20000000",
      "published_at=gt.2026-11-17T14:00:00.000Z", "order=published_at.desc.nullslast,id.asc", "limit=10"]) expect(q).toContain(parte);
    // no toca tablas privadas
    expect(peticiones.some((p) => /deal_private|deal_documents|ndas|messages/.test(p.url))).toBe(false);
    expect(COLUMNAS_ALERTA).not.toMatch(/direccion|descripcion_completa|lat\b|lng\b|seller_id/);

    expect(r.total).toBe(37);
    expect(r.deals).toEqual([expect.objectContaining({ id: filaDeal.id, titulo: "Nave", precio: 12_500_000, cap_rate: 0.09, m2_construccion: 2000, municipio_nombre: "Apodaca", estado_nombre: "Nuevo León", es_ejemplo: true })]);
  });

  it("propaga errores de la BD (el orquestador los reporta)", async () => {
    const { sb } = cliente(() => json({ message: "boom" }, {}, 500));
    await expect(repoSupabase(sb).dealsNuevos(parseFiltros({ estado: "19" }), "2026-01-01T00:00:00Z", 5)).rejects.toThrow(/deals/);
  });
});

describe("repoSupabase.destinatario", () => {
  const usuario = (extra: object) => json({ id: UID, aud: "authenticated", role: "authenticated", email: "ana@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", ...extra });
  it("devuelve correo y nombre solo si el correo está confirmado", async () => {
    const { sb } = cliente((url) => url.includes("/auth/v1/admin/users/") ? usuario({ email_confirmed_at: "2026-01-02T00:00:00Z" }) : json([{ nombre: "Ana López" }]));
    expect(await repoSupabase(sb).destinatario(UID)).toEqual({ email: "ana@example.com", nombre: "Ana López" });
  });
  it("correo SIN confirmar -> null (evita spam a correos ajenos registrados por terceros)", async () => {
    const { sb } = cliente(() => usuario({ email_confirmed_at: null }));
    expect(await repoSupabase(sb).destinatario(UID)).toBeNull();
  });
  it("usuario inexistente -> null", async () => {
    const { sb } = cliente(() => json({ message: "User not found" }, {}, 404));
    expect(await repoSupabase(sb).destinatario(UID)).toBeNull();
  });
});

describe("repoSupabase búsquedas", () => {
  it("lista solo activas, las más rezagadas primero, con límite", async () => {
    const { sb, peticiones } = cliente(() => json([]));
    await repoSupabase(sb).busquedasActivas(501);
    const q = peticiones[0].url;
    expect(q).toContain("saved_searches"); expect(q).toContain("activa=eq.true"); expect(q).toContain("order=last_sent_at.asc.nullsfirst"); expect(q).toContain("limit=501");
  });
  it("marcarEnviado actualiza last_sent_at solo de los ids dados", async () => {
    const { sb, peticiones } = cliente(() => json([], {}, 204));
    await repoSupabase(sb).marcarEnviado(["a", "b"], "2026-11-18T14:00:00.000Z");
    expect(peticiones[0].metodo).toBe("PATCH");
    expect(peticiones[0].url).toContain("id=in.(a,b)");
    expect(JSON.parse(peticiones[0].cuerpo!)).toEqual({ last_sent_at: "2026-11-18T14:00:00.000Z" });
  });
  it("marcarEnviado sin ids no hace peticiones", async () => {
    const { sb, peticiones } = cliente(() => json([]));
    await repoSupabase(sb).marcarEnviado([], "x");
    expect(peticiones).toHaveLength(0);
  });
});
