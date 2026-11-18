import { describe, expect, it } from "vitest";
import { registroSchema } from "@/lib/schemas/auth";

const base = { nombre: "Ana López", email: "ana@example.com", password: "12345678" };
describe("registroSchema", () => {
  it("acepta inversionista y vendedor", () => {
    expect(registroSchema.safeParse({ ...base, rol: "inversionista" }).success).toBe(true);
    expect(registroSchema.safeParse({ ...base, rol: "vendedor" }).success).toBe(true);
  });
  it("rechaza admin desde el cliente", () => {
    expect(registroSchema.safeParse({ ...base, rol: "admin" }).success).toBe(false);
  });
  it("rechaza contraseña corta", () => {
    expect(registroSchema.safeParse({ ...base, rol: "vendedor", password: "123" }).success).toBe(false);
  });
});
