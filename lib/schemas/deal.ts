import { z } from "zod";
import { SEGMENTOS, TIPOS_OPERACION, REGIMENES } from "@/lib/catalogos";
import { evaluarCoherencia } from "@/lib/finance/coherencia";

/** "" / null / NaN -> undefined; si no, número. */
const num = (min = 0, max?: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) ? undefined : Number(v)),
    (max === undefined ? z.number().min(min) : z.number().min(min).max(max)).optional(),
  );
/** "" / null / undefined -> undefined (campo no capturado); si no, número (NaN si no es numérico: lo rechaza z.number). */
const vacioAUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : Number(v));
const texto = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().optional());

export const dealFormSchema = z
  .object({
    // 1 · básicos
    titulo: z.string().trim().min(5, "Mínimo 5 caracteres").max(160),
    tipo_operacion: z.enum(Object.keys(TIPOS_OPERACION) as [keyof typeof TIPOS_OPERACION]),
    segmento: z.enum(Object.keys(SEGMENTOS) as [keyof typeof SEGMENTOS]),
    estado_clave: z.string().regex(/^\d{2}$/, "Selecciona un estado"),
    municipio_clave: z.string().regex(/^\d{3}$/, "Selecciona un municipio"),
    colonia: texto,
    // 2 · financieros
    precio: num(1),
    m2_terreno: num(0),
    m2_construccion: num(0),
    renta_mensual_actual: num(0),
    noi_anual: num(0),
    ocupacion_pct: num(0, 100),
    num_inquilinos: num(0),
    plazo_promedio_contratos: num(0),
    monto_capital_buscado: num(1),
    participacion_ofrecida_pct: num(0, 100),
    tir_proyectada: num(-100, 500),
    // 3 · legal
    regimen_propiedad: z.enum(Object.keys(REGIMENES) as [keyof typeof REGIMENES], { errorMap: () => ({ message: "Selecciona el régimen" }) }),
    uso_suelo: texto,
    zona_restringida: z.boolean().default(false),
    // 5 · teaser vs privado
    descripcion_teaser: z.string().trim().min(30, "Mínimo 30 caracteres").max(1500),
    descripcion_completa: z.string().trim().min(30, "Mínimo 30 caracteres").max(10000),
    direccion_exacta: z.string().trim().min(5, "Captura la dirección"),
    // Coordenadas OPCIONALES (sin ellas el deal se publica, pero no sale en el mapa). Si se capturan, deben ser las dos y estar en México.
    lat: z.preprocess(vacioAUndefined, z.number({ invalid_type_error: "Latitud inválida" }).min(14, "Fuera de México").max(33, "Fuera de México").optional()),
    lng: z.preprocess(vacioAUndefined, z.number({ invalid_type_error: "Longitud inválida" }).min(-119, "Fuera de México").max(-86, "Fuera de México").optional()),
  })
  .superRefine((d, ctx) => {
    const socio = d.tipo_operacion === "busca_socio_capital";
    if (!socio && d.precio === undefined) ctx.addIssue({ code: "custom", path: ["precio"], message: "El precio es obligatorio" });
    if (socio) {
      if (d.monto_capital_buscado === undefined) ctx.addIssue({ code: "custom", path: ["monto_capital_buscado"], message: "Indica el capital buscado" });
      if (d.participacion_ofrecida_pct === undefined) ctx.addIssue({ code: "custom", path: ["participacion_ofrecida_pct"], message: "Indica la participación ofrecida" });
    }
    if (d.m2_terreno === undefined && d.m2_construccion === undefined) {
      ctx.addIssue({ code: "custom", path: ["m2_terreno"], message: "Captura m² de terreno o de construcción" });
    }
    if ((d.lat === undefined) !== (d.lng === undefined)) {
      ctx.addIssue({ code: "custom", path: [d.lat === undefined ? "lat" : "lng"], message: "Captura latitud y longitud, o deja ambas vacías" });
    }
    const c = evaluarCoherencia(d);
    c.errores.forEach((message) => ctx.addIssue({ code: "custom", path: ["noi_anual"], message }));
    // El teaser es público: no debe filtrar la dirección exacta.
    if (d.direccion_exacta && d.descripcion_teaser.toLowerCase().includes(d.direccion_exacta.toLowerCase())) {
      ctx.addIssue({ code: "custom", path: ["descripcion_teaser"], message: "El teaser es público: no incluyas la dirección exacta." });
    }
  });

export type DealForm = z.infer<typeof dealFormSchema>;

export const PASOS = ["Datos básicos", "Financieros", "Legal", "Fotos y documentos", "Teaser vs privado", "Revisión"] as const;

export const CAMPOS_POR_PASO: Record<number, string[]> = {
  0: ["titulo", "tipo_operacion", "segmento", "estado_clave", "municipio_clave", "colonia"],
  1: ["precio", "m2_terreno", "m2_construccion", "renta_mensual_actual", "noi_anual", "ocupacion_pct", "num_inquilinos", "plazo_promedio_contratos", "monto_capital_buscado", "participacion_ofrecida_pct", "tir_proyectada"],
  2: ["regimen_propiedad", "uso_suelo", "zona_restringida"],
  3: [],
  4: ["descripcion_teaser", "descripcion_completa", "direccion_exacta", "lat", "lng"],
};

/** Valida solo los campos del paso dado. Devuelve {campo: mensaje}. */
export function validarPaso(values: unknown, paso: number): Record<string, string> {
  const r = dealFormSchema.safeParse(values);
  if (r.success) return {};
  const campos = CAMPOS_POR_PASO[paso] ?? [];
  const out: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = String(i.path[0]);
    if (campos.includes(k) && !out[k]) out[k] = i.message;
  }
  return out;
}

export type ValoresForm = Record<string, string | boolean>;

/**
 * Deal (y sus datos privados) de la BD -> valores del formulario de edición. El wizard maneja TODO como texto:
 * null/undefined -> "", y los numéricos ("10000000.00" o 10000000) -> "10000000".
 */
export function valoresDesdeDeal(deal: Record<string, unknown>, privado?: Record<string, unknown> | null): ValoresForm {
  const txt = (x: unknown) => (x == null ? "" : String(x));
  const num = (x: unknown) => {
    if (x == null || x === "") return "";
    const n = Number(x);
    return Number.isFinite(n) ? String(n) : "";
  };
  return {
    titulo: txt(deal.titulo), tipo_operacion: txt(deal.tipo_operacion), segmento: txt(deal.segmento),
    estado_clave: txt(deal.estado_clave), municipio_clave: txt(deal.municipio_clave), colonia: txt(deal.colonia),
    precio: num(deal.precio), m2_terreno: num(deal.m2_terreno), m2_construccion: num(deal.m2_construccion),
    renta_mensual_actual: num(deal.renta_mensual_actual), noi_anual: num(deal.noi_anual), ocupacion_pct: num(deal.ocupacion_pct),
    num_inquilinos: num(deal.num_inquilinos), plazo_promedio_contratos: num(deal.plazo_promedio_contratos),
    monto_capital_buscado: num(deal.monto_capital_buscado), participacion_ofrecida_pct: num(deal.participacion_ofrecida_pct),
    tir_proyectada: num(deal.tir_proyectada),
    regimen_propiedad: txt(deal.regimen_propiedad), uso_suelo: txt(deal.uso_suelo), zona_restringida: !!deal.zona_restringida,
    descripcion_teaser: txt(deal.descripcion_teaser),
    direccion_exacta: txt(privado?.direccion_exacta), lat: num(privado?.lat), lng: num(privado?.lng),
    descripcion_completa: txt(privado?.descripcion_completa),
  };
}
