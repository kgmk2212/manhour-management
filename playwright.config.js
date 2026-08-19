import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:8901", viewport: { width: 1400, height: 900 } },
  webServer: {
    command: "node tests/e2e/serve.mjs 8901",
    url: "http://127.0.0.1:8901/index.html",
    reuseExistingServer: !process.env.CI,
  },
});
