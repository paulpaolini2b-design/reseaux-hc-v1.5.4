/* descriptif-rendu.js — mise en page du descriptif des travaux (v1.5.0 §2.10, §2.11) : lignes mises en forme avec
 * retour à la ligne automatique (mot trop long coupé), repère en retrait suspendu, puces et niveaux, échantillon de trait
 * (même fonction que la légende), colonnes égales remplies dans l'ordre et coupées entre entrées (sauts forcés
 * respectés), bloc sur le plan (position, largeur, échelle, cadre, fond) et pages annexes du PDF.
 *
 * Tout est décrit en primitives (primitives.js) : l'écran (rendu-svg.js), le PDF (export-pdf.js) et le PNG
 * (export-png.js) projettent la même géométrie. Unités : unités plan (points PDF) ; mise en page en local (échelle 1),
 * puis mise à l'échelle `echelle` et placement. */
import { CHARTE, MM } from './charte.js';
import { texte, ligne, rect, transformer, mesurerTexte } from './primitives.js';
import { rectArrondi } from './symboles.js';
import { echantillonTroncon } from './legende.js';
import { etenduePlan } from './vue.js';
import { appliquerFormat, texteLigne, largeurParDefaut } from './descriptif.js';

const D = () => CHARTE.descriptif;

/* Échelle bornée : jamais de texte sous la taille minimale de la charte (1,8 mm, H-116). */
export function echelleDescriptif(d) {
  const K = D();
  const min = (K.taille_min_mm * MM) / K.corps.taille;
  return Math.min(K.echelle_max, Math.max(min, Number(d && d.echelle) || K.echelle_defaut));
}

export function largeurColonneLocale(d) {
  const K = D();
  const n = Math.max(1, Math.min(3, Number(d.colonnes) || 1));
  const larg = Number(d.largeur) || largeurParDefaut(n);
  return Math.max(K.largeur_min_colonne, (larg - 2 * K.marge - (n - 1) * K.espace_colonnes) / n);
}

/* ---------- Texte riche avec retour à la ligne ---------- */

/* Morceaux (mots et espaces) d'une sous-ligne de segments, mesurés à la taille donnée. */
function morceaux(segs, taille, forceGras) {
  const res = [];
  for (const s of segs || []) {
    for (const p of String(s.t || '').split(/( +)/)) {
      if (!p) continue;
      const st = { g: !!(s.g || forceGras), i: !!s.i, s: !!s.s, c: s.c || null };
      res.push({ t: p, ...st, espace: /^ +$/.test(p), l: mesurerTexte(p, taille, { gras: st.g, italique: st.i }) });
    }
  }
  return res;
}

/* Coupe un mot trop long caractère par caractère. */
function couperMot(m, largeur, taille) {
  const parts = [];
  let cur = '';
  for (const ch of m.t) {
    const essai = cur + ch;
    if (cur && mesurerTexte(essai, taille, { gras: m.g, italique: m.i }) > largeur) { parts.push(cur); cur = ch; }
    else cur = essai;
  }
  if (cur) parts.push(cur);
  return parts.map((t) => ({ ...m, t, l: mesurerTexte(t, taille, { gras: m.g, italique: m.i }) }));
}

/* Rangées d'une sous-ligne pour une largeur disponible. Retourne [{ morceaux, largeur }]. */
function rangees(ms, largeur, taille) {
  const lignes = [];
  let cur = [], l = 0;
  const pousser = () => {
    while (cur.length && cur[cur.length - 1].espace) { l -= cur[cur.length - 1].l; cur.pop(); }
    lignes.push({ morceaux: cur, largeur: Math.max(0, l) });
    cur = []; l = 0;
  };
  for (const m0 of ms) {
    const liste = !m0.espace && m0.l > largeur ? couperMot(m0, largeur, taille) : [m0];
    for (const m of liste) {
      if (m.espace && !cur.length) continue;   // pas d'espace en début de rangée
      if (!m.espace && cur.length && l + m.l > largeur + 1e-6) pousser();
      cur.push(m); l += m.l;
    }
  }
  if (cur.length || !lignes.length) pousser();
  return lignes;
}

/* Taille d'une ligne selon son rôle. */
function tailleDe(l, defaut) {
  const K = D();
  return l && l.role === 'titre' ? K.titre.taille : defaut;
}

/* Primitives d'une ligne mise en forme dans une boîte [x, x + largeur], à partir de y (haut). Retourne { prims, hauteur, rangees }.
 * `premier` : { texte, taille, couleur } posé à gauche sur la première rangée (repère) avec retrait suspendu `retrait`. */
function rendreLigne(l, x, y, largeur, { taille, forceGras = false, premier = null, retrait = 0 }) {
  const K = D();
  const prims = [];
  const pre = l.puce ? l.puce + ' ' : '';
  const lPuce = pre ? mesurerTexte(pre, taille) : 0;
  const xTexte = x + retrait + (l.niveau || 0) * K.retrait_niveau + lPuce;
  const dispo = Math.max(taille * 2, x + largeur - xTexte);
  const sousLignes = (l.segments && l.segments.length ? l.segments : [[]]);
  let yy = y;
  let nRangees = 0;
  const zones = [];
  sousLignes.forEach((segs, iSL) => {
    const rs = rangees(morceaux(segs, taille, forceGras), dispo, taille);
    rs.forEach((r, i) => {
      const hRang = Math.max(taille, premier && nRangees === 0 ? premier.taille : 0) * K.interligne;
      const base = yy + hRang * 0.78;
      if (premier && nRangees === 0) prims.push(texte(x, base, premier.texte, { taille: premier.taille, couleur: premier.couleur, gras: true }));
      if (pre && iSL === 0 && i === 0) prims.push(texte(xTexte - lPuce, base, l.puce, { taille, couleur: '#000000' }));
      let dx = 0, extra = 0;
      const nbEsp = r.morceaux.filter((m) => m.espace).length;
      if (l.alignement === 'centre') dx = (dispo - r.largeur) / 2;
      else if (l.alignement === 'droite') dx = dispo - r.largeur;
      else if (l.alignement === 'justifie' && i < rs.length - 1 && nbEsp) extra = (dispo - r.largeur) / nbEsp;
      let xx = xTexte + Math.max(0, dx);
      for (const m of r.morceaux) {
        const lm = m.l + (m.espace ? extra : 0);
        const coul = m.c || '#000000';
        if (!m.espace) prims.push(texte(xx, base, m.t, { taille, couleur: coul, gras: m.g || undefined, italique: m.i || undefined }));
        if (m.s && lm > 0) prims.push(ligne(xx, base + taille * 0.14, xx + lm, base + taille * 0.14, coul, Math.max(0.15, taille * 0.07), { bout: 'butt' }));
        xx += lm;
      }
      zones.push({ x, y: yy, l: largeur, h: hRang });
      yy += hRang;
      nRangees++;
    });
  });
  return { prims, hauteur: yy - y, zones };
}

/* Ligne à rendre ? (supprimées et coordonnées GPS vides : éditeur seulement) */
function ligneVisible(l) {
  if (!l || l.supprimee) return false;
  if (l.cle_auto === 'entete.gps' && !texteLigne(l).trim()) return false;
  return true;
}

/* ---------- Éléments (en-tête, entrées) ---------- */

function elementEntete(d, W) {
  const K = D();
  const lignes = d.entete.lignes.filter(ligneVisible);
  if (!lignes.length) return null;
  return {
    saut: false,
    rendre(x, y) {
      const prims = [], zones = [];
      let yy = y;
      for (const l of lignes) {
        const r = rendreLigne(l, x, yy, W, { taille: tailleDe(l, K.corps.taille), forceGras: l.cle_auto && l.cle_auto.startsWith('entete.') });
        prims.push(...r.prims); zones.push(...r.zones.map((z) => ({ ...z, cible: { zone: 'entete', ligne: l.id } })));
        yy += r.hauteur;
      }
      return { prims, zones, hauteur: yy - y };
    }
  };
}

function elementEntree(e, section, W, avecTitre) {
  const K = D();
  const lignes = e.lignes.filter(ligneVisible);
  const repere = (e.repere || []).map((s) => s.t || '').join('').trim();
  return {
    saut: !!e.saut_colonne_avant,
    entree: e,
    rendre(x, y) {
      const prims = [], zones = [];
      let yy = y;
      if (avecTitre) {
        const lt = { segments: [section.titre], alignement: 'centre', niveau: 0, puce: '' };
        const r = rendreLigne(lt, x, yy, W, { taille: K.titre.taille, forceGras: true });
        prims.push(...r.prims); zones.push(...r.zones.map((z) => ({ ...z, cible: { zone: 'titre', section: section.id } })));
        yy += r.hauteur + K.espace_entrees / 2;
      }
      const yEntree = yy;
      let x0 = x;
      const ech = e.echantillon && e.style_echantillon;
      const Lech = CHARTE.legende.longueur_echantillon;
      if (ech) x0 = x + Lech + K.ecart_echantillon;
      const lR = repere ? mesurerTexte(repere + ' ', K.repere.taille, { gras: true }) : 0;
      const couleurRepere = (e.repere && e.repere[0] && e.repere[0].c) || K.repere.couleur;
      lignes.forEach((l, i) => {
        const premier = i === 0 && repere ? { texte: repere, taille: K.repere.taille, couleur: couleurRepere } : null;
        const r = rendreLigne(l, x0, yy, x + W - x0, { taille: tailleDe(l, K.corps.taille), premier, retrait: lR });
        prims.push(...r.prims); zones.push(...r.zones.map((z) => ({ ...z, x, l: W, cible: { zone: 'entree', entree: e.id, ligne: l.id } })));
        yy += r.hauteur;
      });
      if (!lignes.length && repere) {
        prims.push(texte(x0, yy + K.repere.taille * K.interligne * 0.78, repere, { taille: K.repere.taille, couleur: couleurRepere, gras: true }));
        yy += K.repere.taille * K.interligne;
      }
      if (ech) {
        const ym = yEntree + K.corps.taille * K.interligne * 0.45;
        prims.unshift(...echantillonTroncon(ech.domaine, ech.pose, ech.etat, x, x + Lech, ym));
      }
      return { prims, zones, hauteur: yy - y };
    }
  };
}

function elements(d, W) {
  const res = [];
  const ent = elementEntete(d, W);
  if (ent) res.push(ent);
  for (const s of d.sections) {
    const visibles = s.entrees.filter((e) => e.inclure !== false);
    const titre = s.titre && s.titre.some((x) => String(x.t || '').trim());
    visibles.forEach((e, i) => res.push(elementEntree(e, s, W, titre && i === 0)));
  }
  // hauteurs mesurées une fois
  for (const el of res) { const r = el.rendre(0, 0); el.hauteur = r.hauteur; }
  return res;
}

/* Répartition en colonnes. `hMax` null : colonnes équilibrées (hauteur minimale tenant en `n` colonnes, sauts forcés
 * au plus n − 1). `hMax` donné (annexe) : colonnes de hauteur hMax, autant que nécessaire. */
function repartir(els, n, hMax = null) {
  const K = D();
  const gap = K.espace_entrees;
  const glouton = (H, sautsMax) => {
    const cols = [[]];
    let h = 0, sauts = 0;
    for (const el of els) {
      const col = cols[cols.length - 1];
      const force = el.saut && col.length && sauts < sautsMax;
      if (col.length && (force || h + gap + el.hauteur > H + 1e-6)) { if (force) sauts++; cols.push([el]); h = el.hauteur; }
      else { h += (col.length ? gap : 0) + el.hauteur; col.push(el); }
    }
    return cols;
  };
  if (!els.length) return [[]];
  if (hMax !== null) return glouton(hMax, Infinity);
  const sautsMax = n - 1;
  let bas = Math.max(...els.map((e) => e.hauteur)), haut = els.reduce((s, e) => s + e.hauteur + gap, 0);
  if (glouton(bas, sautsMax).length <= n) return glouton(bas, sautsMax);
  for (let k = 0; k < 40; k++) {
    const mid = (bas + haut) / 2;
    if (glouton(mid, sautsMax).length <= n) haut = mid; else bas = mid;
  }
  return glouton(haut, sautsMax);
}

function rendreColonnes(cols, x0, y0, Wc, esp) {
  const K = D();
  const prims = [], zones = [];
  let hMax = 0;
  cols.forEach((col, i) => {
    const x = x0 + i * (Wc + esp);
    let y = y0;
    col.forEach((el, j) => {
      if (j) y += K.espace_entrees;
      const r = el.rendre(x, y);
      prims.push(...r.prims); zones.push(...r.zones);
      y += r.hauteur;
    });
    hMax = Math.max(hMax, y - y0);
  });
  return { prims, zones, hauteur: hMax };
}

/* ---------- Bloc sur le plan ---------- */

let cache = { cle: null, valeur: null };

/* Mise en page locale (échelle 1, origine au coin haut-gauche du bloc). */
export function miseEnPage(d) {
  const K = D();
  const cle = JSON.stringify([d.entete, d.sections, d.largeur, d.colonnes, mesurerTexte('Mm', 10)]);
  if (cache.cle === cle) return cache.valeur;
  const n = Math.max(1, Math.min(3, Number(d.colonnes) || 1));
  const Wc = largeurColonneLocale(d);
  const els = elements(d, Wc);
  const cols = repartir(els, n);
  const r = rendreColonnes(cols, K.marge, K.marge, Wc, K.espace_colonnes);
  const largeur = 2 * K.marge + n * Wc + (n - 1) * K.espace_colonnes;
  const valeur = { prims: r.prims, zones: r.zones, colonnes: cols, largeur, hauteur: r.hauteur + 2 * K.marge, Wc };
  cache = { cle, valeur };
  return valeur;
}

/* Position et dimensions du bloc (unités plan). Position null = coin haut-droit de la page. */
export function positionDescriptif(plan) {
  const d = plan && plan.descriptif;
  if (!d) return null;
  const ech = echelleDescriptif(d);
  const mp = miseEnPage(d);
  const l = mp.largeur * ech, h = mp.hauteur * ech;
  if (d.x !== null && d.x !== undefined && d.y !== null && d.y !== undefined) return { x: d.x, y: d.y, l, h, echelle: ech };
  const e = etenduePlan(plan);
  return { x: e.x + e.l - l - D().marge_bord, y: e.y + D().marge_bord, l, h, echelle: ech };
}

/* Bloc affiché sur le plan ? (`ecran` : à l'écran, le bloc destiné à la page annexe reste visible pour être édité). */
export function descriptifAffiche(plan, { ecran = false } = {}) {
  const d = plan && plan.descriptif;
  if (!d || d.visible === false) return false;
  return ecran || d.sortie_pdf !== 'annexe';
}

export function boiteDescriptif(plan, opts = { ecran: true }) {
  if (!descriptifAffiche(plan, opts)) return null;
  const p = positionDescriptif(plan);
  return p ? { x: p.x, y: p.y, l: p.l, h: p.h } : null;
}

/* Le bloc dépasse-t-il l'étendue de la page ? */
export function depassePage(plan) {
  const b = boiteDescriptif(plan, { ecran: true });
  if (!b) return false;
  const e = etenduePlan(plan);
  const t = 0.5;
  return b.x < e.x - t || b.y < e.y - t || b.x + b.l > e.x + e.l + t || b.y + b.h > e.y + e.h + t;
}

function aspect(d) {
  const K = D(), T = CHARTE.texte;
  const cadre = d.cadre || K.cadre_defaut;
  const fond = d.fond || K.fond_defaut;
  return {
    couleur: cadre === 'aucun' ? null : (d.couleur_cadre || K.couleur_cadre_defaut),
    arrondi: cadre === 'arrondi',
    fond: fond === 'transparent' ? null : (fond === 'translucide' ? T.fond_etiquette : '#FFFFFF')
  };
}

/* Primitives du bloc sur le plan (rien si masqué ou envoyé en page annexe, sauf `ecran`). */
export function primitivesDescriptifPlan(plan, projet, { ecran = false } = {}) {
  void projet;
  if (!descriptifAffiche(plan, { ecran })) return [];
  const d = plan.descriptif;
  const K = D();
  const mp = miseEnPage(d);
  const pos = positionDescriptif(plan);
  const a = aspect(d);
  const prims = [];
  const opt = { couleur: a.couleur, epaisseur: a.couleur ? K.epaisseur_cadre : 0, remplissage: a.fond };
  if (a.couleur || a.fond) prims.push(a.arrondi ? rectArrondi(0, 0, mp.largeur, mp.hauteur, K.rayon_cadre, opt) : rect(0, 0, mp.largeur, mp.hauteur, opt));
  prims.push(...mp.prims);
  return transformer(prims, { x: pos.x, y: pos.y, rotation: 0, echelle: pos.echelle });
}

/* Zone (ligne) du bloc sous un point du plan : { zone, entree?, ligne?, section? } ou null. */
export function cibleDescriptif(plan, p) {
  const b = boiteDescriptif(plan, { ecran: true });
  if (!b || p.x < b.x || p.y < b.y || p.x > b.x + b.l || p.y > b.y + b.h) return null;
  const pos = positionDescriptif(plan);
  const mp = miseEnPage(plan.descriptif);
  const lx = (p.x - pos.x) / pos.echelle, ly = (p.y - pos.y) / pos.echelle;
  const z = mp.zones.find((q) => lx >= q.x && lx <= q.x + q.l && ly >= q.y && ly <= q.y + q.h);
  return z ? z.cible : { zone: 'bloc' };
}

/* ---------- Pages annexes du PDF (§2.11) ---------- */

/* Liste de pages (primitives en unités de page, y vers le bas) au format largeur × hauteur. */
export function pagesAnnexe(plan, projet, largeurPage, hauteurPage) {
  const d = plan && plan.descriptif;
  if (!d || d.visible === false || d.sortie_pdf !== 'annexe') return [];
  const K = D();
  const m = K.annexe.marge_mm * MM;
  const ech = echelleDescriptif(d);
  const n = Math.max(1, Math.min(3, Number(d.colonnes) || 1));
  const p = projet || {};
  const titre = appliquerFormat(K.annexe.entete, { affaire: p.nom || '', sieep: p.num_sieep || '' });
  const hEntete = K.corps.taille * K.interligne + K.annexe.ecart_entete_mm * MM;
  const largeurUtile = (largeurPage - 2 * m) / ech;
  const Wc = Math.max(K.largeur_min_colonne, (largeurUtile - (n - 1) * K.espace_colonnes) / n);
  const hUtile = (hauteurPage - 2 * m - hEntete) / ech;
  const els = elements(d, Wc);
  const cols = repartir(els, n, Math.max(hUtile, 10));
  const pages = [];
  for (let i = 0; i < cols.length; i += n) {
    const r = rendreColonnes(cols.slice(i, i + n), 0, 0, Wc, K.espace_colonnes);
    const prims = [texte(m, m + K.corps.taille * 0.95, titre + (cols.length > n ? ' (' + (i / n + 1) + '/' + Math.ceil(cols.length / n) + ')' : ''), { taille: K.corps.taille, couleur: '#000000' })];
    prims.push(...transformer(r.prims, { x: m, y: m + hEntete, rotation: 0, echelle: ech }));
    pages.push(prims);
  }
  return pages;
}

/* Taille minimale de texte du bloc (mm papier), pour le garde-fou de lisibilité. */
export function tailleMinMm(plan) {
  const d = plan && plan.descriptif;
  if (!d) return null;
  return (D().corps.taille * echelleDescriptif(d)) / MM;
}
