/* pointeur.js — Pointer Events : le stylet dessine, le doigt navigue.
 *
 * - pointerType 'pen'   : glisser = outil (tracer / sélectionner / déplacer) ; survol = curseur de précision
 * - pointerType 'touch' : un doigt = déplacer le plan, deux doigts = pincer/zoomer ; appui bref = poser/sélectionner ;
 *                         glisser une poignée ou un objet déjà sélectionné = manipulation
 * - pointerType 'mouse' : bouton gauche = outil ; molette = zoom ; bouton du milieu ou Ctrl-glisser = déplacer
 * - Rejet de paume : contacts 'touch' ignorés tant qu'un stylet est en appui ou a survolé récemment
 * - Bouton latéral du stylet (button 5 / buttons & 32) ou gomme : suppression
 * - Tolérance au tremblement : zone morte avant qu'un appui devienne un glissement
 */
import { etat, emettre, sur } from './etat.js';
import { vue, versPlan, deplacer, zoomerAutour, ajuster, appliquer } from './vue.js';
import * as outils from './outils.js';
import * as mesure from './mesure.js';   // v1.4.3 : l'outil Mesure est aiguillé AVANT outils.js (voir mesure.js)
import { afficherCurseur } from './rendu-svg.js';

const ZONE_MORTE = { pen: 6, mouse: 5, touch: 11 };
const DELAI_APPUI_LONG = 550;
const DELAI_DOUBLE = 350;
const REJET_PAUME_MS = 500;

const pointeurs = new Map();   // pointerId → { type, x0, y0, x, y, t0, glisse, poignee, shift, gomme, outil }
let stylusActif = 0;
let dernierSurvolStylet = 0;
let minuterieLong = null;
let dernierAppui = { t: 0, x: 0, y: 0 };
let pincement = null;          // { d0, cx, cy, k0, tx0, ty0 }
let panoramique = null;        // { x0, y0, tx0, ty0 }
let rafPan = false;
let svg, zone, curseurDiv;

export function initialiserPointeur() {
  svg = document.getElementById('plan-svg');
  zone = document.getElementById('zone-plan');
  curseurDiv = document.getElementById('curseur-stylet');

  zone.addEventListener('pointerdown', surPointerDown);
  zone.addEventListener('pointermove', surPointerMove);
  zone.addEventListener('pointerup', surPointerUp);
  zone.addEventListener('pointercancel', surPointerCancel);
  zone.addEventListener('pointerleave', surPointerLeave);
  zone.addEventListener('wheel', surMolette, { passive: false });
  zone.addEventListener('contextmenu', (e) => e.preventDefault());
  zone.addEventListener('dblclick', (e) => e.preventDefault());
  sur('vue', () => { if (etat.dernierPointeur === 'pen' && s_survol) afficherCurseur(s_survol.x, s_survol.y, true); });
}

let s_survol = null;

function pos(e) {
  const r = zone.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function estGomme(e) {
  return e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0);
}

function contexte(e, p) {
  return { pointerType: e.pointerType, shift: e.shiftKey, ecran: p, poignee: p.poignee || null };
}

function poigneeSous(cible) {
  const g = cible && cible.closest ? cible.closest('[data-poignee]') : null;
  return g ? g.getAttribute('data-poignee') : null;
}

/* ---------- pointerdown ---------- */
function surPointerDown(e) {
  if (!etat.projet) return;
  const type = e.pointerType || 'mouse';
  etat.dernierPointeur = type;

  if (type === 'touch' && (stylusActif > 0 || (performance.now() - dernierSurvolStylet) < REJET_PAUME_MS)) {
    return;   // rejet de la paume
  }
  if (type === 'pen') stylusActif++;

  const p = pos(e);
  p.poignee = poigneeSous(e.target);
  const entree = { type, x0: p.x, y0: p.y, x: p.x, y: p.y, t0: performance.now(), glisse: false, poignee: p.poignee, shift: e.shiftKey, gomme: estGomme(e) || etat.outil === 'gomme', navigation: false, ctrl: e.ctrlKey, bouton: e.button };
  pointeurs.set(e.pointerId, entree);
  try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  e.preventDefault();

  // Deux doigts : pincement
  const touches = [...pointeurs.values()].filter((x) => x.type === 'touch');
  if (type === 'touch' && touches.length === 2) {
    clearTimeout(minuterieLong);
    if (touches.some((t) => t.outilPris)) return;   // un doigt manipule déjà : on ignore le second
    panoramique = null;
    const [a, b] = touches;
    pincement = { d0: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, k0: vue.k, tx0: vue.tx, ty0: vue.ty };
    return;
  }
  if (touches.length > 2) return;

  // Navigation à la souris : bouton du milieu ou Ctrl
  if (type === 'mouse' && (e.button === 1 || e.ctrlKey)) { entree.navigation = true; panoramique = { x0: p.x, y0: p.y, tx0: vue.tx, ty0: vue.ty }; return; }
  if (type === 'mouse' && e.button === 2) { entree.droit = true; return; }

  // Appui long → menu contextuel
  clearTimeout(minuterieLong);
  minuterieLong = setTimeout(() => {
    const en = pointeurs.get(e.pointerId);
    if (!en || en.glisse) return;
    if (etat.outil === 'mesure' && !en.gomme) return;   // v1.4.3 : pas de menu contextuel en mesure
    en.long = true;
    outils.appuiLong(versPlan({ x: en.x, y: en.y }), contexte(e, { x: en.x, y: en.y }));
  }, DELAI_APPUI_LONG);
}

/* ---------- pointermove ---------- */
function surPointerMove(e) {
  const type = e.pointerType || 'mouse';
  const p = pos(e);

  // Survol du stylet (sans contact)
  if (type === 'pen' && e.buttons === 0) {
    dernierSurvolStylet = performance.now();
    etat.dernierPointeur = 'pen';
    s_survol = p;
    afficherCurseur(p.x, p.y, !etat.modePapier);
    if (etat.projet && etat.outil === 'mesure') { mesure.survol(versPlan(p), contexte(e, p)); return; }   // v1.4.3
    if (etat.projet) outils.survol(versPlan(p), contexte(e, p));
    return;
  }
  if (type === 'mouse' && e.buttons === 0) {
    s_survol = null;
    if (etat.projet && etat.outil === 'mesure') { mesure.survol(versPlan(p), contexte(e, p)); return; }   // v1.4.3
    if (etat.projet) outils.survol(versPlan(p), contexte(e, p));
    return;
  }

  const en = pointeurs.get(e.pointerId);
  if (!en) return;
  en.x = p.x; en.y = p.y;

  if (pincement) {
    const touches = [...pointeurs.values()].filter((x) => x.type === 'touch');
    if (touches.length >= 2) {
      const [a, b] = touches;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const f = d / (pincement.d0 || 1);
      const k = pincement.k0 * f;
      // le point du plan sous le centre initial reste sous le centre courant
      const planCx = (pincement.cx - pincement.tx0) / pincement.k0, planCy = (pincement.cy - pincement.ty0) / pincement.k0;
      programmerVue({ k, tx: cx - planCx * k, ty: cy - planCy * k });
    }
    return;
  }

  if (en.navigation && panoramique) {
    programmerVue({ k: vue.k, tx: panoramique.tx0 + (p.x - panoramique.x0), ty: panoramique.ty0 + (p.y - panoramique.y0) });
    return;
  }
  if (en.droit) return;

  // v1.4.3 — Mesure : glisser un point de mesure l'ajuste ; tout autre glissement déplace le plan.
  if (etat.outil === 'mesure' && !en.gomme) {
    if (!en.glisse) {
      if (Math.hypot(p.x - en.x0, p.y - en.y0) < ZONE_MORTE[type]) return;    // tolérance au tremblement
      en.glisse = true;
      clearTimeout(minuterieLong);
      if (en.long) return;
      en.mesure = mesure.debutGlisser(versPlan({ x: en.x0, y: en.y0 }), contexte(e, { x: en.x0, y: en.y0 }));
      if (!en.mesure) {
        en.navigation = true;
        panoramique = { x0: en.x0, y0: en.y0, tx0: vue.tx, ty0: vue.ty };
        programmerVue({ k: vue.k, tx: panoramique.tx0 + (p.x - panoramique.x0), ty: panoramique.ty0 + (p.y - panoramique.y0) });
        return;
      }
    }
    if (en.mesure) mesure.glisser(versPlan(p), contexte(e, p));
    return;
  }

  const dist = Math.hypot(p.x - en.x0, p.y - en.y0);
  if (!en.glisse) {
    if (dist < ZONE_MORTE[type]) return;    // tolérance au tremblement
    en.glisse = true;
    clearTimeout(minuterieLong);
    if (en.long) return;
    const p0 = { x: en.x0, y: en.y0 };
    if (en.gomme) { en.outilPris = true; outils.debutGlisserGomme(versPlan(p0), contexte(e, p0)); }
    else {
      const ctx = contexte(e, p0); ctx.poignee = en.poignee;
      en.outilPris = outils.debutGlisser(versPlan(p0), ctx);
    }
    if (!en.outilPris) {
      en.navigation = true;
      panoramique = { x0: en.x0, y0: en.y0, tx0: vue.tx, ty0: vue.ty };
      programmerVue({ k: vue.k, tx: panoramique.tx0 + (p.x - panoramique.x0), ty: panoramique.ty0 + (p.y - panoramique.y0) });
      return;
    }
  }
  if (en.outilPris) outils.glisser(versPlan(p), contexte(e, p));
}

/* ---------- pointerup ---------- */
function surPointerUp(e) {
  const type = e.pointerType || 'mouse';
  const en = pointeurs.get(e.pointerId);
  if (type === 'pen') stylusActif = Math.max(0, stylusActif - 1);
  if (!en) return;
  pointeurs.delete(e.pointerId);
  clearTimeout(minuterieLong);
  try { zone.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const p = pos(e);

  if (pincement) {
    const touches = [...pointeurs.values()].filter((x) => x.type === 'touch');
    if (touches.length < 2) { pincement = null; for (const t of touches) { t.glisse = true; t.navigation = true; panoramique = { x0: t.x, y0: t.y, tx0: vue.tx, ty0: vue.ty }; } }
    return;
  }
  if (en.navigation) { panoramique = null; return; }
  if (en.droit && etat.outil === 'mesure') return;   // v1.4.3 : pas de menu contextuel en mesure
  if (en.droit) { outils.appuiLong(versPlan(p), contexte(e, p)); return; }
  if (en.long) return;
  if (en.mesure) { mesure.finGlisser(versPlan(p), contexte(e, p)); return; }   // v1.4.3

  if (en.glisse) {
    if (en.outilPris) {
      if (en.gomme) outils.finGlisserGomme(versPlan(p), contexte(e, p));
      else outils.finGlisser(versPlan(p), contexte(e, p));
    }
    return;
  }

  // Appui bref
  const maintenant = performance.now();
  const ctx = contexte(e, p); ctx.poignee = en.poignee;
  if (en.gomme) { outils.appuiGomme(versPlan(p), ctx); return; }
  const double = (maintenant - dernierAppui.t) < DELAI_DOUBLE && Math.hypot(p.x - dernierAppui.x, p.y - dernierAppui.y) < 24;
  dernierAppui = { t: maintenant, x: p.x, y: p.y };
  if (etat.outil === 'mesure') {   // v1.4.3 : un appui = un point ; double appui = fin de mesure
    if (double) dernierAppui.t = 0;
    if (!mesure.appui(versPlan(p), ctx, { double }) && double && type === 'touch') ajuster();
    return;
  }
  if (double) {
    dernierAppui.t = 0;
    if (outils.doubleAppui(versPlan(p), ctx)) return;
    if (type === 'touch') { ajuster(); return; }   // double tap au doigt : ajuster à l'écran
    return;
  }
  if (en.poignee) { outils.appuiPoignee(en.poignee); return; }   // appui bref sur une poignée (croix du cartouche, v12 §3.3)
  outils.appui(versPlan(p), ctx);
}

function surPointerCancel(e) {
  const type = e.pointerType || 'mouse';
  if (type === 'pen') stylusActif = Math.max(0, stylusActif - 1);
  const en = pointeurs.get(e.pointerId);
  pointeurs.delete(e.pointerId);
  clearTimeout(minuterieLong);
  if (en && en.mesure) mesure.finGlisser(versPlan({ x: en.x, y: en.y }), contexte(e, { x: en.x, y: en.y }));   // v1.4.3
  if (en && en.outilPris) outils.finGlisser(versPlan({ x: en.x, y: en.y }), contexte(e, { x: en.x, y: en.y }));
  if (pointeurs.size < 2) pincement = null;
  if (pointeurs.size === 0) panoramique = null;
}

function surPointerLeave(e) {
  if (etat.outil === 'mesure' && e.pointerType === 'pen' && e.buttons === 0) { s_survol = null; afficherCurseur(0, 0, false); mesure.finSurvol(); return; }   // v1.4.3
  if (e.pointerType === 'pen' && e.buttons === 0) { s_survol = null; afficherCurseur(0, 0, false); outils.finSurvol(); }
}

/* ---------- Molette (souris / pavé tactile) ---------- */
function surMolette(e) {
  e.preventDefault();
  const p = pos(e);
  if (e.ctrlKey || !e.shiftKey) {
    const f = Math.exp(-e.deltaY * 0.0015);
    zoomerAutour(f, p.x, p.y);
  } else {
    deplacer(-e.deltaY, 0);
  }
}

/* Application de la vue limitée à une frame. */
let vueEnAttente = null;
function programmerVue(v) {
  vueEnAttente = v;
  if (rafPan) return;
  rafPan = true;
  requestAnimationFrame(() => { rafPan = false; if (vueEnAttente) { appliquer(vueEnAttente); vueEnAttente = null; } });
}

export function zoomerCentre(facteur) {
  zoomerAutour(facteur, vue.largeurEcran / 2, vue.hauteurEcran / 2);
}
