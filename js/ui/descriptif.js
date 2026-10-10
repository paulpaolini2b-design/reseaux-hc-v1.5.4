/* ui/descriptif.js — éditeur plein écran du descriptif des travaux (v1.5.0 §2.9), dialogue d'alertes à l'export
 * (§2.7) et proposition « Sortie en page annexe » quand le bloc dépasse la page (§2.10).
 *
 * Utilisable au stylet et au clavier : chaque ligne est éditable sur place (contenteditable, liste blanche à la
 * relecture : gras, italique, souligné, couleur) ; la barre de mise en forme reprend celle des notes, plus la couleur
 * (sélecteur de couleur unique), le niveau (0 / 1 / 2) et la puce (aucune, •, ➢). Toute modification passe par
 * historique.valider() : Ctrl+Z / Ctrl+Y annulent aussi les saisies du descriptif. Clavier : Entrée = nouvelle ligne,
 * Ctrl+↑ / Ctrl+↓ = déplacer l'entrée, Échap = fermer. Consultation d'un archivé : lecture seule.
 */
import { etat, emettre, sur, notifier, peutModifier, signalerLectureSeule, selectionner, objets } from '../etat.js';
import { CHARTE } from '../charte.js';
import { bd } from '../bd.js';
import { valider, annuler, retablir } from '../historique.js';
import * as DS from '../descriptif.js';
import { miseEnPage, depassePage } from '../descriptif-rendu.js';
import { echapper, confirmer, ouvrirDialogue } from './dialogues.js';
import { ouvrirSelecteurCouleur } from './selecteur-couleur.js';
import { vue, appliquer } from '../vue.js';
import { pointsFourreau } from '../symboles.js';
import { changerPlanId } from '../plans.js';

const ALIGNEMENTS = [
  ['gauche', 'Aligner à gauche', 'M3 5h18M3 10h12M3 15h18M3 20h12'],
  ['centre', 'Centrer', 'M3 5h18M6 10h12M3 15h18M6 20h12'],
  ['droite', 'Aligner à droite', 'M3 5h18M9 10h12M3 15h18M9 20h12'],
  ['justifie', 'Justifier', 'M3 5h18M3 10h18M3 15h18M3 20h12']
];
const STYLES = [['bold', 'G', 'Gras (Ctrl+B)'], ['italic', 'I', 'Italique (Ctrl+I)'], ['underline', 'S', 'Souligné (Ctrl+U)']];
const PUCES = [['', 'Sans puce'], ['•', 'Puce •'], ['➢', 'Puce ➢']];
const DETAILS = { auto: 'Automatique', aucun: 'Aucun détail', total: 'Total seul', troncons: 'Par tronçon', les_deux: 'Par tronçon et total' };

let section = null;
let actif = null;            // { zone: 'entete'|'entree'|'titre'|'repere', entree?, ligne?, section? }
let rangeSauve = null;
let tranchees = [];
let menuOuvert = null;
let depassementSignale = new Set();
let pointeurBas = false, renduEnAttente = false;

export function initialiserEditeurDescriptif() {
  section = document.getElementById('editeur-descriptif');
  sur('ouvrir-descriptif', (cible) => ouvrirEditeurDescriptif(cible || null));
  sur('objets', () => { if (estOuvert()) { if (pointeurBas) renduEnAttente = true; else rendre(); } verifierDepassement(); });
  sur('plan-change', () => { if (estOuvert()) fermerEditeurDescriptif(); });
  sur('projet-ferme', () => { fermerEditeurDescriptif(); depassementSignale.clear(); });
  sur('projets-changes', (id) => {
    // informations d'affaire modifiées : en-têtes remis à jour (mise à jour idempotente), sauvegarde par 'objets'
    if (!etat.projet || etat.projet.id !== id || !peutModifier()) return;
    let change = false;
    for (const pl of etat.projet.plans) { try { change = DS.mettreAJourDescriptif(pl, etat.projet) || change; } catch (e) { console.warn(e); } }
    if (change) emettre('objets', { etiquette: 'Descriptif — en-tête' });
  });
  document.addEventListener('keydown', (e) => { if (estOuvert()) clavier(e); });   // focus éventuellement hors de l'éditeur après un re-rendu
  section.addEventListener('focusin', surFocus);
  section.addEventListener('focusout', surPerteFocus);
  section.addEventListener('click', surClic);
  section.addEventListener('change', surChangement);
  section.addEventListener('pointerdown', surPointeur);
  // Pas de re-rendu pendant un appui : le bouton touché doit encore exister au moment du « click »
  section.addEventListener('pointerdown', () => { pointeurBas = true; }, true);
  window.addEventListener('pointerup', () => { pointeurBas = false; if (renduEnAttente) { renduEnAttente = false; setTimeout(() => { if (estOuvert()) rendre(); }, 0); } }, true);
  window.addEventListener('pointercancel', () => { pointeurBas = false; }, true);
  // Appui long (menu contextuel du navigateur) sur l'en-tête d'une entrée : menu de l'entrée
  section.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('.entete-entree');
    if (!t) return;
    e.preventDefault();
    const b = t.querySelector('.btn-menu-entree');
    if (b) ouvrirMenuEntree(b.dataset.entree, b);
  });
  bd.get('prefs', 'tranchees_recentes').then((r) => { if (r && Array.isArray(r.valeur)) tranchees = r.valeur; }).catch(() => {});
}

export function estOuvert() { return !!section && !section.hidden; }
const desc = () => (etat.plan ? etat.plan.descriptif : null);
const lectureSeule = () => !peutModifier();

export function ouvrirEditeurDescriptif(cible = null) {
  if (!etat.plan) return;
  if (!desc()) { notifier('Aucun descriptif sur ce plan : Outils → Descriptif pour le créer', 2800); return; }
  emettre('fermer-panneaux');
  section.hidden = false;
  document.body.classList.add('editeur-descriptif-ouvert');
  actif = null;
  rendre();
  if (cible && cible.ligne) focaliserLigne(cible.ligne);
  else if (cible && cible.entree) { const el = section.querySelector(`[data-entree="${cible.entree}"]`); if (el) el.scrollIntoView({ block: 'center' }); }
}

export function fermerEditeurDescriptif() {
  if (!section || section.hidden) return;
  validerSaisieEnCours();
  fermerMenu();
  section.hidden = true;
  document.body.classList.remove('editeur-descriptif-ouvert');
  actif = null;
}

/* ---------- Segments ↔ HTML ---------- */

function htmlSegments(sousLignes) {
  return (sousLignes || [[]]).map((segs) => (segs || []).map((sg) => {
    let h = echapper(sg.t || '');
    if (sg.s) h = '<u>' + h + '</u>';
    if (sg.i) h = '<i>' + h + '</i>';
    if (sg.g) h = '<b>' + h + '</b>';
    if (sg.c) h = `<font color="${echapper(sg.c)}">` + h + '</font>';
    return h;
  }).join('')).join('<br>');
}

function hexDepuisCss(c) {
  if (!c) return null;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(c);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/* Relecture stricte : b/strong, i/em, u, font[color] / style color, br, div/p ; tout le reste = texte brut. */
function lireSegments(racine) {
  const lignes = [[]];
  const pousser = (t, st) => {
    if (!t) return;
    const l = lignes[lignes.length - 1], der = l[l.length - 1];
    const c = st.c && st.c !== '#000000' ? st.c : null;
    if (der && !!der.g === !!st.g && !!der.i === !!st.i && !!der.s === !!st.s && (der.c || null) === c) der.t += t;
    else { const seg = { t }; if (st.g) seg.g = true; if (st.i) seg.i = true; if (st.s) seg.s = true; if (c) seg.c = c; l.push(seg); }
  };
  const parcourir = (n, st) => {
    if (n.nodeType === 3) { n.nodeValue.replace(/\u00A0/g, ' ').replace(/\r/g, '').split('\n').forEach((p, i) => { if (i) lignes.push([]); pousser(p, st); }); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === 'BR') { lignes.push([]); return; }
    const r = { ...st };
    if (tag === 'B' || tag === 'STRONG') r.g = true;
    if (tag === 'I' || tag === 'EM') r.i = true;
    if (tag === 'U') r.s = true;
    if (tag === 'FONT' && n.getAttribute('color')) r.c = hexDepuisCss(n.getAttribute('color')) || r.c;
    const css = n.style;
    if (css) {
      const fw = css.fontWeight;
      if (fw === 'bold' || Number(fw) >= 600) r.g = true; else if (fw === 'normal') r.g = false;
      if (css.fontStyle === 'italic') r.i = true;
      if (/underline/.test(css.textDecorationLine || css.textDecoration || '')) r.s = true;
      if (css.color) r.c = hexDepuisCss(css.color) || r.c;
    }
    const bloc = (tag === 'DIV' || tag === 'P') && lignes[lignes.length - 1].length;
    if (bloc) lignes.push([]);
    for (const c of n.childNodes) parcourir(c, r);
  };
  for (const c of racine.childNodes) parcourir(c, {});
  while (lignes.length > 1 && !lignes[lignes.length - 1].length) lignes.pop();
  return lignes;
}

/* ---------- Rendu ---------- */

function styleLigne(l) {
  const al = { gauche: 'left', centre: 'center', droite: 'right', justifie: 'justify' }[l.alignement || 'gauche'];
  return `text-align:${al};padding-left:${(l.niveau || 0) * 1.6}em`;
}

function htmlLigne(l, conteneur, entreeId = '') {
  const ro = lectureSeule();
  if (l.supprimee) {
    return `<div class="ligne-desc supprimee" data-ligne="${l.id}" data-conteneur="${conteneur}" data-entree="${entreeId}">
      <span class="texte-supprime">${echapper(DS.texteLigne(l)) || '(ligne)'}</span>
      ${ro ? '' : `<button type="button" class="btn-mini" data-a="retablir-ligne" data-ligne="${l.id}">Rétablir</button>`}</div>`;
  }
  const gps = l.cle_auto === 'entete.gps';
  const titre = l.role === 'titre' ? ' role-titre' : '';
  const marque = l.origine === 'manuelle' && l.cle_auto ? '<span class="marque-manuelle" title="Ligne générée modifiée à la main">✎</span>' : '';
  return `<div class="ligne-desc-cadre${titre}" data-cadre="${l.id}">${marque}
    <div class="ligne-desc${l.origine === 'manuelle' ? ' manuelle' : ''}" data-ligne="${l.id}" data-conteneur="${conteneur}" data-entree="${entreeId}"
      ${ro ? '' : 'contenteditable="true"'} spellcheck="true" ${l.puce ? `data-puce="${echapper(l.puce)}"` : ''}
      ${gps ? `data-placeholder="${echapper(CHARTE.descriptif.libelle_gps)}"` : 'data-placeholder="Ligne vide"'}
      style="${styleLigne(l)}">${htmlSegments(l.segments)}</div></div>`;
}

function htmlEntree(e, s, colonne) {
  const ro = lectureSeule();
  const repere = DS.texteSegments(e.repere);
  const groupe = e.source.type === 'groupe_troncons';
  const fournitureCalculee = groupe && (e.lignes.some((l) => l.cle_auto === 'fourniture') || e.champs.fourniture !== null);
  const alertes = (e.inclure ? e.alertes : []).map((a) => `<span class="pastille-alerte" title="${echapper(DS.libelleAlerte(a))}">${echapper(DS.libelleAlerte(a))}</span>`).join('');
  return `
    ${colonne ? `<div class="saut-colonne-desc ${e.saut_colonne_avant ? 'force' : ''}">${e.saut_colonne_avant ? 'Saut de colonne forcé' : 'Colonne ' + colonne}</div>` : ''}
    <div class="entree-desc${e.inclure ? '' : ' exclue'}" data-entree="${e.id}" data-section="${s.id}">
      <div class="entete-entree">
        ${ro ? '' : `<span class="poignee-desc" data-a="glisser" title="Glisser pour déplacer l'entrée">⠿</span>`}
        <label class="case-inclure" title="Inclure dans le rendu"><input type="checkbox" data-champ="inclure" ${e.inclure ? 'checked' : ''} ${ro ? 'disabled' : ''}></label>
        <span class="repere-desc" data-repere="${e.id}" ${ro ? '' : 'contenteditable="true"'} data-placeholder="—">${echapper(repere)}</span>
        <span class="type-desc">${echapper({ objet: 'Ouvrage', groupe_troncons: 'Tronçons', fourreau: 'Fourreau', libre: 'Entrée libre' }[e.source.type] || '')}</span>
        ${alertes}
        ${e.alertes.includes('source_modifiee') && !ro ? `<button type="button" class="btn-mini" data-a="vu" data-entree="${e.id}">Vu</button>` : ''}
        <button type="button" class="btn-icone btn-menu-entree" data-a="menu-entree" data-entree="${e.id}" title="Actions de l'entrée" aria-label="Actions de l'entrée">⋮</button>
      </div>
      <div class="lignes-entree">${e.lignes.map((l) => htmlLigne(l, 'entree', e.id)).join('')}</div>
      ${groupe ? `
      <div class="champs-entree">
        <label>Tranchée<input data-champ="tranchee" list="liste-tranchees" value="${echapper(e.champs.tranchee || '')}" placeholder="0,40 m × 1,00 m" ${ro ? 'disabled' : ''} autocomplete="off"></label>
        ${fournitureCalculee || ['a_poser', 'a_reprendre'].includes(e.style_echantillon && e.style_echantillon.etat) ? `
        <label>Fourniture (${echapper(desc().unite_lineaire || 'ml')})<input data-champ="fourniture" value="${echapper(e.champs.fourniture ?? '')}" placeholder="${e.calcul_fourniture ? 'calculée' : 'à saisir'}" ${ro ? 'disabled' : ''} inputmode="decimal" autocomplete="off"></label>
        ${e.champs.fourniture !== null && !ro ? `<button type="button" class="btn-mini" data-a="retablir-fourniture" data-entree="${e.id}">Rétablir le calcul</button>` : ''}` : ''}
        <label>Détail<select data-champ="detail" ${ro ? 'disabled' : ''}>${Object.entries(DETAILS).map(([k, l]) => `<option value="${k}" ${e.champs.detail === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Sens<select data-champ="sens" ${ro ? 'disabled' : ''} title="Ordre des tronçons dans le détail et sens « de … à … »">
          <option value="auto" ${e.champs.sens !== 'inverse' ? 'selected' : ''}>Ordre des ouvrages</option>
          <option value="inverse" ${e.champs.sens === 'inverse' ? 'selected' : ''}>Inversé</option>
        </select></label>
        <label class="case"><input type="checkbox" data-champ="echantillon" ${e.echantillon ? 'checked' : ''} ${ro ? 'disabled' : ''}> Trait</label>
        ${e.calcul_fourniture ? `<div class="calcul-fourniture">Calcul : ${echapper(e.calcul_fourniture)} (éditeur seulement)</div>` : ''}
      </div>` : ''}
    </div>`;
}

function rendre() {
  const d = desc();
  if (!d) { fermerEditeurDescriptif(); return; }
  const focusAvant = document.activeElement && section.contains(document.activeElement) ? (document.activeElement.dataset.ligne || null) : null;
  const scroll = section.querySelector('.corps-descriptif') ? section.querySelector('.corps-descriptif').scrollTop : 0;
  const ro = lectureSeule();
  // Colonnes effectives (aperçu) : première entrée de chaque colonne au-delà de la première
  const debuts = new Map();
  try { miseEnPage(d).colonnes.forEach((col, i) => { if (i && col[0] && col[0].entree) debuts.set(col[0].entree.id, i + 1); }); } catch (e) { /* aperçu seulement */ }
  const exclus = (d.exclus || []).map((k) => ({ k, l: DS.libelleExclu(etat.plan, k) })).filter((x) => x.l);
  section.innerHTML = `
    <header class="entete-editeur-desc">
      <h2>Descriptif${etat.projet.plans.length > 1 ? ' — ' + echapper(etat.plan.nom || '') : ''}${ro ? ' <span class="pastille-statut">consultation</span>' : ''}</h2>
      <div class="actions-desc">
        ${ro ? '' : `<button type="button" class="btn" data-a="entree-libre">+ Entrée libre</button>
        <button type="button" class="btn" data-a="section-libre">+ Section</button>`}
        <button type="button" class="btn-icone" data-a="menu-general" title="Réglages et actions" aria-label="Réglages et actions">⋮</button>
        <button type="button" class="btn-icone" data-a="fermer" title="Fermer (Échap)" aria-label="Fermer">✕</button>
      </div>
    </header>
    ${ro ? '' : `<div class="barre-format barre-desc" role="toolbar" aria-label="Mise en forme de la ligne">
      ${STYLES.map(([cmd, lettre, titre]) => `<button type="button" class="btn-format fmt-${cmd}" data-cmd="${cmd}" title="${titre}">${lettre}</button>`).join('')}
      <button type="button" class="btn-format" data-a="couleur" title="Couleur du texte sélectionné (sans sélection : toute la ligne)"><span class="pastille-couleur-desc"></span></button>
      <span class="sep-format"></span>
      ${ALIGNEMENTS.map(([k, t, p]) => `<button type="button" class="btn-format" data-align="${k}" title="${t}"><svg viewBox="0 0 24 24" width="20" height="20"><path d="${p}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`).join('')}
      <span class="sep-format"></span>
      ${[0, 1, 2].map((n) => `<button type="button" class="btn-format" data-niveau="${n}" title="Niveau ${n}">N${n}</button>`).join('')}
      ${PUCES.map(([p, t]) => `<button type="button" class="btn-format" data-puce="${p}" title="${t}">${p || '∅'}</button>`).join('')}
      <span class="sep-format"></span>
      <button type="button" class="btn-format" data-a="ligne-dessous" title="Ajouter une ligne dessous (Entrée)">＋</button>
      <button type="button" class="btn-format" data-a="ligne-supprimer" title="Supprimer la ligne">⌫</button>
      <button type="button" class="btn-format" data-a="ligne-auto" title="Rétablir l'automatique de la ligne">↺</button>
    </div>`}
    <datalist id="liste-tranchees">${tranchees.map((t) => `<option value="${echapper(t)}">`).join('')}</datalist>
    <div class="corps-descriptif">
      <section class="bloc-desc entete-desc">
        <h3>En-tête</h3>
        ${d.entete.lignes.map((l) => htmlLigne(l, 'entete')).join('')}
        ${ro ? '' : '<button type="button" class="btn-mini" data-a="ligne-entete">+ Ligne d’en-tête</button>'}
      </section>
      ${d.sections.map((s) => `
      <section class="bloc-desc section-desc" data-section="${s.id}">
        <div class="titre-section-desc">
          ${s.titre ? `<div class="ligne-desc titre" data-titre="${s.id}" ${ro ? '' : 'contenteditable="true"'}>${htmlSegments([s.titre])}</div>
            ${ro ? '' : `<button type="button" class="btn-mini" data-a="titre-supprimer" data-section="${s.id}">Retirer le titre</button>`}`
            : `<span class="sans-titre">${s.cle === 'ouvrages' ? 'Ouvrages' : s.cle === 'troncons' ? 'Tronçons' : 'Section libre'} (sans titre au rendu)</span>
            ${ro ? '' : `<button type="button" class="btn-mini" data-a="titre-ajouter" data-section="${s.id}">Ajouter un titre</button>`}`}
        </div>
        ${s.entrees.map((e) => htmlEntree(e, s, debuts.get(e.id) || (e.saut_colonne_avant ? 'forcé' : 0))).join('') || '<p class="vide">Aucune entrée.</p>'}
        ${ro ? '' : `<button type="button" class="btn-mini" data-a="entree-libre" data-section="${s.id}">+ Entrée libre dans cette section</button>`}
      </section>`).join('')}
      ${exclus.length ? `<section class="bloc-desc"><h3>Entrées supprimées</h3>${exclus.map((x) => `<div class="exclu-desc"><span>${echapper(x.l)}</span>${ro ? '' : `<button type="button" class="btn-mini" data-a="reintegrer" data-cle="${echapper(x.k)}">Réintégrer</button>`}</div>`).join('')}</section>` : ''}
    </div>`;
  const corps = section.querySelector('.corps-descriptif');
  corps.scrollTop = scroll;
  if (focusAvant) focaliserLigne(focusAvant, { defiler: false });
}

function focaliserLigne(id, { defiler = true } = {}) {
  const el = section.querySelector(`[data-ligne="${id}"]`);
  if (!el) return;
  if (defiler) el.scrollIntoView({ block: 'center' });
  if (el.isContentEditable) {
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
}

/* ---------- Saisie ---------- */

function trouverLigne(el) {
  const d = desc();
  const id = el.dataset.ligne;
  if (el.dataset.conteneur === 'entete') return { lignes: d.entete.lignes, ligne: d.entete.lignes.find((l) => l.id === id), entree: null };
  const r = DS.trouverEntree(d, el.dataset.entree);
  if (!r) return null;
  return { lignes: r.entree.lignes, ligne: r.entree.lignes.find((l) => l.id === id), entree: r.entree };
}

/* Relit l'élément en cours d'édition et valide s'il a changé. Retourne true si une étape a été créée. */
function validerElement(el) {
  if (!el || lectureSeule() || !desc()) return false;
  const d = desc();
  if (el.dataset.ligne && el.isContentEditable) {
    const t = trouverLigne(el);
    if (!t || !t.ligne) return false;
    if (DS.modifierLigne(t.ligne, { segments: lireSegments(el) })) { valider('Descriptif — ligne'); return true; }
    return false;
  }
  if (el.dataset.repere) {
    const r = DS.trouverEntree(d, el.dataset.repere);
    const txt = el.textContent.replace(/\u00A0/g, ' ').trim();
    if (!r || txt === DS.texteSegments(r.entree.repere)) return false;
    r.entree.repere = txt ? [{ t: txt, g: true, c: CHARTE.descriptif.repere.couleur }] : [];
    r.entree.repere_manuel = true;
    valider('Descriptif — repère');
    return true;
  }
  if (el.dataset.titre) {
    const s = d.sections.find((x) => x.id === el.dataset.titre);
    const segs = lireSegments(el)[0] || [];
    if (!s || JSON.stringify(segs) === JSON.stringify(s.titre)) return false;
    s.titre = segs.length ? segs : null;
    valider('Descriptif — titre');
    return true;
  }
  return false;
}

function validerSaisieEnCours() {
  const el = document.activeElement;
  if (el && section && section.contains(el)) validerElement(el);
}

function surFocus(e) {
  const el = e.target;
  if (el.dataset && el.dataset.ligne) actif = { zone: el.dataset.conteneur, entree: el.dataset.entree || null, ligne: el.dataset.ligne };
  else if (el.dataset && el.dataset.repere) actif = { zone: 'repere', entree: el.dataset.repere };
  else if (el.dataset && el.dataset.titre) actif = { zone: 'titre', section: el.dataset.titre };
}

function surPerteFocus(e) {
  const el = e.target;
  if (!el.dataset || !(el.dataset.ligne || el.dataset.repere || el.dataset.titre)) return;
  // la barre de mise en forme ne prend pas le focus (pointerdown empêché) : une vraie sortie de champ valide
  setTimeout(() => { if (document.contains(el)) validerElement(el); }, 0);
}

/* Ligne active (objet du modèle) et sa liste. */
function ligneActive() {
  if (!actif || !actif.ligne || !desc()) return null;
  const el = section.querySelector(`[data-ligne="${actif.ligne}"]`);
  return el ? { el, ...trouverLigne(el) } : null;
}

function appliquerALaLigne(changement, etiquette) {
  if (lectureSeule()) { signalerLectureSeule(); return; }
  const a = ligneActive();
  if (!a || !a.ligne) { notifier('Touchez d’abord une ligne', 1600); return; }
  DS.modifierLigne(a.ligne, { segments: lireSegments(a.el) });
  if (DS.modifierLigne(a.ligne, changement(a.ligne))) valider(etiquette);
  focaliserLigne(a.ligne.id, { defiler: false });
}

function clavier(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape') { e.preventDefault(); if (menuOuvert) { fermerMenu(); return; } fermerEditeurDescriptif(); return; }
  if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); validerSaisieEnCours(); annuler(); return; }
  if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); validerSaisieEnCours(); retablir(); return; }
  if (lectureSeule()) return;
  const el = e.target;
  if (ctrl && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    const id = actif && actif.entree;
    if (!id) return;
    e.preventDefault();
    validerSaisieEnCours();
    const ligne = actif.ligne;
    if (DS.deplacerEntree(desc(), id, e.key === 'ArrowUp' ? -1 : 1)) { valider('Descriptif — ordre'); if (ligne) focaliserLigne(ligne); }
    return;
  }
  if (e.key === 'Enter' && el.dataset && (el.dataset.repere || el.dataset.titre)) { e.preventDefault(); el.blur(); return; }
  if (e.key === 'Enter' && !e.shiftKey && el.dataset && el.dataset.ligne) {
    e.preventDefault();
    const t = trouverLigne(el);
    if (!t || !t.ligne) return;
    DS.modifierLigne(t.ligne, { segments: lireSegments(el) });
    const n = DS.ajouterLigneApres(t.lignes, t.ligne.id, t.ligne);
    if (t.ligne.role === 'titre') delete n.role;
    valider('Descriptif — nouvelle ligne');
    focaliserLigne(n.id);
  }
}

function sauverSelection() {
  const s = window.getSelection();
  rangeSauve = s && s.rangeCount && section.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null;
}

/* v1.5.1 — Position (en caractères, sous-lignes jointes par « \n ») d'un point d'une ligne éditable : le contenu qui
 * précède est relu par lireSegments(), la même relecture que la validation — le décompte correspond au modèle. */
function longueurSegments(sl) { return sl.reduce((n, segs, i) => n + (i ? 1 : 0) + segs.reduce((m, sg) => m + String(sg.t || '').length, 0), 0); }
function decalageDans(el, noeud, offset) {
  const r = document.createRange();
  r.selectNodeContents(el);
  try { r.setEnd(noeud, offset); } catch (e) { return 0; }
  const tmp = document.createElement('div');
  tmp.appendChild(r.cloneContents());
  return longueurSegments(lireSegments(tmp));
}

/* v1.5.1 — Couleur du texte : appliquée au MODÈLE de la ligne (plage mémorisée avant l'ouverture du sélecteur), puis
 * validée. Corrige la v1.5.0 : la commande foreColor partait pendant que le sélecteur (fenêtre modale) avait le focus,
 * et la ligne n'était jamais relue — la couleur était perdue. Sans sélection : toute la ligne. */
function preparerCouleur() {
  const a = ligneActive();
  if (!a || !a.ligne) return null;
  let debut = 0, fin = 0;
  const r = rangeSauve;
  if (r && a.el.contains(r.startContainer) && a.el.contains(r.endContainer) && !r.collapsed) {
    debut = decalageDans(a.el, r.startContainer, r.startOffset);
    fin = decalageDans(a.el, r.endContainer, r.endOffset);
  }
  const cible = { idLigne: a.ligne.id, conteneur: a.el.dataset.conteneur, entree: a.el.dataset.entree || null, debut, fin };
  // saisie en cours enregistrée avant le choix de couleur (le DOM peut être redessiné ensuite : la plage est déjà lue)
  if (DS.modifierLigne(a.ligne, { segments: lireSegments(a.el) })) valider('Descriptif — ligne');
  return cible;
}
function trouverLigneModele(cible) {
  const d = desc();
  if (!d) return null;
  if (cible.conteneur === 'entete') return d.entete.lignes.find((l) => l.id === cible.idLigne) || null;
  const r = DS.trouverEntree(d, cible.entree);
  return r ? r.entree.lignes.find((l) => l.id === cible.idLigne) || null : null;
}
function restaurerSelection() {
  if (!rangeSauve) return;
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(rangeSauve);
}

function surPointeur(e) {
  // les boutons de mise en forme ne volent pas le focus (sélection conservée)
  if (e.target.closest('.barre-desc')) { e.preventDefault(); sauverSelection(); }
  const p = e.target.closest('[data-a="glisser"]');
  if (p) debutGlisser(e, p);
  if (menuOuvert && !e.target.closest('.menu-desc')) fermerMenu();
}

async function surClic(e) {
  const b = e.target.closest('button, [data-a]');
  if (!b || !section.contains(b)) return;
  const d = desc();
  if (!d) return;
  const a = b.dataset.a;
  if (b.dataset.cmd) {
    if (lectureSeule()) return;
    restaurerSelection();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(b.dataset.cmd, false, null);
    return;
  }
  if (b.dataset.align !== undefined) return appliquerALaLigne(() => ({ alignement: b.dataset.align }), 'Descriptif — alignement');
  if (b.dataset.niveau !== undefined) return appliquerALaLigne(() => ({ niveau: Number(b.dataset.niveau) }), 'Descriptif — niveau');
  if (b.dataset.puce !== undefined && b.closest('.barre-desc')) return appliquerALaLigne(() => ({ puce: b.dataset.puce }), 'Descriptif — puce');
  switch (a) {
    case 'fermer': fermerEditeurDescriptif(); return;
    case 'couleur': {
      if (lectureSeule()) return;
      const cible = preparerCouleur();
      if (!cible) { notifier('Touchez d’abord une ligne (sélectionnez le texte à colorer, ou rien pour toute la ligne)', 2400); return; }
      ouvrirSelecteurCouleur({ valeur: '#000000', titre: cible.fin > cible.debut ? 'Couleur du texte sélectionné' : 'Couleur de toute la ligne', surChoix: (c) => {
        const l = trouverLigneModele(cible);
        if (!l) return;
        if (DS.modifierLigne(l, { segments: DS.colorierSegments(l.segments, cible.debut, cible.fin, c) })) valider('Descriptif — couleur');
      } });
      return;
    }
    case 'ligne-dessous': {
      const t = ligneActive();
      if (!t || !t.ligne) { notifier('Touchez d’abord une ligne', 1600); return; }
      DS.modifierLigne(t.ligne, { segments: lireSegments(t.el) });
      const n = DS.ajouterLigneApres(t.lignes, t.ligne.id, t.ligne);
      valider('Descriptif — nouvelle ligne'); focaliserLigne(n.id); return;
    }
    case 'ligne-supprimer': {
      const t = ligneActive();
      if (!t || !t.ligne) { notifier('Touchez d’abord une ligne', 1600); return; }
      DS.supprimerLigne(t.lignes, t.ligne.id); actif = null;
      valider('Descriptif — ligne supprimée'); return;
    }
    case 'ligne-auto': {
      const t = ligneActive();
      if (!t || !t.ligne || !t.ligne.cle_auto) { notifier('Ligne libre : rien à rétablir', 1600); return; }
      if (DS.retablirAutoLigne(t.lignes, t.ligne.id)) { actif = null; valider('Descriptif — ligne rétablie'); }
      return;
    }
    case 'retablir-ligne': {
      const el = b.closest('[data-ligne]');
      const t = el && trouverLigne(el);
      if (t && DS.retablirAutoLigne(t.lignes, b.dataset.ligne)) valider('Descriptif — ligne rétablie');
      return;
    }
    case 'ligne-entete': { const n = DS.ajouterLigneApres(d.entete.lignes, null, { niveau: 0, puce: '', alignement: 'centre' }); valider('Descriptif — en-tête'); focaliserLigne(n.id); return; }
    case 'entree-libre': {
      const sid = b.dataset.section || (actif && actif.entree && DS.trouverEntree(d, actif.entree) ? DS.trouverEntree(d, actif.entree).section.id : d.sections[d.sections.length - 1].id);
      const apres = !b.dataset.section && actif && actif.entree ? actif.entree : null;
      const e2 = DS.ajouterEntreeLibre(d, sid, apres); valider('Descriptif — entrée libre'); focaliserLigne(e2.lignes[0].id); return;
    }
    case 'section-libre': { DS.ajouterSectionLibre(d, 'Section'); valider('Descriptif — section'); return; }
    case 'titre-ajouter': { const s = d.sections.find((x) => x.id === b.dataset.section); if (s) { s.titre = [{ t: s.cle === 'ouvrages' ? 'Ouvrages' : s.cle === 'troncons' ? 'Tronçons' : 'Section', g: true }]; valider('Descriptif — titre'); } return; }
    case 'titre-supprimer': { const s = d.sections.find((x) => x.id === b.dataset.section); if (s) { s.titre = null; valider('Descriptif — titre retiré'); } return; }
    case 'reintegrer': DS.reintegrer(d, b.dataset.cle); valider('Descriptif — réintégration'); return;
    case 'vu': { const r = DS.trouverEntree(d, b.dataset.entree); if (r) { DS.marquerVu(r.entree); valider('Descriptif — vu'); } return; }
    case 'retablir-fourniture': { const r = DS.trouverEntree(d, b.dataset.entree); if (r) { r.entree.champs.fourniture = null; valider('Descriptif — fourniture calculée'); } return; }
    case 'menu-entree': ouvrirMenuEntree(b.dataset.entree, b); return;
    case 'menu-general': ouvrirMenuGeneral(b); return;
    default: break;
  }
}

async function surChangement(e) {
  const el = e.target;
  const champ = el.dataset && el.dataset.champ;
  if (!champ) return;
  if (lectureSeule()) { signalerLectureSeule(); rendre(); return; }
  const id = el.closest('[data-entree]') && el.closest('[data-entree]').dataset.entree;
  const r = DS.trouverEntree(desc(), id);
  if (!r) return;
  const en = r.entree;
  if (champ === 'inclure') { en.inclure = el.checked; en.inclure_manuel = true; valider('Descriptif — inclusion'); }
  else if (champ === 'echantillon') { en.echantillon = el.checked; valider('Descriptif — trait'); }
  else if (champ === 'detail') { en.champs.detail = DS.DETAILS.includes(el.value) ? el.value : 'auto'; valider('Descriptif — détail'); }
  else if (champ === 'sens') { en.champs.sens = el.value === 'inverse' ? 'inverse' : 'auto'; valider('Descriptif — sens'); }   // v1.5.3
  else if (champ === 'tranchee') {
    en.champs.tranchee = DS.normaliserTranchee(el.value);
    if (en.champs.tranchee) memoriserTranchee(en.champs.tranchee);
    valider('Descriptif — tranchée');
  } else if (champ === 'fourniture') {
    const v = String(el.value || '').trim();
    en.champs.fourniture = v ? v : null;
    valider('Descriptif — fourniture');
  }
}

async function memoriserTranchee(t) {
  tranchees = [t, ...tranchees.filter((x) => x !== t)].slice(0, CHARTE.descriptif.memoire_tranchees);
  try { await bd.put('prefs', { cle: 'tranchees_recentes', valeur: tranchees }); } catch (e) { /* mémoire seule */ }
}

/* ---------- Glisser une entrée ---------- */

function debutGlisser(e, poignee) {
  if (lectureSeule()) return;
  e.preventDefault();
  const carte = poignee.closest('.entree-desc');
  const sid = carte.dataset.section;
  carte.classList.add('glissee');
  let cible = null;
  const bouger = (ev) => {
    const sous = document.elementFromPoint(ev.clientX, ev.clientY);
    const c = sous && sous.closest('.entree-desc');
    section.querySelectorAll('.cible-avant, .cible-apres').forEach((x) => x.classList.remove('cible-avant', 'cible-apres'));
    cible = null;
    if (c && c !== carte && c.dataset.section === sid) {
      const r = c.getBoundingClientRect();
      const avant = ev.clientY < r.top + r.height / 2;
      c.classList.add(avant ? 'cible-avant' : 'cible-apres');
      cible = { id: c.dataset.entree, avant };
    }
  };
  const fin = () => {
    window.removeEventListener('pointermove', bouger);
    window.removeEventListener('pointerup', fin);
    window.removeEventListener('pointercancel', fin);
    carte.classList.remove('glissee');
    section.querySelectorAll('.cible-avant, .cible-apres').forEach((x) => x.classList.remove('cible-avant', 'cible-apres'));
    if (!cible) return;
    const d = desc();
    const s = d.sections.find((x) => x.id === sid);
    const id = carte.dataset.entree;
    const sans = s.entrees.filter((x) => x.id !== id);
    let i = sans.findIndex((x) => x.id === cible.id);
    if (!cible.avant) i++;
    if (DS.deplacerEntreeVers(d, id, i)) valider('Descriptif — ordre');
  };
  window.addEventListener('pointermove', bouger);
  window.addEventListener('pointerup', fin);
  window.addEventListener('pointercancel', fin);
}

/* ---------- Menus ---------- */

function fermerMenu() { if (menuOuvert) { menuOuvert.remove(); menuOuvert = null; } }

function afficherMenu(items, ancre) {
  fermerMenu();
  const m = document.createElement('div');
  m.className = 'menu-desc';
  m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it.sep ? '<hr>' : `<button type="button" role="menuitem" class="${it.danger ? 'danger' : ''}${it.actif ? ' actif' : ''}" data-i="${i}" ${it.inactif ? 'disabled' : ''}>${echapper(it.l)}</button>`).join('');
  section.appendChild(m);
  const r = ancre.getBoundingClientRect(), rs = section.getBoundingClientRect();
  m.style.top = Math.min(rs.height - m.offsetHeight - 8, r.bottom - rs.top + 4) + 'px';
  m.style.left = Math.max(8, Math.min(rs.width - m.offsetWidth - 8, r.right - rs.left - m.offsetWidth)) + 'px';
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items[Number(b.dataset.i)];
    fermerMenu();
    if (it && it.f) it.f();
  });
  menuOuvert = m;
  const premier = m.querySelector('button'); if (premier) premier.focus();
}

function ouvrirMenuEntree(id, ancre) {
  const d = desc();
  const r = DS.trouverEntree(d, id);
  if (!r) return;
  const e = r.entree;
  validerSaisieEnCours();
  const ro = lectureSeule();
  const items = [];
  const objetsSource = (e.source.objet_ids || []).filter((x) => objets().some((o) => o.id === x));
  if (!ro) {
    items.push({ l: e.inclure ? 'Exclure du rendu' : 'Inclure dans le rendu', f: () => { e.inclure = !e.inclure; e.inclure_manuel = true; valider('Descriptif — inclusion'); } });
    items.push({ l: 'Monter', inactif: r.index === 0, f: () => { DS.deplacerEntree(d, id, -1); valider('Descriptif — ordre'); } });
    items.push({ l: 'Descendre', inactif: r.index >= r.section.entrees.length - 1, f: () => { DS.deplacerEntree(d, id, 1); valider('Descriptif — ordre'); } });
    items.push({ l: 'Fusionner avec l’entrée suivante', inactif: r.index >= r.section.entrees.length - 1, f: () => { DS.fusionnerAvecSuivante(d, id); valider('Descriptif — fusion'); } });
    items.push({ l: 'Saut de colonne avant', actif: e.saut_colonne_avant, f: () => { e.saut_colonne_avant = !e.saut_colonne_avant; valider('Descriptif — saut de colonne'); } });
    if (e.style_echantillon) items.push({ l: 'Trait d’échantillon', actif: e.echantillon, f: () => { e.echantillon = !e.echantillon; valider('Descriptif — trait'); } });
    if (e.source.type === 'groupe_troncons') {
      for (const [k, l] of Object.entries(DETAILS)) items.push({ l: 'Détail : ' + l, actif: e.champs.detail === k, f: () => { e.champs.detail = k; valider('Descriptif — détail'); } });
      items.push({ l: 'Inverser le sens des tronçons', actif: e.champs.sens === 'inverse', f: () => { e.champs.sens = e.champs.sens === 'inverse' ? 'auto' : 'inverse'; valider('Descriptif — sens'); } });   // v1.5.3
      items.push({ l: 'Tranchée…', f: () => { const c = section.querySelector(`[data-entree="${id}"] [data-champ="tranchee"]`); if (c) c.focus(); } });
      items.push({ l: 'Fourniture…', f: () => { const c = section.querySelector(`[data-entree="${id}"] [data-champ="fourniture"]`); if (c) c.focus(); else notifier('Pas de fourniture pour cet état', 1800); } });
    }
    if (e.alertes.includes('source_modifiee')) items.push({ l: 'Vu (garder la saisie manuelle)', f: () => { DS.marquerVu(e); valider('Descriptif — vu'); } });
    if (e.source.type !== 'libre') items.push({ l: 'Rétablir l’automatique', f: async () => { if (await confirmer('Les modifications manuelles de cette entrée seront perdues (annulable).', { ok: 'Rétablir', danger: true })) { DS.retablirAutoEntree(e); valider('Descriptif — automatique rétabli'); } } });
    items.push({ sep: true });
  }
  items.push({ l: 'Centrer sur le plan', inactif: !objetsSource.length, f: () => centrerSurPlan(objetsSource) });
  if (!ro) items.push({ l: 'Supprimer l’entrée', danger: true, f: () => { DS.supprimerEntree(d, id); valider('Descriptif — entrée supprimée'); notifier(e.source.type === 'libre' ? 'Entrée supprimée' : 'Entrée supprimée : elle ne sera plus recréée (« Réintégrer » en bas de l’éditeur)', 3000); } });
  afficherMenu(items, ancre);
}

function ouvrirMenuGeneral(ancre) {
  const d = desc();
  const ro = lectureSeule();
  const items = [];
  if (!ro) {
    for (const n of [1, 2, 3]) items.push({ l: n + ' colonne' + (n > 1 ? 's' : ''), actif: d.colonnes === n, f: () => changerColonnes(n) });
    items.push({ sep: true });
    items.push({ l: 'Sortie PDF : sur le plan', actif: d.sortie_pdf !== 'annexe', f: () => { d.sortie_pdf = 'plan'; valider('Descriptif — sortie'); } });
    items.push({ l: 'Sortie PDF : page annexe', actif: d.sortie_pdf === 'annexe', f: () => { d.sortie_pdf = 'annexe'; valider('Descriptif — sortie'); } });
    items.push({ l: d.visible === false ? 'Afficher le bloc' : 'Masquer le bloc', f: () => { d.visible = d.visible === false; valider(d.visible ? 'Descriptif affiché' : 'Descriptif masqué'); } });
    items.push({ sep: true });
    items.push({ l: 'Régénérer entièrement…', danger: true, f: regenerer });
    items.push({ l: 'Supprimer le descriptif…', danger: true, f: supprimer });
  } else items.push({ l: 'Consultation : aucune modification', inactif: true });
  afficherMenu(items, ancre);
}

export function changerColonnes(n) {
  const d = desc();
  if (!d || lectureSeule()) return;
  const K = CHARTE.descriptif;
  const ancienne = Math.max(1, d.colonnes || 1);
  const wc = Math.max(K.largeur_min_colonne, ((d.largeur || DS.largeurParDefaut(ancienne)) - 2 * K.marge - (ancienne - 1) * K.espace_colonnes) / ancienne);
  d.colonnes = n;
  d.largeur = 2 * K.marge + n * wc + (n - 1) * K.espace_colonnes;   // largeur de colonne conservée
  valider('Descriptif — colonnes');
}

export async function regenerer() {
  if (lectureSeule()) { signalerLectureSeule(); return; }
  if (!(await confirmer('Régénérer entièrement le descriptif ? Les modifications manuelles seront perdues (annulable par Ctrl+Z).', { ok: 'Régénérer', danger: true }))) return;
  DS.genererDescriptif(etat.plan, etat.projet, desc());
  valider('Descriptif régénéré');
}

export async function supprimer() {
  if (lectureSeule()) { signalerLectureSeule(); return; }
  if (!(await confirmer('Supprimer le descriptif de ce plan ? Son texte et ses réglages sont retirés (annulable par Ctrl+Z).', { ok: 'Supprimer', danger: true }))) return;
  fermerEditeurDescriptif();
  const m = await import('../outils.js');
  m.supprimerDescriptif();
}

function centrerSurPlan(ids) {
  const o = objets().find((x) => x.id === ids[0]);
  if (!o) return;
  fermerEditeurDescriptif();
  const pts = o.type === 'troncon' ? o.points : (o.type === 'fourreau' ? pointsFourreau(o) : null);
  const p = pts && pts.length ? pts[Math.floor(pts.length / 2)] : { x: o.x || 0, y: o.y || 0 };
  const k = Math.max(vue.k, 2);
  appliquer({ k, tx: vue.largeurEcran / 2 - p.x * k, ty: vue.hauteurEcran / 2 - p.y * k });
  selectionner(ids.filter((id) => objets().some((x) => x.id === id)));
}

/* Ouvre l'éditeur sur une entrée d'un plan quelconque (liste « à compléter », dialogue d'export). */
export async function corrigerEntree(planId, entreeId) {
  if (etat.plan && etat.plan.id !== planId) { const ok = await changerPlanId(planId); if (!ok) return; }
  ouvrirEditeurDescriptif({ entree: entreeId });
}

/* ---------- Dépassement de la page (§2.10) ---------- */

function verifierDepassement() {
  const plan = etat.plan;
  if (!plan || !plan.descriptif || plan.descriptif.visible === false || plan.descriptif.sortie_pdf === 'annexe') { if (plan) depassementSignale.delete(plan.id); return; }
  let dep = false;
  try { dep = depassePage(plan); } catch (e) { return; }
  if (!dep) { depassementSignale.delete(plan.id); return; }
  if (depassementSignale.has(plan.id)) return;
  depassementSignale.add(plan.id);
  const zone = document.getElementById('notifications');
  if (!zone) return;
  const el = document.createElement('div');
  el.className = 'notification annulable';
  const t = document.createElement('span');
  t.textContent = 'Le descriptif dépasse la page (contour rouge).';
  el.append(t);
  if (peutModifier()) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'notification-bouton'; b.textContent = 'Sortie en page annexe';
    b.addEventListener('click', () => { el.remove(); if (etat.plan === plan && plan.descriptif) { plan.descriptif.sortie_pdf = 'annexe'; valider('Descriptif — page annexe'); notifier('Descriptif : page annexe du PDF', 2400); } });
    el.append(b);
  }
  zone.appendChild(el);
  setTimeout(() => { el.classList.add('sortie'); setTimeout(() => el.remove(), 350); }, 7000);
}

/* ---------- Alertes à l'export (§2.7) ---------- */

/* Résout true (exporter) ou false (corriger / annuler). `plans` : plans exportés. `planOuvert` : le projet est ouvert. */
export function confirmerAlertesExport(plans, { planOuvert = true } = {}) {
  const liste = plans.flatMap((p) => DS.alertesDescriptif(p));
  if (!liste.length) return Promise.resolve(true);
  return new Promise((resolve) => {
    const plusieurs = plans.length > 1;
    const d = ouvrirDialogue('dlg-generique', `
      <form method="dialog" class="dialogue alertes-desc">
        <h2>Descriptif : ${liste.length} alerte${liste.length > 1 ? 's' : ''}</h2>
        <ul>${liste.slice(0, 30).map((x) => `<li>${plusieurs ? '<em>' + echapper(x.plan.nom || '') + '</em> — ' : ''}<strong>${echapper(x.titre)}</strong> : ${echapper(x.libelle)}</li>`).join('')}${liste.length > 30 ? `<li>… et ${liste.length - 30} autre(s)</li>` : ''}</ul>
        <div class="boutons">
          <button type="button" class="btn" data-r="corriger">Corriger</button>
          <button type="button" class="btn btn-primaire" data-r="exporter" autofocus>Exporter quand même</button>
        </div>
      </form>`);
    let resolu = false;
    d.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => {
      resolu = true;
      d.close();
      if (b.dataset.r === 'exporter') { resolve(true); return; }
      resolve(false);
      const exp = document.getElementById('dlg-export'); if (exp && exp.open) exp.close();
      if (planOuvert) corrigerEntree(liste[0].plan.id, liste[0].entree.id);
      else notifier('Ouvrez le projet pour corriger le descriptif', 3000);
    }));
    d.addEventListener('close', () => { if (!resolu) resolve(false); }, { once: true });
  });
}
