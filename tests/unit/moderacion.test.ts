import { describe, expect, it } from "vitest";
import { senalesModeracion, type DealParaModerar } from "@/lib/moderacion";

const sano: DealParaModerar = {
  precio: 10_000_000, noi_anual: 900_000, renta_mensual_actual: 100_000, ocupacion_pct: 95, tir_proyectada: null,
  zona_restringida: false, regimen_propiedad: "escritura", descripcion_teaser: "x".repeat(120),
};
const ctxOk = { fotos: 3, documentos: 2, vendedorVerificado: true, datosPrivadosCompletos: true };
const textos = (s: ReturnType<typeof senalesModeracion>) => s.map((x) => x.texto);

describe("senalesModeracion", () => {
  it("un deal completo y coherente no genera señales", () => expect(senalesModeracion(sano, ctxOk)).toEqual([]));
  it("sin fotos es alerta; data room vacío y vendedor sin verificar son avisos", () => {
    const s = senalesModeracion(sano, { fotos: 0, documentos: 0, vendedorVerificado: false, datosPrivadosCompletos: true });
    expect(s.find((x) => x.texto.includes("fotos"))?.nivel).toBe("alerta");
    expect(s.find((x) => x.texto.includes("data room"))?.nivel).toBe("aviso");
    expect(s.find((x) => x.texto.includes("verificado"))?.nivel).toBe("aviso");
  });
  it("faltan datos privados es ALERTA (un deal así publicado dejaría sin contenido a quien tenga NDA)", () => {
    const s = senalesModeracion(sano, { ...ctxOk, datosPrivadosCompletos: false });
    expect(s).toHaveLength(1);
    expect(s[0].nivel).toBe("alerta"); expect(s[0].texto).toContain("Faltan datos privados");
  });
  it("reusa la coherencia NOI/renta/precio: NOI mayor a la renta anual es alerta", () => {
    const s = senalesModeracion({ ...sano, noi_anual: 1_500_000 }, ctxOk);
    expect(s).toContainEqual({ nivel: "alerta", texto: "El NOI anual no puede exceder la renta anual bruta (renta mensual × 12)." });
  });
  it("cap rate implícito alto solo avisa", () => {
    const s = senalesModeracion({ ...sano, precio: 5_000_000, noi_anual: 900_000 }, ctxOk);
    expect(s.some((x) => x.nivel === "alerta")).toBe(false);
    expect(textos(s).join()).toContain("Cap rate implícito alto");
  });
  it("ejido y zona restringida piden revisión legal", () => {
    const t = textos(senalesModeracion({ ...sano, regimen_propiedad: "ejido", zona_restringida: true }, ctxOk)).join("|");
    expect(t).toContain("ejidal"); expect(t).toContain("zona restringida");
  });
  it("teaser corto", () => expect(textos(senalesModeracion({ ...sano, descripcion_teaser: "muy corto" }, ctxOk))).toContain("El teaser es muy corto."));
});
