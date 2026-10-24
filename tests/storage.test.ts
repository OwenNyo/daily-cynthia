import { describe, expect, it } from 'vitest';
import { finishOfficial, KEY, load, save, withName, type Save } from '../src/ui/storage';
import { memoryStorage } from './helpers';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('storage', () => {
  it('KEY is daily-cynthia:v1', () => {
    expect(KEY).toBe('daily-cynthia:v1');
  });

  it('fresh save', () => {
    const s = load(memoryStorage());
    expect(s.history).toEqual({});
    expect(s.name).toBe('');
    expect(s.current).toBeUndefined();
    expect(s.playerId).toMatch(UUID);
  });

  it('corrupt data gives a fresh save', () => {
    const store = memoryStorage();
    store.setItem(KEY, '{not json');
    expect(load(store)).toMatchObject({ history: {}, name: '' });
  });

  it('round trip', () => {
    const store = memoryStorage();
    const s: Save = {
      playerId: '11111111-2222-4333-8444-555555555555',
      name: 'Ash',
      history: { '2026-10-24': 'W' },
      current: { date: '2026-10-25', lead: 2, choices: ['move 1', 'switch 3'] },
    };
    save(s, store);
    expect(load(store)).toEqual(s);
  });

  it('playerId is stable across loads', () => {
    const store = memoryStorage();
    expect(load(store).playerId).toBe(load(store).playerId);
  });

  it('finishOfficial uses current.date', () => {
    const s: Save = {
      playerId: '11111111-2222-4333-8444-555555555555',
      name: '',
      history: {},
      current: { date: '2026-10-25', lead: 0, choices: ['move 1'] },
    };
    const done = finishOfficial(s, true);
    expect(done.history).toEqual({ '2026-10-25': 'W' });
    expect(done.current).toBeUndefined();
  });

  it('finishOfficial records a loss as L', () => {
    const s: Save = { playerId: 'x', name: '', history: {}, current: { date: '2026-10-25', lead: 0, choices: [] } };
    expect(finishOfficial(s, false).history['2026-10-25']).toBe('L');
  });

  it('finishOfficial does not mutate its input', () => {
    const s: Save = { playerId: 'x', name: '', history: {}, current: { date: '2026-10-25', lead: 0, choices: [] } };
    finishOfficial(s, true);
    expect(s).toEqual({ playerId: 'x', name: '', history: {}, current: { date: '2026-10-25', lead: 0, choices: [] } });
  });

  it('finishOfficial keeps the summary for the day', () => {
    const s: Save = { playerId: 'x', name: '', history: {}, current: { date: '2026-10-25', lead: 0, choices: [] } };
    const done = { won: true, turns: 12, p1Fainted: [true, false, false, false, false, false], p2Fainted: [true, true, true, true, true, true] };
    const saved = finishOfficial(s, true, done);
    expect(saved.results).toEqual({ '2026-10-25': done });
    expect(saved.history).toEqual({ '2026-10-25': 'W' });
  });

  it('finishOfficial keeps earlier summaries', () => {
    const old = { won: false, turns: 3, p1Fainted: Array(6).fill(true), p2Fainted: Array(6).fill(false) };
    const s: Save = { playerId: 'x', name: '', history: { '2026-10-24': 'L' }, results: { '2026-10-24': old }, current: { date: '2026-10-25', lead: 0, choices: [] } };
    expect(finishOfficial(s, false).results).toEqual({ '2026-10-24': old });
  });

  it.each(['null', '42', '"text"', '[]', '{}', '{"playerId":"x","name":"","history":null}'])('wrong shape %s gives a fresh save', raw => {
    const store = memoryStorage();
    store.setItem(KEY, raw);
    expect(load(store)).toMatchObject({ history: {}, name: '' });
  });

  it('withName saves a valid name trimmed', () => {
    const s: Save = { playerId: 'x', name: '', history: {} };
    expect(withName(s, ' Ash ').name).toBe('Ash');
  });

  it('withName clears the name on empty input', () => {
    const s: Save = { playerId: 'x', name: 'Ash', history: {} };
    expect(withName(s, '  ').name).toBe('');
  });

  it('withName keeps the old name on invalid input', () => {
    const s: Save = { playerId: 'x', name: 'Ash', history: {} };
    expect(withName(s, 'a!')).toBe(s);
  });
});
