import { defineConfig, devices } from "@playwright/test";

const smokePort = 3100;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const smokeServerCommand = process.env.CI
  ? `node ./node_modules/next/dist/bin/next build --webpack && node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${smokePort}`
  : `node ./node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port ${smokePort}`;

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: smokeBaseUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: smokeServerCommand,
    env: {
      ...process.env,
      PLAYWRIGHT_TEST: "1",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ""
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    url: smokeBaseUrl
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] }
    }
  ]
});
