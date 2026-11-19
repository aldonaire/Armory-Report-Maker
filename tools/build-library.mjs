// Builds heroes.json from heroes.csv + the Assets folders.
//
//   node tools/build-library.mjs            (run from the project root)
//   node tools/build-library.mjs --strict   (exit with an error if any hero or background image is missing)
//
// Expected layout:
//   heroes.csv
//   Assets/Adult/     hero art for adult heroes
//   Assets/Young/     hero art for young heroes
//   Assets/Hero-BG/   backgrounds
//
// No dependencies. Run it on your machine, then commit heroes.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const BIG = 600 * 1024; // warn above this size

/* ---- CSV (same rules as the tool: quotes, CRLF, BOM) ---- */
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

/* ---- find a folder under Assets, ignoring case (Windows vs Vercel's Linux) ---- */
const assetsDir = path.join(root, 'Assets');
if (!fs.existsSync(assetsDir)) { console.error(`Cannot find ${assetsDir}`); process.exit(1); }

function openFolder(name) {
  const actual = fs.readdirSync(assetsDir, { withFileTypes: true })
    .find(d => d.isDirectory() && d.name.toLowerCase() === name.toLowerCase());
  if (!actual) { console.error(`Missing folder: Assets/${name}`); process.exit(1); }
  const files = fs.readdirSync(path.join(assetsDir, actual.name)).filter(f => !f.startsWith('.'));
  const stem = f => f.replace(/\.[^.]+$/, '').toLowerCase();
  const exact = new Map(files.map(f => [f.toLowerCase(), f]));
  const byStem = new Map();
  files.forEach(f => { const s = stem(f); if (!byStem.has(s)) byStem.set(s, []); byStem.get(s).push(f); });
  return { folder: actual.name, exact, byStem, stem };
}
const F = { adult: openFolder('Adult'), young: openFolder('Young'), bg: openFolder('Hero-BG') };

/* Returns { url, note } or null. Order: exact name, then same name with another extension. */
function find(ref, folders) {
  const want = String(ref || '').trim().split(/[\\/]/).pop();
  if (!want) return null;
  for (const [i, f] of folders.entries()) {
    const hit = f.exact.get(want.toLowerCase());
    if (hit) return { f, file: hit, note: i ? 'found in another folder' : '' };
  }
  for (const [i, f] of folders.entries()) {
    const hits = f.byStem.get(f.stem(want));
    if (hits && hits.length === 1) return { f, file: hits[0], note: 'different extension' + (i ? ', other folder' : '') };
  }
  return null;
}
const urlOf = h => `Assets/${encodeURIComponent(h.f.folder)}/${encodeURIComponent(h.file)}`;

/* ---- build ---- */
const rows = parseCsv(fs.readFileSync(path.join(root, 'heroes.csv'), 'utf8'));
const norm = v => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
const head = rows[0].map(norm);
const col = (...n) => head.findIndex(h => n.includes(h));
let ci = {
  type: col('type', 'age', 'agegroup', 'class', 'category'), name: col('name', 'heroname', 'hero'),
  sub: col('subtitle', 'sub'), hero: col('heroimage', 'heroimg', 'herofile', 'image', 'art'),
  bg: col('bg', 'background', 'bgimage', 'backgroundimage', 'bgfile')
};
let data = rows.slice(1);
if (ci.name < 0) { ci = { type: 0, name: 1, sub: 2, hero: 3, bg: 4 }; data = rows; }
const get = (r, i) => (i >= 0 && r[i] != null ? r[i].trim() : '');

const out = [], problems = [], unlisted = [], notes = [], used = new Set();
for (const r of data) {
  const name = get(r, ci.name); if (!name) continue;
  const type = /^y/i.test(get(r, ci.type)) ? 'young' : 'adult';
  const sub = get(r, ci.sub);
  const label = `${type} ${name}${sub ? ' / ' + sub : ''}`;
  const heroFolders = type === 'young' ? [F.young, F.adult] : [F.adult, F.young];

  const entry = { type, name, subtitle: sub, hero: '', bg: '' };
  for (const [field, ref, folders] of [['hero', get(r, ci.hero), heroFolders], ['bg', get(r, ci.bg), [F.bg]]]) {
    if (!ref) { unlisted.push(`${label} (${field})`); continue; }
    const hit = find(ref, folders);
    if (!hit) { problems.push(`${label}: ${field} ${ref}`); continue; }
    if (hit.note) notes.push(`${label}: ${field} "${ref}" -> ${hit.file} (${hit.note})`);
    entry[field] = urlOf(hit);
    used.add(path.join(assetsDir, hit.f.folder, hit.file));
  }
  out.push(entry);
}

fs.writeFileSync(path.join(root, 'heroes.json'), JSON.stringify(out, null, 2) + '\n');

/* ---- report ---- */
let total = 0; const big = [];
for (const p of used) { const s = fs.statSync(p).size; total += s; if (s > BIG) big.push([path.relative(root, p), s]); }
const mb = n => (n / 1048576).toFixed(1) + ' MB';
console.log(`heroes.json written: ${out.length} heroes (${out.filter(e => e.type === 'adult').length} adult, ${out.filter(e => e.type === 'young').length} young)`);
console.log(`${used.size} images referenced, ${mb(total)} total`);
if (notes.length) console.log(`\nMatched with a fix (${notes.length}):\n  ` + notes.join('\n  '));
if (big.length) console.log(`\nLarge images over ${Math.round(BIG / 1024)} KB (${big.length}). These all load at startup, so shrinking them helps:\n  ` + big.sort((a, b) => b[1] - a[1]).slice(0, 15).map(([p, s]) => `${p} (${mb(s)})`).join('\n  ') + (big.length > 15 ? `\n  ...and ${big.length - 15} more` : ''));
if (unlisted.length) console.log(`\nNo image named in heroes.csv (${unlisted.length}). Fill these in and run again:\n  ` + unlisted.join('\n  '));
if (problems.length) console.log(`\nNamed in heroes.csv but not found in Assets (${problems.length}):\n  ` + problems.join('\n  '));
if (!problems.length && !unlisted.length) console.log('\nAll images found.');
if (strict && (problems.length || unlisted.length)) process.exit(1);
