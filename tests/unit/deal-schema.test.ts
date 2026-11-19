import { describe, expect, it } from "vitest";
import { dealFormSchema, validarPaso, valoresDesdeDeal } from "@/lib/schemas/deal";

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

describe("valoresDesdeDeal (deal de la BD -> valores del formulario de edición)", () => {
  const deal = {
    titulo: "Nave en Apodaca", tipo_operacion: "venta", segmento: "industrial", estado_clave: "19", municipio_clave: "006", colonia: null,
    precio: "10000000.00", m2_terreno: null, m2_construccion: 2000, renta_mensual_actual: 100000, noi_anual: "900000.00",
    ocupacion_pct: "95.00", num_inquilinos: 2, plazo_promedio_contratos: "3.0", regimen_propiedad: "escritura", uso_suelo: null,
    zona_restringida: false, monto_capital_buscado: null, participacion_ofrecida_pct: null, tir_proyectada: null,
    descripcion_teaser: "Teaser público de la nave industrial con rentas vigentes.",
  };
  const privado = { direccion_exacta: "Calle Ejemplo 123", lat: 25.7818, lng: -100.1883, descripcion_completa: "Descripción completa y confidencial de la nave industrial." };

  it("null/undefined -> cadena vacía; números (o numéricos como texto) -> cadena sin ceros sobrantes", () => {
    const v = valoresDesdeDeal(deal, privado);
    expect(v.colonia).toBe(""); expect(v.m2_terreno).toBe(""); expect(v.uso_suelo).toBe(""); expect(v.tir_proyectada).toBe("");
    expect(v.precio).toBe("10000000"); expect(v.noi_anual).toBe("900000"); expect(v.ocupacion_pct).toBe("95");
    expect(v.m2_construccion).toBe("2000"); expect(v.plazo_promedio_contratos).toBe("3"); expect(v.num_inquilinos).toBe("2");
  });
  it("conserva textos y el booleano zona_restringida", () => {
    const v = valoresDesdeDeal({ ...deal, zona_restringida: true }, privado);
    expect(v).toMatchObject({ titulo: "Nave en Apodaca", tipo_operacion: "venta", segmento: "industrial", estado_clave: "19", municipio_clave: "006", regimen_propiedad: "escritura", zona_restringida: true, descripcion_teaser: "Teaser público de la nave industrial con rentas vigentes." });
  });
  it("incluye los datos privados; sin deal_private quedan vacíos", () => {
    expect(valoresDesdeDeal(deal, privado)).toMatchObject({ direccion_exacta: "Calle Ejemplo 123", lat: "25.7818", lng: "-100.1883", descripcion_completa: "Descripción completa y confidencial de la nave industrial." });
    expect(valoresDesdeDeal(deal, null)).toMatchObject({ direccion_exacta: "", lat: "", lng: "", descripcion_completa: "" });
  });
  it("el resultado pasa la validación completa (ida y vuelta con el esquema)", () => {
    expect(dealFormSchema.safeParse(valoresDesdeDeal(deal, privado)).success).toBe(true);
  });
});
