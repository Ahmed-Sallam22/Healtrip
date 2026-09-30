/**
 * Loads .env files for local development (Node's built-in loader, no dependency).
 * Imported first in main.ts. Real environment variables always win; in containers no file exists.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const file of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (!existsSync(file)) continue;
  try {
    process.loadEnvFile(file);
  } catch {
    // malformed file: ignore, env validation will report missing values
  }
}
