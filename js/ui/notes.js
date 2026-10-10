/* ui/notes.js — éditeur de note de terrain : texte, couleur, taille, cadre, fond,
 * flèche de rappel. Le clavier physique est utilisable immédiatement (focus).
 *
 * v1.4.6 §1 : gras, italique et souligné À LA SÉLECTION (boutons G / I / S, Ctrl+B / Ctrl+I / Ctrl+U), alignement de
 * la note (gauche, centré, droite, justifié). Le <textarea> devient une zone `contenteditable` ; la mise en forme passe
 * par document.execCommand (toujours pris en charge par Chrome Android, aucune bibliothèque). À la validation, le
 * contenu est relu par une liste blanche stricte (b/strong, i/em, u, br, div/p ; tout le reste = texte brut) et rangé
 * dans `segments` [[{ t, g, i, s }]] ; `texte` est régénéré depuis les segments et reste la source pour la recherche,
 * la légende et la compatibilité. Une note sans aucune mise en forme n'a pas de `segments` : elle est enregistrée et
 * rendue exactement comme avant. Le collage est forcé en texte brut.
 * v1.4.6 §4 : départ de la flèche — milieu du bord gauche (historique) ou coin du cadre situé du côté de la pointe
 * (étiquette fléchée).
 */
import { etat, objetParId, notifier, selectionner } from '../etat.js';
import { CHARTE, MM } from '../charte.js';
import { valider } from '../historique.js';
import { cloner, genererId, attribuerRepere } from '../modele.js';
import { segmentsNote, pointeEtiquetteParDefaut } from '../symboles.js';
import { normaliserSegments, texteDesSegments, segmentsMisEnForme } from '../forme-calcul.js';
import { echapper } from './dialogues.js';
import { declencheurCouleur, brancherDeclencheurs } from './selecteur-couleur.js';

/* v1.4.4 §2 : taille en mm, une décimale, virgule française — même convention que l'angle des supports
 * (modele.js → formaterAngle / analyserAngle). `taille` reste stocké en unités de plan (comme aujourd'hui). */
function mmDepuisPlan(v) { return (Math.round((v / MM) * 10) / 10).toString().replace('.', ','); }
function planDepuisMm(mm) { return Math.round(mm * MM * 100) / 100; }
function analyserTailleMm(texte, K) {
  const t = String(texte ?? '').trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  if (!isFinite(v) || v <= 0 || planDepuisMm(v) < K.taille_min || planDepuisMm(v) > K.taille_max) return NaN;
  return v;
}

const ALIGNEMENTS = [
  ['gauche', 'Aligner à gauche', 'M3 5h18M3 10h12M3 15h18M3 20h12'],
  ['centre', 'Centrer', 'M3 5h18M6 10h12M3 15h18M6 20h12'],
  ['droite', 'Aligner à droite', 'M3 5h18M9 10h12M3 15h18M9 20h12'],
  ['justifie', 'Justifier', 'M3 5h18M3 10h18M3 15h18M3 20h12']
];
const STYLES = [['bold', 'g', 'G', 'Gras (Ctrl+B)'], ['italic', 'i', 'I', 'Italique (Ctrl+I)'], ['underline', 's', 'S', 'Souligné (Ctrl+U)']];

/* ---------- Segments ↔ HTML de l'éditeur ---------- */
function htmlDepuisLignes(lignes) {
  return lignes.map((l) => {
    const contenu = (l || []).map((sg) => {
      let h = echapper(sg.t || '');
      if (sg.s) h = '<u>' + h + '</u>';
      if (sg.i) h = '<i>' + h + '</i>';
      if (sg.g) h = '<b>' + h + '</b>';
      return h;
    }).join('');
    return '<div>' + (contenu || '<br>') + '</div>';
  }).join('');
}

function lignesDeLaNote(n) {
  const seg = segmentsNote(n);
  if (seg) return seg;
  return String(n.texte || '').split('\n').map((t) => (t ? [{ t }] : []));
}

/* Style porté par un élément (balises, ou style en ligne que Chrome peut produire). */
function styleElement(el, st) {
  const tag = el.tagName;
  const r = { ...st };
  if (tag === 'B' || tag === 'STRONG') r.g = true;
  if (tag === 'I' || tag === 'EM') r.i = true;
  if (tag === 'U') r.s = true;
  const css = el.style;
  if (css) {
    const fw = css.fontWeight;
    if (fw === 'bold' || fw === 'bolder' || Number(fw) >= 600) r.g = true;
    else if (fw === 'normal' || (fw && Number(fw) < 600)) r.g = false;
    if (css.fontStyle === 'italic' || css.fontStyle === 'oblique') r.i = true;
    else if (css.fontStyle === 'normal') r.i = false;
    const td = (css.textDecorationLine || css.textDecoration || '');
    if (/underline/.test(td)) r.s = true;
  }
  return r;
}

/* Contenu de l'éditeur → lignes de segments. Une balise de bloc (div, p) commence une ligne si la ligne courante n'est
 * pas vide ou si un bloc la précède ; un <br> dernier enfant d'un bloc ne crée pas de ligne supplémentaire. */
export function lireEditeur(racine) {
  const lignes = [[]];
  let apresBloc = false;
  const courante = () => lignes[lignes.length - 1];
  const nouvelle = () => { lignes.push([]); apresBloc = false; };
  const pousser = (t, st) => {
    if (!t) return;
    if (apresBloc) nouvelle();
    const l = courante(), der = l[l.length - 1];
    if (der && !!der.g === !!st.g && !!der.i === !!st.i && !!der.s === !!st.s) der.t += t;
    else l.push({ t, g: !!st.g, i: !!st.i, s: !!st.s });
  };
  const parcourir = (n, st) => {
    if (n.nodeType === 3) {
      const parts = n.nodeValue.replace(/\u00A0/g, ' ').replace(/\r/g, '').split('\n');
      parts.forEach((p, i) => { if (i > 0) nouvelle(); pousser(p, st); });
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === 'BR') {
      const parent = n.parentNode;
      const dernier = parent && parent.lastChild === n && (parent === racine || parent.tagName === 'DIV' || parent.tagName === 'P');
      if (apresBloc) { nouvelle(); return; }
      if (!dernier) nouvelle();
      return;
    }
    const bloc = tag === 'DIV' || tag === 'P';
    if (bloc && (courante().length || apresBloc)) nouvelle();
    const st2 = styleElement(n, st);
    for (const c of n.childNodes) parcourir(c, st2);
    if (bloc) apresBloc = true;
  };
  for (const c of racine.childNodes) parcourir(c, {});
  return lignes;
}

/* Retire les espaces et lignes vides de fin (comme le trimEnd du texte avant la v1.4.6). */
function rognerFin(lignes) {
  const l = normaliserSegments(lignes);
  const derniere = l[l.length - 1];
  while (derniere.length) {
    const sg = derniere[derniere.length - 1];
    sg.t = sg.t.replace(/\s+$/, '');
    if (sg.t) break;
    derniere.pop();
  }
  return normaliserSegments(l);
}

export function ouvrirEditeurNote(id, { nouvelle = false } = {}) {
  const n = objetParId(id);
  if (!n) return;
  const d = document.getElementById('dlg-note');
  const K = CHARTE.notes;
  const tailleInitiale = Number(n.taille) || K.taille_defaut;
  const libre = !K.tailles.includes(tailleInitiale);
  const etiquette = !!n.etiquette_flechee;
  const flecheCochee = !!n.fleche || (nouvelle && etiquette);
  let alignement = n.alignement || 'gauche';
  d.innerHTML = `
    <form method="dialog" class="dialogue note">
      <h2>${nouvelle ? (etiquette ? 'Nouvelle étiquette fléchée' : 'Nouvelle note') : 'Note ' + echapper(n.repere)}</h2>
      <div class="barre-format" role="toolbar" aria-label="Mise en forme">
        ${STYLES.map(([cmd, , lettre, titre]) => `<button type="button" class="btn-format fmt-${cmd}" data-cmd="${cmd}" title="${titre}" aria-pressed="false">${lettre}</button>`).join('')}
        <span class="sep-format"></span>
        ${ALIGNEMENTS.map(([k, titre, d2]) => `<button type="button" class="btn-format" data-align="${k}" title="${titre}" aria-pressed="${alignement === k}"><svg viewBox="0 0 24 24" width="20" height="20"><path d="${d2}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`).join('')}
      </div>
      <div class="editeur-note" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-placeholder="Texte de la note (Entrée = nouvelle ligne)" style="text-align:${alignement === 'justifie' ? 'justify' : (alignement === 'centre' ? 'center' : (alignement === 'droite' ? 'right' : 'left'))}">${n.texte ? htmlDepuisLignes(lignesDeLaNote(n)) : ''}</div>
      <label class="ligne-couleur">Couleur ${declencheurCouleur('couleur_note', n.couleur, { titre: 'Couleur de la note' })}</label>
      <div class="ligne2">
        <label>Taille<select name="taille">${K.tailles.map((t) => `<option value="${t}" ${!libre && tailleInitiale === t ? 'selected' : ''}>${t}</option>`).join('')}${libre ? `<option value="${tailleInitiale}" data-libre selected>Personnalisé (${mmDepuisPlan(tailleInitiale)} mm)</option>` : ''}</select></label>
        <label>Taille (mm)<input name="taille_mm" value="${mmDepuisPlan(tailleInitiale)}" inputmode="decimal" placeholder="Ex. 2,8" autocomplete="off"></label>
        <label>Rotation (°)<input type="number" name="rotation" value="${Math.round(n.rotation || 0)}" step="15"></label>
      </div>
      <div class="ligne2">
        <label>Cadre<select name="cadre">${[['aucun', 'Aucun'], ['rectangle', 'Rectangle'], ['arrondi', 'Angles arrondis']].map(([k, l]) => `<option value="${k}" ${(n.cadre === true ? 'rectangle' : (n.cadre || 'aucun')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Fond<select name="fond">${[['aucun', 'Transparent'], ['translucide', 'Blanc translucide'], ['blanc', 'Blanc opaque']].map(([k, l]) => `<option value="${k}" ${(n.fond === true ? 'translucide' : (n.fond === false ? 'aucun' : (n.fond || 'translucide'))) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <label>Échelle (× ${CHARTE.echelle_symbole.min}–${CHARTE.echelle_symbole.max}, aussi par la poignée carrée fléchée)<input type="number" name="echelle_symbole" value="${n.echelle_symbole || 1}" step="0.1" min="${CHARTE.echelle_symbole.min}" max="${CHARTE.echelle_symbole.max}"></label>
      <label class="case"><input type="checkbox" name="fleche" ${flecheCochee ? 'checked' : ''}> Flèche de rappel (déplacez ensuite sa pointe avec la poignée)</label>
      <label class="depart-fleche" ${flecheCochee ? '' : 'hidden'}>Départ de la flèche<select name="fleche_depart">${[['bord', 'Milieu du bord gauche'], ['coin', 'Coin du cadre, du côté de la pointe']].map(([k, l]) => `<option value="${k}" ${(n.fleche_depart || 'bord') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="boutons">
        <button type="button" class="btn btn-danger" data-r="supprimer">Supprimer</button>
        <button type="button" class="btn" data-r="dupliquer" ${nouvelle ? 'hidden' : ''}>Dupliquer</button>
        <button type="submit" class="btn btn-primaire">Valider</button>
      </div>
    </form>`;
  const form = d.querySelector('form');
  const editeur = d.querySelector('.editeur-note');
  const texteEditeur = () => texteDesSegments(lireEditeur(editeur));
  // Couleur : sélecteur unique de l'application (v13.4 §1) — même palette que le reste, « Personnalisé » compris
  brancherDeclencheurs(d);
  const champCouleur = d.querySelector('[name="couleur_note"]');
  let couleur = n.couleur;
  champCouleur.addEventListener('change', () => { couleur = champCouleur.value; });

  // Taille : menu déroulant et champ mm synchronisés dans les deux sens (v1.4.4 §2). `taille` (unités de plan)
  // reste la seule source de vérité, comme n.taille aujourd'hui ; aucune entrée d'origine du menu n'est retirée.
  let taille = tailleInitiale;
  const champTaille = form.elements.taille;
  const champTailleMm = form.elements.taille_mm;
  champTaille.addEventListener('change', () => {
    taille = Number(champTaille.value);
    champTailleMm.value = mmDepuisPlan(taille);
  });
  champTailleMm.addEventListener('change', () => {
    const mm = analyserTailleMm(champTailleMm.value, K);
    if (mm === null) { champTailleMm.value = mmDepuisPlan(taille); return; }
    if (Number.isNaN(mm)) {
      notifier('Taille refusée : entre ' + mmDepuisPlan(K.taille_min) + ' et ' + mmDepuisPlan(K.taille_max) + ' mm', 3200);
      champTailleMm.value = mmDepuisPlan(taille);
      return;
    }
    taille = planDepuisMm(mm);
    champTailleMm.value = mmDepuisPlan(taille);   // ré-arrondi affiché (1 décimale)
    const palier = K.tailles.find((t) => t === taille);
    let optLibre = champTaille.querySelector('option[data-libre]');
    if (palier !== undefined) { if (optLibre) optLibre.remove(); champTaille.value = String(palier); return; }
    if (!optLibre) { optLibre = document.createElement('option'); optLibre.dataset.libre = ''; champTaille.appendChild(optLibre); }
    optLibre.value = String(taille);
    optLibre.textContent = 'Personnalisé (' + mmDepuisPlan(taille) + ' mm)';
    champTaille.value = String(taille);
  });

  form.elements.fleche.addEventListener('change', () => { d.querySelector('.depart-fleche').hidden = !form.elements.fleche.checked; });

  // ---------- Mise en forme (v1.4.6 §1) ----------
  try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* balises <b>/<i>/<u> par défaut */ }
  const boutonsStyle = [...d.querySelectorAll('[data-cmd]')];
  const majEtatsStyle = () => {
    if (!editeur.contains(document.getSelection() && document.getSelection().anchorNode)) return;
    for (const b of boutonsStyle) {
      let actif = false;
      try { actif = document.queryCommandState(b.dataset.cmd); } catch (e) { /* ignore */ }
      b.setAttribute('aria-pressed', String(!!actif));
    }
  };
  for (const b of d.querySelectorAll('.btn-format')) b.addEventListener('pointerdown', (e) => e.preventDefault());   // garde la sélection
  for (const b of boutonsStyle) b.addEventListener('click', () => {
    editeur.focus();
    document.execCommand(b.dataset.cmd, false, null);
    majEtatsStyle();
  });
  for (const b of d.querySelectorAll('[data-align]')) b.addEventListener('click', () => {
    alignement = b.dataset.align;
    d.querySelectorAll('[data-align]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    editeur.style.textAlign = { gauche: 'left', centre: 'center', droite: 'right', justifie: 'justify' }[alignement];
    editeur.focus();
  });
  const surSelection = () => majEtatsStyle();
  document.addEventListener('selectionchange', surSelection);
  editeur.addEventListener('keyup', majEtatsStyle);
  // Collage : texte brut uniquement (aucune mise en forme étrangère, aucune image)
  editeur.addEventListener('paste', (e) => {
    e.preventDefault();
    const t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    document.execCommand('insertText', false, t);
  });
  editeur.addEventListener('drop', (e) => e.preventDefault());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const lignes = rognerFin(lireEditeur(editeur));
    const texte = texteDesSegments(lignes);
    if (!texte.trim()) { supprimer(n); d.close(); if (nouvelle) notifier('Note vide : non conservée'); return; }
    n.texte = texte;
    if (segmentsMisEnForme(lignes)) n.segments = lignes;
    else delete n.segments;   // aucune mise en forme : note enregistrée exactement comme avant la v1.4.6
    n.alignement = alignement;
    n.couleur = couleur;
    n.taille = taille;
    n.rotation = Number(form.elements.rotation.value) || 0;
    n.cadre = form.elements.cadre.value;
    n.fond = form.elements.fond.value;
    n.echelle_symbole = Math.min(CHARTE.echelle_symbole.max, Math.max(CHARTE.echelle_symbole.min, Number(form.elements.echelle_symbole.value) || 1));
    n.fleche_depart = form.elements.fleche_depart.value;
    if (form.elements.fleche.checked && !n.fleche) n.fleche = n.fleche_depart === 'coin' ? pointeEtiquetteParDefaut(n) : { x: n.x - 12, y: n.y - 12 };
    if (!form.elements.fleche.checked) n.fleche = null;
    delete n.etiquette_flechee;
    valider(etiquette && nouvelle ? 'Étiquette fléchée' : 'Note');
    d.close();
  });
  d.querySelector('[data-r="supprimer"]').addEventListener('click', () => { supprimer(n); d.close(); });
  d.querySelector('[data-r="dupliquer"]').addEventListener('click', () => {
    const c = cloner(n); c.id = genererId(); c.repere = ''; c.repere_manuel = false; attribuerRepere(etat.projet, c); c.x += 12; c.y += 12;
    if (c.fleche) c.fleche = null;
    etat.plan.objets.push(c); valider('Note dupliquée'); selectionner([c.id]); d.close();
  });
  d.addEventListener('close', () => {
    document.removeEventListener('selectionchange', surSelection);
    if (nouvelle && !texteEditeur().trim() && objetParId(n.id)) supprimer(n);
  }, { once: true });
  // Ctrl+Entrée valide, Échap ferme (comportement natif du <dialog>)
  editeur.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); } });
  d.showModal();
  setTimeout(() => {
    editeur.focus();
    const sel = document.getSelection();
    const r = document.createRange();
    r.selectNodeContents(editeur);
    r.collapse(false);
    sel.removeAllRanges(); sel.addRange(r);
    majEtatsStyle();
  }, 30);
}

function supprimer(n) {
  etat.plan.objets = etat.plan.objets.filter((o) => o.id !== n.id);
  etat.selection.delete(n.id);
  valider('Note supprimée');
}
