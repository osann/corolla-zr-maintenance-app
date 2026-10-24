// Runs once per `npm test`. Every test file's throwaway DB (setup.ts) goes in one temp directory,
// deleted when the run ends. By then the workers have exited and let go of the files, which
// Windows needs before it will delete them.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'corolla-test-'));
  process.env.COROLLA_TEST_DIR = dir;
  return () => rmSync(dir, { recursive: true, force: true });
}
