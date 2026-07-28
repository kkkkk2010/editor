import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  oxc: false,
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setupTests.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
