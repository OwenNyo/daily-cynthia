import { describe, expect, it } from 'vitest';
import { finishOfficial, KEY, load, save, update, withName, type Save } from '../src/ui/storage';
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
    const done = finishOfficial(s, { won: true, turns: 1, p1Fainted: Array(6).fill(false), p2Fainted: Array(6).fill(true) });
    expect(done.history).toEqual({ '2026-10-25': 'W' });
    expect(done.current).toBeUndefined();
  });

  it('finishOfficial without a summary records a loss as L', () => {
    const s: Save = { playerId: 'x', name: '', history: {}, current: { date: '2026-10-25', lead: 0, choices: [] } };
    expect(finishOfficial(s).history['2026-10-25']).toBe('L');
  });

  it('finishOfficial does not mutate its input', () => {
    const s: Save = { playerId: 'x', name: '', history: {}, current: { date: '2026-10-25', lead: 0, choices: [] } };
    finishOfficial(s);
    expect(s).toEqual({ playerId: 'x', name: '', history: {}, current: { date: '2026-10-25', lead: 0, choices: [] } });
  });

  it('finishOfficial keeps the summary for the day', () => {
    const s: Save = { playerId: 'x', name: '', history: {}, current: { date: '2026-10-25', lead: 0, choices: [] } };
    const done = { won: true, turns: 12, p1Fainted: [true, false, false, false, false, false], p2Fainted: [true, true, true, true, true, true] };
    const saved = finishOfficial(s, done);
    expect(saved.results).toEqual({ '2026-10-25': { ...done, lead: 0, choices: [] } });
    expect(saved.history).toEqual({ '2026-10-25': 'W' });
  });

  it('finishOfficial keeps the lead and choices with the summary', () => {
    const s: Save = { playerId: 'x', name: '', history: {}, current: { date: '2026-10-25', lead: 2, choices: ['move 1', 'switch 3'] } };
    const done = { won: false, turns: 2, p1Fainted: Array(6).fill(true), p2Fainted: Array(6).fill(false) };
    expect(finishOfficial(s, done).results?.['2026-10-25']).toMatchObject({ lead: 2, choices: ['move 1', 'switch 3'] });
  });

  it('finishOfficial without a summary writes no result for the day', () => {
    const s: Save = { playerId: 'x', name: '', history: {}, current: { date: '2026-10-25', lead: 2, choices: ['move 1'] } };
    expect(finishOfficial(s).results?.['2026-10-25']).toBeUndefined();
  });

  it('finishOfficial keeps earlier summaries', () => {
    const old = { won: false, turns: 3, p1Fainted: Array(6).fill(true), p2Fainted: Array(6).fill(false) };
    const s: Save = { playerId: 'x', name: '', history: { '2026-10-24': 'L' }, results: { '2026-10-24': old }, current: { date: '2026-10-25', lead: 0, choices: [] } };
    expect(finishOfficial(s).results).toEqual({ '2026-10-24': old });
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

  it('update applies the change to the latest stored save, not a stale copy', () => {
    const store = memoryStorage();
    const stale = load(store);
    save({ ...stale, history: { '2026-10-24': 'W' } }, store); // another tab
    const next = update(s => ({ ...s, music: true }), store);
    expect(next).toMatchObject({ music: true, history: { '2026-10-24': 'W' } });
    expect(load(store)).toEqual(next);
  });

  it('update starts from a fresh save when nothing is stored', () => {
    const store = memoryStorage();
    const next = update(s => ({ ...s, name: 'Ash' }), store);
    expect(next.playerId).toMatch(UUID);
    expect(load(store).name).toBe('Ash');
  });

  it('malformed results entries are dropped, good ones kept', () => {
    const store = memoryStorage();
    const good = { won: true, turns: 9, p1Fainted: Array(6).fill(false), p2Fainted: Array(6).fill(true) };
    store.setItem(KEY, JSON.stringify({
      playerId: 'x', name: '', history: {},
      results: { '2026-10-24': good, '2026-10-23': { won: 'yes' }, '2026-10-22': null, '2026-10-21': { ...good, p1Fainted: [true] } },
    }));
    expect(load(store).results).toEqual({ '2026-10-24': good });
  });

  it('results with and without lead and choices load unchanged', () => {
    const store = memoryStorage();
    const old = { won: true, turns: 9, p1Fainted: Array(6).fill(false), p2Fainted: Array(6).fill(true) };
    const kept = { ...old, lead: 1, choices: ['move 1', 'switch 2'] };
    store.setItem(KEY, JSON.stringify({ playerId: 'x', name: '', history: {}, results: { '2026-10-24': old, '2026-10-25': kept } }));
    expect(load(store).results).toEqual({ '2026-10-24': old, '2026-10-25': kept });
  });

  it.each(['[]', 'null', '"x"'])('results of the wrong type (%s) are dropped', raw => {
    const store = memoryStorage();
    store.setItem(KEY, `{"playerId":"x","name":"","history":{},"results":${raw}}`);
    const s = load(store);
    expect(s.results).toBeUndefined();
    expect(s.playerId).toBe('x');
  });
});
