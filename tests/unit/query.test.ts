import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { aplicarFiltros, aplicarOrden, COLUMNAS_LISTA } from "@/lib/search/query";
import { parseFiltros } from "@/lib/search/filters";

/** Cliente real de supabase-js con fetch capturado: verifica la consulta PostgREST que se enviaría. */
async function urlDe(qs: string): Promise<string> {
  let url = "";
  const sb = createClient("http://localhost:54321", "anon", {
    global: { fetch: async (u) => { url = decodeURIComponent(String(u)); return new Response("[]", { status: 200, headers: { "content-type": "application/json" } }); } },
  });
  const f = parseFiltros(new URLSearchParams(qs));
  await aplicarOrden(aplicarFiltros(sb.from("deals").select(COLUMNAS_LISTA), f), f.orden);
  return url;
}

describe("aplicarFiltros → PostgREST", () => {
  it("sin filtros solo limita a estatus buscables", async () => {
    const u = await urlDe("");
    expect(u).toContain("status=in.(publicado,en_negociacion)");
    expect(u).not.toContain("precio=");
  });
  it("traduce cada filtro", async () => {
    const u = await urlDe("estado=19&municipio=039&segmento=industrial,comercial&operacion=venta,remate&precio_min=5000000&precio_max=20000000&cap_min=8&m2_min=1000&m2_max=5000&ocup_min=90&renta=1");
    for (const parte of [
      "estado_clave=eq.19", "municipio_clave=eq.039", "segmento=in.(industrial,comercial)", "tipo_operacion=in.(venta,remate)",
      "precio=gte.5000000", "precio=lte.20000000", "cap_rate=gte.0.08", "m2_ref=gte.1000", "m2_ref=lte.5000",
      "ocupacion_pct=gte.90", "renta_mensual_actual=gt.0",
    ]) expect(u).toContain(parte);
  });
  it("cap rate mínimo se convierte de % a fracción", async () => {
    expect(await urlDe("cap_min=7.5")).toContain("cap_rate=gte.0.075");
  });
  it("ordenamientos con desempate estable", async () => {
    expect(await urlDe("orden=precio_asc")).toContain("order=precio.asc.nullslast,id.asc");
    expect(await urlDe("orden=cap_desc")).toContain("order=cap_rate.desc.nullslast,id.asc");
    expect(await urlDe("")).toContain("order=published_at.desc.nullslast,id.asc");
  });
  it("no filtra por municipio sin estado", async () => {
    expect(await urlDe("municipio=039")).not.toContain("municipio_clave=");
  });
});
