import { readFileSync } from 'node:fs';
import path from 'node:path';

export type ManualSection = { title: string; level: 1 | 2 | 3; body: string };

const MANUAL_PATH = path.resolve(process.cwd(), 'docs/manual-de-usuario.md');

let cache: ManualSection[] | null = null;

/** Parsea `docs/manual-de-usuario.md` en secciones por encabezado (#, ##, ###). Memoizado en proceso. */
export function loadManualSections(): ManualSection[] {
  if (cache) return cache;
  const raw = readFileSync(MANUAL_PATH, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const sections: ManualSection[] = [];
  let current: ManualSection | null = null;

  for (const line of lines) {
    const match = /^(#{1,3})\s+(.*)$/.exec(line);
    if (match) {
      if (current) sections.push(current);
      current = { title: match[2]!.trim(), level: match[1]!.length as 1 | 2 | 3, body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) sections.push(current);

  cache = sections;
  return sections;
}

/** Busca la primera sección cuyo título contenga alguno de los `keywords` (case-insensitive). */
export function findSectionByKeywords(keywords: string[]): ManualSection | null {
  const sections = loadManualSections();
  for (const kw of keywords) {
    const found = sections.find((s) => s.title.toLowerCase().includes(kw.toLowerCase()));
    if (found) return found;
  }
  return null;
}

/** Solo para tests: fuerza a releer el archivo en la siguiente llamada. */
export function resetManualCache(): void {
  cache = null;
}
