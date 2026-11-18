import { expect, test, type Page } from "@playwright/test";

// Red simulada: valida UI y la forma de las llamadas RPC. La autorización real está en la BD y se prueba con `npm run test:rls`.
type Llamada = { rpc: string; cuerpo: Record<string, unknown> };
async function abrir(page: Page, respuestas: Record<string, { status: number; body: unknown }> = {}) {
  const llamadas: Llamada[] = [];
  await page.route("**/rest/v1/rpc/*", async (route) => {
    const rpc = new URL(route.request().url()).pathname.split("/").pop()!;
    llamadas.push({ rpc, cuerpo: route.request().postDataJSON() });
    const r = respuestas[rpc] ?? { status: 200, body: null };
    await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
  });
  await page.goto("/e2e/admin");
  return llamadas;
}

test.describe("administración (componentes con red simulada)", () => {
  test("cola: muestra señales y el rechazo previo; aprobar llama a moderar_deal y saca el deal de la cola", async ({ page }) => {
    const llamadas = await abrir(page);
    const d1 = page.locator("li", { hasText: "Nave Uno" }).first();
    await expect(d1.getByText("No tiene fotos.")).toBeVisible();
    await expect(d1.getByText("Rechazo previo: Faltaban fotos")).toBeVisible();
    await d1.getByRole("button", { name: "Aprobar y publicar" }).click();
    await expect(page.getByRole("link", { name: "Nave Uno" })).toHaveCount(0);
    expect(llamadas).toEqual([{ rpc: "moderar_deal", cuerpo: { p_deal: "d1", p_accion: "aprobar", p_motivo: null } }]);
  });

  test("cola: rechazar exige un motivo de al menos 10 caracteres y lo envía", async ({ page }) => {
    const llamadas = await abrir(page);
    const d2 = page.locator("li", { hasText: "Local Dos" }).first();
    await d2.getByRole("button", { name: "Rechazar…" }).click();
    const confirmar = d2.getByRole("button", { name: "Confirmar rechazo" });
    await expect(confirmar).toBeDisabled();
    await d2.getByLabel(/Motivo/).fill("corto");
    await expect(confirmar).toBeDisabled();
    await d2.getByLabel(/Motivo/).fill("  El NOI no cuadra con la renta  ");
    await expect(confirmar).toBeEnabled();
    await confirmar.click();
    await expect(page.getByRole("link", { name: "Local Dos" })).toHaveCount(0);
    expect(llamadas[0]).toEqual({ rpc: "moderar_deal", cuerpo: { p_deal: "d2", p_accion: "rechazar", p_motivo: "El NOI no cuadra con la renta" } });
  });

  test("cola: si la BD rechaza la acción (p. ej. ya estaba resuelta) se muestra el mensaje y el deal sigue en la cola", async ({ page }) => {
    await abrir(page, { moderar_deal: { status: 400, body: { message: "Solo se aprueban deals en revisión", code: "P0001" } } });
    await page.locator("li", { hasText: "Nave Uno" }).first().getByRole("button", { name: "Aprobar y publicar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Solo se aprueban deals en revisión" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nave Uno" })).toBeVisible();
  });

  test("usuarios: verificar y rechazar (con motivo) llaman a verificar_usuario", async ({ page }) => {
    const llamadas = await abrir(page);
    const ana = page.locator("li", { hasText: "Ana Vendedora" });
    await expect(ana.getByText("Reg. asesor NL-123 (Nuevo León)")).toBeVisible();
    await ana.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByText("Ana Vendedora")).toHaveCount(0);

    const beto = page.locator("li", { hasText: "Beto Inversionista" });
    await beto.getByRole("button", { name: "Revocar…" }).click();
    const confirmar = beto.getByRole("button", { name: "Confirmar" });
    await expect(confirmar).toBeDisabled();
    await beto.getByLabel(/Motivo/).fill("Datos falsos");
    await confirmar.click();
    expect(llamadas.filter((l) => l.rpc === "verificar_usuario").map((l) => l.cuerpo)).toEqual([
      { p_user: "u1", p_estado: "verificado", p_nota: null },
      { p_user: "u2", p_estado: "rechazado", p_nota: "Datos falsos" },
    ]);
  });

  test("ficha admin: despublicar pide motivo; reabrir solo aparece en NDAs rechazados", async ({ page }) => {
    const llamadas = await abrir(page);
    const panel = page.getByRole("region", { name: "Panel de administración" });
    await expect(panel.getByRole("button", { name: "Reabrir…" })).toHaveCount(1); // solo Carla (rechazado)
    await panel.getByRole("button", { name: "Despublicar…" }).click();
    const conf = panel.getByRole("button", { name: "Confirmar despublicación" });
    await expect(conf).toBeDisabled();
    await panel.getByLabel(/Motivo/).fill("Reporte de duplicado");
    await conf.click();
    await expect(panel.getByRole("status")).toContainText("Deal despublicado");

    await panel.getByRole("button", { name: "Reabrir…" }).click();
    await panel.getByLabel(/Motivo/).fill("Error del vendedor");
    await panel.getByRole("button", { name: "Confirmar reapertura" }).click();
    expect(llamadas.map((l) => [l.rpc, l.cuerpo])).toEqual([
      ["moderar_deal", { p_deal: "d9", p_accion: "despublicar", p_motivo: "Reporte de duplicado" }],
      ["reabrir_nda", { p_nda: "n1", p_motivo: "Error del vendedor" }],
    ]);
  });
});
