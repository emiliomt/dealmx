import { describe, expect, it } from "vitest";
import { filtrosToJson, filtrosToParams, parseFiltros, tieneFiltros } from "@/lib/search/filters";

const qs = (s: string) => parseFiltros(new URLSearchParams(s));

describe("parseFiltros", () => {
  it("defaults", () => {
    const f = qs("");
    expect(f).toMatchObject({ segmento: [], operacion: [], solo_renta: false, orden: "recientes", pagina: 1 });
    expect(tieneFiltros(f)).toBe(false);
  });
  it("lee todos los filtros", () => {
    const f = qs("estado=19&municipio=039&segmento=industrial,comercial&operacion=venta&precio_min=5000000&precio_max=20000000&cap_min=8&m2_min=1000&m2_max=5000&ocup_min=90&renta=1&orden=cap_desc&pagina=3");
    expect(f).toEqual({ estado: "19", municipio: "039", segmento: ["industrial", "comercial"], operacion: ["venta"], precio_min: 5e6, precio_max: 2e7, cap_min: 8, m2_min: 1000, m2_max: 5000, ocup_min: 90, solo_renta: true, orden: "cap_desc", pagina: 3 });
  });
  it("descarta valores inválidos sin romper", () => {
    const f = qs("estado=XX&segmento=casa,industrial,';drop&precio_min=abc&cap_min=-4&ocup_min=500&orden=hack&pagina=-2&renta=0");
    expect(f.estado).toBeUndefined();
    expect(f.segmento).toEqual(["industrial"]);
    expect(f.precio_min).toBeUndefined();
    expect(f.cap_min).toBeUndefined();
    expect(f.ocup_min).toBeUndefined();
    expect(f.orden).toBe("recientes");
    expect(f.pagina).toBe(1);
    expect(f.solo_renta).toBe(false);
  });
  it("municipio sin estado se ignora", () => expect(qs("municipio=039").municipio).toBeUndefined());
  it("intercambia rangos invertidos", () => {
    const f = qs("precio_min=9&precio_max=3&m2_min=50&m2_max=10");
    expect([f.precio_min, f.precio_max, f.m2_min, f.m2_max]).toEqual([3, 9, 10, 50]);
  });
  it("acepta parámetros repetidos de Next (arrays)", () => {
    expect(parseFiltros({ segmento: ["terreno", "mixto"], estado: ["05", "19"] }).segmento).toEqual(["terreno", "mixto"]);
    expect(parseFiltros({ estado: ["05", "19"] }).estado).toBe("05");
  });
});

describe("serialización", () => {
  it("ida y vuelta por URL", () => {
    const f = qs("estado=05&municipio=030&segmento=oficinas,mixto&cap_min=7.5&renta=1&orden=precio_asc&pagina=2");
    expect(qs(filtrosToParams(f).toString())).toEqual(f);
  });
  it("omite defaults", () => expect(filtrosToParams(qs("orden=recientes&pagina=1")).toString()).toBe(""));
  it("JSON guardado se vuelve a leer igual (sin orden ni página)", () => {
    const f = qs("estado=19&segmento=industrial&precio_max=1e7&cap_min=8&renta=1&orden=cap_desc&pagina=4&ocup_min=80");
    const json = filtrosToJson(f);
    expect(json).not.toHaveProperty("orden");
    expect(parseFiltros(json)).toEqual({ ...f, orden: "recientes", pagina: 1 });
  });
});
