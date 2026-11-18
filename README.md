# DealMX (MVP)

Marketplace de oportunidades de inversión inmobiliaria en México. Next.js 14 + Supabase.
**Estado:** Fase 3 de 7 (búsqueda + mapa). Ver el plan por fases en el historial del proyecto.

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

## Pendientes conocidos
- Fase 3: la página `/buscar` con datos reales no se ha ejecutado contra Supabase; sí están verificados filtros→URL, filtros→PostgREST y el mapa (Playwright).
- Fase 2 sin prueba de extremo a extremo: wizard, subida a Storage y ficha no se han ejecutado contra un Supabase real.
- `supabase/config.toml` está escrito a mano (no con `supabase init`).
- Municipios INEGI de NL y Coahuila capturados de memoria: verificar contra el catálogo oficial.
- Textos legales (aviso legal, privacidad LFPDPPP, NDA) son placeholders: requieren revisión legal.
