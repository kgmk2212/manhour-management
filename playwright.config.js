import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  // タイミングだけで落ちたテスト（手元のマシンの負荷が高いときなど）で統合が止まらないよう、1 回だけ再試行する。
  // 本当に壊れていれば再試行でも落ちる。再試行で通ったテストは結果に flaky と表示されるので、不安定なテストも分かる
  retries: 1,
  use: { baseURL: "http://127.0.0.1:8901", viewport: { width: 1400, height: 900 } },
  webServer: {
    command: "node tests/e2e/serve.mjs 8901",
    url: "http://127.0.0.1:8901/index.html",
    reuseExistingServer: !process.env.CI,
  },
});
