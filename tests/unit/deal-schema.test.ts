import { describe, expect, it } from "vitest";
import { dealFormSchema, validarPaso } from "@/lib/schemas/deal";

const ok = {
  titulo: "Nave industrial de prueba", tipo_operacion: "venta", segmento: "industrial",
  estado_clave: "19", municipio_clave: "006", colonia: "",
  precio: "10000000", m2_terreno: "", m2_construccion: "2000", renta_mensual_actual: "100000", noi_anual: "900000",
  ocupacion_pct: "95", num_inquilinos: "2", plazo_promedio_contratos: "3",
  monto_capital_buscado: "", participacion_ofrecida_pct: "", tir_proyectada: "",
  regimen_propiedad: "escritura", uso_suelo: "", zona_restringida: false,
  descripcion_teaser: "Nave industrial bien ubicada con rentas vigentes.",
  descripcion_completa: "Descripción completa con detalles confidenciales del inmueble.",
  direccion_exacta: "Calle Ejemplo 123, Apodaca", lat: "25.78", lng: "-100.19",
};

describe("dealFormSchema", () => {
  it("acepta un deal válido (strings de formulario se convierten)", () => {
    const r = dealFormSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.precio).toBe(10000000); expect(r.data.colonia).toBeUndefined(); }
  });
  it("venta exige precio", () => {
    const r = dealFormSchema.safeParse({ ...ok, precio: "" });
    expect(r.success).toBe(false);
  });
  it("socio capitalista exige capital y participación, no precio", () => {
    const base = { ...ok, tipo_operacion: "busca_socio_capital", precio: "", noi_anual: "" };
    expect(dealFormSchema.safeParse(base).success).toBe(false);
    expect(dealFormSchema.safeParse({ ...base, monto_capital_buscado: "5000000", participacion_ofrecida_pct: "30" }).success).toBe(true);
  });
  it("rechaza NOI incoherente con la renta", () => {
    const r = dealFormSchema.safeParse({ ...ok, noi_anual: "2000000" });
    expect(r.success).toBe(false);
    expect(validarPaso({ ...ok, noi_anual: "2000000" }, 1).noi_anual).toMatch(/renta anual/);
  });
  it("coordenadas fuera de México", () => {
    expect(dealFormSchema.safeParse({ ...ok, lat: "40", lng: "-3" }).success).toBe(false);
  });
  it("latitud y longitud son OPCIONALES: vacías o ausentes es válido", () => {
    expect(dealFormSchema.safeParse({ ...ok, lat: "", lng: "" }).success).toBe(true);
    const { lat: _lat, lng: _lng, ...sinCoordenadas } = ok;
    expect(dealFormSchema.safeParse(sinCoordenadas).success).toBe(true);
    expect(validarPaso({ ...ok, lat: "", lng: "" }, 4)).toEqual({});
  });
  it("o se capturan las dos coordenadas o ninguna", () => {
    expect(dealFormSchema.safeParse({ ...ok, lat: "25.78", lng: "" }).success).toBe(false);
    expect(dealFormSchema.safeParse({ ...ok, lat: "", lng: "-100.19" }).success).toBe(false);
    const e = validarPaso({ ...ok, lat: "25.78", lng: "" }, 4);
    expect(Object.values(e).join()).toMatch(/ambas vacías/);
  });
  it("si se capturan, valores no numéricos siguen siendo error", () => {
    expect(dealFormSchema.safeParse({ ...ok, lat: "abc", lng: "-100.19" }).success).toBe(false);
  });
  it("el teaser no puede filtrar la dirección exacta", () => {
    const r = dealFormSchema.safeParse({ ...ok, descripcion_teaser: "Ubicada en Calle Ejemplo 123, Apodaca, excelente acceso a la carretera." });
    expect(r.success).toBe(false);
  });
  it("validarPaso solo reporta campos del paso", () => {
    const e = validarPaso({ ...ok, titulo: "x", descripcion_teaser: "corto" }, 0);
    expect(Object.keys(e)).toEqual(["titulo"]);
  });
  it("requiere m² de terreno o construcción", () => {
    expect(dealFormSchema.safeParse({ ...ok, m2_construccion: "", m2_terreno: "" }).success).toBe(false);
  });
});
