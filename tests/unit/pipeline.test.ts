import { describe, expect, it } from "vitest";
import { ETAPAS, agrupar, esEtapa, mover, type Etapa } from "@/lib/pipeline";
import { describirFiltros } from "@/lib/search/describir";
import { parseFiltros } from "@/lib/search/filters";

const it1 = (id: string, etapa: Etapa) => ({ id, etapa });

describe("pipeline", () => {
  it("las etapas coinciden con el enum de la BD", () => expect([...ETAPAS]).toEqual(["visto", "nda", "oferta", "due_diligence", "cierre", "descartado"]));
  it("esEtapa valida", () => { expect(esEtapa("oferta")).toBe(true); expect(esEtapa("hack")).toBe(false); expect(esEtapa(undefined)).toBe(false); });
  it("mover cambia solo la tarjeta indicada y no muta", () => {
    const a = [it1("1", "visto"), it1("2", "nda")];
    const b = mover(a, "1", "oferta");
    expect(b.map((x) => x.etapa)).toEqual(["oferta", "nda"]);
    expect(a[0].etapa).toBe("visto");
  });
  it("mover a la misma etapa o a un id inexistente devuelve la misma referencia", () => {
    const a = [it1("1", "visto")];
    expect(mover(a, "1", "visto")).toBe(a);
    expect(mover(a, "zzz", "cierre")).toBe(a);
  });
  it("agrupar crea todas las columnas, incluso vacías", () => {
    const g = agrupar([it1("1", "visto"), it1("2", "visto"), it1("3", "cierre")]);
    expect(Object.keys(g)).toEqual([...ETAPAS]);
    expect(g.visto).toHaveLength(2); expect(g.cierre).toHaveLength(1); expect(g.oferta).toHaveLength(0);
  });
});

describe("describirFiltros", () => {
  const f = (q: string) => parseFiltros(new URLSearchParams(q));
  it("sin filtros", () => expect(describirFiltros(f(""))).toBe("Todos los deals"));
  it("combina estado, segmento, precio, cap rate y renta", () => {
    const t = describirFiltros(f("estado=19&municipio=006&segmento=industrial,comercial&precio_min=5000000&precio_max=20000000&cap_min=8&renta=1"), { estado: "Nuevo León", municipio: "Apodaca" });
    expect(t).toBe("Apodaca, Nuevo León · Industrial / Comercial · $5 mdp a $20 mdp · cap rate ≥ 8% · solo con renta");
  });
  it("sin nombres usa la clave", () => expect(describirFiltros(f("estado=05"))).toBe("Estado 05"));
  it("rangos abiertos", () => {
    expect(describirFiltros(f("precio_max=3000000"))).toBe("hasta $3 mdp");
    expect(describirFiltros(f("m2_min=500"))).toBe("≥ 500 m²");
  });
});
