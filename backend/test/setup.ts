// Runs before each test file is imported, so db/connection.ts picks up these values.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'corolla-test-'));
process.env.TURSO_URL = `file:${join(dir, 'test.sqlite').replace(/\\/g, '/')}`;
delete process.env.TURSO_TOKEN;

process.env.OWNER_EMAIL = 'owner@example.com';
process.env.SCRAPE_SECRET = 'test-secret';
// lib/email.ts constructs the Resend client at import time, which throws without a key. No
// email is ever sent in tests: there's no owner user row, so notification settings default
// to email alerts off and TickTick disconnected.
process.env.RESEND_API_KEY = 're_test_dummy';
