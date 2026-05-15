import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = resolve(__dirname, '..');
const SRC_JA = resolve(repo, 'data/n1_corpus');
let src = process.env.DATA_SRC || resolve(repo, 'data/n1_corpus_ko');
if (!existsSync(src)) {
  console.warn(`[sync-data] ${src} missing — falling back to data/n1_corpus`);
  src = SRC_JA;
}
const dst = resolve(repo, 'public/data');

if (!existsSync(src)) {
  console.error(`[sync-data] source missing: ${src}`);
  process.exit(1);
}
if (existsSync(dst)) rmSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`[sync-data] ${src} -> ${dst}`);

// Audio is hosted on Supabase Storage (audio_url in each exam JSON is the public CDN).
// By default we DO NOT copy local mp3s into the published dist — that keeps the
// deploy artifact small (a few hundred KB instead of several hundred MB).
// Set INCLUDE_AUDIO=1 to overlay local `data/n1_corpus/audio/` for offline dev.
const audioSrc = resolve(SRC_JA, 'audio');
if (process.env.INCLUDE_AUDIO === '1' && existsSync(audioSrc)) {
  cpSync(audioSrc, resolve(dst, 'audio'), { recursive: true });
  console.log(`[sync-data] overlay local audio (INCLUDE_AUDIO=1): ${audioSrc} -> ${resolve(dst, 'audio')}`);
}

// Listening section is canonical only in `n1_corpus/exams/*.json` (the JA corpus).
// Always overlay it onto the dst, so Supabase URL rewrites & new scrapes propagate
// regardless of whether translate.py has been re-run for the ko corpus.
// We do preserve any Korean-translated `translation_ko` / `expl_ko` fields per question
// when the ko corpus already has them.
const jaExams = resolve(SRC_JA, 'exams');
const dstExams = resolve(dst, 'exams');
if (existsSync(jaExams) && existsSync(dstExams) && src !== SRC_JA) {
  let overlaid = 0;
  for (const f of readdirSync(jaExams)) {
    if (!f.endsWith('.json')) continue;
    const dstPath = resolve(dstExams, f);
    if (!existsSync(dstPath)) continue;
    const jaJson = JSON.parse(readFileSync(resolve(jaExams, f), 'utf8'));
    if (!jaJson.listening) continue;
    const dstJson = JSON.parse(readFileSync(dstPath, 'utf8'));

    // Build a map of preserved KO fields keyed by question id
    const koOverrides = new Map();
    if (dstJson.listening?.subsections) {
      for (const s of dstJson.listening.subsections) {
        for (const q of (s.questions || [])) {
          const ov = {};
          if (q.translation_ko) ov.translation_ko = q.translation_ko;
          if (q.expl_ko) ov.expl_ko = q.expl_ko;
          if (Object.keys(ov).length) koOverrides.set(q.id, ov);
        }
      }
    }

    // Take JA listening as truth, then re-apply KO overrides
    const merged = JSON.parse(JSON.stringify(jaJson.listening));
    for (const s of merged.subsections) {
      for (const q of (s.questions || [])) {
        const ov = koOverrides.get(q.id);
        if (ov) Object.assign(q, ov);
      }
    }
    dstJson.listening = merged;
    writeFileSync(dstPath, JSON.stringify(dstJson), 'utf8');
    overlaid++;
  }
  if (overlaid) console.log(`[sync-data] overlaid listening into ${overlaid} exam(s) from JA corpus (KO translations preserved)`);
}

// Enrich public/data/index.json with listening question counts so the home page can
// show the full per-exam totals (reading + listening) without loading every exam.
// Also aggregate category totals (reading + listening) for the 영역별 모아풀기 cards.
const idxPath = resolve(dst, 'index.json');
if (existsSync(idxPath) && existsSync(dstExams)) {
  const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
  const categoryTotals = {}; // reading category → total q count across exams
  const listeningTotals = {}; // listening type → total q count across exams

  for (const entry of idx.exams) {
    const examFile = resolve(dst, entry.file);
    if (!existsSync(examFile)) continue;
    const ex = JSON.parse(readFileSync(examFile, 'utf8'));
    // Listening counts
    const L = ex.listening;
    if (L?.subsections) {
      entry.listening_subsections = L.subsections.length;
      entry.listening_questions = L.subsections.reduce((s, sub) => s + (sub.questions?.length || 0), 0);
      for (const sub of L.subsections) {
        listeningTotals[sub.type] = (listeningTotals[sub.type] || 0) + (sub.questions?.length || 0);
      }
    }
    // Reading category counts
    for (const q of (ex.questions || [])) {
      if (!q.category) continue;
      categoryTotals[q.category] = (categoryTotals[q.category] || 0) + 1;
    }
  }
  idx.category_totals = { ...categoryTotals, ...listeningTotals };
  writeFileSync(idxPath, JSON.stringify(idx, null, 2), 'utf8');
  console.log(`[sync-data] enriched index.json with listening + category totals (${Object.keys(idx.category_totals).length} categories)`);
}
