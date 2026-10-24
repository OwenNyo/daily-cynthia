/// <reference types="vite/client" />
import { Dex } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { CYNTHIA } from '../src/game/cynthia';
import { dailyTeam } from '../src/game/teams';
import { spritePath } from '../src/ui/sprites';
import { addDays } from './helpers';

// Lists public/sprites without node:fs (no @types/node in this project).
const FILES = new Set(Object.keys(import.meta.glob('../public/sprites/*/*.png')).map(f => f.slice('../public'.length)));
const onDisk = (species: string, back: boolean) => FILES.has(spritePath(species, back));

describe('spritePath', () => {
  it('uses the PokeAPI id for Rotom-Wash', () => {
    expect(spritePath('Rotom-Wash', false)).toBe('/sprites/front/10009.png');
  });

  it('uses the forme file for Arceus-Psychic (back)', () => {
    expect(spritePath('Arceus-Psychic', true)).toBe('/sprites/back/493-psychic.png');
  });

  it('uses the forme file for Gastrodon-East', () => {
    expect(spritePath('Gastrodon-East', false)).toBe('/sprites/front/423-east.png');
  });

  it('uses the number for a base species', () => {
    expect(spritePath('Garchomp', false)).toBe('/sprites/front/445.png');
  });

  it('falls back to the base number for a forme with no file', () => {
    expect(spritePath('Pichu-Spiky-eared', false)).toBe('/sprites/front/172.png');
  });

  it('every Gen 1-4 species resolves to a file on disk', () => {
    const missing = Dex.forGen(4).species.all()
      .filter(s => s.num >= 1 && s.num <= 493 && s.isNonstandard == null)
      .flatMap(s => [false, true].filter(back => !onDisk(s.name, back)).map(back => `${s.name} ${back ? 'back' : 'front'}`));
    expect(missing).toEqual([]);
  });

  it('Cynthia and the daily pool over 365 days resolve to files on disk', () => {
    const names = new Set<string>(CYNTHIA.map(s => s.species));
    for (let i = 0; i < 365; i++) for (const s of dailyTeam(addDays('2026-10-25', i))) names.add(s.species);
    const missing = [...names].flatMap(n => [false, true].filter(back => !onDisk(n, back)).map(back => `${n} ${back ? 'back' : 'front'}`));
    expect(missing).toEqual([]);
  }, 60_000);
});
