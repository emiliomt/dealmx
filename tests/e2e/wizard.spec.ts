import { expect, test, type Page } from "@playwright/test";

// Red simulada: valida el recorrido del wizard y la forma de lo que se envía a la BD. NO prueba RLS (npm run test:rls).
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
type Llamada = { tabla: string; cuerpo: Record<string, unknown> };

async function abrir(page: Page) {
  const llamadas: Llamada[] = [];
  await page.addInitScript(() => localStorage.clear()); // el wizard recupera un borrador local al montar
  await page.route("**/rest/v1/inegi_municipios**", (r) => r.fulfill(json([{ clave: "006", nombre: "Apodaca" }])));
  await page.route("**/rest/v1/deals**", (r) => {
    if (r.request().method() === "POST") { llamadas.push({ tabla: "deals", cuerpo: r.request().postDataJSON() }); return r.fulfill(json({ id: "deal-1" }, 201)); }
    return r.fulfill(json([]));
  });
  await page.route("**/rest/v1/deal_private**", (r) => { llamadas.push({ tabla: "deal_private", cuerpo: r.request().postDataJSON() }); return r.fulfill({ status: 201, body: "" }); });
  await page.goto("/e2e/wizard");
  return llamadas;
}

const siguiente = (page: Page) => page.getByRole("button", { name: "Siguiente" }).click();
const TEASER = "Nave industrial de prueba con acceso a vialidades principales y rentas vigentes.";
const COMPLETA = "Descripción completa de prueba con detalles confidenciales para quienes tengan NDA aprobado.";

/** Pasos 1 a 4 y los campos del paso 5, SIN coordenadas. Deja el wizard en el paso 5 ("Teaser vs privado"). */
async function hastaPaso5(page: Page) {
  await page.getByLabel("Título").fill("PRUEBA Nave industrial en Apodaca");
  await page.getByLabel("Municipio").selectOption("006");
  await siguiente(page);
  await page.getByLabel("Precio (MXN)").fill("10000000");
  await page.getByLabel("Superficie de construcción (m²)").fill("2000");
  await page.getByLabel("Renta mensual actual (MXN)").fill("100000");
  await page.getByLabel("NOI anual (MXN)").fill("900000");
  await siguiente(page);
  await page.getByLabel("Régimen de propiedad").selectOption("escritura");
  await siguiente(page);
  await siguiente(page); // fotos y documentos: opcionales
  await page.getByLabel("Descripción del teaser").fill(TEASER);
  await page.getByLabel("Dirección exacta").fill("Calle Ejemplo 123, Apodaca");
  await page.getByLabel("Descripción completa").fill(COMPLETA);
}

test.describe("wizard /publicar (red simulada)", () => {
  test("SIN coordenadas: avanza, envía a revisión y guarda lat/lng en null", async ({ page }) => {
    const llamadas = await abrir(page);
    await hastaPaso5(page);
    await siguiente(page);
    await expect(page.getByText("Revisa los datos")).toBeVisible();
    await page.getByRole("button", { name: "Enviar a revisión" }).click();
    await page.waitForURL("**/deal/deal-1");

    const deal = llamadas.find((l) => l.tabla === "deals")!.cuerpo;
    expect(deal).toMatchObject({ status: "en_revision", titulo: "PRUEBA Nave industrial en Apodaca", estado_clave: "19", municipio_clave: "006", precio: 10000000, noi_anual: 900000 });
    expect(llamadas.find((l) => l.tabla === "deal_private")!.cuerpo).toEqual({
      deal_id: "deal-1", direccion_exacta: "Calle Ejemplo 123, Apodaca", lat: null, lng: null, descripcion_completa: COMPLETA,
    });
  });

  test("CON ambas coordenadas las envía como números", async ({ page }) => {
    const llamadas = await abrir(page);
    await hastaPaso5(page);
    await page.getByLabel("Latitud").fill("25.7818");
    await page.getByLabel("Longitud").fill("-100.1883");
    await siguiente(page);
    await page.getByRole("button", { name: "Enviar a revisión" }).click();
    await page.waitForURL("**/deal/deal-1");
    expect(llamadas.find((l) => l.tabla === "deal_private")!.cuerpo).toMatchObject({ lat: 25.7818, lng: -100.1883 });
  });

  test("solo UNA coordenada: avisa y no avanza ni envía nada", async ({ page }) => {
    const llamadas = await abrir(page);
    await hastaPaso5(page);
    await page.getByLabel("Latitud").fill("25.7818");
    await siguiente(page);
    await expect(page.getByRole("alert").filter({ hasText: "ambas vacías" })).toBeVisible();
    await expect(page.getByLabel("Descripción del teaser")).toBeVisible(); // sigue en el paso 5
    expect(llamadas).toHaveLength(0);
  });

  test("coordenadas fuera de México se siguen rechazando", async ({ page }) => {
    await abrir(page);
    await hastaPaso5(page);
    await page.getByLabel("Latitud").fill("40");
    await page.getByLabel("Longitud").fill("-3");
    await siguiente(page);
    await expect(page.getByRole("alert").filter({ hasText: "Fuera de México" }).first()).toBeVisible();
    await expect(page.getByLabel("Descripción del teaser")).toBeVisible();
  });
});
