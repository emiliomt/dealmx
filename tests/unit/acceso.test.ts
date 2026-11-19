import { describe, expect, it } from "vitest";
import { puedeVerPrivado } from "@/lib/acceso";

const base = { esDueno: false, esAdmin: false, ndaEstado: null as string | null, tienePrivado: false };

describe("puedeVerPrivado", () => {
  it("dueño y admin siempre", () => {
    expect(puedeVerPrivado({ ...base, esDueno: true })).toBe(true);
    expect(puedeVerPrivado({ ...base, esAdmin: true })).toBe(true);
  });
  it("NDA aprobado ve el data room AUNQUE el deal no tenga fila deal_private (hallazgo de la revisión)", () => {
    expect(puedeVerPrivado({ ...base, ndaEstado: "aprobado", tienePrivado: false })).toBe(true);
  });
  it("si RLS entregó deal_private, también", () => expect(puedeVerPrivado({ ...base, tienePrivado: true })).toBe(true));
  it.each([null, undefined, "solicitado", "firmado", "rechazado"])("NDA %s sin deal_private: no", (ndaEstado) => {
    expect(puedeVerPrivado({ ...base, ndaEstado })).toBe(false);
  });
});
