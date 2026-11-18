# DealMX (MVP)

Marketplace web de oportunidades de inversión inmobiliaria en México: teasers públicos y datos privados tras un NDA aprobado.
Interfaz en español de México, montos en MXN (toggle opcional a USD), superficies en m².

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, Storage, Realtime, RLS) · MapLibre GL · Resend · Zod · Vitest · Playwright.

**Roles:** visitante (ve teasers) · inversionista (NDAs, búsquedas, pipeline) · vendedor/broker (publica, aprueba NDAs, ve vistas) · admin (modera y verifica).

> Lee primero [Estado de verificación](#estado-de-verificación-y-limitaciones): este código **nunca se ha ejecutado contra un Supabase ni un Resend reales**.

---

## Inicio rápido (local)

Requisitos: Node 20+, Docker (para Supabase local) y la [Supabase CLI](https://supabase.com/docs/guides/cli) (`npx supabase` basta).

```bash
npm install
npx supabase start        # levanta Postgres/Auth/Storage/Realtime; imprime URL y llaves
npx supabase db reset     # aplica supabase/migrations/* y carga supabase/seed.sql
cp .env.example .env.local   # pega URL, anon key y service_role key que imprimió `supabase start`
npm run dev               # http://localhost:3000
```

Con el seed verás 30 deals **ficticios** (`es_ejemplo = true`, títulos `[EJEMPLO]`, insignia visible) en Monterrey, San Pedro, Apodaca,
Escobedo, Santa Catarina, Saltillo y Ramos Arizpe. Se regeneran con `npx tsx scripts/gen-seed.ts` (determinista). Sus vendedores usan
correos `.invalid` y no tienen contraseña: para probar flujos crea tus propias cuentas en `/auth/registro` (en local no se exige confirmar correo).

Recorrido sugerido: 1) crea un **vendedor**, un **inversionista** y promueve a un **admin** ([ver cómo](#primer-administrador));
2) vendedor: `/publicar` (con un documento) → queda `en_revision`; 3) admin: `/admin` → aprobar; 4) inversionista: abre el deal → firma el NDA;
5) vendedor: `/dashboard/vendedor` → aprueba → abre el chat; 6) inversionista: recarga → ve dirección, descripción, data room y chat.

## Variables de entorno

Plantilla completa en [`.env.example`](.env.example). Los secretos se generan con `openssl rand -hex 32`.

| Variable | ¿Requerida? | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto Supabase (cliente y servidor). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Llave pública; todo pasa por RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí en producción | **Solo servidor.** Firma de NDA (IP), cron de alertas, bajas. Nunca con prefijo `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_SITE_URL` | Sí | URL pública (enlaces de correos y bajas). Sin `/` final. |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Producción | `style.json` compatible con MapLibre (MapTiler, Stadia, Protomaps…). Vacío = mosaicos públicos de OpenStreetMap, **solo desarrollo**. Los estilos `mapbox://` no funcionan con MapLibre. |
| `NEXT_PUBLIC_FX_USD_MXN` | Opcional | Tipo de cambio fijo para el toggle USD. Vacío = el toggle se oculta. No se inventa ningún valor. |
| `RESEND_API_KEY`, `MAIL_FROM` | Para alertas | `MAIL_FROM` debe ser de un dominio verificado en Resend (con el sandbox solo llega a tu propia cuenta). |
| `CRON_SECRET` | Para alertas | Vercel Cron lo envía como `Authorization: Bearer …`. Sin él, `/api/cron/alerts` responde 401. |
| `UNSUBSCRIBE_SECRET` | Para alertas | Firma (HMAC) los enlaces de baja. Distinto de `CRON_SECRET`. |
| `ALERTS_DRY_RUN` | Opcional | `1` = el cron calcula coincidencias pero no envía ni modifica nada. |

Solo para pruebas (**nunca en producción**): `E2E_HARNESS=1` y `NEXT_PUBLIC_E2E=1` activan páginas de arnés bajo `/e2e/*` (en cualquier otro caso devuelven 404);
`PW_CHROMIUM_PATH`, `PGBIN`, `PGPORT_TEST` ajustan el entorno de pruebas.
Las variables `NEXT_PUBLIC_*` se incrustan en el build: cambiarlas exige redesplegar.

## Pruebas

```bash
npm run typecheck
npm run test       # Vitest: finanzas, esquemas Zod, filtros y consultas, NDA, alertas, rutas, moderación
npm run test:rls   # migraciones + pruebas SQL de RLS/Storage/RPC/seed en un Postgres temporal (no requiere Docker)
npm run e2e        # Playwright en Chromium (mapa, NDA/chat, dashboards, admin, cron/bajas, rutas protegidas)
```
Si tu Chromium es de otra versión que la de Playwright: `PW_CHROMIUM_PATH=/ruta/al/chromium npm run e2e`.

Qué demuestra cada una (y qué **no**):
- `test:rls` es la prueba que importa para la privacidad: anónimo, inversionista sin/con NDA, vendedor ajeno, dueño y admin contra `deal_private`,
  documentos, mensajes, Storage (`data-room`), funciones del vendedor/admin y la máquina de estados de deals/NDAs. Ha sido verificada
  sabotando a propósito políticas clave y comprobando que las pruebas fallan. Usa una **réplica mínima** de los esquemas `auth` y `storage`
  y emula los privilegios por defecto de Supabase; no sustituye probar con Supabase real.
- `e2e` usa red simulada en los componentes de UI: valida comportamiento y forma de las peticiones, **no** RLS.

## Arquitectura y reglas de privacidad

- **Campos privados fuera de `deals`.** RLS filtra filas, no columnas, así que dirección exacta, lat/lng exactas y descripción completa viven en
  `deal_private`, legible solo por el dueño, un admin o un usuario con NDA `aprobado` (`can_see_private()`). Las coordenadas públicas
  (`lat_aprox/lng_aprox`, ~1–2 km) las calcula un trigger en la BD; el cliente nunca las envía.
- **Campos calculados** `cap_rate` y `precio_m2` son columnas generadas. `m2_ref` (construcción, o terreno) sirve al filtro de m².
- **Máquinas de estado en la BD**, no en la interfaz: deals (`guard_deal_status`), NDAs (`guard_nda_transition`), roles/verificación (`guard_profile_privileged_cols`).
- **Storage:** `deal-photos` público; `data-room` privado con política `has_approved_nda`/dueño/admin. Descarga vía URL firmada de 60 s tras validar con RLS.
- **Funciones SQL `SECURITY DEFINER`** acotadas por `auth.uid()` para datos agregados (estadísticas, solicitudes, hilos, vistas) sin exponer teléfono ni correo.
- Ninguna ruta de la app lee `deal_private`/documentos con service role; solo el cron (columnas del teaser) y la firma/baja usan service role.

## Qué hace cada rol

- **Visitante / inversionista:** `/` (buscador, destacados, segmentos) · `/buscar` (lista + mapa, filtros en la URL, guardar búsqueda) · `/deal/[id]`
  (teaser, KPIs, calculadora con supuestos editables, firma de NDA; tras la aprobación: datos privados, data room y chat) · `/dashboard/inversionista`
  (pipeline kanban con arrastrar y soltar, NDAs, búsquedas guardadas, favoritos).
- **Vendedor:** `/publicar` (wizard de 6 pasos con validación NOI/precio/renta) · `/dashboard/vendedor` (solicitudes de NDA, mis deals con vistas,
  estado y data room, mensajes).
- **Admin:** `/admin` (cola de moderación con señales automáticas, verificación de usuarios, bitácora). El acceso lo decide la BD
  (`moderar_deal`, `verificar_usuario`, `reabrir_nda`); la página devuelve 404 a quien no sea admin. Cada acción se registra en `admin_audit`.
- **Calculadora** (`lib/finance/`, `config/finance.ts`): cap rate, cash-on-cash, payback y TIR a 5 y 10 años. La tasa de crédito precargada es un
  placeholder **editable, no la TIIE**. Modelo: NOI declarado × (1+crecimiento)^(t−1) × (1−vacancia); capex como % del NOI; deuda con
  amortización mensual; salida capitalizando el NOI siguiente al cap rate de entrada, sin costos de venta ni impuestos.

## Despliegue en Vercel + Supabase

1. **Proyecto Supabase** (hosted). Anota URL, anon key y service_role key (Settings → API).
2. **Migraciones:**
   ```bash
   npx supabase login
   npx supabase link --project-ref <tu-ref>
   npx supabase db push        # aplica supabase/migrations/* (el seed NO se aplica: en producción no cargues deals ficticios)
   ```
   Verifica en el dashboard que existan los buckets `deal-photos` (público) y `data-room` (privado) y que `messages` esté en la publicación `supabase_realtime`.
3. **Auth** (Authentication → URL Configuration): *Site URL* = tu dominio; añade `https://<dominio>/auth/callback` a *Redirect URLs*.
   **Activa "Confirm email"** (en local está desactivado por comodidad; las alertas solo se envían a correos confirmados) y configura un
   **SMTP propio** (el correo integrado de Supabase tiene un límite muy bajo, no es para producción).
4. **Resend:** verifica tu dominio y crea una API key.
5. **Vercel:** importa el repositorio (Next.js se detecta solo) y define las variables de la tabla de arriba para *Production*. `vercel.json` registra el cron
   (`0 14 * * *` UTC = 8:00 de CDMX; Vercel Hobby permite una ejecución diaria y puede retrasarla hasta una hora).
6. **Primer admin:** ver abajo.
7. **Comprobación posterior:**
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" "https://<dominio>/api/cron/alerts?dry=1"   # debe responder 200 con conteos
   ```
   Confirma que `/e2e/mapa` da 404 y que `/admin` redirige al login sin sesión.

### Primer administrador
El rol `admin` no se puede elegir al registrarse ni auto-asignarse. Regístrate normalmente y, en el *SQL Editor* de Supabase (corre sin `auth.uid()`, por lo que el trigger lo permite):
```sql
update profiles set rol = 'admin' where id = (select id from auth.users where email = 'tu@correo.com');
```
Después `/dashboard` te lleva a `/admin`.

## Alertas por correo

El cron `GET /api/cron/alerts` cruza los deals publicados con `saved_searches` y envía **un correo resumen por usuario**.
- **Ventana:** deals con `published_at` posterior a `last_sent_at` (o a `created_at` si nunca se envió). Una búsqueda toca correo si pasó su periodo
  (diaria ≥ 22 h, semanal ≥ 6 d 22 h) **y** hay coincidencias; si no las hay no se modifica nada y la ventana sigue creciendo.
- `last_sent_at` se fija solo tras un envío exitoso y solo en las búsquedas incluidas. Cada envío lleva `Idempotency-Key` contra duplicados.
- **Seguridad:** solo lee columnas del teaser público; solo escribe a correos **confirmados**; omite búsquedas sin filtros útiles.
- **Bajas:** `List-Unsubscribe` de un clic y enlaces firmados. El `GET` solo muestra confirmación (los escáneres de correo no dan de baja a nadie); la baja es un `POST`.
- **Límites:** 500 búsquedas por corrida (`truncado: true` si hay más) y 60 s; con más volumen hay que paginar o usar una cola.
- **Ensayo local:**
  ```bash
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "update saved_searches set last_sent_at = now() - interval '2 days'"
  curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/alerts?dry=1"   # sin enviar
  curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/alerts"         # envío real (Resend)
  ```
  Los correos de Resend salen de verdad (no pasan por Inbucket).

## Estructura

```
app/            páginas y rutas (api/nda, api/deals, api/cron, api/alertas), /admin, /dashboard, /deal, /buscar, /publicar, e2e (arnés de pruebas)
components/     UI por dominio (deals, calculator, map, search, nda, chat, dashboard, admin, wizard)
lib/            finance/, search/, alertas/, email/, schemas/ (Zod), supabase/, format, nda, pipeline, moderacion
supabase/       migrations/0001–0008, seed.sql, config.toml, tests/rls/ (shim + pruebas SQL)
scripts/        test-rls.sh, gen-seed.ts
tests/          unit/ (Vitest) y e2e/ (Playwright)
```

## Estado de verificación y limitaciones

**Verificado** (automáticamente, ver [Pruebas](#pruebas)): lógica financiera, validaciones, filtros→URL→consultas PostgREST, RLS/Storage/RPC/triggers/seed
en un Postgres 16 real, rutas de API (firma, cron, bajas) con HTTP real o clientes simulados, y componentes en Chromium con red simulada.

**NO verificado — conviene probarlo antes de producción:**
- Nunca se ha corrido contra un **Supabase real** (local o alojado) ni contra **Resend**: no se ha enviado ningún correo real ni ejecutado el cron con datos reales.
  Las migraciones se probaron en PostgreSQL 16; Supabase usa 15 (no se usó sintaxis exclusiva de 16, pero no está comprobado).
- Políticas de Storage: probadas contra una réplica de `storage`, no el servicio real. Tampoco Realtime del chat (sin él, hay que recargar).
- `supabase/config.toml` está escrito a mano (no con `supabase init`); si la CLI se queja, ejecuta `supabase init` y conserva `[db.seed]`.
- La IP de la firma del NDA viene de `x-forwarded-for`/`x-real-ip`: es evidencia razonable detrás de Vercel, pero es un encabezado (en local suele ser `null`).
- **Municipios INEGI:** los de Nuevo León y Coahuila están capturados de memoria (inegi.org no era accesible); el resto del país no está cargado. Verifica contra el catálogo oficial.
- **Textos legales** (aviso legal, aviso de privacidad LFPDPPP, texto del NDA) son **placeholders** sin revisión de un abogado.
- Mapa: los mosaicos de OpenStreetMap por defecto son solo para desarrollo.

**Fuera del alcance del MVP:** editar un deal ya creado (solo cambia de estado y gestiona documentos), indicador de mensajes no leídos, correos al vendedor por NDA o
mensaje nuevo ni al moderar, revocar un NDA ya aprobado, geocodificación (las coordenadas exactas se capturan a mano), paginación del cron más allá de 500 búsquedas.
