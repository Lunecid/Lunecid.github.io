/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

const exclude = ['tests/e2e/**', 'tests/ops/**', 'node_modules/**', 'dist/**'];

export default getViteConfig({
  test: {
    projects: [
      // isolate: false keeps one process (and the packages it has loaded) for many files; setup-node.ts gives each file a fresh module registry.
      { extends: true, test: { name: 'node', environment: 'node', isolate: false, setupFiles: ['./tests/setup-node.ts'], include: ['tests/{unit,astro,content}/**/*.test.ts'], exclude } },
      { extends: true, test: { name: 'dom', environment: 'jsdom', include: ['tests/react/**/*.test.{ts,tsx}'], exclude, setupFiles: ['./tests/setup-dom.ts'] } },
    ],
  },
});
