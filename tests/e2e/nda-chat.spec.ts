import { expect, test } from "@playwright/test";

const DEAL = "11111111-1111-4111-8111-111111111111";
const YO = "22222222-2222-4222-8222-222222222222";

// Red simulada: verifica el comportamiento de los componentes y la forma de las peticiones.
// NO prueba RLS (eso lo cubre `npm run test:rls`).
test.describe("NDA y chat (componentes con red simulada)", () => {
  test("firma del NDA: validación, petición correcta y estado de espera", async ({ page }) => {
    let cuerpo: Record<string, unknown> | null = null;
    await page.route("**/api/nda/firmar", async (route) => {
      cuerpo = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ estado: "firmado" }) });
    });
    await page.route("**/rest/v1/messages*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto("/e2e/nda");

    const boton = page.getByRole("button", { name: "Firmar NDA y solicitar acceso" });
    await expect(boton).toBeDisabled();
    await page.getByLabel("Nombre completo (firma)").fill("Ana");
    await page.getByRole("checkbox").check();
    await expect(boton).toBeDisabled(); // nombre muy corto
    await page.getByLabel("Nombre completo (firma)").fill("Ana López Pérez");
    await expect(boton).toBeEnabled();
    await boton.click();

    await expect(page.getByText("NDA firmado. Esperando la aprobación del vendedor")).toBeVisible();
    expect(cuerpo).toEqual({ dealId: DEAL, nombre: "Ana López Pérez", acepto: true });
  });

  test("firma: muestra el error del servidor y permite reintentar", async ({ page }) => {
    await page.route("**/api/nda/firmar", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "No se pudo registrar la firma" }) }));
    await page.route("**/rest/v1/messages*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto("/e2e/nda");
    await page.getByLabel("Nombre completo (firma)").fill("Ana López Pérez");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Firmar NDA y solicitar acceso" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "No se pudo registrar la firma" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Firmar NDA y solicitar acceso" })).toBeEnabled();
  });

  test("chat: carga historial, envía con los campos correctos y escapa el HTML", async ({ page }) => {
    let enviado: Record<string, unknown> | null = null;
    const hist = [{ id: "m1", sender_id: "99999999-9999-4999-8999-999999999999", body: "<img src=x onerror=alert(1)> Hola", created_at: "2026-11-18T10:00:00Z" }];
    let dialogo = false;
    page.on("dialog", async (d) => { dialogo = true; await d.dismiss(); });
    await page.route("**/rest/v1/messages*", async (route) => {
      const req = route.request();
      if (req.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hist) });
      enviado = req.postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "m2", sender_id: YO, body: "Me interesa", created_at: "2026-11-18T10:05:00Z" }) });
    });
    await page.goto("/e2e/nda");
    const log = page.getByRole("log");
    await expect(log).toContainText("<img src=x onerror=alert(1)> Hola");
    await expect(log.locator("img")).toHaveCount(0);

    await page.getByLabel("Mensaje").fill("Me interesa");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(log).toContainText("Me interesa");
    await expect(page.getByLabel("Mensaje")).toHaveValue("");
    expect(enviado).toEqual({ deal_id: DEAL, thread_user_id: YO, sender_id: YO, body: "Me interesa" });
    expect(dialogo).toBe(false);
  });

  test("chat: error de envío se avisa y conserva el texto", async ({ page }) => {
    await page.route("**/rest/v1/messages*", (route) => route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
      : route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "new row violates row-level security policy" }) }));
    await page.goto("/e2e/nda");
    await page.getByLabel("Mensaje").fill("hola");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "No se pudo enviar" })).toBeVisible();
    await expect(page.getByLabel("Mensaje")).toHaveValue("hola");
  });
});
