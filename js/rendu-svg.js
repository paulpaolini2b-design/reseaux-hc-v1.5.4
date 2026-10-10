/* rendu-svg.js — projection des primitives vers le DOM SVG.
 *
 * Un <g> par objet, re-rendu uniquement quand l'objet change (comparaison d'une
 * empreinte JSON). Les poignées de sélection et le curseur sont dessinés dans des
 * groupes en coordonnées écran (non mis à l'échelle), jamais exportés.
 */
import { etat, sur, objets } from './etat.js';
import { CHARTE } from './charte.js';
import { vue, versEcran } from './vue.js';
import { primitivesObjet, pointsFourreau, FORMES_BOITE } from './symboles.js';
import { cleOrdreZ, estObjetDessin } from './modele.js';
import { imageChargee, imageEnErreur, chargerImage } from './images.js';
import { coinsMonde } from './forme-calcul.js';
import { primitivesLegende } from './legende.js';
import { primitivesDescriptifPlan, boiteDescriptif, depassePage } from './descriptif-rendu.js';   // v1.5.0 §2.10
import { surChangementVue, appliquerVisibiliteCalqueFond } from './fond.js';

const NS = 'http://www.w3.org/2000/svg';
let svg, gVue, gObjets, gTemp, gPoignees, gCurseur;
const empreintes = new Map();   // id → { empreinte, g }
let rafDemande = false;

export function initialiserRendu() {
  svg = document.getElementById('plan-svg');
  gVue = document.getElementById('g-vue');
  gObjets = document.getElementById('g-objets');
  gTemp = document.getElementById('g-temporaire');
  gPoignees = document.getElementById('g-poignees');
  gCurseur = document.getElementById('g-curseur');

  sur('vue', () => { appliquerVue(); surChangementVue(); dessinerPoignees(); });
  sur('objets', () => demanderRendu());
  sur('objets-apercu', () => demanderRendu());
  sur('selection', () => { demanderRendu(); });
  sur('calques', () => { appliquerCalques(); appliquerVisibiliteCalqueFond(); demanderRendu(); });
  sur('reglages', () => { empreintes.clear(); gObjets.innerHTML = ''; cleDescriptif = null; demanderRendu(); });
  sur('projet-ouvert', () => { empreintes.clear(); gObjets.innerHTML = ''; cleDescriptif = null; appliquerVue(); appliquerCalques(); demanderRendu(); });
  sur('plan-change', () => { empreintes.clear(); gObjets.innerHTML = ''; cleDescriptif = null; appliquerVue(); appliquerCalques(); demanderRendu(); });   // v1.4.5
  sur('images', () => demanderRendu());   // v1.4.6 : une image libre vient d'être lue en base (l'empreinte change)
}

export function el(nom, attrs = {}) {
  const e = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v);
  return e;
}

function appliquerVue() {
  gVue.setAttribute('transform', `matrix(${vue.k} 0 0 ${vue.k} ${vue.tx} ${vue.ty})`);
  const ind = document.getElementById('indicateur-zoom');
  if (ind) ind.textContent = Math.round(vue.k * 100) + ' %';
}

export function demanderRendu() {
  if (rafDemande) return;
  rafDemande = true;
  requestAnimationFrame(() => { rafDemande = false; rendreTout(); });
}

/* ---------- Primitives → éléments SVG ---------- */
export function primVersSvg(p) {
  switch (p.t) {
    case 'ligne':
      return el('line', {
        x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, stroke: p.couleur || 'none', 'stroke-width': p.epaisseur,
        'stroke-dasharray': p.tirete ? p.tirete.join(' ') : null, 'stroke-linecap': p.bout || 'round'
      });
    case 'poly': {
      if (!p.points.length) return null;
      let d = 'M' + p.points.map((q) => q.x.toFixed(2) + ' ' + q.y.toFixed(2)).join('L');
      if (p.ferme) d += 'Z';
      return el('path', {
        d, fill: p.remplissage || 'none', stroke: p.couleur || 'none', 'stroke-width': p.couleur ? p.epaisseur : 0,
        'stroke-dasharray': p.tirete ? p.tirete.join(' ') : null, 'stroke-linejoin': p.joint || 'round', 'stroke-linecap': 'round'
      });
    }
    case 'cercle':
      return el('circle', { cx: p.cx, cy: p.cy, r: p.r, fill: p.remplissage || 'none', stroke: p.couleur || 'none', 'stroke-width': p.couleur ? p.epaisseur : 0 });
    case 'texte': {
      const t = el('text', {
        x: p.x, y: p.y, 'font-size': p.taille, fill: p.couleur, 'font-family': CHARTE.texte.police,
        'font-weight': p.gras ? 'bold' : null, 'font-style': p.italique ? 'italic' : null,   // v1.4.6 §1
        'text-anchor': p.ancre === 'milieu' ? 'middle' : (p.ancre === 'fin' ? 'end' : 'start'),
        transform: p.rotation ? `rotate(${p.rotation} ${p.x} ${p.y})` : null
      });
      t.textContent = p.texte;
      return t;
    }
    case 'image': {
      // Image libre (v1.4.6 §2). Pas encore lue en base : cadre d'attente (écran seulement), lecture lancée.
      const transform = `translate(${p.cx} ${p.cy})` + (p.rotation ? ` rotate(${p.rotation})` : '');
      const img = imageChargee(p.fond_id);
      let e;
      if (!img) {
        if (!imageEnErreur(p.fond_id)) chargerImage(p.fond_id);
        const A = CHARTE.image.attente;
        e = el('g', { transform });
        e.appendChild(el('rect', { x: -p.largeur / 2, y: -p.hauteur / 2, width: p.largeur, height: p.hauteur, fill: A.fond, stroke: A.contour, 'stroke-width': Math.max(0.3, p.largeur / 300), 'stroke-dasharray': '3 2' }));
        if (imageEnErreur(p.fond_id)) e.appendChild(el('path', { d: `M${-p.largeur / 2} ${-p.hauteur / 2}L${p.largeur / 2} ${p.hauteur / 2}M${-p.largeur / 2} ${p.hauteur / 2}L${p.largeur / 2} ${-p.hauteur / 2}`, stroke: A.contour, 'stroke-width': Math.max(0.3, p.largeur / 300) }));
        if (!p.recadrage) return e;
      } else {
        e = el('image', { href: img.url, x: -p.largeur / 2, y: -p.hauteur / 2, width: p.largeur, height: p.hauteur, preserveAspectRatio: 'none', opacity: p.opacite < 1 ? p.opacite : null, transform });
        if (!p.recadrage) return e;   // image non rognée : élément de la v1.4.6, à l'identique
      }
      return imageDecoupee(e, p, transform);
    }
    default:
      return null;
  }
}

/* Image rognée (v1.4.7 §1) : <clipPath> rectangulaire dans le repère de l'image (même transformation que l'image),
 * identifiant unique par objet ; placé dans le groupe rendu, il est retiré avec l'objet. Pas de viewBox imbriquée. */
function imageDecoupee(e, p, transform) {
  const r = p.recadrage;
  const id = 'rognage-' + String(p.objet_id || p.fond_id || 'image').replace(/[^A-Za-z0-9_-]/g, '_');
  const g = el('g');
  const defs = el('defs');
  const clip = el('clipPath', { id, clipPathUnits: 'userSpaceOnUse', transform });
  clip.appendChild(el('rect', { x: -p.largeur / 2 + r.g * p.largeur, y: -p.hauteur / 2 + r.h * p.hauteur, width: (1 - r.g - r.d) * p.largeur, height: (1 - r.h - r.b) * p.hauteur }));
  defs.appendChild(clip);
  g.appendChild(defs);
  const cadre = el('g', { 'clip-path': `url(#${id})` });
  cadre.appendChild(e);
  g.appendChild(cadre);
  return g;
}

export function ajouterPrims(groupe, prims) {
  for (const p of prims) { const e = primVersSvg(p); if (e) groupe.appendChild(e); }
}

/* ---------- Rendu des objets ---------- */
function ordreZ(o) {
  const i = CHARTE.ordre_z.indexOf(cleOrdreZ(o));   // dessin en surligneur : rang des annotations (v13.3 §4.1 bis)
  return i < 0 ? 99 : i;
}

function rendreTout() {
  if (!etat.plan) return;
  const liste = objets();
  const reglages = etat.projet.reglages;
  const vus = new Set();
  const tries = liste.map((o, i) => ({ o, i })).sort((a, b) => ordreZ(a.o) - ordreZ(b.o) || a.i - b.i);

  for (const { o } of tries) {
    vus.add(o.id);
    const selectionne = etat.selection.has(o.id);
    const empreinte = JSON.stringify(o) + '|' + (selectionne ? 1 : 0) + '|' + (etat.etiquettesVisibles ? 1 : 0) + '|' + etat.modePapier
      + (o.type === 'image' ? '|' + (imageChargee(o.fond_id) ? 1 : 0) + (imageEnErreur(o.fond_id) ? 'e' : '') : '')
      + (etat.rognage && etat.rognage.id === o.id ? '|R' + JSON.stringify(etat.rognage.recadrage) : '');   // v1.4.7 : mode Rognage
    let entree = empreintes.get(o.id);
    if (!entree) {
      const g = el('g', { 'data-id': o.id, class: 'objet' });
      gObjets.appendChild(g);
      entree = { empreinte: null, g };
      empreintes.set(o.id, entree);
    }
    if (entree.empreinte !== empreinte) {
      entree.empreinte = empreinte;
      rendreObjet(entree.g, o, reglages, selectionne);
    }
    // ordre z : on réordonne en déplaçant en fin (opération sans coût si déjà en place)
    if (entree.g !== gObjets.lastElementChild) gObjets.appendChild(entree.g);
    appliquerVisibiliteObjet(entree.g, o);
  }
  for (const [id, entree] of empreintes) if (!vus.has(id)) { entree.g.remove(); empreintes.delete(id); }
  rendreDescriptif();   // v1.5.0 : au-dessus des objets, sous la légende
  rendreLegende();
  dessinerPoignees();
}

function rendreObjet(g, o, reglages, selectionne) {
  g.innerHTML = '';
  g.setAttribute('class', 'objet' + (selectionne ? ' selectionne' : '') + (o.complet === false && o.type !== 'note' ? ' incomplet' : '') + (o.type === 'masque' ? ' masque' : ''));
  // v1.4.7 — mode Rognage (écran seulement) : l'image entière en transparence sous la partie retenue, découpée d'après
  // le recadrage en cours (le modèle n'est écrit qu'à la validation).
  const enRognage = o.type === 'image' && !etat.modePapier && etat.rognage && etat.rognage.id === o.id;
  const r = primitivesObjet(enRognage ? { ...o, recadrage: etat.rognage.recadrage } : o, reglages);
  const gCorps = el('g', { 'data-role': 'corps' });
  if (enRognage) {
    const entiere = primitivesObjet({ ...o, recadrage: null }, reglages).corps
      .map((p) => ({ ...p, opacite: (p.opacite ?? 1) * CHARTE.image.rognage.opacite_image_entiere }));
    const gEntiere = el('g', { class: 'rognage-image-entiere' });
    ajouterPrims(gEntiere, entiere);
    gCorps.appendChild(gEntiere);
  }
  ajouterPrims(gCorps, r.corps);
  g.appendChild(gCorps);
  // Masque du fond : liseré discret à l'écran seulement (jamais exporté) pour repérer les zones masquées
  if (o.type === 'masque' && !etat.modePapier && r.boite && o.rotation && FORMES_BOITE.includes(o.sous_type) && o.points && o.points.length === 4) {
    // v1.4.6 §3 : liseré d'une forme tournée = ses coins réels, pas sa boîte aux axes
    const M = CHARTE.masque.contour_ecran;
    const c = coinsMonde(o.points, o.rotation);
    g.appendChild(el('path', { d: 'M' + c.map((q) => q.x.toFixed(2) + ' ' + q.y.toFixed(2)).join('L') + 'Z', fill: 'none', stroke: M.couleur, 'stroke-width': M.epaisseur, 'stroke-dasharray': M.tirete.join(' '), opacity: selectionne ? 1 : 0.45, class: 'contour-masque' }));
  } else if (o.type === 'masque' && !etat.modePapier && r.boite) {
    const M = CHARTE.masque.contour_ecran;
    g.appendChild(el('rect', { x: r.boite.x, y: r.boite.y, width: r.boite.l, height: r.boite.h, fill: 'none', stroke: M.couleur, 'stroke-width': M.epaisseur, 'stroke-dasharray': M.tirete.join(' '), opacity: selectionne ? 1 : 0.45, class: 'contour-masque' }));
  }
  if (etat.etiquettesVisibles && r.etiquette.length) {
    const gEt = el('g', { 'data-role': 'etiquette' });
    ajouterPrims(gEt, r.etiquette);
    g.appendChild(gEt);
  }
  if (etat.etiquettesVisibles && r.materiel && r.materiel.length) {
    const gMa = el('g', { 'data-role': 'materiel' });
    ajouterPrims(gMa, r.materiel);
    g.appendChild(gMa);
  }
  if (etat.etiquettesVisibles && r.cartouche && r.cartouche.length) {
    const gCa = el('g', { 'data-role': 'cartouche' });
    ajouterPrims(gCa, r.cartouche);
    g.appendChild(gCa);
  }
  // Garde-fou lisibilité (aperçu papier) : liseré d'alerte autour des textes sous le seuil (v11 §2.4)
  if (etat.modePapier && etat.etiquettesVisibles) {
    for (const b of blocsIllisibles(r)) {
      const A = CHARTE.bloc_etiquette.alerte;
      g.appendChild(el('rect', { x: b.x - 0.6, y: b.y - 0.6, width: b.l + 1.2, height: b.h + 1.2, fill: 'none', stroke: A.couleur, 'stroke-width': A.epaisseur, 'stroke-dasharray': A.tirete.join(' '), class: 'alerte-lisibilite' }));
    }
  }
  // Indicateur discret « objet incomplet » (jamais exporté) : petit point orange
  if (!etat.modePapier && o.complet === false && !estObjetDessin(o)) {
    const pts = o.type === 'troncon' ? o.points : (o.type === 'fourreau' ? pointsFourreau(o) : null);
    const p = pts ? (pts[0] || { x: 0, y: 0 }) : (r.centre || { x: o.x, y: o.y });
    const rayon = (r.rayon || 3) + 1.2;
    g.appendChild(el('circle', { cx: p.x + rayon * 0.7, cy: p.y - rayon * 0.7, r: 1.1, fill: '#FF8A00', stroke: '#fff', 'stroke-width': 0.3, class: 'marque-incomplet' }));
  }
}

/* Blocs dont un texte retombe sous le seuil de lisibilité (hauteur papier en mm = taille × 25,4 / 72). */
export function blocsIllisibles(r) {
  const seuil = CHARTE.bloc_etiquette.seuil_lisibilite_mm;
  const res = [];
  for (const [prims, boiteB] of [[r.etiquette, r.boiteEtiquette], [r.materiel, r.boiteMateriel], [r.cartouche, r.boiteCartouche]]) {
    if (!prims || !boiteB) continue;
    if (prims.some((p) => p.t === 'texte' && (p.taille * 25.4) / 72 < seuil)) res.push(boiteB);
  }
  return res;
}

function appliquerVisibiliteObjet(g, o) {
  const calque = etat.projet.calques[o.calque] || etat.projet.calques.existant;
  const domaineVisible = estObjetDessin(o) || etat.projet.filtre_domaines[o.domaine] !== false;
  const visible = calque.visible && domaineVisible;
  g.style.display = visible ? '' : 'none';
  g.style.opacity = calque.opacite !== 1 ? String(calque.opacite) : '';
}

function appliquerCalques() {
  // Re-appliqué par rendreTout ; ici on force le rafraîchissement immédiat.
  for (const [id, entree] of empreintes) {
    const o = objets().find((x) => x.id === id);
    if (o) appliquerVisibiliteObjet(entree.g, o);
  }
}

/* ---------- Descriptif des travaux (v1.5.0 §2.10) ----------
 * Au-dessus des objets, sous la légende. L'aperçu papier le montre tel qu'exporté : absent s'il est masqué ou envoyé
 * en page annexe. À l'écran seulement : bloc destiné à la page annexe encadré en tireté bleu, bloc qui dépasse la page
 * encadré en rouge (jamais exportés). */
let gDescriptif = null, cleDescriptif = null;
function rendreDescriptif() {
  const plan = etat.plan;
  const d = plan && plan.descriptif;
  const cle = d && d.visible !== false ? JSON.stringify(d) + '|' + etat.modePapier + '|' + (plan.fond ? plan.fond.largeur + 'x' + plan.fond.hauteur : '') : null;
  if (gDescriptif && cle === cleDescriptif && gDescriptif.parentNode) { gObjets.appendChild(gDescriptif); return; }
  if (gDescriptif) { gDescriptif.remove(); gDescriptif = null; }
  cleDescriptif = cle;
  if (!cle) return;
  const prims = primitivesDescriptifPlan(plan, etat.projet, { ecran: !etat.modePapier });
  if (!prims.length) return;
  gDescriptif = el('g', { id: 'descriptif', class: 'descriptif' });
  ajouterPrims(gDescriptif, prims);
  const b = boiteDescriptif(plan, { ecran: true });
  const E = CHARTE.descriptif.ecran;
  if (b && !etat.modePapier && d.sortie_pdf === 'annexe') {
    gDescriptif.appendChild(el('rect', { x: b.x - 1, y: b.y - 1, width: b.l + 2, height: b.h + 2, fill: 'none', stroke: E.annexe, 'stroke-width': 1, 'stroke-dasharray': '4 3', class: 'descriptif-annexe' }));
    const t = el('text', { x: b.x, y: b.y - 3, 'font-size': 6, fill: E.annexe, 'font-family': CHARTE.texte.police, class: 'descriptif-annexe' });
    t.textContent = 'Page annexe du PDF';
    gDescriptif.appendChild(t);
  }
  if (b && depassePage(plan)) gDescriptif.appendChild(el('rect', { x: b.x - 1.5, y: b.y - 1.5, width: b.l + 3, height: b.h + 3, fill: 'none', stroke: E.depassement, 'stroke-width': 1.4, class: 'descriptif-depasse' }));
  gObjets.appendChild(gDescriptif);
}

/* ---------- Légende ---------- */
let gLegende = null;
function rendreLegende() {
  if (gLegende) { gLegende.remove(); gLegende = null; }
  const plan = etat.plan;
  if (!plan || !plan.legende || !plan.legende.visible) return;
  const prims = primitivesLegende(plan, objets(), etat.projet.reglages);
  if (!prims.length) return;
  gLegende = el('g', { id: 'legende', class: 'legende' });
  ajouterPrims(gLegende, prims);
  gObjets.appendChild(gLegende);
}

/* ---------- Groupe temporaire (aperçus d'outils) ---------- */
export function viderTemporaire() { gTemp.innerHTML = ''; }
export function dessinerTemporaire(prims) { viderTemporaire(); ajouterPrims(gTemp, prims); }
export function groupeTemporaire() { return gTemp; }

/* ---------- Poignées de sélection (coordonnées écran) ---------- */
/* Les outils fournissent la liste des poignées : [{ id, x, y (plan), forme:'rond'|'carre'|'losange', role }] */
let fournisseurPoignees = null;
export function definirFournisseurPoignees(fn) { fournisseurPoignees = fn; }

export function dessinerPoignees() {
  gPoignees.innerHTML = '';
  if (!fournisseurPoignees || etat.modePapier) return;
  const liste = fournisseurPoignees() || [];
  // Zone tactile : 48 px au doigt, 24 px minimum au stylet (v11 §1.3)
  const R = etat.dernierPointeur === 'pen' ? Math.max(CHARTE.ecran.poignee_stylet_px, 12) : CHARTE.ecran.poignee_px;
  const active = etat.poigneeActive || null;
  const ordonnee = active ? [...liste.filter((p) => p.id !== active), ...liste.filter((p) => p.id === active)] : liste;
  for (const p of ordonnee) {
    const e = versEcran(p);
    if (p.forme === 'contour') {
      // contour de sélection (rectangle plan → écran)
      const a = versEcran({ x: p.x, y: p.y }), b = versEcran({ x: p.x + p.l, y: p.y + p.h });
      gPoignees.appendChild(el('rect', { x: a.x - 4, y: a.y - 4, width: b.x - a.x + 8, height: b.y - a.y + 8, fill: 'none', stroke: CHARTE.ecran.selection, 'stroke-width': 1.2, 'stroke-dasharray': '4 3', class: 'contour-selection' }));
      continue;
    }
    if (p.forme === 'cadre-rognage') {
      // v1.4.7 : partie retenue, cadre tireté sur halo blanc (coins réels, image tournée comprise)
      const C = CHARTE.image.rognage.cadre;
      const d = 'M' + p.points.map((q) => { const e2 = versEcran(q); return e2.x.toFixed(1) + ' ' + e2.y.toFixed(1); }).join('L') + 'Z';
      gPoignees.appendChild(el('path', { d, fill: 'none', stroke: C.halo, 'stroke-width': C.epaisseur_px + 2, opacity: 0.9, class: 'cadre-rognage' }));
      gPoignees.appendChild(el('path', { d, fill: 'none', stroke: C.couleur, 'stroke-width': C.epaisseur_px, 'stroke-dasharray': C.tirete_px.join(' '), class: 'cadre-rognage' }));
      continue;
    }
    if (p.forme === 'lien') {
      const b = versEcran({ x: p.x2, y: p.y2 });
      gPoignees.appendChild(el('line', { x1: e.x, y1: e.y, x2: b.x, y2: b.y, stroke: CHARTE.ecran.selection, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      continue;
    }
    const g = el('g', { class: 'poignee poignee-' + p.role + (p.id === active ? ' active' : ''), 'data-poignee': p.id, transform: `translate(${e.x} ${e.y})` });
    // zone de saisie invisible : jamais sous 24 px de diamètre
    g.appendChild(el('circle', { r: R, fill: 'rgba(0,0,0,0.001)' }));
    if (p.id === active) g.appendChild(el('circle', { r: 13, fill: 'rgba(10,132,255,0.22)', stroke: CHARTE.ecran.selection, 'stroke-width': 1 }));
    if (p.forme === 'rond') g.appendChild(el('circle', { r: 7, fill: '#fff', stroke: CHARTE.ecran.selection, 'stroke-width': 2 }));
    else if (p.forme === 'losange') g.appendChild(el('path', { d: 'M0 -8L8 0L0 8L-8 0Z', fill: '#fff', stroke: CHARTE.ecran.selection, 'stroke-width': 2 }));
    else if (p.forme === 'petit') g.appendChild(el('circle', { r: 4.5, fill: CHARTE.ecran.selection, stroke: '#fff', 'stroke-width': 1.5 }));
    else if (p.forme === 'croix') { g.appendChild(el('circle', { r: 7, fill: '#fff', stroke: CHARTE.ecran.selection, 'stroke-width': 2 })); g.appendChild(el('path', { d: 'M-4 0H4M0 -4V4', stroke: CHARTE.ecran.selection, 'stroke-width': 1.6 })); }
    else if (p.forme === 'tige') { g.appendChild(el('rect', { x: -5, y: -5, width: 10, height: 10, fill: '#fff', stroke: CHARTE.ecran.selection, 'stroke-width': 2, transform: 'rotate(45)' })); }
    else if (p.forme === 'echelle') { g.appendChild(el('rect', { x: -5, y: -5, width: 10, height: 10, fill: CHARTE.ecran.selection, stroke: '#fff', 'stroke-width': 1.5 })); g.appendChild(el('path', { d: 'M-2.5 2.5L2.5 -2.5M0 -2.5H2.5V0', fill: 'none', stroke: '#fff', 'stroke-width': 1.2 })); }
    else if (p.forme === 'glissant') { g.appendChild(el('circle', { r: 6.5, fill: CHARTE.ecran.accrochage, stroke: '#fff', 'stroke-width': 2 })); }
    else if (p.forme === 'coin-rognage') {
      // équerre dont les branches longent les deux côtés du coin ; `angle` = rotation de l'image, `coin` = hg|hd|bd|bg
      const sx = p.coin.includes('g') ? 1 : -1, sy = p.coin.includes('h') ? 1 : -1;
      const tr = `rotate(${p.angle || 0})`;
      const d = `M${sx * 12} 0H0V${sy * 12}`;
      g.appendChild(el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 7, 'stroke-linecap': 'square', transform: tr }));
      g.appendChild(el('path', { d, fill: 'none', stroke: CHARTE.ecran.selection, 'stroke-width': 4, 'stroke-linecap': 'square', transform: tr }));
    }
    else if (p.forme === 'barre-rognage') {
      // barre posée sur le milieu du côté, dans son axe
      g.appendChild(el('rect', { x: -11, y: -3.5, width: 22, height: 7, rx: 3.5, fill: CHARTE.ecran.selection, stroke: '#fff', 'stroke-width': 1.8, transform: `rotate(${p.angle || 0})` }));
    }
    else if (p.forme === 'x') { g.appendChild(el('circle', { r: 7, fill: '#fff', stroke: '#B00020', 'stroke-width': 1.8 })); g.appendChild(el('path', { d: 'M-3.5 -3.5L3.5 3.5M-3.5 3.5L3.5 -3.5', stroke: '#B00020', 'stroke-width': 1.8, 'stroke-linecap': 'round' })); }
    else g.appendChild(el('rect', { x: -6, y: -6, width: 12, height: 12, fill: '#fff', stroke: CHARTE.ecran.selection, 'stroke-width': 2 }));
    if (p.role === 'rotation' || p.role === 'rot-bloc') {
      g.appendChild(el('path', { d: 'M-3.5 -1.5a4 4 0 1 1 1 4.2', fill: 'none', stroke: CHARTE.ecran.selection, 'stroke-width': 1.5 }));
    }
    gPoignees.appendChild(g);
  }
}

/* ---------- Curseur de précision (stylet en survol) ---------- */
export function afficherCurseur(x, y, visible) {
  gCurseur.innerHTML = '';
  if (!visible) return;
  gCurseur.appendChild(el('line', { x1: x - 14, y1: y, x2: x - 4, y2: y, stroke: CHARTE.ecran.survol, 'stroke-width': 1.5 }));
  gCurseur.appendChild(el('line', { x1: x + 4, y1: y, x2: x + 14, y2: y, stroke: CHARTE.ecran.survol, 'stroke-width': 1.5 }));
  gCurseur.appendChild(el('line', { x1: x, y1: y - 14, x2: x, y2: y - 4, stroke: CHARTE.ecran.survol, 'stroke-width': 1.5 }));
  gCurseur.appendChild(el('line', { x1: x, y1: y + 4, x2: x, y2: y + 14, stroke: CHARTE.ecran.survol, 'stroke-width': 1.5 }));
  gCurseur.appendChild(el('circle', { cx: x, cy: y, r: 1.5, fill: CHARTE.ecran.survol }));
}

let idSurvol = null;
export function surligner(id) {
  if (idSurvol === id) return;
  if (idSurvol) { const e = empreintes.get(idSurvol); if (e) e.g.classList.remove('survol'); }
  idSurvol = id;
  if (id) { const e = empreintes.get(id); if (e) e.g.classList.add('survol'); }
}

/* Sérialisation du groupe des objets (export PNG). */
export function svgObjetsSerialise() {
  return gObjets;
}
