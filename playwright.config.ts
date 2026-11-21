import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  webServer: [
    {
      command: "npm.cmd run dev:test -- --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npm.cmd run dev:configured -- --host 127.0.0.1 --port 4174 --strictPort",
      url: "http://127.0.0.1:4174",
      env: {
        VITE_DEMO_MODE: "false",
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
