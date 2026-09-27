/** One-page proposal for a city councillor, opened in a new tab for print / Save as PDF. */
import type * as maplibregl from 'maplibre-gl'
import type { Lang, T } from '../i18n'
import { describeEdit } from '../scenario/fold'
import type { Edit } from '../scenario/types'
import type { SimResult } from '../sim/api'
import { delta, notApplied, ROWS } from '../sim/metrics'

const REPO = 'https://github.com/FaraDuMatin/HackTheHill'

const TEXT = {
  en: {
    title: 'Traffic change proposal',
    to: 'To',
    toValue: 'City councillor (Ward ________) — City of Ottawa / Ville de Gatineau',
    from: 'From',
    fromValue: 'Resident ________________________',
    date: 'Date',
    summary: 'Summary',
    changes: 'Proposed changes',
    results: 'Simulated effect (before → after)',
    method: 'Method and limits',
    methodText:
      'Road network from OpenStreetMap. Traffic simulated with Eclipse SUMO using {trips} synthetic random trips over one hour, identical before and after (same seed). Results are a relative comparison between the two scenarios, not a prediction of real traffic.',
    madeWith: 'Made with the open-source Ottawa-Gatineau Sandbox',
    print: 'Print / Save as PDF',
    noEdits: 'No changes.',
    sumIntro: 'This proposal tests {n} change(s) in a {km2} km² area: {list}.',
    sumTravel: 'Average travel time goes from {b} to {a} ({d}).',
    sumNotDone: '{n} trip(s) could not be completed after the change (before: {b}).',
    sumStuck: 'Gridlock indicator (stuck vehicles): {b} → {a}.',
  },
  fr: {
    title: 'Proposition de changement de circulation',
    to: 'À',
    toValue: 'Conseiller·ère municipal·e (quartier ________) — Ville de Gatineau / City of Ottawa',
    from: 'De',
    fromValue: 'Résident·e ________________________',
    date: 'Date',
    summary: 'Résumé',
    changes: 'Changements proposés',
    results: 'Effet simulé (avant → après)',
    method: 'Méthode et limites',
    methodText:
      'Réseau routier issu d’OpenStreetMap. Circulation simulée avec Eclipse SUMO à partir de {trips} trajets aléatoires synthétiques sur une heure, identiques avant et après (même graine). Les résultats sont une comparaison relative entre deux scénarios, pas une prédiction du trafic réel.',
    madeWith: 'Réalisé avec le logiciel libre Bac à sable Ottawa-Gatineau',
    print: 'Imprimer / Enregistrer en PDF',
    noEdits: 'Aucun changement.',
    sumIntro: 'Cette proposition teste {n} changement(s) dans une zone de {km2} km² : {list}.',
    sumTravel: 'Le temps de trajet moyen passe de {b} à {a} ({d}).',
    sumNotDone: '{n} trajet(s) ne peuvent plus être complétés après le changement (avant : {b}).',
    sumStuck: 'Indicateur d’embouteillage (véhicules bloqués) : {b} → {a}.',
  },
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]))

/** Current map view as PNG. Synchronous (needs preserveDrawingBuffer): the export tab
 * opens on click and backgrounds this one, which would stop further map renders. */
export function snapshot(map: maplibregl.Map): string {
  return map.getCanvas().toDataURL('image/png')
}

/** Write the proposal into `w`, a tab opened synchronously on click (so popup blockers allow it). */
export function writeProposal(w: Window, opts: {
  lang: Lang
  t: T
  image: string
  edits: Edit[]
  result: SimResult
}) {
  const { lang, t, image, edits, result } = opts
  const L = TEXT[lang]
  const list = edits.map((e) => describeEdit(e, t))
  const travel = ROWS[0]
  const b = travel.get(result.baseline)
  const a = travel.get(result.scenario)
  const d = delta(travel, b, a)

  const summary = [
    fill(L.sumIntro, { n: edits.length, km2: result.area_km2, list: list.join('; ') || L.noEdits }),
    b != null && a != null ? fill(L.sumTravel, { b: travel.fmt(b, t), a: travel.fmt(a, t), d: d?.text ?? t('noChange') }) : '',
    result.scenario.not_completed ? fill(L.sumNotDone, { n: result.scenario.not_completed, b: result.baseline.not_completed }) : '',
    result.scenario.teleports !== result.baseline.teleports
      ? fill(L.sumStuck, { b: result.baseline.teleports, a: result.scenario.teleports })
      : '',
  ].filter(Boolean)

  const rows = ROWS.map((row) => {
    const rb = row.get(result.baseline)
    const ra = row.get(result.scenario)
    const rd = delta(row, rb, ra)
    const change = !rd ? '–' : rd.text == null ? t('noChange') : `${rd.up ? '▲' : '▼'} ${rd.text} (${rd.better ? t('better') : t('worse')})`
    return `<tr><th>${esc(t(row.label))}</th><td>${rb == null ? '–' : esc(row.fmt(rb, t))}</td><td>${ra == null ? '–' : esc(row.fmt(ra, t))}</td><td>${esc(change)}</td></tr>`
  }).join('')

  const skipped = notApplied(result.applied?.skipped ?? [], edits, t)

  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><title>${esc(L.title)}</title>
<style>
  @page { size: letter; margin: 14mm; }
  body { font: 12px/1.45 system-ui, 'Segoe UI', Roboto, sans-serif; color: #1c1c1c; max-width: 780px; margin: 20px auto; padding: 0 16px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  h2 { font-size: 13px; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: .04em; color: #444; }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin-bottom: 8px; }
  .meta b { color: #444; }
  img { width: 100%; max-height: 300px; object-fit: cover; border: 1px solid #ccc; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: right; padding: 3px 6px; border-bottom: 1px solid #ddd; }
  th:first-child { text-align: left; font-weight: 500; }
  thead th { font-size: 11px; color: #555; }
  ul { margin: 4px 0; padding-left: 18px; }
  .note { font-size: 11px; color: #555; }
  .print { position: fixed; top: 12px; right: 12px; font: inherit; padding: 8px 12px; border-radius: 6px; border: 0; background: #1f78b4; color: #fff; cursor: pointer; }
  @media print { .print { display: none; } body { margin: 0; } }
</style></head><body>
<button class="print" onclick="window.print()">${esc(L.print)}</button>
<h1>${esc(L.title)}</h1>
<div class="meta">
  <b>${esc(L.to)}</b><span>${esc(L.toValue)}</span>
  <b>${esc(L.from)}</b><span>${esc(L.fromValue)}</span>
  <b>${esc(L.date)}</b><span>${new Date().toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA')}</span>
</div>
<img src="${image}" alt="">
<h2>${esc(L.summary)}</h2>
${summary.map((s) => `<p>${esc(s)}</p>`).join('')}
<h2>${esc(L.changes)}</h2>
<ul>${list.map((s) => `<li>${esc(s)}</li>`).join('') || `<li>${esc(L.noEdits)}</li>`}</ul>
${skipped.length ? `<p class="note">${esc(t('notApplied'))} ${skipped.map(esc).join('; ')}</p>` : ''}
<h2>${esc(L.results)}</h2>
<table><thead><tr><th>${esc(t('metric'))}</th><th>${esc(t('before'))}</th><th>${esc(t('after'))}</th><th>${esc(t('change'))}</th></tr></thead>
<tbody>${rows}</tbody></table>
<h2>${esc(L.method)}</h2>
<p class="note">${esc(fill(L.methodText, { trips: result.baseline.trips }))}</p>
<p class="note">${esc(L.madeWith)} — ${REPO}</p>
</body></html>`

  w.document.open()
  w.document.write(html)
  w.document.close()
}
