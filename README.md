# DealMX (MVP)

Marketplace de oportunidades de inversión inmobiliaria en México. Next.js 14 + Supabase.
**Estado:** Fase 6 de 7 (alertas por correo). Ver el plan por fases en el historial del proyecto.

## Variables de entorno
Copia `.env.example` a `.env.local`. Solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` son necesarias en la Fase 1.

## Supabase local (requiere Docker + Supabase CLI)
```bash
npx supabase start     # imprime URL y llaves para .env.local
npx supabase db reset  # aplica supabase/migrations/*
```

## Desarrollo
```bash
npm install
npm run dev
```

## Pruebas
```bash
npm run test       # Vitest (unitarias)
npm run typecheck
npm run e2e        # Playwright (mapa). Si tu Chromium es de otra versión: PW_CHROMIUM_PATH=/ruta/chromium npm run e2e
npm run test:rls   # migraciones + pruebas de RLS en un Postgres 16 temporal (sin Docker)
```
`test:rls` usa un shim del esquema `auth` de Supabase; las políticas de Storage (bucket `data-room`)
**no** se ejercitan ahí porque dependen de `storage.objects` real: se probarán con `supabase start`.

## Datos de ejemplo
`supabase db reset` carga `supabase/seed.sql`: 30 deals FICTICIOS (`es_ejemplo = true`, títulos `[EJEMPLO]`, badge visible)
en Monterrey, San Pedro, Apodaca, Escobedo, Santa Catarina, Saltillo y Ramos Arizpe. Se regenera con
`npx tsx scripts/gen-seed.ts` (determinista). Los vendedores demo usan correos `.invalid` y no tienen contraseña.

## Calculadora (Fase 2)
`lib/finance/` (puro, con pruebas). Supuestos en `config/finance.ts`: la tasa de crédito precargada es un
placeholder editable, **no** la TIIE. Modelo: NOI declarado × (1+crecimiento)^(t-1) × (1-vacancia); capex como % del
NOI; deuda con amortización mensual; salida al año 5/10 capitalizando el NOI siguiente al cap rate de entrada
(sin costos de venta ni impuestos). El toggle USD solo aparece si defines `NEXT_PUBLIC_FX_USD_MXN`.

## Búsqueda y mapa (Fase 3)
- `/buscar`: filtros en la URL (`estado, municipio, segmento, operacion, precio_min/max, cap_min, m2_min/max, ocup_min, renta=1, orden, pagina`).
  Los valores inválidos se descartan en `lib/search/filters.ts`; la misma función lee el JSON de `saved_searches` (lo reutilizarán las alertas).
- Los filtros se traducen a PostgREST en `lib/search/query.ts` (`aplicarFiltros`). `m²` filtra por `m2_ref` (construcción, o terreno si no hay).
- El mapa usa solo `lat_aprox/lng_aprox` (públicas). Muestra hasta 500 puntos; el listado pagina de 20 en 20.
- Mapa: MapLibre GL. Define `NEXT_PUBLIC_MAP_STYLE_URL` (style.json compatible con MapLibre). Sin él se usan mosaicos públicos de
  OpenStreetMap, **solo para desarrollo**. Mapbox (`mapbox://`) no es compatible con MapLibre.
- "Guardar búsqueda": requiere sesión y al menos un filtro; guarda en `saved_searches`. El envío de alertas llega en la Fase 6.
- `app/e2e/mapa` es un arnés de pruebas, activo solo con `E2E_HARNESS=1` (404 en cualquier otro caso).

## NDA, data room y chat (Fase 4)
Flujo: el inversionista firma en la ficha → `POST /api/nda/firmar` (servidor, service role) guarda nombre, timestamp, IP y
el texto/versión EXACTOS de la plantilla (el cliente no puede fijarlos ni el estado) → el vendedor aprueba o rechaza en su panel
(la ficha de su propio deal) → con `aprobado`, RLS libera dirección exacta, descripción completa, data room y chat.
- Data room: `GET /api/deals/[id]/documentos/[docId]` valida con RLS y redirige a una URL firmada de 60 s.
- Chat: un hilo por (deal, inversionista); RLS exige NDA aprobado para leer y escribir. Mensajes nuevos de la otra parte por
  Supabase Realtime (migración 0006 agrega `messages` a la publicación `supabase_realtime`). Sin Realtime hay que recargar.
- Vendedor: `solicitantes_nda()` y `vistas_deal()` (funciones SQL) entregan solo nombre/empresa, nunca teléfono ni correo.
  Una vista por usuario identificado cada 30 min; las anónimas no se deduplican.
- La IP viene de `x-forwarded-for`/`x-real-ip`: es confiable detrás de Vercel u otro proxy que lo sobrescriba; en local suele ser null.
- Rechazado/firmado no se puede re-firmar (UNIQUE deal+usuario): para reabrir un caso un admin debe intervenir (Fase 7).
- `test:rls` incluye una réplica mínima de `storage` para ejercitar las políticas del bucket `data-room`; sigue siendo una réplica,
  no el servicio real.

## Dashboards (Fase 5)
- `/dashboard` redirige por rol. **Inversionista** (`/dashboard/inversionista`): pipeline kanban (arrastrar y soltar nativo + selector por
  tarjeta para teclado/móvil, con notas), mis NDAs, búsquedas guardadas (frecuencia, pausar, eliminar) y favoritos. En la ficha hay
  botones de favorito y de pipeline.
- Al firmarse un NDA el deal pasa a la etapa `nda` del pipeline, solo si no existía o seguía en `visto` (trigger `sync_pipeline_from_nda`).
- **Vendedor** (`/dashboard/vendedor`): resumen, bandeja de NDAs por decidir (todos sus deals), mis deals con vistas/NDAs/mensajes,
  cambio de estado (las transiciones válidas las impone la BD), alta y baja de documentos del data room, y mensajes por hilo.
- Los datos agregados del vendedor salen de funciones SQL acotadas por `auth.uid()` (`deals_vendedor_stats`, `solicitudes_pendientes_vendedor`,
  `hilos_vendedor`); no exponen teléfono ni correo.
- No hay "no leídos" en el chat (no existe estado de lectura): se muestra el último mensaje de cada hilo.
- Los deals no se pueden editar después de crearlos (solo cambiar estado y documentos); editar queda fuera del MVP.

## Alertas por correo (Fase 6)
Un cron diario (`vercel.json`: `0 14 * * *` UTC = 8:00 hora de CDMX) llama a `GET /api/cron/alerts`, que cruza los deals publicados
con las búsquedas guardadas (`saved_searches`) y envía **un correo resumen por usuario** con Resend.
- **Autenticación:** Vercel envía `Authorization: Bearer $CRON_SECRET`; sin `CRON_SECRET` configurado el endpoint queda cerrado (401).
- **Ventana:** deals con `published_at` posterior a `last_sent_at` (o a `created_at` si la búsqueda nunca ha enviado). Una búsqueda solo
  toca correo si pasó su periodo (diaria ≥ 22 h, semanal ≥ 6 d 22 h; la tolerancia absorbe el desfase del cron) **y** hay coincidencias.
  Sin coincidencias no se modifica nada: la ventana sigue creciendo y no se pierde ningún deal.
- `last_sent_at` se fija al inicio de la corrida y **solo tras un envío exitoso**, y solo en las búsquedas incluidas en ese correo. Si Resend falla se
  reintenta en la siguiente corrida. Además cada envío lleva `Idempotency-Key` (Resend lo respeta 24 h) contra duplicados por doble disparo.
- **Privacidad:** el cron usa service role (sin RLS), por eso solo lee columnas del teaser público y el correo renderiza únicamente campos
  explícitos (nunca dirección, coordenadas ni descripción completa). Solo se escribe a correos **confirmados** (evita spam a terceros).
  Se omiten búsquedas sin filtros útiles (coincidirían con todo).
- **Bajas:** cada correo trae `List-Unsubscribe` (one-click) y enlaces firmados (HMAC con `UNSUBSCRIBE_SECRET`): "Pausar esta búsqueda" y
  "Dejar de recibir todas". El `GET` solo muestra una confirmación (los escáneres de correo no dan de baja a nadie); la baja es un `POST`.
  También se gestionan en el dashboard (frecuencia, pausa, último correo).
- **Variables:** `RESEND_API_KEY`, `MAIL_FROM` (dominio verificado en Resend; con el sandbox solo llega a tu propia cuenta), `CRON_SECRET`,
  `UNSUBSCRIBE_SECRET`, `NEXT_PUBLIC_SITE_URL`, `ALERTS_DRY_RUN`. Genera secretos con `openssl rand -hex 32`.
- **Límites:** hasta 500 búsquedas por corrida (se atienden primero las más rezagadas; `truncado: true` en la respuesta) y `maxDuration = 60 s`.
  Si el volumen crece hay que paginar o mover el trabajo a una cola. En Vercel Hobby el cron puede retrasarse hasta una hora.
- Si el correo sale pero falla el `UPDATE` de `last_sent_at`, se reporta en `errores` y la clave de idempotencia evita el duplicado ese día.

## Seguridad de datos privados
Dirección exacta, lat/lng exactas y descripción completa viven en `deal_private`, legible solo por el
dueño, admin o un usuario con NDA `aprobado` (RLS en la base de datos, no en el frontend).

## Cómo probar la Fase 2 localmente
1. `npx supabase start && npx supabase db reset`, llena `.env.local` y `npm run dev`.
2. `/` muestra deals de ejemplo; entra a uno (`/deal/[id]`): teaser, KPIs y calculadora con supuestos editables.
3. Como visitante/inversionista NO aparece el bloque "Información confidencial" (lo decide RLS).
4. Regístrate como **vendedor** en `/auth/registro` y abre `/publicar`: wizard de 6 pasos con validación de coherencia NOI/precio.
   Los envíos quedan `en_revision` (no públicos hasta que un admin los publique: Fase 7).

## Cómo probar la Fase 3 localmente
`supabase db reset` (aplica la migración 0005 y el seed) → `npm run dev` → `/buscar`: filtra, cambia de página, comparte la URL,
haz clic en clusters y puntos del mapa, y guarda una búsqueda con sesión iniciada.

## Cómo probar la Fase 4 localmente
1. Crea dos cuentas: un **vendedor** y un **inversionista** (con `enable_confirmations = false` en local no hace falta correo).
2. Como vendedor, publica un deal en `/publicar` con un documento y pídele a un admin que lo publique (promueve tu usuario a admin
   con SQL y usa el panel de la Fase 7, o actualiza `status` a `publicado` desde Studio). Los deals de ejemplo del seed son de otro vendedor.
3. Como inversionista: abre el deal → firma el NDA → verás "Esperando aprobación".
4. Como vendedor: abre tu deal → "Panel del vendedor" → Aprobar → "Abrir chat".
5. Como inversionista: recarga → ya ves dirección, descripción, data room (descarga) y el chat.

## Cómo probar la Fase 5 localmente
Con las dos cuentas de la Fase 4: como inversionista abre una ficha → ★ favoritos y "Mi pipeline"; firma el NDA y mira cómo la tarjeta
aparece en "NDA" en `/dashboard/inversionista`; arrástrala a "Oferta" y añade una nota. Guarda una búsqueda en `/buscar` y gestiónala ahí.
Como vendedor: `/dashboard/vendedor` → aprueba la solicitud, abre el hilo, sube un documento y marca el deal "en negociación".

## Cómo probar la Fase 6 localmente
```bash
# 1) Variables en .env.local: CRON_SECRET, UNSUBSCRIBE_SECRET, NEXT_PUBLIC_SITE_URL=http://localhost:3000, SUPABASE_SERVICE_ROLE_KEY
# 2) Guarda una búsqueda en /buscar (p. ej. segmento Industrial) y fuerza que "toque" (el seed ya está publicado):
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "update saved_searches set last_sent_at = now() - interval '2 days'"
# 3) Ensayo sin enviar ni modificar nada: devuelve conteos
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/alerts?dry=1"
# 4) Envío real (requiere RESEND_API_KEY y MAIL_FROM; con el sandbox, usa tu propio correo en la cuenta)
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/alerts
```
Los correos de Resend salen de verdad (no pasan por Inbucket). Abre el enlace de baja del correo: debe mostrar una confirmación y, al pulsar el botón, pausar la alerta.

## Pendientes conocidos
- Fase 6: nunca se ha enviado un correo real ni ejecutado el cron contra un Supabase real. Verificado por piezas: orquestación con dobles,
  consultas HTTP exactas capturadas, rutas con HTTP real (autenticación y fallos controlados), render del correo y firma de enlaces.
  No hay correo al vendedor por NDA o mensajes nuevos (no pedido en el alcance de alertas).
- Fase 5: las páginas de dashboard no se han ejecutado contra un Supabase real; verificado por piezas (SQL, componentes con red simulada).
- El enlace "Mi panel" del admin cae en el dashboard de inversionista hasta que exista `/admin` (Fase 7).
- Fase 4: el flujo completo (firma real → aprobación → datos → chat con Realtime) no se ha ejecutado contra un Supabase real;
  está probado por piezas: RLS/Storage/RPC en SQL, ruta de firma con clientes simulados y componentes en Chromium con red simulada.
- No hay correo al vendedor cuando llega una solicitud o un mensaje (Fase 6 reutilizará Resend).
- El vendedor no puede subir documentos después de publicar (solo en el wizard); se agregará con el dashboard (Fase 5).
- Fase 3: la página `/buscar` con datos reales no se ha ejecutado contra Supabase; sí están verificados filtros→URL, filtros→PostgREST y el mapa (Playwright).
- Fase 2 sin prueba de extremo a extremo: wizard, subida a Storage y ficha no se han ejecutado contra un Supabase real.
- `supabase/config.toml` está escrito a mano (no con `supabase init`).
- Municipios INEGI de NL y Coahuila capturados de memoria: verificar contra el catálogo oficial.
- Textos legales (aviso legal, privacidad LFPDPPP, NDA) son placeholders: requieren revisión legal.
