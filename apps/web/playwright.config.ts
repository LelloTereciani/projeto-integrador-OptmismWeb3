import { defineConfig, devices } from "@playwright/test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webPort = 3100;
const webDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${webPort}`,
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${webPort}`,
    cwd: webDirectory,
    env: {
      NEXT_PUBLIC_PAYMENT_REGISTRY_ADDRESS: "0x3000000000000000000000000000000000000003",
      NEXT_PUBLIC_MOCK_USD_ADDRESS: "0x4000000000000000000000000000000000000004",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${webPort}`,
  },
});
