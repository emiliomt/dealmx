# DealMX (MVP)

Marketplace de oportunidades de inversión inmobiliaria en México. Next.js 14 + Supabase.
**Estado:** Fase 1 de 7 (esquema + auth + RLS). Ver el plan por fases en el historial del proyecto.

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
npm run test:rls   # migraciones + pruebas de RLS en un Postgres 16 temporal (sin Docker)
```
`test:rls` usa un shim del esquema `auth` de Supabase; las políticas de Storage (bucket `data-room`)
**no** se ejercitan ahí porque dependen de `storage.objects` real: se probarán con `supabase start`.

## Seguridad de datos privados
Dirección exacta, lat/lng exactas y descripción completa viven en `deal_private`, legible solo por el
dueño, admin o un usuario con NDA `aprobado` (RLS en la base de datos, no en el frontend).

## Pendientes conocidos
- Municipios INEGI de NL y Coahuila capturados de memoria: verificar contra el catálogo oficial.
- Textos legales (aviso legal, privacidad LFPDPPP, NDA) son placeholders: requieren revisión legal.
