// One-off: downloads the Gen 4 Platinum sprites from the PokeAPI sprites repo into public/sprites/ (spec D14).
// Run with `node scripts/fetch-sprites.ts`. Skips files that already exist.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const API = 'https://api.github.com/repos/PokeAPI/sprites/contents/sprites/pokemon/versions/generation-iv/platinum';

async function fetchFolder(apiPath: string, outDir: string): Promise<number> {
  const res = await fetch(apiPath, { headers: { 'User-Agent': 'daily-cynthia-fetch-sprites' } });
  if (!res.ok) throw new Error(`${apiPath}: ${res.status} ${await res.text()}`);
  const files = (await res.json() as { name: string; type: string; download_url: string }[])
    .filter(f => f.type === 'file' && f.name.endsWith('.png'));
  mkdirSync(outDir, { recursive: true });
  const todo = files.filter(f => !existsSync(`${outDir}/${f.name}`));
  for (let i = 0; i < todo.length; i += 20) {
    await Promise.all(todo.slice(i, i + 20).map(async f => {
      const r = await fetch(f.download_url);
      if (!r.ok) throw new Error(`${f.download_url}: ${r.status}`);
      writeFileSync(`${outDir}/${f.name}`, new Uint8Array(await r.arrayBuffer()));
    }));
  }
  console.log(`${outDir}: ${files.length} files listed, ${todo.length} downloaded`);
  return files.length;
}

await fetchFolder(API, 'public/sprites/front');
await fetchFolder(`${API}/back`, 'public/sprites/back');
