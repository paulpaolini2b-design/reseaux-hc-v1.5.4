/* accrochage.js — recherche d'objets sous le pointeur (hit-test géométrique sur le
 * modèle) et accrochage aux extrémités / ouvrages / angles.
 *
 * La tolérance est fournie en unités plan par l'appelant (12 px stylet, 48 px
 * doigt convertis selon le zoom).
 */
import { etat, objets } from './etat.js';
import { primitivesObjet, pointsFourreau, decalerPolyligne } from './symboles.js';
import { boitePrimitives, boiteDeuxPoints, dansEllipse, rayonArrondi } from './symboles.js';
import { boiteLegende } from './legende.js';
import { TYPES_PONCTUELS, estObjetDessin } from './modele.js';
import { FORMES_BOITE } from './symboles.js';
import { coinsMonde, centreBoite, versLocal, dansRectangleTourne, rectangleVisible } from './forme-calcul.js';

export function distancePointSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function objetActif(o) {
  const c = etat.projet.calques[o.calque] || etat.projet.calques.existant;
  if (!c.visible || c.verrou) return false;
  if (!estObjetDessin(o) && etat.projet.filtre_domaines[o.domaine] === false) return false;
  return true;
}

function dansBoite(p, b) {
  return b && p.x >= b.x && p.x <= b.x + b.l && p.y >= b.y && p.y <= b.y + b.h;
}

/* Cache des primitives par empreinte (évite de recalculer pour chaque test). */
const cache = new Map();
export function primsObjet(o) {
  const cle = JSON.stringify(o) + '|' + JSON.stringify(etat.projet.reglages);
  let c = cache.get(o.id);
  if (!c || c.cle !== cle) { c = { cle, r: primitivesObjet(o, etat.projet.reglages) }; cache.set(o.id, c); }
  return c.r;
}

/* Distance minimale d'un point à une polyligne (et index du segment). */
function distancePolyligne(p, pts) {
  let best = Infinity, idx = -1;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = distancePointSegment(p, pts[i], pts[i + 1]);
    if (d < best) { best = d; idx = i; }
  }
  return { d: best, idx };
}

/* Blocs d'étiquette (désignation, matériel, cartouche) sous le point ? */
function testerBlocs(o, p, r, tol) {
  if (!etat.etiquettesVisibles) return null;
  if (dansBoite(p, r.boiteCartouche)) return { distance: tol + 0.4, partie: 'cartouche', index: -1 };
  if (dansBoite(p, r.boiteMateriel)) return { distance: tol + 0.5, partie: 'materiel', index: -1 };
  if (dansBoite(p, r.boiteEtiquette)) return { distance: tol + 0.5, partie: 'etiquette', index: -1 };
  return null;
}

/* Teste un objet. Retourne { distance, partie, index } ou null. */
export function testerObjet(o, p, tol) {
  const r = primsObjet(o);
  if (o.type === 'troncon' || o.type === 'fourreau') {
    const pts = o.type === 'fourreau' ? pointsFourreau(o) : o.points;
    if (o.type === 'troncon' || !o.troncon_id) {
      for (let i = 0; i < pts.length; i++) {
        const d = Math.hypot(p.x - pts[i].x, p.y - pts[i].y);
        if (d <= tol) return { distance: d, partie: 'sommet', index: i };
      }
    }
    if (o.type === 'fourreau') {
      // distance aux deux lignes du fourreau (pas à l'axe) : un appui sur la ligne sélectionne le fourreau, sur l'axe le tronçon
      const dd = 2.2 * Math.min(8, Math.max(0.5, o.echelle_symbole || 1));
      const a = distancePolyligne(p, decalerPolyligne(pts, -dd)), b = distancePolyligne(p, decalerPolyligne(pts, dd));
      const d = Math.min(a.d, b.d);
      if (d <= tol) return { distance: d, partie: 'corps', index: a.d < b.d ? a.idx : b.idx };
      return testerBlocs(o, p, r, tol);
    }
    const { d, idx } = distancePolyligne(p, pts);
    if (d <= tol + 1) return { distance: d, partie: 'corps', index: idx };
    return testerBlocs(o, p, r, tol);
  }
  if (o.type === 'note') {
    const a = (-(o.rotation || 0) * Math.PI) / 180;
    const dx = p.x - o.x, dy = p.y - o.y;
    const q = { x: o.x + dx * Math.cos(a) - dy * Math.sin(a), y: o.y + dx * Math.sin(a) + dy * Math.cos(a) };
    const b = r.boite;
    if (b && q.x >= b.x - tol / 2 && q.x <= b.x + b.l + tol / 2 && q.y >= b.y - tol / 2 && q.y <= b.y + b.h + tol / 2) {
      return { distance: Math.hypot(p.x - (b.x + b.l / 2), p.y - (b.y + b.h / 2)), partie: 'corps', index: -1 };
    }
    if (o.fleche && Math.hypot(p.x - o.fleche.x, p.y - o.fleche.y) <= tol) return { distance: 0, partie: 'fleche', index: -1 };
    return null;
  }
  if (o.type === 'annotation') {
    const pts = o.points || [];
    if (pts.length) {
      for (let i = 0; i < pts.length; i++) {
        const d = Math.hypot(p.x - pts[i].x, p.y - pts[i].y);
        if (d <= tol && o.sous_type !== 'stylo' && o.sous_type !== 'trait_libre') return { distance: d, partie: 'sommet', index: i };
      }
      const ferme = o.sous_type === 'zone_hachuree';
      const { d } = distancePolyligne(p, ferme ? [...pts, pts[0]] : pts);
      if (d <= tol + (o.epaisseur || 1)) return { distance: d, partie: 'corps', index: -1 };
      if (ferme && dansPolygone(p, pts)) return { distance: tol, partie: 'corps', index: -1 };
      return null;
    }
    const b = r.boite;
    if (b && p.x >= b.x - tol / 2 && p.x <= b.x + b.l + tol / 2 && p.y >= b.y - tol / 2 && p.y <= b.y + b.h + tol / 2) {
      return { distance: Math.hypot(p.x - o.x, p.y - o.y), partie: 'corps', index: -1 };
    }
    return null;
  }
  if (o.type === 'masque') {
    // masque du fond (v12 §8) : intérieur de la forme ; bande de pinceau : distance à l'axe ≤ rayon
    const pts = o.points || [];
    if (o.sous_type === 'pinceau') {
      if (!pts.length) return null;
      const d = pts.length === 1 ? Math.hypot(p.x - pts[0].x, p.y - pts[0].y) : distancePolyligne(p, pts).d;
      const rayon = (Number(o.attributs.diametre) || 1) / 2;
      return d <= rayon + tol / 2 ? { distance: d + 1000, partie: 'corps', index: -1 } : null;
    }
    if (pts.length < 3) return null;
    // v1.4.6 §3 : forme tournée — sommets à leur place réelle, intérieur testé dans le repère de la forme
    const rot = FORMES_BOITE.includes(o.sous_type) ? (Number(o.rotation) || 0) : 0;
    const sommets = rot ? coinsMonde(pts, rot) : pts;
    const q = rot ? versLocal(p, centreBoite(pts), rot) : p;
    for (let i = 0; i < sommets.length; i++) { const d = Math.hypot(p.x - sommets[i].x, p.y - sommets[i].y); if (d <= tol) return { distance: d + 1000, partie: 'sommet', index: i }; }
    // Formes arrondies (v13.4 §2) : le test suit la forme réellement dessinée — un appui dans le coin vide d'une
    // ellipse ne la sélectionne pas.
    if (o.sous_type === 'ellipse' || o.sous_type === 'rectangle_arrondi') {
      const b = boiteDeuxPoints(pts);
      if (!b) return null;
      const dedans = o.sous_type === 'ellipse' ? dansEllipse(q, b) : dansRectArrondi(q, b, rayonArrondi(o, b));
      return dedans ? { distance: 1000 + tol, partie: 'corps', index: -1 } : null;
    }
    if (dansPolygone(q, pts)) return { distance: 1000 + tol, partie: 'corps', index: -1 };
    return null;
  }
  if (o.type === 'image') {
    // Image libre (v1.4.6 §2) : intérieur du rectangle tourné ; toujours derrière le reste à la sélection.
    // v1.4.7 : seule la partie visible d'une image rognée est sélectionnable (sans rognage : rectangle entier).
    const v = rectangleVisible(o);
    return dansRectangleTourne(p, v.cx, v.cy, v.l, v.h, o.rotation || 0, tol / 2) ? { distance: 2000 + tol, partie: 'corps', index: -1 } : null;
  }
  // ponctuel : le symbole (éventuellement déporté) fait foi pour la sélection ; l'ancrage pour l'accrochage
  const c = r.centre || { x: o.x, y: o.y };
  const d = Math.hypot(p.x - c.x, p.y - c.y);
  if (d <= (r.rayon || 2) + tol) return { distance: d, partie: 'corps', index: -1 };
  const da = Math.hypot(p.x - o.x, p.y - o.y);
  if (da <= tol) return { distance: da, partie: 'corps', index: -1 };
  return testerBlocs(o, p, r, tol);
}

function dansPolygone(p, pts) {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > p.y) !== (pts[j].y > p.y) && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) dedans = !dedans;
  }
  return dedans;
}

/* Recherche le meilleur objet sous le point. options : { ignorer: Set<id>, types: [..], seulementSelection } */
export function chercherObjet(p, tol, options = {}) {
  if (!etat.plan) return null;
  let best = null;
  for (const o of objets()) {
    if (options.ignorer && options.ignorer.has(o.id)) continue;
    if (options.types && !options.types.includes(o.type)) continue;
    if (options.seulementSelection && !etat.selection.has(o.id)) continue;
    if (!objetActif(o)) continue;
    const t = testerObjet(o, p, tol);
    if (!t) continue;
    const prio = TYPES_PONCTUELS.includes(o.type) ? 0 : (o.type === 'note' ? 1 : (o.type === 'annotation' ? 1.5 : (o.type === 'masque' ? 3 : (o.type === 'image' ? 4 : 2))));   // masques puis images toujours derrière
    const score = prio * 1000 + (['etiquette', 'materiel', 'cartouche'].includes(t.partie) ? 500 : 0) + t.distance;
    if (!best || score < best.score) best = { objet: o, score, ...t };
  }
  return best;
}

/* Objets dont la boîte est contenue dans un rectangle plan (lasso). */
export function objetsDansRectangle(rect) {
  const res = [];
  const x2 = rect.x + rect.l, y2 = rect.y + rect.h;
  for (const o of objets()) {
    if (!objetActif(o)) continue;
    const b = boiteObjet(o);
    if (!b) continue;
    if (b.x >= rect.x && b.y >= rect.y && b.x + b.l <= x2 && b.y + b.h <= y2) res.push(o);
  }
  return res;
}

/* Boîte englobante d'un objet (corps seul). */
/* Point dans un rectangle à angles arrondis : rectangle moins les quatre quarts de disque manquants. */
function dansRectArrondi(p, b, r) {
  if (p.x < b.x || p.x > b.x + b.l || p.y < b.y || p.y > b.y + b.h) return false;
  if (!r) return true;
  const cx = Math.min(Math.max(p.x, b.x + r), b.x + b.l - r);
  const cy = Math.min(Math.max(p.y, b.y + r), b.y + b.h - r);
  return Math.hypot(p.x - cx, p.y - cy) <= r;
}

export function boiteObjet(o) {
  const r = primsObjet(o);
  return boitePrimitives(r.corps);
}

/* Légende sous le point ? */
export function testerLegende(p) {
  const b = boiteLegende(etat.plan, objets());
  return b && dansBoite(p, b) ? b : null;
}

/* ---------- Accrochage ---------- */
/* Accroche p aux extrémités de tronçons et aux centres d'ouvrages ponctuels. */
export function accrocher(p, tol, { exclureId = null } = {}) {
  let best = null;
  for (const o of objets()) {
    if (o.id === exclureId || !objetActif(o) || o.type === 'note') continue;
    if (o.type === 'annotation' || o.type === 'masque' || o.type === 'image') continue;
    const candidats = (o.type === 'troncon' || o.type === 'fourreau') ? (() => { const pts = o.type === 'fourreau' ? pointsFourreau(o) : o.points; return pts.length ? [pts[0], pts[pts.length - 1]] : []; })() : [{ x: o.x, y: o.y }];
    for (const c of candidats) {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d <= tol && (!best || d < best.d)) best = { x: c.x, y: c.y, d, objet: o };
    }
  }
  return best;
}

/* Accrochage angulaire (0 / 45 / 90°) par rapport au point précédent. */
export function accrocherAngle(precedent, p) {
  const dx = p.x - precedent.x, dy = p.y - precedent.y;
  const L = Math.hypot(dx, dy);
  if (!L) return p;
  const a = Math.atan2(dy, dx);
  const pas = Math.PI / 4;
  const a2 = Math.round(a / pas) * pas;
  return { x: precedent.x + Math.cos(a2) * L, y: precedent.y + Math.sin(a2) * L };
}

export function viderCacheAccrochage() { cache.clear(); }
