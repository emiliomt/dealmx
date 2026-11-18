import { expect, test, type Page, type Request } from "@playwright/test";

// Red simulada: valida comportamiento de UI y la forma de las peticiones. NO prueba RLS (npm run test:rls).
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

async function abrir(page: Page, opts: { rechazaPatch?: boolean } = {}) {
  const peticiones: { metodo: string; url: string; cuerpo: unknown }[] = [];
  await page.route("**/rest/v1/**", async (route) => {
    const r: Request = route.request();
    const cuerpo = r.method() === "GET" || !r.postData() ? null : r.postDataJSON();
    peticiones.push({ metodo: r.method(), url: decodeURIComponent(r.url()), cuerpo });
    if (r.method() === "PATCH" || r.method() === "DELETE") {
      if (opts.rechazaPatch) return route.fulfill(json([])); // RLS: 0 filas afectadas
      return route.fulfill(json([{ id: "ok" }]));
    }
    return route.fulfill(json({}, 201));
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/e2e/dashboard");
  return peticiones;
}
const col = (page: Page, etapa: string) => page.locator(`section[data-etapa="${etapa}"]`);
// Se agarra la tarjeta por su margen interior: el centro cae sobre enlaces/selects, que no inician el arrastre de la tarjeta.
const agarrar = { sourcePosition: { x: 3, y: 3 } };

test.describe("dashboards (componentes con red simulada)", () => {
  test("kanban: arrastrar una tarjeta cambia de columna y guarda la etapa", async ({ page }) => {
    const reqs = await abrir(page);
    await expect(col(page, "visto").getByText("Nave Uno")).toBeVisible();
    await col(page, "visto").locator("li", { hasText: "Nave Uno" }).dragTo(col(page, "oferta"), agarrar);
    await expect(col(page, "oferta").getByText("Nave Uno")).toBeVisible();
    await expect(col(page, "visto").getByText("Nave Uno")).toHaveCount(0);
    const patch = reqs.find((r) => r.metodo === "PATCH");
    expect(patch?.url).toContain("pipeline_items");
    expect(patch?.url).toContain("id=eq.p1");
    expect(patch?.cuerpo).toEqual({ etapa: "oferta" });
  });

  test("kanban: si la BD rechaza el cambio (0 filas) la tarjeta regresa y se avisa", async ({ page }) => {
    await abrir(page, { rechazaPatch: true });
    await col(page, "visto").locator("li", { hasText: "Nave Uno" }).dragTo(col(page, "cierre"), agarrar);
    await expect(page.getByRole("alert").filter({ hasText: "No se pudo mover la tarjeta" })).toBeVisible();
    await expect(col(page, "visto").getByText("Nave Uno")).toBeVisible();
    await expect(col(page, "cierre").getByText("Nave Uno")).toHaveCount(0);
  });

  test("kanban: alternativa por teclado/móvil con el selector de etapa", async ({ page }) => {
    const reqs = await abrir(page);
    await page.getByLabel("Mover Local Dos a otra etapa").selectOption("due_diligence");
    await expect(col(page, "due_diligence").getByText("Local Dos")).toBeVisible();
    expect(reqs.find((r) => r.metodo === "PATCH")?.cuerpo).toEqual({ etapa: "due_diligence" });
  });

  test("kanban: editar una nota la guarda al salir del campo", async ({ page }) => {
    const reqs = await abrir(page);
    await page.getByRole("button", { name: "Agregar nota" }).click();
    await page.getByLabel("Notas de Nave Uno").fill("Llamar al broker");
    await page.getByLabel("Notas de Nave Uno").blur();
    await expect(page.getByRole("button", { name: "Llamar al broker" })).toBeVisible();
    expect(reqs.find((r) => r.metodo === "PATCH")?.cuerpo).toEqual({ notas: "Llamar al broker" });
  });

  test("búsquedas guardadas: cambiar frecuencia, pausar y eliminar", async ({ page }) => {
    const reqs = await abrir(page);
    await page.getByLabel("Frecuencia de Naves en Apodaca").selectOption("semanal");
    await page.getByLabel("Alertas").uncheck();
    const patches = reqs.filter((r) => r.metodo === "PATCH" && r.url.includes("saved_searches"));
    expect(patches.map((p) => p.cuerpo)).toEqual([{ frecuencia: "semanal" }, { activa: false }]);
    await page.getByRole("button", { name: "Eliminar" }).first().click();
    await expect(page.getByText("No tienes búsquedas guardadas")).toBeVisible();
    expect(reqs.some((r) => r.metodo === "DELETE" && r.url.includes("saved_searches"))).toBe(true);
  });

  test("vendedor: aprobar una solicitud envía estado=aprobado solo si sigue 'firmado'", async ({ page }) => {
    const reqs = await abrir(page);
    await page.getByRole("button", { name: "Aprobar" }).click();
    await expect(page.getByText("No tienes solicitudes pendientes")).toBeVisible();
    const patch = reqs.find((r) => r.metodo === "PATCH" && r.url.includes("/ndas"));
    expect(patch?.cuerpo).toEqual({ estado: "aprobado" });
    expect(patch?.url).toContain("id=eq.n1");
    expect(patch?.url).toContain("estado=eq.firmado");
  });

  test("vendedor: solicitud ya resuelta (0 filas) avisa y no la quita en falso", async ({ page }) => {
    await abrir(page, { rechazaPatch: true });
    await page.getByRole("button", { name: "Rechazar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "ya fue resuelta" })).toBeVisible();
    await expect(page.getByText("Ana Inversionista")).toBeVisible();
  });

  test("vendedor: marcar en negociación y cerrar piden confirmación y envían el estado", async ({ page }) => {
    const reqs = await abrir(page);
    await page.getByRole("button", { name: "Marcar en negociación" }).click();
    await expect(page.getByText("En negociación")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar" }).click();
    const cuerpos = reqs.filter((r) => r.metodo === "PATCH" && r.url.includes("/deals")).map((r) => r.cuerpo);
    expect(cuerpos).toEqual([{ status: "en_negociacion" }, { status: "cerrado" }]);
    await expect(page.getByRole("button", { name: "Cerrar" })).toHaveCount(0); // cerrado: sin más acciones
  });

  test("ficha: favoritos y pipeline envían upsert con el usuario y deal correctos", async ({ page }) => {
    const reqs = await abrir(page);
    await page.getByRole("button", { name: /Guardar en favoritos/ }).click();
    await expect(page.getByRole("button", { name: /En favoritos/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Mi pipeline").selectOption("visto");
    await expect.poll(() => reqs.filter((r) => r.metodo === "POST").length).toBe(2);
    const posts = reqs.filter((r) => r.metodo === "POST");
    expect(posts.find((p) => p.url.includes("favorites"))?.cuerpo).toEqual({ user_id: "u1", deal_id: "d9" });
    expect(posts.find((p) => p.url.includes("pipeline_items"))?.cuerpo).toEqual({ user_id: "u1", deal_id: "d9", etapa: "visto" });
  });
});
