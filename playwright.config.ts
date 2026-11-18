import { defineConfig } from "@playwright/test";

const PORT = 3100;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // WebGL por software para Chromium headless sin GPU
    launchOptions: {
      // En entornos con un Chromium preinstalado de otra versión: PW_CHROMIUM_PATH=/ruta/al/chromium
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
    },
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/legal/aviso-legal`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      E2E_HARNESS: "1", NEXT_PUBLIC_E2E: "1",
      CRON_SECRET: "e2e-cron-secret", SUPABASE_SERVICE_ROLE_KEY: "e2e-service-key", UNSUBSCRIBE_SECRET: "e2e-unsub-secret", NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "x",
    },
  },
});
