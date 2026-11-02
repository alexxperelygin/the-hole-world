/* Population in millions (UN 2024 estimates, rounded) for the per-capita ranking (SPEC §2.5).
   Shared by the client (src/ui/panel.ts) and the worker (shard count for the top-10 countries). Not balance: see config.ts for that. */
export const POP: Record<string, number> = {
  CN: 1410, IN: 1430, US: 335, ID: 278, PK: 240, NG: 224, BR: 216, BD: 173, RU: 144, MX: 128,
  ET: 127, JP: 124, PH: 117, EG: 113, VN: 99, IR: 89, TR: 85, DE: 84, TH: 72, GB: 68, FR: 68, TZ: 67,
  ZA: 60, IT: 59, KE: 55, MM: 54, KR: 52, CO: 52, ES: 48, UG: 48, AR: 46, DZ: 46, IQ: 45, AF: 42,
  CA: 40, MA: 38, PL: 37, UA: 37, SA: 37, AO: 37, UZ: 36, PE: 34, MY: 34, YE: 34, GH: 34, NP: 31,
  VE: 29, CI: 29, CM: 28, AU: 26, TW: 23.4, SY: 23, LK: 22, KZ: 20, CL: 20, RO: 19, NL: 18, EC: 18,
  SN: 18, GT: 18, KH: 17, TN: 12.4, BO: 12.4, BE: 11.8, CU: 11, JO: 11.3, DO: 11.3, CZ: 10.9, SE: 10.6,
  PT: 10.4, GR: 10.4, AZ: 10.2, TJ: 10.1, IL: 9.8, HU: 9.6, AE: 9.5, BY: 9.2, AT: 9.1, CH: 8.9, HK: 7.5,
  KG: 7, PY: 6.9, RS: 6.6, TM: 6.5, BG: 6.4, SG: 5.9, DK: 5.9, FI: 5.6, LB: 5.5, NO: 5.5, SK: 5.4,
  IE: 5.3, NZ: 5.2, CR: 5.2, OM: 4.6, PA: 4.5, KW: 4.3, HR: 3.9, GE: 3.7, MN: 3.5, UY: 3.4, PR: 3.2,
  AM: 3, LT: 2.9, JM: 2.8, QA: 2.7, MD: 2.5, SI: 2.1, LV: 1.9, BH: 1.5, EE: 1.4, CY: 1.3, LU: 0.66, IS: 0.39,
};
export const popOf = (cc: string) => POP[cc] || 1;
/* The ten most populous countries get 16 CountryShard instances each (SPEC §3.2); everyone else gets one. */
export const TOP10 = Object.keys(POP).sort((a, b) => POP[b] - POP[a]).slice(0, 10);
