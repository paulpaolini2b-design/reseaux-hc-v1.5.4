/* vue.js — transformation plan ↔ écran.
 *
 * écran = plan × k + (tx, ty)   (pixels CSS)
 * Le fond de plan définit l'étendue du plan : (0,0) → (largeur, hauteur) en
 * unités plan (points PDF ou pixels d'image).
 */
import { etat, emettre } from './etat.js';

export const vue = { k: 1, tx: 0, ty: 0, largeurEcran: 1, hauteurEcran: 1 };

const ZOOM_MIN = 0.02, ZOOM_MAX = 60;

export function versEcran(p) { return { x: p.x * vue.k + vue.tx, y: p.y * vue.k + vue.ty }; }
export function versPlan(p) { return { x: (p.x - vue.tx) / vue.k, y: (p.y - vue.ty) / vue.k }; }
/* Convertit une distance en pixels écran en unités plan. */
export function pxVersPlan(px) { return px / vue.k; }

export function tailleEcran() {
  const z = document.getElementById('zone-plan');
  vue.largeurEcran = Math.max(1, z.clientWidth);
  vue.hauteurEcran = Math.max(1, z.clientHeight);
}

/* Étendue d'un plan (fond ou, sans fond, feuille virtuelle A3 paysage). Par défaut le plan courant ; v1.4.5 : un
 * plan explicite pour l'export de plans non affichés (position par défaut de leur légende). */
export function etenduePlan(plan = etat.plan) {
  if (plan && plan.fond && plan.fond.largeur) return { x: 0, y: 0, l: plan.fond.largeur, h: plan.fond.hauteur };
  // Sans fond : feuille virtuelle A3 paysage (1190 × 842 pt)
  return { x: 0, y: 0, l: 1190, h: 842 };
}

export function appliquer({ k, tx, ty }, { silencieux = false } = {}) {
  vue.k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
  vue.tx = tx; vue.ty = ty;
  if (etat.plan) etat.plan.vue = { k: vue.k, tx: vue.tx, ty: vue.ty };
  if (!silencieux) emettre('vue', vue);
}

export function deplacer(dx, dy) {
  appliquer({ k: vue.k, tx: vue.tx + dx, ty: vue.ty + dy });
}

/* Zoom d'un facteur autour d'un point écran (cx, cy). */
export function zoomerAutour(facteur, cx, cy) {
  const k2 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vue.k * facteur));
  const f = k2 / vue.k;
  appliquer({ k: k2, tx: cx - (cx - vue.tx) * f, ty: cy - (cy - vue.ty) * f });
}

/* Ajuste l'étendue du plan à l'écran (Ctrl+0, double tap). */
export function ajuster(marge = 24) {
  tailleEcran();
  const e = etenduePlan();
  const k = Math.min((vue.largeurEcran - 2 * marge) / e.l, (vue.hauteurEcran - 2 * marge) / e.h);
  appliquer({ k, tx: (vue.largeurEcran - e.l * k) / 2 - e.x * k, ty: (vue.hauteurEcran - e.h * k) / 2 - e.y * k });
}

/* Restaure la vue enregistrée d'un plan, ou ajuste. */
export function restaurer(plan) {
  tailleEcran();
  if (plan && plan.vue && isFinite(plan.vue.k)) appliquer(plan.vue);
  else ajuster();
}

/* Rectangle écran visible en coordonnées plan. */
export function rectangleVisible() {
  const a = versPlan({ x: 0, y: 0 }), b = versPlan({ x: vue.largeurEcran, y: vue.hauteurEcran });
  return { x: a.x, y: a.y, l: b.x - a.x, h: b.y - a.y };
}
