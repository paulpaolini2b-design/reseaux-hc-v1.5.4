/* forme-calcul.js — calculs purs de la v1.4.6 (aucune dépendance : ni DOM, ni `etat`, ni import).
 * Testables sous Node : js/forme-calcul.test.mjs (comme plans-calcul.js et mesure-calcul.js).
 *
 * Conventions du plan : x vers la droite, y vers le BAS, angle en degrés, positif = sens horaire à l'écran
 * (même convention que primitives.js → tournerPoint et que la rotation des notes et des symboles).
 *
 * - Formes du Dessin tournées (§3) : rectangle, rectangle arrondi, ellipse (et carré / rond) restent stockés par les
 *   4 coins de leur boîte NON tournée ; la rotation s'applique autour du centre de cette boîte.
 * - Étiquette fléchée (§4) : coin de départ de la flèche selon la position de la pointe.
 * - Mise en page d'une note mise en forme (§1) : gras / italique / souligné par morceau, alignement, justification.
 * - Image libre (§2) : rectangle tourné (coins, test d'appartenance).
 * - v1.4.7 — rognage non destructif d'une image libre : `recadrage` { g, h, d, b } = fractions retirées à gauche, en
 *   haut, à droite, en bas, dans le repère de l'image (avant rotation). x, y, largeur, hauteur, rotation décrivent
 *   toujours l'image ENTIÈRE ; seule la partie visible change.
 */

/* ---------- Rotation ---------- */
export function tourner(p, c, deg) {
  if (!deg) return { x: p.x, y: p.y };
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/* Point monde → repère local d'une forme tournée de `deg` autour de `c`. */
export function versLocal(p, c, deg) { return tourner(p, c, -(deg || 0)); }

/* Centre de la boîte englobante (axes) d'une liste de points. */
export function centreBoite(pts) {
  if (!pts || !pts.length) return { x: 0, y: 0 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) { if (p.x < x1) x1 = p.x; if (p.y < y1) y1 = p.y; if (p.x > x2) x2 = p.x; if (p.y > y2) y2 = p.y; }
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

/* Coins d'une forme tournée, dans le repère du plan (poignées, liseré, sélection). */
export function coinsMonde(pts, deg) {
  if (!deg) return pts.map((p) => ({ x: p.x, y: p.y }));
  const c = centreBoite(pts);
  return pts.map((p) => tourner(p, c, deg));
}

/* Boîte carrée : le point opposé à `depart` est ramené à la plus grande des deux dimensions (carré, rond). */
export function contraindreCarre(depart, p) {
  const dx = p.x - depart.x, dy = p.y - depart.y;
  const c = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: depart.x + (dx < 0 ? -c : c), y: depart.y + (dy < 0 ? -c : c) };
}

/* Redimensionnement par un coin d'une forme stockée par ses 4 coins [a, (b.x,a.y), b, (a.x,b.y)] et tournée de `deg`.
 * Le point saisi (repère du plan) est ramené dans le repère local, la règle d'origine s'applique (le coin opposé reste
 * fixe, les deux voisins suivent — v12 §8), puis la forme est recalée pour que le coin opposé ne bouge pas à l'écran.
 * À rotation nulle et sans proportions fixes, le résultat est exactement celui de la v1.4.5. */
export function redimensionnerCoin(pts, index, pMonde, deg = 0, ratioFixe = false) {
  const c = centreBoite(pts);
  const oppose = pts[(index + 2) % 4];
  let q = versLocal(pMonde, c, deg);
  if (ratioFixe) q = contraindreCarre(oppose, q);
  const n = pts.map((p) => ({ x: p.x, y: p.y }));
  n[index] = { x: q.x, y: q.y };
  n[index ^ 1] = { x: n[index ^ 1].x, y: q.y };
  n[3 - index] = { x: q.x, y: n[3 - index].y };
  if (!deg) return n;
  const avant = tourner(oppose, c, deg);
  const apres = tourner(n[(index + 2) % 4], centreBoite(n), deg);
  const tx = avant.x - apres.x, ty = avant.y - apres.y;
  return n.map((p) => ({ x: p.x + tx, y: p.y + ty }));
}

/* ---------- Étiquette fléchée ---------- */
/* Coin de départ de la flèche : coin de la boîte locale {x, y, l, h} situé du côté de la pointe (repère local). */
export function coinDepartFleche(b, pointe) {
  const cx = b.x + b.l / 2, cy = b.y + b.h / 2;
  return { x: pointe.x < cx ? b.x : b.x + b.l, y: pointe.y < cy ? b.y : b.y + b.h };
}

/* ---------- Image libre : rectangle tourné autour de son centre ---------- */
export function coinsRectangleTourne(cx, cy, l, h, deg) {
  const c = { x: cx, y: cy };
  return [{ x: cx - l / 2, y: cy - h / 2 }, { x: cx + l / 2, y: cy - h / 2 }, { x: cx + l / 2, y: cy + h / 2 }, { x: cx - l / 2, y: cy + h / 2 }].map((p) => tourner(p, c, deg));
}

export function dansRectangleTourne(p, cx, cy, l, h, deg, marge = 0) {
  const q = versLocal(p, { x: cx, y: cy }, deg);
  return Math.abs(q.x - cx) <= l / 2 + marge && Math.abs(q.y - cy) <= h / 2 + marge;
}

/* ---------- Rognage d'une image libre (v1.4.7 §1) ---------- */
export const RECADRAGE_NUL = Object.freeze({ g: 0, h: 0, d: 0, b: 0 });

/* Recadrage lisible : champs absents ou non numériques = 0. */
export function lireRecadrage(r) {
  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  return r && typeof r === 'object' ? { g: n(r.g), h: n(r.h), d: n(r.d), b: n(r.b) } : { g: 0, h: 0, d: 0, b: 0 };
}

/* Vrai si rien n'est retiré (absent ou quatre zéros) : le chemin de rendu de la v1.4.6 s'applique alors à l'identique. */
export function recadrageNul(r) {
  const q = lireRecadrage(r);
  return !q.g && !q.h && !q.d && !q.b;
}

/* Bornes du modèle : chaque fraction ≥ 0, g + d ≤ 1 − visibleMin, h + b ≤ 1 − visibleMin. Un couple qui déborde est
 * réduit proportionnellement (les deux côtés gardent leur rapport). */
export function bornerRecadrage(r, visibleMin = 0.05) {
  const q = lireRecadrage(r);
  const max = 1 - visibleMin;
  for (const k of ['g', 'h', 'd', 'b']) q[k] = Math.max(0, q[k]);
  for (const [a, c] of [['g', 'd'], ['h', 'b']]) {
    const t = q[a] + q[c];
    if (t > max) { q[a] = (q[a] / t) * max; q[c] = (q[c] / t) * max; }
  }
  return q;
}

/* Décalage du centre visible par rapport au centre de l'image entière, dans le repère de l'image (avant rotation). */
function decalageVisible(l, h, r) {
  return { x: ((r.g - r.d) / 2) * l, y: ((r.h - r.b) / 2) * h };
}

/* Partie visible d'une image décrite par son centre, sa taille entière, sa rotation et son recadrage.
 * Rend { cx, cy, l, h } : centre et taille de la partie visible dans le repère du plan ; ses côtés restent parallèles
 * à ceux de l'image (même rotation). */
export function rectangleVisibleDe(cx, cy, l, h, deg, recadrage) {
  const r = lireRecadrage(recadrage);
  const o = decalageVisible(l, h, r);
  const c = tourner({ x: cx + o.x, y: cy + o.y }, { x: cx, y: cy }, deg || 0);
  return { cx: c.x, cy: c.y, l: (1 - r.g - r.d) * l, h: (1 - r.h - r.b) * h };
}

/* Même calcul sur un objet image { x, y, largeur, hauteur, rotation, recadrage }. */
export function rectangleVisible(o) {
  return rectangleVisibleDe(o.x, o.y, o.largeur || 0, o.hauteur || 0, o.rotation || 0, o.recadrage);
}

/* Nouveau recadrage quand la poignée `poignee` (g | d | h | b | hg | hd | bg | bd) est amenée en `pointPlan`.
 * Le point est ramené dans le repère de l'image (rotation comprise) ; chaque côté saisi suit le point, les autres ne
 * bougent pas (coin : deux côtés, sans conserver les proportions). Bornes du modèle appliquées. */
export function rognerParPoignee(o, poignee, pointPlan, visibleMin = 0.05) {
  const r = lireRecadrage(o.recadrage);
  const L = o.largeur || 0, H = o.hauteur || 0;
  const q = versLocal(pointPlan, { x: o.x, y: o.y }, o.rotation || 0);
  const u = L > 0 ? (q.x - (o.x - L / 2)) / L : 0;   // 0 au bord gauche de l'image entière, 1 au bord droit
  const v = H > 0 ? (q.y - (o.y - H / 2)) / H : 0;   // 0 au bord haut, 1 au bord bas
  const borne = (x, max) => Math.min(Math.max(0, max), Math.max(0, x));
  const max = 1 - visibleMin;
  const n = { ...r };
  const cote = String(poignee || '');
  if (cote.includes('g')) n.g = borne(u, max - r.d);
  if (cote.includes('d')) n.d = borne(1 - u, max - r.g);
  if (cote.includes('h')) n.h = borne(v, max - r.b);
  if (cote.includes('b')) n.b = borne(1 - v, max - r.h);
  return n;
}

/* Fenêtre de rognage glissée de (dx, dy) (unités plan) sur l'image : la taille visible est conservée, la fenêtre ne
 * sort jamais de l'image. `recadrage` = état au début du glissement. */
export function deplacerFenetreRognage(o, recadrage, dx, dy) {
  const r = lireRecadrage(recadrage);
  const L = o.largeur || 0, H = o.hauteur || 0;
  const q = versLocal({ x: dx, y: dy }, { x: 0, y: 0 }, o.rotation || 0);
  const du = Math.min(r.d, Math.max(-r.g, L > 0 ? q.x / L : 0));
  const dv = Math.min(r.b, Math.max(-r.h, H > 0 ? q.y / H : 0));
  return { g: r.g + du, h: r.h + dv, d: r.d - du, b: r.b - dv };
}

/* Agrandit ou réduit l'image d'un facteur k autour du centre de sa partie visible : x, y, largeur, hauteur recalculés,
 * recadrage inchangé. Sans rognage, le centre ne bouge pas (x, y rendus à l'identique). */
export function echelleAutourDuVisible(o, k) {
  const L = o.largeur || 0, H = o.hauteur || 0;
  const r = lireRecadrage(o.recadrage);
  const v = rectangleVisible(o);
  const d = decalageVisible(L * k, H * k, r);
  const t = tourner(d, { x: 0, y: 0 }, o.rotation || 0);
  return { x: v.cx - t.x, y: v.cy - t.y, largeur: L * k, hauteur: H * k };
}

/* Rotation de l'image amenée à `deg` autour du centre de sa partie visible : la partie visible tourne sur place.
 * Sans rognage, x, y sont rendus à l'identique (rotation autour du centre, comme en v1.4.6). */
export function tournerAutourDuVisible(o, deg) {
  const r = lireRecadrage(o.recadrage);
  const v = rectangleVisible(o);
  const t = tourner(decalageVisible(o.largeur || 0, o.hauteur || 0, r), { x: 0, y: 0 }, deg || 0);
  return { x: v.cx - t.x, y: v.cy - t.y, rotation: deg };
}

/* Dimensions d'une image posée : largeur imposée, proportions du fichier conservées. */
export function dimensionsImage(largeurPx, hauteurPx, largeurPlan) {
  const r = largeurPx > 0 ? hauteurPx / largeurPx : 1;
  return { largeur: largeurPlan, hauteur: largeurPlan * r };
}

/* Dimensions en pixels après réduction du côté long à `coteMax` (jamais d'agrandissement). */
export function reduirePixels(largeurPx, hauteurPx, coteMax) {
  const k = Math.min(1, coteMax / Math.max(largeurPx, hauteurPx, 1));
  return { largeur: Math.max(1, Math.round(largeurPx * k)), hauteur: Math.max(1, Math.round(hauteurPx * k)), reduit: k < 1 };
}

/* ---------- Texte mis en forme (§1) ---------- */
/* Texte brut d'une note mise en forme : une ligne par entrée, segments concaténés. */
export function texteDesSegments(lignes) {
  return (lignes || []).map((l) => (l || []).map((s) => s.t || '').join('')).join('\n');
}

/* Vrai si au moins un segment porte une mise en forme (gras, italique ou souligné). */
export function segmentsMisEnForme(lignes) {
  return (lignes || []).some((l) => (l || []).some((s) => s.g || s.i || s.s));
}

/* Normalise les segments : segments vides retirés, voisins de même style fusionnés, lignes vides de fin retirées. */
export function normaliserSegments(lignes) {
  const res = (lignes || []).map((l) => {
    const out = [];
    for (const s of l || []) {
      const t = String(s.t || '');
      if (!t) continue;
      const st = { g: !!s.g, i: !!s.i, s: !!s.s };
      const der = out[out.length - 1];
      if (der && der.g === st.g && der.i === st.i && der.s === st.s) der.t += t;
      else out.push({ t, ...st });
    }
    return out;
  });
  while (res.length > 1 && !res[res.length - 1].length) res.pop();
  if (!res.length) res.push([]);
  return res;
}

/* Mise en page des lignes d'une note. `mesurer(texte, style)` rend la largeur en unités plan.
 * Chaque ligne est découpée en morceaux « mot » et « espace » placés à une abscisse explicite : le SVG écrase les
 * espaces multiples, un morceau placé ne dépend donc jamais de ses espaces. Les espaces de fin de ligne ne comptent
 * pas dans la largeur (comme un traitement de texte).
 * Justifié : chaque ligne est étirée à la largeur de la plus longue, sauf la dernière, les lignes vides et les lignes
 * sans espace intérieur (un seul mot) — H-234.
 * Retourne { largeur, lignes: [{ largeur, morceaux: [{ t, x, l, g, i, s, espace }] }] }. */
export function disposerLignes(lignes, { alignement = 'gauche', mesurer }) {
  const brutes = (lignes || []).map((l) => {
    const morceaux = [];
    for (const seg of l || []) {
      for (const partie of String(seg.t || '').split(/( +)/)) {
        if (!partie) continue;
        const style = { g: !!seg.g, i: !!seg.i, s: !!seg.s };
        morceaux.push({ t: partie, ...style, espace: /^ +$/.test(partie), l: mesurer(partie, style) });
      }
    }
    let fin = morceaux.length;
    while (fin > 0 && morceaux[fin - 1].espace) fin--;
    const utiles = morceaux.slice(0, fin);
    const largeur = utiles.reduce((s, m) => s + m.l, 0);
    return { morceaux, utiles, largeur };
  });
  const largeur = Math.max(0, ...brutes.map((b) => b.largeur));
  const n = brutes.length;
  const res = brutes.map((b, i) => {
    let x = 0, extra = 0;
    const premierMot = b.utiles.findIndex((m) => !m.espace);
    const interieurs = b.utiles.filter((m, k) => m.espace && k > premierMot && premierMot >= 0).length;
    if (alignement === 'centre') x = (largeur - b.largeur) / 2;
    else if (alignement === 'droite') x = largeur - b.largeur;
    else if (alignement === 'justifie' && i < n - 1 && interieurs > 0 && b.largeur < largeur) extra = (largeur - b.largeur) / interieurs;
    const morceaux = [];
    b.morceaux.forEach((m, k) => {
      const interieur = m.espace && k > premierMot && premierMot >= 0 && k < b.utiles.length;
      const l = m.l + (interieur ? extra : 0);
      morceaux.push({ t: m.t, x, l, g: m.g, i: m.i, s: m.s, espace: m.espace });
      x += l;
    });
    return { largeur: extra ? largeur : b.largeur, morceaux };
  });
  return { largeur, lignes: res };
}
