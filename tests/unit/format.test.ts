import { describe, expect, it } from "vitest";
import { formatMoney, formatMdp, formatM2, formatPct } from "@/lib/format";

describe("format es-MX", () => {
  it("MXN", () => expect(formatMoney(12500000)).toBe("$12,500,000 MXN"));
  it("USD con tipo de cambio dado", () => expect(formatMoney(2000000, "USD", 20)).toBe("$100,000 USD"));
  it("USD sin fx cae a MXN", () => expect(formatMoney(1000, "USD", null)).toBe("$1,000 MXN"));
  it("mdp", () => expect(formatMdp(12500000)).toBe("$12.5 mdp"));
  it("mdp bajo 1 millón usa formato completo", () => expect(formatMdp(500000)).toBe("$500,000 MXN"));
  it("m2", () => expect(formatM2(1234)).toBe("1,234 m²"));
  it("pct", () => expect(formatPct(0.0875)).toBe("8.75%"));
  it("nulos", () => { expect(formatMoney(null)).toBe("—"); expect(formatPct(undefined)).toBe("—"); });
});
