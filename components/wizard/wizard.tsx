"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dealFormSchema, PASOS, validarPaso } from "@/lib/schemas/deal";
import { evaluarCoherencia } from "@/lib/finance/coherencia";
import { REGIMENES, SEGMENTOS, TIPOS_OPERACION } from "@/lib/catalogos";
import { formatPct } from "@/lib/format";

type Vals = Record<string, string | boolean>;
const INICIAL: Vals = { tipo_operacion: "venta", segmento: "industrial", estado_clave: "19", municipio_clave: "", zona_restringida: false };
const DRAFT_KEY = "dealmx.wizard.draft";
const MAX_FOTO = 8 * 1024 * 1024;
const MAX_DOC = 25 * 1024 * 1024;

const input = "mt-1 w-full rounded-md border border-border p-2";

export function Wizard({ userId, estados }: { userId: string; estados: { clave: string; nombre: string }[] }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [paso, setPaso] = useState(0);
  const [v, setV] = useState<Vals>(INICIAL);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [munis, setMunis] = useState<{ clave: string; nombre: string }[]>([]);
  const [fotos, setFotos] = useState<File[]>([]);
  const [docs, setDocs] = useState<File[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Borrador local (solo texto; los archivos no se guardan)
  useEffect(() => { try { const d = localStorage.getItem(DRAFT_KEY); if (d) setV({ ...INICIAL, ...JSON.parse(d) }); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch {} }, [v]);

  useEffect(() => {
    let vivo = true;
    sb.from("inegi_municipios").select("clave,nombre").eq("estado_clave", String(v.estado_clave)).order("nombre")
      .then(({ data }) => { if (vivo) setMunis(data ?? []); });
    return () => { vivo = false; };
  }, [sb, v.estado_clave]);

  const set = (k: string, val: string | boolean) => setV((p) => ({ ...p, [k]: val }));
  const num = (k: string) => (v[k] === "" || v[k] === undefined ? null : Number(v[k]));
  const coherencia = evaluarCoherencia({
    precio: num("precio"), noi_anual: num("noi_anual"), renta_mensual_actual: num("renta_mensual_actual"),
    ocupacion_pct: num("ocupacion_pct"), tir_proyectada: num("tir_proyectada"),
  });

  const campo = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm">{label}
      <input className={input} value={String(v[k] ?? "")} onChange={(e) => set(k, e.target.value)} {...props} />
      {errs[k] && <span role="alert" className="text-destructive">{errs[k]}</span>}
    </label>
  );
  const select = (k: string, label: string, opts: Record<string, string> | { clave: string; nombre: string }[], vacio?: string) => (
    <label className="block text-sm">{label}
      <select className={input} value={String(v[k] ?? "")} onChange={(e) => set(k, e.target.value)}>
        {vacio !== undefined && <option value="">{vacio}</option>}
        {Array.isArray(opts) ? opts.map((o) => <option key={o.clave} value={o.clave}>{o.nombre}</option>)
          : Object.entries(opts).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
      </select>
      {errs[k] && <span role="alert" className="text-destructive">{errs[k]}</span>}
    </label>
  );

  function siguiente() {
    const e = paso < 5 ? validarPaso(v, paso) : {};
    setErrs(e);
    if (Object.keys(e).length === 0) setPaso((p) => Math.min(p + 1, 5));
  }

  function agregarArchivos(lista: FileList | null, tipo: "foto" | "doc") {
    if (!lista) return;
    const max = tipo === "foto" ? MAX_FOTO : MAX_DOC;
    const validos = Array.from(lista).filter((f) => {
      if (f.size > max) { setMsg(`"${f.name}" excede ${max / 1024 / 1024} MB.`); return false; }
      if (tipo === "foto" && !/^image\/(jpeg|png|webp)$/.test(f.type)) { setMsg(`"${f.name}": solo JPG, PNG o WebP.`); return false; }
      return true;
    });
    (tipo === "foto" ? setFotos : setDocs)((p) => [...p, ...validos]);
  }

  async function guardar(status: "borrador" | "en_revision") {
    setMsg(null);
    const parsed = dealFormSchema.safeParse(v);
    if (status === "en_revision" && !parsed.success) {
      const todos: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { todos[String(i.path[0])] ??= i.message; });
      setErrs(todos);
      return setMsg("Hay campos por corregir: " + Object.values(todos).join(" · "));
    }
    if (status === "borrador" && (!v.titulo || String(v.titulo).trim().length < 5 || !v.estado_clave || !v.municipio_clave)) {
      return setMsg("Para guardar un borrador captura al menos título, estado y municipio.");
    }
    setBusy(true);
    try {
      const g = (k: string) => (v[k] === "" || v[k] === undefined ? null : v[k]);
      const n = (k: string) => (num(k));
      const fila = {
        seller_id: userId, status,
        titulo: String(v.titulo).trim(), tipo_operacion: v.tipo_operacion, segmento: v.segmento,
        estado_clave: v.estado_clave, municipio_clave: v.municipio_clave, colonia: g("colonia"),
        precio: n("precio"), m2_terreno: n("m2_terreno"), m2_construccion: n("m2_construccion"),
        renta_mensual_actual: n("renta_mensual_actual"), noi_anual: n("noi_anual"), ocupacion_pct: n("ocupacion_pct"),
        num_inquilinos: n("num_inquilinos"), plazo_promedio_contratos: n("plazo_promedio_contratos"),
        regimen_propiedad: g("regimen_propiedad"), uso_suelo: g("uso_suelo"), zona_restringida: !!v.zona_restringida,
        monto_capital_buscado: n("monto_capital_buscado"), participacion_ofrecida_pct: n("participacion_ofrecida_pct"),
        tir_proyectada: n("tir_proyectada"), descripcion_teaser: String(v.descripcion_teaser ?? ""),
      };
      const { data: deal, error } = await sb.from("deals").insert(fila).select("id").single();
      if (error || !deal) throw new Error(error?.message ?? "No se pudo crear el deal");

      if (v.direccion_exacta || v.lat || v.descripcion_completa) {
        const { error: e2 } = await sb.from("deal_private").insert({
          deal_id: deal.id, direccion_exacta: g("direccion_exacta"), lat: g("lat") === null ? null : Number(v.lat),
          lng: g("lng") === null ? null : Number(v.lng), descripcion_completa: g("descripcion_completa"),
        });
        if (e2) throw new Error("Datos privados: " + e2.message);
      }
      const falloArchivos: string[] = [];
      for (const [i, f] of fotos.entries()) {
        const ext = f.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${deal.id}/${crypto.randomUUID()}.${ext}`;
        const up = await sb.storage.from("deal-photos").upload(path, f, { contentType: f.type });
        if (up.error) { falloArchivos.push(f.name); continue; }
        await sb.from("deal_photos").insert({ deal_id: deal.id, path, orden: i });
      }
      for (const f of docs) {
        const path = `${deal.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
        const up = await sb.storage.from("data-room").upload(path, f, { contentType: f.type || undefined });
        if (up.error) { falloArchivos.push(f.name); continue; }
        await sb.from("deal_documents").insert({ deal_id: deal.id, storage_path: path, nombre: f.name, tipo: f.type || null });
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      if (falloArchivos.length) {
        setMsg(`Deal guardado, pero no se subieron: ${falloArchivos.join(", ")}.`);
        setTimeout(() => router.push(`/deal/${deal.id}`), 2500);
      } else router.push(`/deal/${deal.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error al guardar");
    } finally { setBusy(false); }
  }

  const socio = v.tipo_operacion === "busca_socio_capital";
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Publicar un deal</h1>
      <ol className="flex flex-wrap gap-2 text-xs">
        {PASOS.map((p, i) => <li key={p} className={`rounded px-2 py-1 ${i === paso ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{i + 1}. {p}</li>)}
      </ol>

      {paso === 0 && <div className="space-y-3">
        {campo("titulo", "Título")}
        {select("tipo_operacion", "Tipo de operación", TIPOS_OPERACION)}
        {select("segmento", "Segmento", SEGMENTOS)}
        {select("estado_clave", "Estado", estados)}
        {select("municipio_clave", "Municipio", munis, "Selecciona…")}
        {campo("colonia", "Colonia (opcional)")}
      </div>}

      {paso === 1 && <div className="space-y-3">
        {!socio && campo("precio", "Precio (MXN)", { type: "number", min: 0 })}
        {socio && <>
          {campo("monto_capital_buscado", "Capital buscado (MXN)", { type: "number", min: 0 })}
          {campo("participacion_ofrecida_pct", "Participación ofrecida (%)", { type: "number", min: 0, max: 100 })}
          {campo("tir_proyectada", "TIR proyectada (%) — la declara el vendedor", { type: "number" })}
          {campo("precio", "Valor del inmueble/proyecto (MXN, opcional)", { type: "number", min: 0 })}
        </>}
        {campo("m2_terreno", "Superficie de terreno (m²)", { type: "number", min: 0 })}
        {campo("m2_construccion", "Superficie de construcción (m²)", { type: "number", min: 0 })}
        {campo("renta_mensual_actual", "Renta mensual actual (MXN)", { type: "number", min: 0 })}
        {campo("noi_anual", "NOI anual (MXN)", { type: "number", min: 0 })}
        {campo("ocupacion_pct", "Ocupación (%)", { type: "number", min: 0, max: 100 })}
        {campo("num_inquilinos", "Número de inquilinos", { type: "number", min: 0 })}
        {campo("plazo_promedio_contratos", "Plazo promedio de contratos (años)", { type: "number", min: 0 })}
        <div aria-live="polite" className="space-y-1 text-sm">
          {coherencia.capRateImplicito != null && <p>Cap rate implícito (NOI / precio): <strong>{formatPct(coherencia.capRateImplicito)}</strong></p>}
          {coherencia.errores.map((e) => <p key={e} className="text-destructive">⚠ {e}</p>)}
          {coherencia.avisos.map((e) => <p key={e} className="text-amber-700">• {e}</p>)}
        </div>
      </div>}

      {paso === 2 && <div className="space-y-3">
        {select("regimen_propiedad", "Régimen de propiedad", REGIMENES, "Selecciona…")}
        {campo("uso_suelo", "Uso de suelo (opcional)")}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!v.zona_restringida} onChange={(e) => set("zona_restringida", e.target.checked)} />
          Está en zona restringida (p. ej. franja fronteriza/costera)
        </label>
        {v.regimen_propiedad === "ejido" && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">Los inmuebles ejidales requieren dominio pleno para venderse a terceros. Se mostrará una advertencia en la ficha.</p>}
      </div>}

      {paso === 3 && <div className="space-y-4">
        <div>
          <label className="block text-sm">Fotos públicas (JPG/PNG/WebP, máx. 8 MB)
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className={input} onChange={(e) => { agregarArchivos(e.target.files, "foto"); e.target.value = ""; }} />
          </label>
          <ul className="mt-1 text-xs">{fotos.map((f, i) => <li key={i}>{f.name} <button type="button" className="underline" onClick={() => setFotos(fotos.filter((_, j) => j !== i))}>quitar</button></li>)}</ul>
        </div>
        <div>
          <label className="block text-sm">Documentos del data room (privados, solo con NDA aprobado; máx. 25 MB)
            <input type="file" multiple className={input} onChange={(e) => { agregarArchivos(e.target.files, "doc"); e.target.value = ""; }} />
          </label>
          <ul className="mt-1 text-xs">{docs.map((f, i) => <li key={i}>{f.name} <button type="button" className="underline" onClick={() => setDocs(docs.filter((_, j) => j !== i))}>quitar</button></li>)}</ul>
        </div>
        <p className="text-xs text-muted-foreground">Los archivos no se guardan en el borrador local: se suben al guardar.</p>
      </div>}

      {paso === 4 && <div className="space-y-3">
        <fieldset className="space-y-3 rounded-md border border-border p-3"><legend className="px-1 text-sm font-semibold">Público (teaser)</legend>
          <label className="block text-sm">Descripción del teaser
            <textarea rows={4} className={input} value={String(v.descripcion_teaser ?? "")} onChange={(e) => set("descripcion_teaser", e.target.value)} />
            {errs.descripcion_teaser && <span role="alert" className="text-destructive">{errs.descripcion_teaser}</span>}
          </label>
        </fieldset>
        <fieldset className="space-y-3 rounded-md border border-border bg-muted p-3"><legend className="px-1 text-sm font-semibold">Privado (solo con NDA aprobado)</legend>
          {campo("direccion_exacta", "Dirección exacta")}
          <div className="grid grid-cols-2 gap-3">{campo("lat", "Latitud (opcional)", { type: "number", step: "any" })}{campo("lng", "Longitud (opcional)", { type: "number", step: "any" })}</div>
          <p className="text-xs text-muted-foreground">Las coordenadas son opcionales: sin ellas el deal se publica y aparece en la lista, pero no en el mapa. Si las capturas, en el sitio público solo se muestra una ubicación aproximada (redondeada ~1–2 km, calculada en el servidor).</p>
          <label className="block text-sm">Descripción completa
            <textarea rows={6} className={input} value={String(v.descripcion_completa ?? "")} onChange={(e) => set("descripcion_completa", e.target.value)} />
            {errs.descripcion_completa && <span role="alert" className="text-destructive">{errs.descripcion_completa}</span>}
          </label>
        </fieldset>
      </div>}

      {paso === 5 && <div className="space-y-3 text-sm">
        <p>Revisa los datos. Al enviar, el deal entra a moderación y no será público hasta que un administrador lo apruebe.</p>
        <dl className="grid grid-cols-2 gap-1">
          {[["Título", v.titulo], ["Operación", TIPOS_OPERACION[v.tipo_operacion as keyof typeof TIPOS_OPERACION]], ["Segmento", SEGMENTOS[v.segmento as keyof typeof SEGMENTOS]],
            ["Precio", v.precio], ["NOI anual", v.noi_anual], ["Fotos", fotos.length], ["Documentos", docs.length]].map(([k, val]) => (
            <div key={String(k)} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{String(val || "—")}</dd></div>
          ))}
        </dl>
        {coherencia.errores.map((e) => <p key={e} className="text-destructive">⚠ {e}</p>)}
        {coherencia.avisos.map((e) => <p key={e} className="text-amber-700">• {e}</p>)}
        <p className="text-xs text-muted-foreground">Declaras que las cifras son tuyas y que DealMX no las verifica.</p>
      </div>}

      {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" disabled={paso === 0 || busy} onClick={() => setPaso(paso - 1)} className="rounded-md border border-border px-4 py-2 disabled:opacity-40">Atrás</button>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => guardar("borrador")} className="rounded-md border border-border px-4 py-2">Guardar borrador</button>
          {paso < 5
            ? <button type="button" onClick={siguiente} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">Siguiente</button>
            : <button type="button" disabled={busy} onClick={() => guardar("en_revision")} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">{busy ? "Enviando…" : "Enviar a revisión"}</button>}
        </div>
      </div>
    </div>
  );
}
