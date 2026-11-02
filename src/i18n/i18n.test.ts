import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG } from '../config.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (l: string) => JSON.parse(fs.readFileSync(path.join(dir, l + '.json'), 'utf8')) as Record<string, unknown>;
const en = load('en');
const flat = (o: unknown, p = ''): Record<string, unknown> => {
  if (Array.isArray(o)) return Object.fromEntries(o.map((v, i) => [p + '[' + i + ']', v]));
  if (o && typeof o === 'object') return Object.assign({}, ...Object.entries(o).map(([k, v]) => { const f = flat(v, p ? p + '.' + k : k); return (v && typeof v === 'object') ? f : { [p ? p + '.' + k : k]: v }; }));
  return { [p]: o };
};
const enFlat = flat(en);
const ph = (s: string) => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');

describe('i18n dictionaries', () => {
  it('every language in CFG.langs has a file', () => {
    for (const l of CFG.langs) expect(fs.existsSync(path.join(dir, l + '.json')), l).toBe(true);
  });
  for (const l of CFG.langs.filter(x => x !== 'en')) {
    it(`${l}: same keys and placeholders as en`, () => {
      const f = flat(load(l));
      expect(Object.keys(f).sort()).toEqual(Object.keys(enFlat).sort());
      for (const k of Object.keys(enFlat)) {
        const a = enFlat[k], b = f[k];
        expect(typeof b, k).toBe(typeof a);
        if (typeof a === 'string') { expect(ph(b as string), `${l} ${k} placeholders`).toBe(ph(a)); expect((b as string).length, `${l} ${k} empty`).toBeGreaterThan(0); }
      }
    });
  }
  it('every layer, tool, helper, find, ocean and milestone in config has an EN string', () => {
    for (const l of CFG.layers) { expect(enFlat['layers.' + l.id]).toBeTypeOf('string'); for (let r = 0; r < 4; r++) expect(enFlat[`finds.${l.id}[${r}]`]).toBeTypeOf('string'); }
    for (const t of CFG.tools) expect(enFlat['tools.' + t.id]).toBeTypeOf('string');
    for (const h of CFG.helpers) expect(enFlat['helpers.' + h.id]).toBeTypeOf('string');
    for (const r of CFG.rarity) expect(enFlat['rarity.' + r.id]).toBeTypeOf('string');
    for (const m of CFG.milestones) expect(enFlat[m.k]).toBeTypeOf('string');
    for (const o of ['PAC', 'ATL', 'IND', 'SOU', 'ARC']) expect(enFlat['oceans.' + o]).toBeTypeOf('string');
  });
});
