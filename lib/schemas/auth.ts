import { z } from "zod";

export const registroSchema = z.object({
  nombre: z.string().trim().min(2, "Ingresa tu nombre"),
  email: z.string().trim().email("Correo inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  rol: z.enum(["inversionista", "vendedor"]), // 'admin' nunca se elige desde el cliente
  empresa: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
});
export const loginSchema = z.object({
  email: z.string().trim().email("Correo inválido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});
export type RegistroInput = z.infer<typeof registroSchema>;
