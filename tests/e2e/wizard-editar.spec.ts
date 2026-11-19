import { expect, test, type Page } from "@playwright/test";

// Red simulada: valida el modo edición del wizard y la forma EXACTA de lo que envía. NO prueba RLS ni los triggers (npm run test:rls).
type Llamada = { tabla: string; metodo: string; url: string; cuerpo: Record<string, unknown> | null };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

async function abrir(page: Page, status: string) {
  const llamadas: Llamada[] = [];
  const reg = (tabla: string, r: { request(): { method(): string; url(): string; postDataJSON(): unknown; postData(): string | null } }): Llamada => {
    const q = r.request(); let cuerpo: Record<string, unknown> | null = null;
    try { cuerpo = q.postData() ? (q.postDataJSON() as Record<string, unknown>) : null; } catch { cuerpo = null; }
    const l = { tabla, metodo: q.method(), url: decodeURIComponent(q.url()), cuerpo }; llamadas.push(l); return l;
  };
  // Un borrador local de OTRO deal NO debe pisar los datos del deal que se edita
  await page.addInitScript(() => localStorage.setItem("dealmx.wizard.draft", JSON.stringify({ titulo: "BORRADOR LOCAL AJENO" })));
  await page.route("**/rest/v1/inegi_municipios**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ clave: "006", nombre: "Apodaca" }]) }));
  await page.route("**/rest/v1/deals**", (r) => { reg("deals", r); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "deal-1" }]) }); });
  await page.route("**/rest/v1/deal_private**", (r) => { reg("deal_private", r); return r.fulfill({ status: 201, body: "" }); });
  await page.route("**/rest/v1/deal_photos**", (r) => { reg("deal_photos", r); return r.fulfill({ status: r.request().method() === "DELETE" ? 204 : 201, body: "" }); });
  await page.route("**/storage/v1/**", (r) => {
    reg("storage", r);
    return r.fulfill({ status: 200, contentType: "application/json", body: r.request().method() === "DELETE" ? "[]" : JSON.stringify({ Key: "deal-photos/x", Id: "1" }) });
  });
  await page.goto(`/e2e/wizard-editar?status=${status}`);
  return llamadas;
}
const siguiente = (p: Page) => p.getByRole("button", { name: "Siguiente" }).click();
const hastaRevision = async (p: Page) => { for (let i = 0; i < 5; i++) await siguiente(p); };

test.describe("wizard en modo edición (red simulada)", () => {
  test("precarga los datos del deal e ignora el borrador local de otro deal", async ({ page }) => {
    await abrir(page, "publicado");
    await expect(page.getByRole("heading", { name: "Editar deal" })).toBeVisible();
    await expect(page.getByLabel("Título")).toHaveValue("Nave industrial en Apodaca");
    await expect(page.getByLabel("Municipio")).toHaveValue("006");
    await siguiente(page);
    await expect(page.getByLabel("Precio (MXN)")).toHaveValue("10000000");
    await expect(page.getByLabel("NOI anual (MXN)")).toHaveValue("900000");
  });

  test("deal PUBLICADO: avisa que volverá a revisión y guarda sin enviar seller_id ni status", async ({ page }) => {
    const llamadas = await abrir(page, "publicado");
    await expect(page.getByText(/volverá a revisión/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar borrador" })).toHaveCount(0);
    await siguiente(page);
    await page.getByLabel("Precio (MXN)").fill("12000000");
    await siguiente(page); await siguiente(page); await siguiente(page); await siguiente(page);
    await page.getByRole("button", { name: "Guardar cambios y enviar a revisión" }).click();
    await page.waitForURL("**/deal/deal-1");

    const patch = llamadas.find((l) => l.tabla === "deals" && l.metodo === "PATCH")!;
    expect(patch.url).toContain("id=eq.deal-1");
    expect(patch.cuerpo).toMatchObject({ titulo: "Nave industrial en Apodaca", precio: 12000000, noi_anual: 900000, municipio_clave: "006" });
    expect(patch.cuerpo).not.toHaveProperty("seller_id");
    expect(patch.cuerpo).not.toHaveProperty("status"); // la BD decide: un publicado editado vuelve a revisión
    expect(patch.cuerpo).not.toHaveProperty("es_ejemplo");
    const priv = llamadas.find((l) => l.tabla === "deal_private")!;
    expect(priv.url).toContain("on_conflict=deal_id");
    expect(priv.cuerpo).toMatchObject({ deal_id: "deal-1", direccion_exacta: "Calle Ejemplo 123, Apodaca", lat: 25.7818, lng: -100.1883 });
  });

  test("BORRADOR: sin aviso; 'Guardar borrador' y 'Enviar a revisión' fijan el estado correspondiente", async ({ page }) => {
    const llamadas = await abrir(page, "borrador");
    await expect(page.getByText(/volverá a revisión/i)).toHaveCount(0);
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.waitForURL("**/deal/deal-1");
    expect(llamadas.find((l) => l.tabla === "deals" && l.metodo === "PATCH")!.cuerpo).toMatchObject({ status: "borrador" });

    const l2 = await abrir(page, "borrador");
    await hastaRevision(page);
    await page.getByRole("button", { name: "Enviar a revisión" }).click();
    await page.waitForURL("**/deal/deal-1");
    expect(l2.find((l) => l.tabla === "deals" && l.metodo === "PATCH")!.cuerpo).toMatchObject({ status: "en_revision" });
  });

  test("fotos: quitar una existente y agregar una nueva (orden siguiente)", async ({ page }) => {
    const llamadas = await abrir(page, "borrador");
    await siguiente(page); await siguiente(page); await siguiente(page);
    await expect(page.getByText("a.jpg")).toBeVisible(); await expect(page.getByText("b.jpg")).toBeVisible();
    await page.getByRole("button", { name: "Quitar foto a.jpg" }).click();
    await expect(page.getByText("a.jpg")).toHaveCount(0);
    await page.getByLabel(/Fotos públicas/).setInputFiles({ name: "nueva.png", mimeType: "image/png", buffer: PNG });
    await siguiente(page); await siguiente(page);
    await page.getByRole("button", { name: "Enviar a revisión" }).click();
    await page.waitForURL("**/deal/deal-1");

    expect(llamadas.some((l) => l.tabla === "deal_photos" && l.metodo === "DELETE" && l.url.includes("id=eq.p1"))).toBe(true);
    expect(llamadas.some((l) => l.tabla === "deal_photos" && l.metodo === "DELETE" && l.url.includes("id=eq.p2"))).toBe(false); // la otra se conserva
    expect(llamadas.some((l) => l.tabla === "storage" && l.metodo === "DELETE" && JSON.stringify(l.cuerpo).includes("deal-1/a.jpg"))).toBe(true);
    expect(llamadas.some((l) => l.tabla === "storage" && l.metodo !== "DELETE" && l.url.includes("/object/deal-photos/deal-1/"))).toBe(true);
    const alta = llamadas.find((l) => l.tabla === "deal_photos" && l.metodo === "POST")!;
    expect(alta.cuerpo).toMatchObject({ deal_id: "deal-1", orden: 2 });
    expect(String(alta.cuerpo!.path)).toMatch(/^deal-1\/.+\.png$/);
  });

  test("si la BD rechaza el guardado se muestra el error y NO se sale de la pantalla", async ({ page }) => {
    await abrir(page, "borrador");
    await page.route("**/rest/v1/deals**", (r) => r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "Un deal cerrado no se edita" }) }));
    await hastaRevision(page);
    await page.getByRole("button", { name: "Enviar a revisión" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Un deal cerrado no se edita" })).toBeVisible();
    await expect(page).toHaveURL(/wizard-editar/);
  });

  test("ADMIN editando un publicado: sin aviso de re-revisión y el botón dice 'Guardar cambios'", async ({ page }) => {
    await abrir(page, "publicado&admin=1");
    await expect(page.getByText(/volverá a revisión/i)).toHaveCount(0);
    await hastaRevision(page);
    await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /enviar a revisión/i })).toHaveCount(0);
  });
});
