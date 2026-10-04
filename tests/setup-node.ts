import { vi } from 'vitest';

// The node project runs with `isolate: false`: its files share one process, so a module imported by an earlier file
// stays cached and stays bound to that file's vi.mock (characters.ts to a mocked islandImage, BaseLayout to a mocked
// soundAvailability). Isolation also meant an empty module registry per file; this setup file runs before every file
// and restores that part. Mock registrations are already per file, and installed packages stay loaded across files,
// which is where the saved time comes from.
vi.resetModules();
