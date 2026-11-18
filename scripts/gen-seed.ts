/**
 * Genera supabase/seed.sql: 30 deals FICTICIOS (es_ejemplo = true) en el área metropolitana de Monterrey y Saltillo.
 * Determinista: `npx tsx scripts/gen-seed.ts` produce siempre el mismo archivo.
 */
import { writeFileSync } from "node:fs";

function rng(seed: number) { // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r = rng(20261118);
const rand = (a: number, b: number) => a + r() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
const redondea = (n: number, paso: number) => Math.round(n / paso) * paso;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const MUNIS = [
  { nombre: "Monterrey", e: "19", m: "039", lat: 25.6866, lng: -100.3161, colonias: ["Centro", "Mitras Centro", "Cumbres", "Tecnológico"] },
  { nombre: "San Pedro Garza García", e: "19", m: "019", lat: 25.6511, lng: -100.4029, colonias: ["Valle Oriente", "Del Valle", "Fuentes del Valle"] },
  { nombre: "Apodaca", e: "19", m: "006", lat: 25.7818, lng: -100.1883, colonias: ["Zona Industrial", "Huinalá", "Centro"] },
  { nombre: "General Escobedo", e: "19", m: "021", lat: 25.797, lng: -100.317, colonias: ["Centro", "Zona Industrial", "Belisario Domínguez"] },
  { nombre: "Santa Catarina", e: "19", m: "048", lat: 25.6733, lng: -100.458, colonias: ["Centro", "Zona Industrial", "La Fama"] },
  { nombre: "Saltillo", e: "05", m: "030", lat: 25.4232, lng: -101.0053, colonias: ["Centro", "Zona Norte", "República Oriente"] },
  { nombre: "Ramos Arizpe", e: "05", m: "027", lat: 25.54, lng: -100.95, colonias: ["Centro", "Parque Industrial", "Zona Sur"] },
];

type Seg = "industrial" | "comercial" | "oficinas" | "multifamiliar" | "hotelero" | "terreno" | "mixto";
const PERFIL: Record<Seg, { m2: [number, number]; pm2: [number, number]; cap: [number, number]; nombre: string; titulos: string[] }> = {
  industrial: { m2: [1500, 12000], pm2: [12000, 22000], cap: [0.08, 0.11], nombre: "Nave industrial", titulos: ["Nave industrial con andén", "Bodega logística", "Nave con oficinas"] },
  comercial: { m2: [300, 4000], pm2: [25000, 55000], cap: [0.07, 0.095], nombre: "Local comercial", titulos: ["Plaza comercial", "Locales en esquina", "Strip center"] },
  oficinas: { m2: [500, 6000], pm2: [30000, 60000], cap: [0.07, 0.09], nombre: "Edificio de oficinas", titulos: ["Edificio de oficinas", "Torre corporativa pequeña", "Piso de oficinas"] },
  multifamiliar: { m2: [1500, 8000], pm2: [22000, 40000], cap: [0.06, 0.085], nombre: "Multifamiliar", titulos: ["Conjunto de departamentos", "Edificio multifamiliar", "Residencial en renta"] },
  hotelero: { m2: [2000, 9000], pm2: [25000, 45000], cap: [0.06, 0.09], nombre: "Hotel", titulos: ["Hotel de negocios", "Hotel boutique", "Hotel de carretera"] },
  terreno: { m2: [2000, 50000], pm2: [1500, 9000], cap: [0, 0], nombre: "Terreno", titulos: ["Terreno para desarrollo", "Lote industrial", "Terreno comercial"] },
  mixto: { m2: [800, 5000], pm2: [25000, 45000], cap: [0.065, 0.09], nombre: "Uso mixto", titulos: ["Edificio de uso mixto", "Comercio y departamentos", "Proyecto mixto"] },
};
const SEGS = Object.keys(PERFIL) as Seg[];

const vendedores = [
  { id: "00000000-0000-4000-8000-000000000a01", nombre: "Vendedor Demo 1 (ficticio)", email: "demo-vendedor1@dealmx.invalid" },
  { id: "00000000-0000-4000-8000-000000000a02", nombre: "Vendedor Demo 2 (ficticio)", email: "demo-vendedor2@dealmx.invalid" },
  { id: "00000000-0000-4000-8000-000000000a03", nombre: "Vendedor Demo 3 (ficticio)", email: "demo-vendedor3@dealmx.invalid" },
];

const out: string[] = [
  "-- DealMX · seed: 30 deals de EJEMPLO FICTICIOS (es_ejemplo = true). Generado por scripts/gen-seed.ts",
  "-- Nada de esto corresponde a inmuebles, personas o cifras reales.",
];
for (const v of vendedores) {
  out.push(`insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values (${q(v.id)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(v.email)}, ${q(JSON.stringify({ rol: "vendedor", nombre: v.nombre, empresa: "Empresa Ficticia S.A. (ejemplo)" }))}::jsonb, now(), now()) on conflict (id) do nothing;`);
}
out.push(`update profiles set estado_verificacion = 'verificado' where id in (${vendedores.map((v) => q(v.id)).join(",")});`);

for (let i = 0; i < 30; i++) {
  const seg = SEGS[i % 7];
  const p = PERFIL[seg];
  const mu = MUNIS[(i * 3 + Math.floor(r() * 2)) % MUNIS.length];
  const tipo = i % 6 === 3 ? "busca_socio_capital" : i % 10 === 7 ? "remate" : i % 9 === 4 ? "negocio_con_inmueble" : "venta";
  const m2 = redondea(rand(...p.m2), 50);
  const pm2 = rand(...p.pm2);
  const precio = redondea(m2 * pm2 * (tipo === "remate" ? 0.7 : 1), 50000);
  const terreno = seg === "terreno" ? m2 : redondea(m2 * rand(1.1, 2.2), 50);
  const constr = seg === "terreno" ? null : m2;
  const esRenta = seg !== "terreno";
  const cap = esRenta ? rand(...p.cap) : 0;
  const noi = esRenta ? redondea(precio * cap, 1000) : null;
  const ratio = rand(0.62, 0.82);
  const rentaMensual = esRenta ? redondea((noi! / ratio) / 12, 500) : null;
  const ocup = esRenta ? Math.round(rand(72, 100)) : null;
  const inq = esRenta ? Math.max(1, Math.round(m2 / rand(400, 1500))) : null;
  const plazo = esRenta ? Math.round(rand(1, 8) * 2) / 2 : null;
  const regimen = seg === "terreno" && i % 5 === 0 ? "ejido" : seg === "multifamiliar" && i % 2 ? "condominio" : seg === "hotelero" && i % 2 ? "fideicomiso" : "escritura";
  const socio = tipo === "busca_socio_capital";
  const capital = socio ? redondea(precio * rand(0.3, 0.6), 50000) : null;
  const part = socio ? Math.round(rand(20, 49)) : null;
  const tir = socio ? Math.round(rand(14, 22) * 10) / 10 : null;
  const lat = mu.lat + rand(-0.03, 0.03);
  const lng = mu.lng + rand(-0.03, 0.03);
  const id = `00000000-0000-4000-8000-${String(1000 + i).padStart(12, "0")}`;
  const titulo = `[EJEMPLO] ${pick(p.titulos)} en ${mu.nombre}`;
  const colonia = pick(mu.colonias);
  const teaser = `DEAL DE EJEMPLO FICTICIO. ${p.nombre} en ${mu.nombre}${esRenta ? ` con ${ocup}% de ocupación y ${inq} inquilino(s)` : ""}. Cifras inventadas para demostración; no es un inmueble real.`;
  const completa = `Descripción completa FICTICIA del deal ${i + 1}. Aquí iría el detalle confidencial (contratos, estados financieros, condiciones de venta) visible solo con NDA aprobado. Información inventada.`;
  const s = (x: number | null, d = 2) => (x === null ? "null" : x.toFixed(d));
  out.push(
    `insert into deals (id, seller_id, titulo, tipo_operacion, segmento, estado_clave, municipio_clave, colonia, precio, m2_terreno, m2_construccion, renta_mensual_actual, noi_anual, ocupacion_pct, num_inquilinos, plazo_promedio_contratos, regimen_propiedad, uso_suelo, zona_restringida, monto_capital_buscado, participacion_ofrecida_pct, tir_proyectada, descripcion_teaser, status, es_ejemplo) values (` +
      [q(id), q(vendedores[i % 3].id), q(titulo), q(tipo), q(seg), q(mu.e), q(mu.m), q(colonia), s(precio), s(terreno), s(constr), s(rentaMensual), s(noi), s(ocup), inq ?? "null", plazo ?? "null", q(regimen), q(seg === "industrial" ? "Industrial" : seg === "terreno" ? "Por definir" : "Mixto/Comercial"), "false", s(capital), part ?? "null", tir ?? "null", q(teaser), "'publicado'", "true"].join(", ") + ");",
  );
  out.push(`insert into deal_private (deal_id, direccion_exacta, lat, lng, descripcion_completa) values (${q(id)}, ${q(`Calle Ejemplo ${100 + i} (dirección ficticia), ${colonia}, ${mu.nombre}`)}, ${lat.toFixed(6)}, ${lng.toFixed(6)}, ${q(completa)});`);
}
writeFileSync("supabase/seed.sql", out.join("\n") + "\n");
console.log("supabase/seed.sql generado: 30 deals");
