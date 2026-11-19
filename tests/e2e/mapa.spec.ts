import { expect, test } from "@playwright/test";

test.describe("mapa de deals (arnés sin BD)", () => {
  test("carga, agrupa los 5 puntos y no inyecta HTML del título", async ({ page }) => {
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    let dialogo = false;
    page.on("dialog", async (d) => { dialogo = true; await d.dismiss(); });
    // Sin red a OSM en CI: los mosaicos fallan, el mapa y las capas deben funcionar igual.
    await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());

    await page.goto("/e2e/mapa");
    const mapa = page.getByRole("region", { name: /Mapa con 5 oportunidades/ });
    await expect(mapa).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await expect(mapa.locator("canvas")).toBeVisible();

    // Todas las features (agrupadas o sueltas) suman 5.
    await page.waitForFunction(() => {
      const m = (window as any).__map;
      return m && m.isStyleLoaded() && m.querySourceFeatures("deals").length > 0;
    });
    const total = await page.evaluate(() => {
      const m = (window as any).__map;
      const fs = m.querySourceFeatures("deals");
      const vistos = new Map<string, number>();
      fs.forEach((f: any) => vistos.set(f.properties.cluster_id ?? f.properties.id, f.properties.point_count ?? 1));
      return [...vistos.values()].reduce((a, b) => a + b, 0);
    });
    expect(total).toBe(5);

    // Ajustar el zoom lo suficiente separa el punto de Saltillo (lejano) como individual.
    await page.evaluate(() => (window as any).__map.jumpTo({ center: [-101.0053, 25.4232], zoom: 12 }));
    await page.waitForFunction(() => (window as any).__map.queryRenderedFeatures({ layers: ["puntos"] }).length >= 1);

    // Popup: el título con HTML se muestra como texto, sin ejecutar nada.
    await page.evaluate(() => (window as any).__map.jumpTo({ center: [-100.3161, 25.6866], zoom: 16 }));
    await page.waitForFunction(() => (window as any).__map.queryRenderedFeatures({ layers: ["puntos"] }).length >= 1);
    const centro = await page.evaluate(() => { const m = (window as any).__map; const p = m.project([-100.3161, 25.6866]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; });
    await page.mouse.click(centro.x, centro.y);
    const popup = page.locator(".maplibregl-popup-content");
    await expect(popup).toContainText("<img src=x onerror=alert(1)> Nave A");
    await expect(popup.locator("img")).toHaveCount(0);
    await expect(popup.getByRole("link", { name: "Ver ficha" })).toHaveAttribute("href", "/deal/00000000-0000-4000-8000-000000000001");

    expect(dialogo).toBe(false);
    expect(errores).toEqual([]);
  });
});
