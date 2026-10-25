/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// Reads files through Vite globs, not node:fs (no @types/node in this project). A missing file gives no entry.
const MANIFEST = import.meta.glob<string>('../public/manifest.webmanifest', { query: '?raw', import: 'default', eager: true });
const PNGS = import.meta.glob<string>('../public/*.png', { query: '?inline', import: 'default', eager: true });
const INDEX = Object.values(import.meta.glob<string>('../index.html', { query: '?raw', import: 'default', eager: true }))[0];

type Icon = { src: string; sizes: string; type: string };
const manifest = () => JSON.parse(Object.values(MANIFEST)[0] ?? 'null');

// Width and height from the PNG IHDR chunk: bytes 16-23, big-endian.
function pngSize(dataUrl: string): string {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return `${view.getUint32(16)}x${view.getUint32(20)}`;
}

describe('web manifest', () => {
  it('parses as JSON', () => {
    expect(manifest()).not.toBeNull(); // null when the file is missing; JSON.parse throws when it is not JSON
  });

  it('start_url is /', () => {
    expect(manifest()?.start_url).toBe('/');
  });

  it('display is standalone', () => {
    expect(manifest()?.display).toBe('standalone');
  });

  it('every icon exists in public/ with the size it claims', () => {
    const icons: Icon[] = manifest()?.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const file = PNGS[`../public${icon.src}`];
      expect(file, icon.src).toBeDefined();
      expect(pngSize(file), icon.src).toBe(icon.sizes);
    }
  });

  it('lists a 192x192 and a 512x512 icon', () => {
    const sizes = (manifest()?.icons ?? []).map((i: Icon) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });

  it('index.html links the manifest', () => {
    expect(INDEX).toContain('<link rel="manifest" href="/manifest.webmanifest"');
  });
});
