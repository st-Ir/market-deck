import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Vercel Functions can write only to temporary storage. The bundled data is
// still needed on cold starts and after a new deployment.
export function marketCachePath(file) {
  const directory = process.env.VERCEL === '1'
    ? path.join(tmpdir(), 'market-deck')
    : path.join(process.cwd(), '.cache');
  return path.join(directory, file);
}

export async function writeMarketCache(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data));
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}
