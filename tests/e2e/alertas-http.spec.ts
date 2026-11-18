import { expect, test } from "@playwright/test";
import { firmarBaja } from "../../lib/alertas/token";

// Smoke HTTP real contra `next dev`: cableado de rutas, middleware y autenticación del cron.
// No hay Supabase detrás, así que las operaciones que llegan a la BD deben fallar de forma controlada (sin caerse ni filtrar datos).
const UID = "11111111-1111-4111-8111-111111111111";

test.describe("cron y bajas (HTTP real, sin BD)", () => {
  test("el cron exige el Bearer correcto", async ({ request }) => {
    for (const headers of [{}, { authorization: "Bearer mal" }, { authorization: "e2e-cron-secret" }] as Record<string, string>[]) {
      const r = await request.get("/api/cron/alerts", { headers });
      expect(r.status()).toBe(401);
      expect(await r.json()).toEqual({ error: "No autorizado" });
    }
  });

  test("con el secreto correcto se ejecuta: sin Resend responde un error controlado y NO filtra secretos", async ({ request }) => {
    const r = await request.get("/api/cron/alerts", { headers: { authorization: "Bearer e2e-cron-secret" } });
    expect(r.status()).toBe(500);
    const cuerpo = await r.text();
    expect(cuerpo).toMatch(/RESEND_API_KEY|MAIL_FROM/);
    expect(cuerpo).not.toContain("e2e-cron-secret"); expect(cuerpo).not.toContain("e2e-unsub-secret");
  });

  test("dry-run con secreto correcto llega a la BD; al no haber Supabase falla controlado (JSON, no página de error)", async ({ request }) => {
    const r = await request.get("/api/cron/alerts?dry=1", { headers: { authorization: "Bearer e2e-cron-secret" } });
    expect(r.status()).toBe(500);
    expect(r.headers()["content-type"]).toContain("application/json");
    expect(await r.json()).toHaveProperty("error");
  });

  test("baja: el enlace válido solo muestra confirmación (GET no ejecuta nada)", async ({ request, page }) => {
    const t = firmarBaja({ k: "u", id: UID }, "e2e-unsub-secret");
    const r = await request.get(`/api/alertas/baja?t=${encodeURIComponent(t)}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["x-robots-tag"]).toBe("noindex");
    await page.goto(`/api/alertas/baja?t=${encodeURIComponent(t)}`);
    await expect(page.getByRole("heading", { name: /Dejar de recibir todas tus alertas/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sí, dar de baja" })).toBeVisible();
  });

  test("baja: token inválido o firmado con otro secreto → 'no válido'", async ({ request }) => {
    for (const t of ["basura", firmarBaja({ k: "u", id: UID }, "otro")]) {
      expect(await (await request.get(`/api/alertas/baja?t=${encodeURIComponent(t)}`)).text()).toContain("no válido");
      expect(await (await request.post(`/api/alertas/baja?t=${encodeURIComponent(t)}`)).text()).toContain("no válido");
    }
  });

  test("baja: POST válido sin BD disponible falla de forma controlada (500 JSON)", async ({ request }) => {
    const r = await request.post(`/api/alertas/baja?t=${encodeURIComponent(firmarBaja({ k: "s", id: UID }, "e2e-unsub-secret"))}`, { data: "List-Unsubscribe=One-Click" });
    expect(r.status()).toBe(500);
    expect(await r.json()).toEqual({ error: "No se pudo procesar la baja" });
  });
});

test.describe("rutas protegidas (HTTP real, sin sesión)", () => {
  for (const ruta of ["/admin", "/dashboard", "/dashboard/vendedor", "/publicar"]) {
    test(`${ruta} sin sesión redirige al login conservando el destino`, async ({ request }) => {
      const r = await request.get(ruta, { maxRedirects: 0 });
      expect([302, 307]).toContain(r.status());
      expect(r.headers()["location"]).toContain(`/auth/login?next=${encodeURIComponent(ruta)}`);
    });
  }
});

test.describe("portada con la base de datos inaccesible o sin esquema (HTTP real)", () => {
  // El servidor de pruebas apunta a un Supabase inexistente: equivale a un proyecto sin migraciones o con una llave mala.
  test("/ avisa que no pudo cargar los deals, en vez de aparentar que simplemente no hay ninguno", async ({ request }) => {
    const r = await request.get("/");
    expect(r.status()).toBe(200);
    const html = await r.text();
    expect(html).toContain("No pudimos cargar los deals");
    expect(html).not.toContain("Aún no hay deals publicados");
    // no se filtran detalles internos (mensajes de PostgREST / red) a los visitantes
    expect(html).not.toMatch(/fetch failed|ECONNREFUSED|PGRST|does not exist|127\.0\.0\.1/i);
  });
});

