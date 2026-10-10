/* symboles.js — catalogue des symboles : chaque objet → primitives (unités plan).
 *
 * Symboles locaux centrés sur (0,0), axe « haut » = -y ; la rotation de l'objet
 * (degrés, sens horaire à l'écran) s'applique ensuite. Les textes restent
 * horizontaux (§8.3), sauf le texte des notes.
 */
import { CHARTE, MM, styleTroncon, couleurReseau, ABREVIATIONS_ETIQUETTE, supportSansCaracteristiques, couleurFourreau, couleurManuelleValide, besoinLisere, categorieMalt, couleurMalt } from './charte.js';
import { ligne, poly, cercle, texte, rect, ellipsePoly, transformer, hachurerPolygone, hachurerPolyligne, blocTexte, blocTexteRiche, mesurerTexte, boite } from './primitives.js';
import { centreBoite, tourner, versLocal, coinDepartFleche, texteDesSegments, recadrageNul, lireRecadrage, coinsRectangleTourne, rectangleVisibleDe } from './forme-calcul.js';
import { designationAffichee, etiquetteTroncon, lignesMaterielEtiquette, compensationEchelle, formaterAngle, symboleMaltActif, categorieMaltHote } from './modele.js';
import { objetParId } from './etat.js';

/* ---------- Contexte de rendu (lot 1.4, v14 §5.3) ----------
 * Par défaut, les primitives lisent le projet ouvert (écran). Un export depuis le gestionnaire exécute le calcul des
 * primitives sous un contexte explicite { projet, objets } : le tronçon parent d'un fourreau accroché et la
 * compensation d'échelle viennent alors du projet exporté, jamais de etat.projet / etat.plan. Le calcul est
 * synchrone, le contexte est restauré dans un finally : aucun rendu écran ne peut s'intercaler. */
let contexteRendu = null;
export function avecContexteRendu(ctx, fn) {
  const avant = contexteRendu;
  contexteRendu = ctx || null;
  try { return fn(); } finally { contexteRendu = avant; }
}
function objetRendu(id) {
  if (contexteRendu) return contexteRendu.objets.find((x) => x.id === id) || null;
  return objetParId(id);
}
function compensationRendu(o) {
  return contexteRendu ? compensationEchelle(o, contexteRendu.projet) : compensationEchelle(o);
}

const C = CHARTE.contour_symbole;

/* ---------- Remplissage selon l'état (convention commune aux ponctuels) ---------- */
function polygoneCercle(cx, cy, r, n = 40) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return pts;
}

/* Coupe un polygone par le demi-plan x <= 0 (Sutherland-Hodgman). */
function moitieGauche(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const aIn = a.x <= 0, bIn = b.x <= 0;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = a.x / (a.x - b.x);
      out.push({ x: 0, y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}

/* Forme polygonale fermée avec le remplissage de l'état.
 * couleurPlein : couleur du remplissage « à poser » (noir par défaut). */
function formeEtat(pts, etatObjet, { contour = '#000000', couleurPlein = '#000000', epaisseur = C } = {}) {
  const e = CHARTE.etats[etatObjet] || CHARTE.etats.existant;
  const prims = [];
  if (etatObjet === 'a_poser') {
    prims.push(poly(pts, { ferme: true, couleur: contour, epaisseur, remplissage: couleurPlein }));
  } else if (etatObjet === 'a_deposer') {
    prims.push(poly(pts, { ferme: true, couleur: null, epaisseur: 0, remplissage: e.remplissage }));
    prims.push(...hachurerPolygone(pts, e.hachures));
    prims.push(poly(pts, { ferme: true, couleur: contour, epaisseur, remplissage: null }));
  } else if (etatObjet === 'a_reprendre') {
    prims.push(poly(pts, { ferme: true, couleur: null, epaisseur: 0, remplissage: e.remplissage }));
    const demi = moitieGauche(pts);
    if (demi.length >= 3) prims.push(poly(demi, { ferme: true, couleur: null, epaisseur: 0, remplissage: couleurPlein }));
    prims.push(poly(pts, { ferme: true, couleur: contour, epaisseur, remplissage: null }));
  } else {
    prims.push(poly(pts, { ferme: true, couleur: contour, epaisseur, remplissage: e.remplissage }));
  }
  return prims;
}

function cercleEtat(r, etatObjet, options = {}) {
  if (etatObjet === 'existant') {
    return [cercle(0, 0, r, { couleur: options.contour || '#000000', epaisseur: options.epaisseur || C, remplissage: '#FFFFFF' })];
  }
  if (etatObjet === 'a_poser') {
    return [cercle(0, 0, r, { couleur: options.contour || '#000000', epaisseur: options.epaisseur || C, remplissage: options.couleurPlein || '#000000' })];
  }
  const prims = formeEtat(polygoneCercle(0, 0, r), etatObjet, { ...options, contour: null, epaisseur: 0 });
  // contour circulaire propre par-dessus
  prims.push(cercle(0, 0, r, { couleur: options.contour || '#000000', epaisseur: options.epaisseur || C, remplissage: null }));
  return prims.filter((p) => !(p.t === 'poly' && p.couleur === null && p.remplissage === null));
}

/* Texte contrasté sur un fond selon l'état (sigles à l'intérieur des coffrets/postes). */
function couleurTexteSurEtat(etatObjet, couleurPlein = '#000000') {
  if (etatObjet === 'a_poser') return couleurPlein === '#000000' || couleurPlein === '#E2001A' ? '#FFFFFF' : '#000000';
  return '#000000';
}

/* Largeur effective d'un symbole à sigle (coffret, poste, armoire EP — v13.3 §2).
 * Le sigle ne doit ni déborder de l'emprise, ni descendre sous sa taille minimale (2 mm papier) : on réduit d'abord
 * le texte jusqu'à `taille_sigle_min`, puis on ÉLARGIT le symbole, plafonné à `largeur_max_facteur` × la largeur
 * nominale ; au-delà, le sigle affiché est tronqué avec une élision (le sigle complet reste dans la fiche, le .json
 * et le métré). La hauteur du symbole ne change jamais.
 * Retourne { largeur, taille, sigleAffiche }. */
export function gabaritSigle(sigle, K) {
  const marge = K.marge_interieure ?? 1.4;
  const plafond = K.largeur * (K.largeur_max_facteur ?? 2.5);
  const base = { largeur: K.largeur, taille: K.taille_sigle, sigleAffiche: sigle || '' };
  if (!sigle) return base;
  // 1. réduction progressive du texte dans la largeur nominale
  let taille = K.taille_sigle;
  const utile = (L) => L - 2 * marge;
  while (taille > K.taille_sigle_min && mesurerTexte(sigle, taille) > utile(K.largeur)) taille = Math.round((taille - 0.2) * 100) / 100;
  if (mesurerTexte(sigle, taille) <= utile(K.largeur)) return { largeur: K.largeur, taille, sigleAffiche: sigle };
  // 2. élargissement du symbole à la taille minimale
  taille = K.taille_sigle_min;
  const voulue = mesurerTexte(sigle, taille) + 2 * marge;
  if (voulue <= plafond) return { largeur: voulue, taille, sigleAffiche: sigle };
  // 3. plafond atteint : élision
  const elision = CHARTE.masque.sigle_elision;
  let t = sigle;
  while (t.length > 1 && mesurerTexte(t + elision, taille) > utile(plafond)) t = t.slice(0, -1);
  return { largeur: plafond, taille, sigleAffiche: t + elision };
}

/* Sigle centré dans le symbole ; fond blanc si hachuré. Reçoit la taille et le texte déjà calculés par
 * `gabaritSigle()`. Le sigle suit la rotation du symbole pour rester aligné sur ses bords (v13.2), avec le
 * retournement automatique des étiquettes : au-delà de 90° il pivote de 180° et reste lu à l'endroit. */
function sigleDans(gab, etatObjet, couleurPlein, rotationObjet = 0) {
  const sigle = gab.sigleAffiche;
  if (!sigle) return [];
  const taille = gab.taille;
  const l = mesurerTexte(sigle, taille);
  const prims = [];
  if (etatObjet === 'a_deposer' || etatObjet === 'a_reprendre') {
    prims.push(rect(-l / 2 - 0.6, -taille * 0.6, l + 1.2, taille * 1.2, { couleur: null, epaisseur: 0, remplissage: '#FFFFFF' }));
  }
  // rotation locale = écart entre l'orientation lisible et celle du symbole ; `suivre_rotation` ajoute ensuite
  // la rotation du symbole, le texte sort donc à rotationLisible(rotationObjet)
  const dRot = rotationLisible(rotationObjet) - (((rotationObjet || 0) % 360) + 360) % 360;
  prims.push(texte(0, taille * 0.36, sigle, { taille, couleur: couleurTexteSurEtat(etatObjet, couleurPlein), ancre: 'milieu', rotation: dRot, suivre_rotation: true }));
  return prims;
}

/* ---------- Supports (v1.4.8 — charte SIEEP-HC) ----------
 * Convention d'état PROPRE aux supports (H-261) :
 *   existant   : contour noir, intérieur blanc ;
 *   à poser    : moitié noire / moitié blanche, partage propre à chaque forme (demi-plan `partage`) ;
 *   à déposer  : plein noir + croix de dépose débordante (console et ancrage : plein sans croix) ;
 *   à remplacer (clé a_reprendre) : dessin de l'existant + barre oblique unique « \ » débordante (H-257).
 * Tout est construit dans le repère local (x à droite, y vers le bas) : partage et croix tournent avec le symbole.
 * formeEtat(), cercleEtat() et moitieGauche() restent réservées aux autres objets ponctuels. */

/* Coupe un polygone par le demi-plan n.x·x + n.y·y >= 0 (Sutherland-Hodgman). */
export function coupeDemiPlan(pts, n) {
  const out = [];
  const val = (p) => n.x * p.x + n.y * p.y;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const va = val(a), vb = val(b);
    const aIn = va >= 0, bIn = vb >= 0;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = va / (va - vb);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}

const PLEIN_SUPPORT = '#000000';
const FOND_SUPPORT = '#FFFFFF';

/* Polygone d'un support selon l'état (sans croix ni barre). `partage` : normale du demi-plan noir « à poser ». */
function polygoneEtatSupport(pts, etatObjet, partage) {
  const prims = [];
  if (etatObjet === 'a_deposer') {
    prims.push(poly(pts, { ferme: true, couleur: '#000000', epaisseur: C, remplissage: PLEIN_SUPPORT }));
  } else if (etatObjet === 'a_poser') {
    prims.push(poly(pts, { ferme: true, couleur: null, epaisseur: 0, remplissage: FOND_SUPPORT }));
    const demi = coupeDemiPlan(pts, partage);
    if (demi.length >= 3) prims.push(poly(demi, { ferme: true, couleur: null, epaisseur: 0, remplissage: PLEIN_SUPPORT }));
    prims.push(poly(pts, { ferme: true, couleur: '#000000', epaisseur: C, remplissage: null }));
  } else {
    prims.push(poly(pts, { ferme: true, couleur: '#000000', epaisseur: C, remplissage: FOND_SUPPORT }));
  }
  return prims;
}

/* Cercle d'un support selon l'état (contour circulaire exact, demi-disque en polygone). */
function cercleEtatSupport(r, etatObjet, partage) {
  if (etatObjet === 'a_deposer') return [cercle(0, 0, r, { couleur: '#000000', epaisseur: C, remplissage: PLEIN_SUPPORT })];
  if (etatObjet === 'a_poser') {
    const demi = coupeDemiPlan(polygoneCercle(0, 0, r, 64), partage);
    return [
      cercle(0, 0, r, { couleur: null, epaisseur: 0, remplissage: FOND_SUPPORT }),
      poly(demi, { ferme: true, couleur: null, epaisseur: 0, remplissage: PLEIN_SUPPORT }),
      cercle(0, 0, r, { couleur: '#000000', epaisseur: C, remplissage: null })
    ];
  }
  return [cercle(0, 0, r, { couleur: '#000000', epaisseur: C, remplissage: FOND_SUPPORT })];
}

/* Rectangle centré sur (cx, cy). */
function ptsRectangle(l, h, cx = 0, cy = 0) {
  return [{ x: cx - l / 2, y: cy - h / 2 }, { x: cx + l / 2, y: cy - h / 2 }, { x: cx + l / 2, y: cy + h / 2 }, { x: cx - l / 2, y: cy + h / 2 }];
}

/* Octogone régulier à arêtes horizontales en haut et en bas (sommets à 22,5° + k·45°). */
function ptsOctogone(R) {
  const pts = [];
  for (let k = 0; k < 8; k++) { const a = (Math.PI / 8) + k * (Math.PI / 4); pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) }); }
  return pts;
}

/* Marque d'état : croix de dépose (à déposer, si `croix`) ou barre unique « \ » (à remplacer).
 * `demi` : demi-vecteur du centre vers le point visé de la forme dans la direction « \ » (bas-droit, y vers le bas) ;
 * la seconde branche de la croix est son symétrique (bas-gauche). Chaque branche déborde de `debord`. */
function marqueEtatSupport(etatObjet, demi, { centre = { x: 0, y: 0 }, croix = true } = {}) {
  const ES = CHARTE.etats_support;
  let K = null, branches = null;
  if (etatObjet === 'a_deposer' && croix) { K = ES.croix_depose; branches = [{ x: demi.x, y: demi.y }, { x: -demi.x, y: demi.y }]; }
  else if (etatObjet === 'a_reprendre') { K = ES.barre_remplacer; branches = [{ x: demi.x, y: demi.y }]; }
  if (!K) return [];
  return branches.map((v) => {
    const n = Math.hypot(v.x, v.y) || 1;
    const k = (n + K.debord) / n;
    return ligne(centre.x - v.x * k, centre.y - v.y * k, centre.x + v.x * k, centre.y + v.y * k, K.couleur, K.epaisseur, { bout: 'butt' });
  });
}

/* Console de façade : triangle isocèle pointe en haut, centré sur sa boîte englobante ; partage vertical par la pointe. */
function symboleConsole(etatObjet) {
  const K = CHARTE.supports.console;
  const b = K.base, h = K.hauteur;
  const pts = [{ x: 0, y: -h / 2 }, { x: b / 2, y: h / 2 }, { x: -b / 2, y: h / 2 }];
  return { prims: polygoneEtatSupport(pts, etatObjet, { x: 1, y: 0 }), dessus: [], rayon: Math.max(b / 2, h / 2), demi: { x: b / 2, y: h / 2 }, ext: { x: b / 2, y: h / 2 }, croix: false };
}

/* Ancrage en façade : platine (porte l'état) + arceau en U renversé, toujours noir à intérieur blanc. */
function symboleAncrage(etatObjet) {
  const K = CHARTE.supports.ancrage;
  const pw = K.platine_largeur, ph = K.platine_hauteur, aw = K.arceau_largeur, ah = K.arceau_hauteur, ae = K.arceau_epaisseur;
  const H = ah + ph;
  const yHaut = -H / 2, yPlatine = yHaut + ah;                 // bord supérieur de la platine
  const rc = Math.max(0.1, (aw - ae) / 2);                     // rayon de l'axe de l'arceau
  const yc = Math.min(yPlatine, yHaut + ae / 2 + rc);          // centre de l'arc
  // axe de l'arceau : pied gauche → arc → pied droit
  const axe = [{ x: -rc, y: yPlatine }, { x: -rc, y: yc }];
  for (let i = 1; i < 24; i++) { const a = Math.PI + (i / 24) * Math.PI; axe.push({ x: rc * Math.cos(a), y: yc + rc * Math.sin(a) }); }
  axe.push({ x: rc, y: yc }, { x: rc, y: yPlatine });
  const prims = [];
  // intérieur de l'arceau : blanc, quel que soit l'état
  prims.push(poly(axe, { ferme: true, couleur: null, epaisseur: 0, remplissage: FOND_SUPPORT }));
  prims.push(poly(axe, { ferme: false, couleur: '#000000', epaisseur: ae, remplissage: null }));
  // platine (dessinée après l'arceau : elle recouvre ses pieds) : partage diagonale bas-gauche → haut-droit, triangle bas-droit noir
  const locale = polygoneEtatSupport(ptsRectangle(pw, ph), etatObjet, { x: ph, y: pw });
  prims.push(...transformer(locale, { x: 0, y: yPlatine + ph / 2 }));
  return { prims, dessus: [], rayon: Math.max(pw / 2, H / 2), demi: { x: pw / 2, y: H / 2 }, ext: { x: pw / 2, y: H / 2 }, croix: false };
}

/* Symbole d'un support seul (sans renforcement).
 * Retourne { prims, dessus, rayon, demi, ext, croix } : `ext` = demi-étendue de la forme (boîte englobante) ; `dessus` est dessiné APRÈS la marque d'état (croix inscrite de la
 * poutrelle, qui doit rester entière sur le plein noir) ; `croix` = la croix de dépose s'applique à ce type. */
function symboleSupportSimple(a, etatObjet) {
  const S = CHARTE.supports;
  switch (a.materiau) {
    case 'BETON': {
      const l = a.classe === 'E' ? S.carre.cote : S.rectangle.largeur;
      const h = a.classe === 'E' ? S.carre.cote : S.rectangle.hauteur;
      return { prims: polygoneEtatSupport(ptsRectangle(l, h), etatObjet, { x: h, y: l }), dessus: [], rayon: l / 2, demi: { x: l / 2, y: h / 2 }, ext: { x: l / 2, y: h / 2 }, croix: true };
    }
    case 'BOIS': {
      const r = S.cercle.rayon;
      return { prims: cercleEtatSupport(r, etatObjet, { x: 1, y: 1 }), dessus: [], rayon: r, demi: { x: r / Math.SQRT2, y: r / Math.SQRT2 }, ext: { x: r, y: r }, croix: true };
    }
    case 'ME_TUB': {
      const R = S.octogone.rayon;
      return { prims: polygoneEtatSupport(ptsOctogone(R), etatObjet, { x: 0, y: 1 }), dessus: [], rayon: R, demi: { x: R / Math.SQRT2, y: R / Math.SQRT2 }, ext: { x: R * Math.cos(Math.PI / 8), y: R * Math.cos(Math.PI / 8) }, croix: true };
    }
    case 'ME_PTR': {
      const c = S.croix.cote, ep = S.croix.epaisseur_croix, d = c / 2;
      const prims = polygoneEtatSupport(ptsRectangle(c, c), etatObjet, { x: 1, y: 1 });
      const dessus = [];
      const croixDroite = (couleur, epaisseur) => [ligne(-d, 0, d, 0, couleur, epaisseur, { bout: 'butt' }), ligne(0, -d, 0, d, couleur, epaisseur, { bout: 'butt' })];
      if (etatObjet === 'a_deposer') dessus.push(...croixDroite('#FFFFFF', ep));
      else if (etatObjet === 'a_poser') dessus.push(...croixDroite('#FFFFFF', ep + 2 * CHARTE.etats_support.lisere_croix_ptr), ...croixDroite('#000000', ep));
      else dessus.push(...croixDroite('#000000', ep));
      // le contour du carré repasse sur les extrémités de la croix
      dessus.push(poly(ptsRectangle(c, c), { ferme: true, couleur: '#000000', epaisseur: C, remplissage: null }));
      return { prims, dessus, rayon: d, demi: { x: d, y: d }, ext: { x: d, y: d }, croix: true };
    }
    case 'CONSOLE': return symboleConsole(etatObjet);
    case 'ANCRAGE': return symboleAncrage(etatObjet);
    default: {
      // Support posé sans matériau connu : cercle générique + point central
      const r = S.generique.rayon;
      const prims = cercleEtatSupport(r, etatObjet, { x: 1, y: 1 });
      const dessus = [cercle(0, 0, 0.45, { couleur: null, epaisseur: 0, remplissage: etatObjet === 'a_deposer' ? '#FFFFFF' : '#000000' })];
      return { prims, dessus, rayon: r, demi: { x: r / Math.SQRT2, y: r / Math.SQRT2 }, ext: { x: r, y: r }, croix: true };
    }
  }
}

/* Support seul complet : corps, marque d'état, puis `dessus`. */
function supportSeulMarque(simple, etatObjet) {
  return [...simple.prims, ...marqueEtatSupport(etatObjet, simple.demi, { croix: simple.croix }), ...simple.dessus];
}

/* Boîte englobante de points. */
function boitePoints(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}

function symboleSupport(o) {
  const a = o.attributs || {};
  const simple = symboleSupportSimple(a, o.etat);
  const prims = [];
  const R = CHARTE.renforcements;
  const ang = ((a.angle_renforcement || 0) * Math.PI) / 180;   // 0° = vers le haut du symbole
  const dir = { x: Math.sin(ang), y: -Math.cos(ang) };
  const perp = { x: dir.y, y: -dir.x };
  let rayon = simple.rayon;
  // Console et ancrage : jamais de renforcement (v1.4.8)
  const renforcement = supportSansCaracteristiques(a.materiau) ? 'AUCUN' : a.renforcement;

  switch (renforcement) {
    case 'JUMELE': {
      const d = simple.rayon + R.jumele.ecart / 2;
      const un = supportSeulMarque(simple, o.etat);
      prims.push(...transformer(un, { x: -d, y: 0 }), ...transformer(un, { x: d, y: 0 }));
      rayon = d + simple.rayon;
      break;
    }
    case 'PORTIQUE': {
      const d = R.portique.ecart / 2;
      const un = supportSeulMarque(simple, o.etat);
      prims.push(ligne(-d, 0, d, 0, '#000', R.portique.epaisseur));
      prims.push(...transformer(un, { x: -d, y: 0 }), ...transformer(un, { x: d, y: 0 }));
      rayon = d + simple.rayon;
      break;
    }
    case 'CONTREFICHE': {
      // v10 §3.1 : la POINTE touche le symbole du support, la BASE est du côté du pied de la contrefiche.
      // v1.4.8 : triangle vide (existant, à remplacer) ou plein noir (à poser, à déposer) ; marque unique sur l'ensemble.
      const b = simple.rayon, L = R.contrefiche.longueur, w = R.contrefiche.base / 2;
      const pointe = { x: dir.x * b, y: dir.y * b };
      const base1 = { x: dir.x * (b + L) + perp.x * w, y: dir.y * (b + L) + perp.y * w };
      const base2 = { x: dir.x * (b + L) - perp.x * w, y: dir.y * (b + L) - perp.y * w };
      const plein = o.etat === 'a_poser' || o.etat === 'a_deposer';
      prims.push(...simple.prims);
      prims.push(poly([pointe, base1, base2], { ferme: true, couleur: '#000000', epaisseur: C, remplissage: plein ? PLEIN_SUPPORT : FOND_SUPPORT }));
      // boîte englobante de la forme du support + triangle
      const ex = simple.ext;
      const bx = boitePoints([pointe, base1, base2, { x: -ex.x, y: -ex.y }, { x: ex.x, y: ex.y }]);
      const centre = { x: (bx.x0 + bx.x1) / 2, y: (bx.y0 + bx.y1) / 2 };
      prims.push(...marqueEtatSupport(o.etat, { x: (bx.x1 - bx.x0) / 2, y: (bx.y1 - bx.y0) / 2 }, { centre, croix: simple.croix }));
      prims.push(...simple.dessus);
      rayon = b + L;
      break;
    }
    case 'HAUBANE': {
      // Tige et flèche pleine noire inchangées ; marque d'état sur le support seul.
      prims.push(...supportSeulMarque(simple, o.etat));
      const b = simple.rayon, L = R.hauban.longueur, t = R.hauban.tete;
      const p0 = { x: dir.x * b, y: dir.y * b }, p1 = { x: dir.x * (b + L), y: dir.y * (b + L) };
      prims.push(ligne(p0.x, p0.y, p1.x, p1.y, '#000', C + 0.1));
      prims.push(poly([
        { x: p1.x, y: p1.y },
        { x: p1.x - dir.x * t + perp.x * t * 0.45, y: p1.y - dir.y * t + perp.y * t * 0.45 },
        { x: p1.x - dir.x * t - perp.x * t * 0.45, y: p1.y - dir.y * t - perp.y * t * 0.45 }
      ], { ferme: true, couleur: '#000', epaisseur: C, remplissage: '#000' }));
      rayon = b + L;
      break;
    }
    default:
      prims.push(...supportSeulMarque(simple, o.etat));
  }
  return { prims, rayon };
}
/* ---------- Autres ponctuels ---------- */
function symboleCoffret(o) {
  const K = CHARTE.coffret;
  const gab = gabaritSigle(o.attributs.sigle, K);
  const l = gab.largeur, h = K.hauteur;
  const prims = formeEtat([{ x: -l / 2, y: -h / 2 }, { x: l / 2, y: -h / 2 }, { x: l / 2, y: h / 2 }, { x: -l / 2, y: h / 2 }], o.etat);
  prims.push(...sigleDans(gab, o.etat, '#000000', o.rotation || 0));
  return { prims, rayon: l / 2 };
}

function symbolePoste(o) {
  const K = CHARTE.poste;
  const gab = gabaritSigle(o.attributs.sigle, K);
  const l = gab.largeur, h = K.hauteur;
  const prims = formeEtat([{ x: -l / 2, y: -h / 2 }, { x: l / 2, y: -h / 2 }, { x: l / 2, y: h / 2 }, { x: -l / 2, y: h / 2 }], o.etat,
    { contour: K.couleur, couleurPlein: K.couleur, epaisseur: K.epaisseur });
  prims.push(...sigleDans(gab, o.etat, K.couleur, o.rotation || 0));
  return { prims, rayon: l / 2 };
}

function symboleBoiteJonction(o) {
  const K = CHARTE.boite_jonction;
  const couleur = couleurReseau(o.domaine, o.pose, o.etat);
  const pts = ellipsePoly(0, 0, K.rx, K.ry).points;
  const e = CHARTE.etats[o.etat] || CHARTE.etats.existant;
  const prims = [poly(pts, { ferme: true, couleur: null, epaisseur: 0, remplissage: couleur })];
  if (o.etat === 'a_deposer') prims.push(...hachurerPolygone(pts, e.hachures));
  prims.push(poly(pts, { ferme: true, couleur: '#000', epaisseur: C, remplissage: null }));
  return { prims, rayon: K.rx };
}

/* Symbole de terre IEC 60417-5019 : tige de (dx, dy - tige) à (dx, dy), puis trois barres décroissantes.
 * `couleur` (v1.5.1) : null = couleur de la charte (noir), sinon couleur de la catégorie de MALT. */
export function symboleMalt(dx = 0, dy = 0, tige = null, couleur = null) {
  const K = CHARTE.malt;
  const c = couleur || K.couleur;
  const t = Math.min(K.tige_max, Math.max(K.tige_min, tige === null || tige === undefined ? K.hauteur_trait : Number(tige)));
  const prims = [ligne(dx, dy - t, dx, dy, c, K.epaisseur)];
  K.largeurs.forEach((l, i) => { const y = dy + i * K.ecart_barres; prims.push(ligne(dx - l / 2, y, dx + l / 2, y, c, K.epaisseur)); });
  return prims;
}

/* v1.5.4 (H-305) — Plan de situation : cadre de la partie visible de la carte, puis rond rouge à fond transparent
 * centré sur le point GPS (centre de l'image entière, donc fixe quels que soient taille, rotation et rognage). Le
 * diamètre est en mm papier (`situation.diametre_mm`), indépendant de la taille de la carte. */
export function primitivesSituation(o) {
  const S = CHARTE.situation;
  const v = rectangleVisibleDe(o.x, o.y, o.largeur || 0, o.hauteur || 0, o.rotation || 0, o.recadrage);
  const prims = [poly(coinsRectangleTourne(v.cx, v.cy, v.l, v.h, o.rotation || 0), { ferme: true, couleur: S.cadre.couleur, epaisseur: S.cadre.epaisseur_mm * MM, remplissage: null })];
  const d = Number(o.situation && o.situation.diametre_mm);
  const dm = Math.min(S.rond.diametre_max_mm, Math.max(S.rond.diametre_min_mm, Number.isFinite(d) ? d : S.rond.diametre_mm));
  prims.push(cercle(o.x, o.y, (dm * MM) / 2, { couleur: S.rond.couleur, epaisseur: S.rond.epaisseur_mm * MM, remplissage: null }));
  return prims;
}

/* v1.5.1 — Couleur de l'objet MALT (outil 8) : grise s'il est existant ou à déposer, sinon couleur du réseau
 * (BT bleu, HTA rouge) — même règle que le symbole porté par un ouvrage (H-293). */
export function couleurObjetMalt(o) {
  return couleurMalt(categorieMalt(o.etat === 'existant' || o.etat === 'a_deposer', o.domaine));
}

/* v1.5.2 — Géométrie du symbole MALT porté par un ouvrage : la tige part du CENTRE du symbole de l'ouvrage, orientée par
 * `angle` (degrés, 0 = vers le bas, sens horaire comme `rotation`). Facteur d'échelle du plan seul (comme la MALT
 * d'ERAS). Longueur locale bornée en bas par le rayon de l'ouvrage + dépassement minimal : les barres sortent toujours
 * du symbole. Retourne { centre, angle, tige, tigeMin, echelle, couleur, pied, direction } ou null. `rayonHote` : rayon
 * du symbole de l'ouvrage (unités plan). */
export function geometrieSymboleMalt(o, reglages = { echelle_symbole: 1 }, rayonHote = null) {
  if (!symboleMaltActif(o)) return null;
  const K = CHARTE.malt;
  const m = o.malt_symbole;
  const echelle = (reglages.echelle_symbole || 1) * compensationRendu(o).symbole || 1;
  const centre = centreSymbole(o);
  const rLocal = (rayonHote === null ? 6 : rayonHote) / echelle;
  const tigeMin = Math.min(K.tige_max, rLocal + K.depassement_min);
  const brut = m.longueur_tige === null || m.longueur_tige === undefined || !Number.isFinite(Number(m.longueur_tige)) ? rLocal + K.depassement_defaut : Number(m.longueur_tige);
  const tige = Math.min(K.tige_max, Math.max(tigeMin, brut));
  const angle = Number.isFinite(Number(m.angle)) ? Number(m.angle) : 0;
  const a = (angle * Math.PI) / 180;
  const direction = { x: -Math.sin(a), y: Math.cos(a) };
  const pied = { x: centre.x + direction.x * tige * echelle, y: centre.y + direction.y * tige * echelle };
  return { centre, angle, tige, tigeMin, echelle, couleur: couleurMalt(categorieMaltHote(o)), pied, direction, auto: m.longueur_tige === null || m.longueur_tige === undefined };
}

/* ERAS : le rond seul ; la MALT (tige depuis le centre du rond, longueur propre) est ajoutée par primitivesObjet
 * avec son propre facteur, pour qu'agrandir le rond ne rallonge pas la tige (v12 §5.4.2). */
function symboleEras(o) {
  const K = CHARTE.eras;
  const couleur = couleurReseau(o.domaine, o.pose, o.etat);
  const prims = cercleEtat(K.rayon, o.etat, { contour: couleur, couleurPlein: couleur });
  // v1.4.9 (H-263) : couleur fluo (jaune BT existant, orange BRT à poser…) → liseré sombre autour du rond, comme les tracés
  if (besoinLisere(couleur)) prims.unshift(cercle(0, 0, K.rayon, { couleur: CHARTE.lisere.couleur, epaisseur: C + CHARTE.lisere.surepaisseur, remplissage: null }));
  return { prims, rayon: K.rayon };
}

/* Longueur de tige d'une ERAS, bornée. */
export function tigeEras(o) {
  const K = CHARTE.eras;
  const t = o.attributs && o.attributs.longueur_tige;
  return Math.min(K.tige_max, Math.max(K.tige_min, t === null || t === undefined ? K.tige_defaut : Number(t)));
}

/* ---------- Éclairage public : lanterne et boucle (v12 §7) ---------- */
/* Lanterne : console horizontale partant du point d'ancrage, tête (trapèze) à son extrémité ; orientable, couleur EP. */
function symboleLanterneEp(o) {
  const K = CHARTE.eclairage.lanterne;
  const couleur = couleurReseau('EP', 'aerien', o.etat);
  const prims = [];
  const c = K.console, lt = K.tete_largeur, ht = K.tete_hauteur;
  // console : de l'ancrage (0,0) vers la droite
  prims.push(ligne(0, 0, c, 0, couleur, K.epaisseur));
  // tête : trapèze centré au bout de la console, plus large vers le bas (vasque)
  const tete = [{ x: c - lt * 0.3, y: -ht * 0.35 }, { x: c + lt * 0.3, y: -ht * 0.35 }, { x: c + lt / 2, y: ht * 0.65 }, { x: c - lt / 2, y: ht * 0.65 }];
  prims.push(...formeEtat(tete, o.etat, { contour: couleur, couleurPlein: couleur, epaisseur: K.epaisseur * 0.8 }));
  // point d'accrochage sur le support
  prims.push(cercle(0, 0, 0.8, { couleur: null, epaisseur: 0, remplissage: couleur }));
  return { prims, rayon: c + lt / 2 };
}

/* Boucle de câble : spirale ouverte (1,5 tour) figurée sur le tracé ou sur le support ; couleur EP ; hachures si à déposer. */
function symboleBoucleEp(o) {
  const K = CHARTE.eclairage.boucle;
  const couleur = couleurReseau('EP', 'aerien', o.etat);
  const pts = [];
  const n = Math.round(36 * K.tours);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = -Math.PI / 2 + t * K.tours * Math.PI * 2;
    const r = K.rayon * (0.55 + 0.45 * t);
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  // entrée et sortie du câble, tangentes horizontales
  const prims = [poly([{ x: -K.rayon * 1.6, y: 0 }, { x: -K.rayon * 0.55, y: 0 }], { couleur, epaisseur: K.epaisseur })];
  prims.push(poly(pts, { couleur, epaisseur: K.epaisseur, joint: 'round' }));
  const fin = pts[pts.length - 1];
  prims.push(poly([{ x: fin.x, y: fin.y }, { x: fin.x + K.rayon * 1.1, y: fin.y }], { couleur, epaisseur: K.epaisseur }));
  if (o.etat === 'a_poser') prims.push(cercle(0, 0, K.rayon * 0.3, { couleur: null, epaisseur: 0, remplissage: couleur }));
  if (o.etat === 'a_deposer') prims.push(...hachurerPolyligne(pts, { pas: 2.2, longueur: 2, epaisseur: 0.4, couleur: '#000000', angle_deg: 60 }));
  if (o.etat === 'a_reprendre') prims.push(poly(pts, { couleur: CHARTE.a_reprendre_troncon.couleur, epaisseur: CHARTE.a_reprendre_troncon.epaisseur, tirete: CHARTE.a_reprendre_troncon.tirete }));
  return { prims, rayon: K.rayon * 1.6 };
}

function symbolePointLumineux(o) {
  const K = CHARTE.eclairage.point_lumineux;
  const prims = [];
  for (let i = 0; i < K.nb_rayons; i++) {
    const a = (i / K.nb_rayons) * Math.PI * 2;
    prims.push(ligne(Math.cos(a) * K.rayon, Math.sin(a) * K.rayon, Math.cos(a) * K.rayon_rayons, Math.sin(a) * K.rayon_rayons, '#000', C));
  }
  prims.push(...cercleEtat(K.rayon, o.etat));
  return { prims, rayon: K.rayon_rayons };
}

function symboleArmoireEp(o) {
  const K = CHARTE.eclairage.armoire;
  const gab = gabaritSigle(o.attributs.sigle || 'S17', K);
  const l = gab.largeur, h = K.hauteur;
  const prims = formeEtat([{ x: -l / 2, y: -h / 2 }, { x: l / 2, y: -h / 2 }, { x: l / 2, y: h / 2 }, { x: -l / 2, y: h / 2 }], o.etat);
  prims.push(...sigleDans(gab, o.etat, '#000000', o.rotation || 0));
  return { prims, rayon: l / 2 };
}

/* ---------- Tronçons ---------- */
/* ---------- Géométrie des polylignes ---------- */
export function longueurPolyligne(pts) {
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return L;
}

/* Point à l'abscisse curviligne s (fraction 0..1) et direction locale. */
export function pointSurPolyligne(pts, s) {
  const L = longueurPolyligne(pts);
  let d = Math.max(0, Math.min(1, s)) * L;
  for (let i = 0; i + 1 < pts.length; i++) {
    const seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (d <= seg || i === pts.length - 2) {
      const t = seg ? d / seg : 0;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
        ux: seg ? (pts[i + 1].x - pts[i].x) / seg : 1, uy: seg ? (pts[i + 1].y - pts[i].y) / seg : 0, index: i };
    }
    d -= seg;
  }
  return { x: pts[0].x, y: pts[0].y, ux: 1, uy: 0, index: 0 };
}

/* Abscisse curviligne (0..1) du point de la polyligne le plus proche de p. */
export function abscisseSurPolyligne(pts, p) {
  const L = longueurPolyligne(pts) || 1;
  let best = Infinity, sBest = 0, cumul = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    const seg = Math.sqrt(l2);
    if (d < best) { best = d; sBest = (cumul + t * seg) / L; }
    cumul += seg;
  }
  return sBest;
}

/* Portion de polyligne entre deux abscisses curvilignes (0..1). */
export function portionPolyligne(pts, s0, s1) {
  const a = Math.min(s0, s1), b = Math.max(s0, s1);
  const pa = pointSurPolyligne(pts, a), pb = pointSurPolyligne(pts, b);
  const res = [{ x: pa.x, y: pa.y }];
  for (let i = pa.index + 1; i <= pb.index; i++) res.push({ x: pts[i].x, y: pts[i].y });
  res.push({ x: pb.x, y: pb.y });
  return res;
}

/* Polyligne décalée d'une distance d (à gauche pour d < 0, à droite pour d > 0), jointure en onglet limitée. */
export function decalerPolyligne(pts, d) {
  const n = pts.length;
  if (n < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const normales = [];
  for (let i = 0; i + 1 < n; i++) {
    const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y, l = Math.hypot(dx, dy) || 1;
    normales.push({ x: -dy / l, y: dx / l });
  }
  const res = [];
  for (let i = 0; i < n; i++) {
    let nx, ny;
    if (i === 0) { nx = normales[0].x; ny = normales[0].y; }
    else if (i === n - 1) { nx = normales[n - 2].x; ny = normales[n - 2].y; }
    else {
      nx = normales[i - 1].x + normales[i].x; ny = normales[i - 1].y + normales[i].y;
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const cos = nx * normales[i].x + ny * normales[i].y;
      const f = 1 / Math.max(0.35, cos);   // onglet limité
      nx *= f; ny *= f;
    }
    res.push({ x: pts[i].x + nx * d, y: pts[i].y + ny * d });
  }
  return res;
}

/* Point milieu (en longueur) d'une polyligne et direction locale. */
export function milieuPolyligne(pts) {
  return pointSurPolyligne(pts, 0.5);
}

/* ---------- Tronçons ---------- */
export function primitivesTroncon(o) {
  const s = styleTroncon(o.domaine, o.pose, o.etat, o.couleur_manuelle);   // couleur manuelle : v1.4.9 §4
  const e = echelleLineaire(o);
  const pts = o.points;
  const prims = [];
  const tirete = s.tirete ? s.tirete.map((v) => v * e) : null;
  if (s.fluo) prims.push(poly(pts, { couleur: CHARTE.lisere.couleur, epaisseur: (s.epaisseur + CHARTE.lisere.surepaisseur) * e, tirete, joint: 'round' }));
  prims.push(poly(pts, { couleur: s.couleur, epaisseur: s.epaisseur * e, tirete, joint: 'round' }));
  if (s.hachure) prims.push(...hachurerPolyligne(pts, echelleHachures(CHARTE.hachures_troncon, e)));
  if (s.reprendre) prims.push(poly(pts, { couleur: CHARTE.a_reprendre_troncon.couleur, epaisseur: CHARTE.a_reprendre_troncon.epaisseur * e, tirete: CHARTE.a_reprendre_troncon.tirete.map((v) => v * e) }));
  return prims;
}

function echelleLineaire(o) {
  const K = CHARTE.echelle_lineaire;
  return Math.min(K.max, Math.max(K.min, o.echelle_symbole || 1)) * compensationRendu(o).symbole;
}

/* Facteur de rendu d'un symbole ponctuel, d'une annotation ou d'une note : réglage du plan × échelle propre × origine / courant (v12 §1.1). */
export function facteurSymbole(o, reglages) {
  const K = CHARTE.echelle_symbole;
  const propre = Math.min(K.max, Math.max(K.min, o.echelle_symbole || 1));
  return (reglages.echelle_symbole || 1) * propre * compensationRendu(o).symbole;
}

/* Rectangle à angles arrondis (polygone). */
export function rectArrondi(x, y, l, h, r, options = {}) {
  const rr = Math.max(0, Math.min(r, l / 2, h / 2));
  if (!rr) return rect(x, y, l, h, options);
  const pts = [];
  const coin = (cx, cy, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); pts.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) }); } };
  coin(x + l - rr, y + rr, -Math.PI / 2);
  coin(x + l - rr, y + h - rr, 0);
  coin(x + rr, y + h - rr, Math.PI / 2);
  coin(x + rr, y + rr, Math.PI);
  return poly(pts, { ferme: true, ...options });
}
function echelleHachures(h, e) {
  return { ...h, pas: h.pas * e, longueur: h.longueur * e, epaisseur: h.epaisseur * e };
}

/* ---------- Fourreaux ---------- */
/* Polyligne effective d'un fourreau : portion du tronçon parent, ou sa propre géométrie. */
export function pointsFourreau(o) {
  if (o.troncon_id) {
    const parent = objetRendu(o.troncon_id);
    if (parent && parent.points && parent.points.length > 1) return portionPolyligne(parent.points, o.s_debut, o.s_fin);
  }
  return o.points || [];
}

export function primitivesFourreau(o) {
  const pts = pointsFourreau(o);
  if (pts.length < 2) return [];
  const K = CHARTE.fourreau;
  const e = echelleLineaire(o);
  const couleur = couleurFourreau(o);   // charte (matière × état) ou couleur manuelle (v1.4.9 §4, §5)
  const lisere = besoinLisere(couleur, !!couleurManuelleValide(o.couleur_manuelle));
  const d = K.ecartement * e;
  const gauche = decalerPolyligne(pts, -d), droite = decalerPolyligne(pts, d);
  const prims = [];
  for (const ligneF of [gauche, droite]) {
    if (lisere) prims.push(poly(ligneF, { couleur: CHARTE.lisere.couleur, epaisseur: (K.epaisseur + CHARTE.lisere.surepaisseur) * e, tirete: K.tirete.map((v) => v * e), joint: 'round' }));
    prims.push(poly(ligneF, { couleur, epaisseur: K.epaisseur * e, tirete: K.tirete.map((v) => v * e), joint: 'round' }));
    if (o.etat === 'a_deposer') prims.push(...hachurerPolyligne(ligneF, echelleHachures({ ...CHARTE.hachures_troncon, longueur: 3 }, e)));
    if (o.etat === 'a_reprendre') prims.push(poly(ligneF, { couleur: CHARTE.a_reprendre_troncon.couleur, epaisseur: CHARTE.a_reprendre_troncon.epaisseur * e, tirete: CHARTE.a_reprendre_troncon.tirete.map((v) => v * e) }));
  }
  // Un fourreau vide se dessine pareil, sans trait d'axe (rien à ajouter) ; sur un tronçon, le câble est dessiné au-dessus.
  return prims;
}

/* ---------- Notes ---------- */
/* Segments d'une note mise en forme (v1.4.6 §1), ou null. Garde-fou : ils ne sont suivis que s'ils redonnent
 * exactement `texte`, qui reste la source pour la recherche, la légende et la compatibilité. */
export function segmentsNote(o) {
  if (!o || !Array.isArray(o.segments) || !o.segments.length) return null;
  return texteDesSegments(o.segments) === (o.texte || '') ? o.segments : null;
}

/* Bloc texte d'une note. Une note sans mise en forme et alignée à gauche passe par blocTexte, exactement comme avant
 * la v1.4.6 ; sinon blocTexteRiche (mêmes origine, cadre, fond et rotation). */
function blocNote(o) {
  const K = CHARTE.notes;
  const e = facteurSymbole(o, { echelle_symbole: 1 });   // échelle propre de la note (poignée / menu), sans le réglage global des symboles
  const fond = o.fond === 'blanc' ? '#FFFFFF' : (o.fond === 'aucun' || o.fond === false ? null : K.fond);
  const cadre = o.cadre && o.cadre !== 'aucun' ? K.cadre.couleur : null;
  const opts = {
    taille: (o.taille || K.taille_defaut) * e, couleur: o.couleur || K.couleur_defaut,
    fond, cadre, marge: K.cadre.marge * e,
    rotation: o.rotation || 0, epaisseur_cadre: K.cadre.epaisseur, rayon_cadre: o.cadre === 'arrondi' ? K.cadre.rayon_arrondi * e : 0
  };
  const riche = segmentsNote(o);
  const alignement = o.alignement || 'gauche';
  if (o.texte && (riche || alignement !== 'gauche')) {
    const lignes = riche || String(o.texte).split('\n').map((t) => [{ t }]);
    return { bloc: blocTexteRiche(o.x, o.y, lignes, { ...opts, alignement }), e };
  }
  return { bloc: blocTexte(o.x, o.y, o.texte || '…', { ...opts, ancre: 'debut' }), e };
}

function primitivesNote(o, reglages = { echelle_symbole: 1 }) {
  const K = CHARTE.notes;
  void reglages;
  const { bloc } = blocNote(o);
  const prims = [...bloc.prims];
  if (o.fleche) {
    let depart;
    if (o.fleche_depart === 'coin') {
      // Étiquette fléchée (v1.4.6 §4) : coin du cadre situé du côté de la pointe, dans le repère de la note
      const c = { x: o.x, y: o.y };
      depart = tourner(coinDepartFleche(bloc.boite, versLocal(o.fleche, c, o.rotation || 0)), c, o.rotation || 0);
    } else {
      const a = ((o.rotation || 0) * Math.PI) / 180;
      depart = { x: o.x + Math.cos(a) * (-K.cadre.marge) - Math.sin(a) * (bloc.hauteur / 2), y: o.y + Math.sin(a) * (-K.cadre.marge) + Math.cos(a) * (bloc.hauteur / 2) };
    }
    prims.push(...primitivesFleche(depart, o.fleche, o.couleur || K.couleur_defaut, K.fleche.epaisseur, K.fleche.tete, false));
  }
  return { prims, boite: bloc.boite };
}

/* Pointe initiale d'une étiquette fléchée, une fois le texte connu : au-delà du coin bas-droit du cadre. */
export function pointeEtiquetteParDefaut(o) {
  const { bloc, e } = blocNote(o);
  const b = bloc.boite, d = CHARTE.etiquette_flechee.pointe_mm * MM * e;
  return tourner({ x: b.x + b.l + d, y: b.y + b.h + d }, { x: o.x, y: o.y }, o.rotation || 0);
}

/* Flèche de p1 vers p2 (pointe en p2 ; double = pointe aussi en p1). */
function primitivesFleche(p1, p2, couleur, epaisseur, tete, double) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const prims = [ligne(p1.x, p1.y, p2.x, p2.y, couleur, epaisseur)];
  const pointe = (p, sx, sy) => poly([
    { x: p.x, y: p.y },
    { x: p.x - sx * tete - sy * tete * 0.42, y: p.y - sy * tete + sx * tete * 0.42 },
    { x: p.x - sx * tete + sy * tete * 0.42, y: p.y - sy * tete - sx * tete * 0.42 }
  ], { ferme: true, couleur: null, epaisseur: 0, remplissage: couleur });
  prims.push(pointe(p2, ux, uy));
  if (double) prims.push(pointe(p1, -ux, -uy));
  return prims;
}

/* ---------- Blocs d'étiquette réglables (v11 §2) ---------- */
/* Mots insécables d'un texte : découpe aux espaces, sauf à l'intérieur des groupes de charte.texte.groupes_insecables
 * (nombre + unité, « 3 x 70 + 54,6 », « déposer — 60 m », « à déposer », « Nu ≥ 22 mm² »…) — v1.4.9 §2.3. */
export function motsInsecables(texte) {
  const s = String(texte);
  const proteges = new Array(s.length).fill(false);
  for (const src of CHARTE.texte.groupes_insecables || []) {
    const re = new RegExp(src, 'gu');
    let m;
    while ((m = re.exec(s)) !== null) {
      if (!m[0].length) { re.lastIndex++; continue; }
      for (let i = m.index; i < m.index + m[0].length; i++) proteges[i] = true;
    }
  }
  const mots = [];
  let courant = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ' ' && !proteges[i]) { if (courant) mots.push(courant); courant = ''; }
    else courant += s[i];
  }
  if (courant) mots.push(courant);
  return mots;
}

/* Mode de retour à la ligne effectif d'un bloc : 'auto' | 'jamais' (v1.4.9 §2.2). */
export function modeRetourLigne(bloc, objet) {
  const v = bloc && bloc.retour_ligne;
  if (v === 'auto' || v === 'jamais') return v;
  const D = CHARTE.texte.retour_ligne_defaut;
  return objet && (objet.type === 'troncon' || objet.type === 'fourreau') ? D.lineaire : D.ponctuel;
}

/* Coupe un texte en lignes de largeur maximale (retour à la ligne aux espaces, groupes insécables respectés).
 * mode 'jamais' : une seule ligne, quelle que soit la largeur. */
export function couperLignes(texte, taille, largeurMax, mode = 'auto') {
  if (mode === 'jamais') return String(texte) ? [String(texte)] : [];
  const mots = motsInsecables(texte);
  const lignes = [];
  let courante = '';
  for (const m of mots) {
    const essai = courante ? courante + ' ' + m : m;
    if (courante && mesurerTexte(essai, taille) > largeurMax) { lignes.push(courante); courante = m; }
    else courante = essai;
  }
  if (courante) lignes.push(courante);
  return lignes;
}

/* Rotation effective d'un bloc : retournement de 180° au-delà de 90° pour rester lisible. */
export function rotationLisible(rotation, retourner = true) {
  let r = ((rotation || 0) % 360 + 360) % 360;
  if (retourner !== false && CHARTE.bloc_etiquette.retournement_auto && r > 90 && r < 270) r = (r + 180) % 360;
  return r;
}

function echelleBloc(bloc, o = null) {
  const K = CHARTE.bloc_etiquette;
  return Math.min(K.echelle_max, Math.max(K.echelle_min, (bloc && bloc.echelle) || 1)) * (o ? compensationRendu(o).texte : 1);
}

/* Construit un bloc de lignes de texte [{texte, taille}] dont le coin haut-gauche (avant rotation) est en (x, y).
 * Retourne { prims, boite (englobante après rotation), centre, largeur, hauteur, rotation }. */
export function blocLignes(x, y, lignes, { bloc = null, objet = null, fond = CHARTE.texte.fond_etiquette, couleur = CHARTE.texte.couleur, marge = CHARTE.texte.marge_etiquette, interligne = CHARTE.texte.interligne, interligneSuite = CHARTE.texte.interligne_materiel, largeurMax = CHARTE.texte.largeur_max_etiquette } = {}) {
  const ech = echelleBloc(bloc, objet);
  const T = CHARTE.texte;
  // Cadre et fond du bloc (v12 §3.2) : translucide (défaut) / blanc opaque / transparent ; aucun / rectangle / arrondi
  if (bloc && bloc.fond === 'blanc') fond = '#FFFFFF';
  else if (bloc && bloc.fond === 'transparent') fond = null;
  const cadre = bloc && bloc.cadre && bloc.cadre !== 'aucun' ? (bloc.couleur_cadre || T.couleur_cadre_defaut) : null;
  if (bloc && bloc.couleur_texte) couleur = bloc.couleur_texte;   // couleur du texte du bloc (v13.3 §3.1)
  const rotation = rotationLisible(bloc ? bloc.rotation : 0, bloc ? bloc.retourner : true);
  const mode = modeRetourLigne(bloc, objet);   // v1.4.9 §2
  const textes = [];
  for (const l of lignes) {
    const taille = l.taille * ech;
    for (const sl of couperLignes(l.texte, taille, largeurMax * ech, mode)) textes.push({ texte: sl, taille });
  }
  if (!textes.length) return { prims: [], boite: null, centre: null, largeur: 0, hauteur: 0, rotation };
  const largeur = Math.max(...textes.map((t) => mesurerTexte(t.texte, t.taille)));
  let hauteur = 0;
  textes.forEach((t, i) => { hauteur += t.taille * (i === 0 ? interligne : interligneSuite) + (i ? 0.5 * ech : 0); });
  const m = marge * ech;
  const l = largeur + 2 * m, h = hauteur + 2 * m;
  const centre = { x: x + l / 2, y: y + h / 2 };
  // Primitives locales centrées, puis rotation autour du centre
  const prims = [];
  if (fond || cadre) {
    const opt = { couleur: cadre, epaisseur: cadre ? T.epaisseur_cadre : 0, remplissage: fond };
    prims.push(bloc && bloc.cadre === 'arrondi' ? rectArrondi(-l / 2, -h / 2, l, h, T.rayon_cadre * ech, opt) : rect(-l / 2, -h / 2, l, h, opt));
  }
  let yy = -h / 2 + m;
  textes.forEach((t, i) => {
    yy += (i ? 0.5 * ech : 0);
    prims.push(texte(-l / 2 + m, yy + t.taille * 0.95, t.texte, { taille: t.taille, couleur, ancre: 'debut', rotation: 0, suivre_rotation: true }));
    yy += t.taille * (i === 0 ? interligne : interligneSuite);
  });
  const res = transformer(prims, { x: centre.x, y: centre.y, rotation, echelle: 1 });
  return { prims: res, boite: boite(res) || { x, y, l, h }, centre, largeur: l, hauteur: h, rotation, coins: coinsRect(centre, l, h, rotation) };
}

function coinsRect(c, l, h, rotation) {
  const a = (rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const p = (dx, dy) => ({ x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos });
  return { hg: p(-l / 2, -h / 2), hd: p(l / 2, -h / 2), bd: p(l / 2, h / 2), bg: p(-l / 2, h / 2) };
}

/* Lignes du bloc de désignation : désignation (+ « ex »), armement abrégé ; pour les linéaires : étiquette + mention. */
function lignesDesignation(o, reglages) {
  const T = CHARTE.texte, f = reglages.taille_texte || 1;
  const lignes = [];
  if (o.type === 'troncon' || o.type === 'fourreau') {
    const t = etiquetteTroncon(o, reglages);
    if (t) lignes.push({ texte: t, taille: T.taille_etiquette * f });
    if (o.mention) lignes.push({ texte: o.mention, taille: T.taille_etiquette_secondaire * f });
    return lignes;
  }
  const d = designationAffichee(o);
  if (d) lignes.push({ texte: d, taille: T.taille_etiquette * f });
  if (o.type === 'support') {
    const ang = formaterAngle(o.attributs.angle_gr);   // « φ = 45 gr », ligne propre sous la désignation (v12 §6)
    if (ang) lignes.push({ texte: ang, taille: T.taille_etiquette_secondaire * f });
    // v1.4.8 : pour un ancrage en façade, le type est déjà dans la désignation (« Ancrage EAF ») — pas de ligne d'armement
    if (o.attributs.armement && o.attributs.materiau !== 'ANCRAGE') lignes.push({ texte: ABREVIATIONS_ETIQUETTE[o.attributs.armement_ref] || o.attributs.armement, taille: T.taille_etiquette_secondaire * f });
  }
  return lignes;
}

/* Lignes du bloc matériel : une par matériel associé (abrégé, MALT condensé) puis la mention libre. */
function lignesMateriel(o, reglages) {
  const T = CHARTE.texte, f = reglages.taille_texte || 1;
  const lignes = lignesMaterielEtiquette(o).map((t) => ({ texte: t, taille: T.taille_etiquette_secondaire * f }));
  if (o.mention) lignes.push({ texte: o.mention, taille: T.taille_etiquette_secondaire * f });
  return lignes;
}

/* Ancrage par défaut du bloc de désignation (coin haut-gauche avant rotation). */
function ancreDesignation(o, rayon, centre) {
  const T = CHARTE.texte;
  if (o.type === 'troncon' || o.type === 'fourreau') {
    const pts = o.type === 'fourreau' ? pointsFourreau(o) : o.points;
    if (pts.length < 2) return { x: o.x || 0, y: o.y || 0 };
    const m = milieuPolyligne(pts);
    return { x: m.x + (o.etiquette.dx ?? 0) - m.uy * 3, y: m.y + (o.etiquette.dy ?? 0) + m.ux * 3 - T.taille_etiquette };
  }
  const c = centre || { x: o.x, y: o.y };
  return { x: c.x + rayon + T.marge_etiquette + (o.etiquette.dx ?? T.decalage_etiquette.dx), y: c.y + (o.etiquette.dy ?? T.decalage_etiquette.dy) };
}

/* Bloc de désignation. */
export function primitivesEtiquette(o, reglages, rayon = 0, centre = null) {
  const vide = { prims: [], boite: null, centre: null, hauteur: 0, ancre: null };
  if (!o.etiquette || o.etiquette.visible === false) return { ...vide, ancre: ancreDesignation(o, rayon, centre) };
  const lignes = lignesDesignation(o, reglages);
  const ancre = ancreDesignation(o, rayon, centre);
  if (!lignes.length) return { ...vide, ancre };
  const b = blocLignes(ancre.x, ancre.y, lignes, { bloc: o.etiquette, objet: o });
  return { prims: b.prims, boite: b.boite, centre: b.centre, hauteur: b.hauteur, largeur: b.largeur, coins: b.coins, rotation: b.rotation, ancre };
}

/* Bloc matériel + mention, sous le bloc de désignation par défaut. */
export function primitivesMateriel(o, reglages, ancreDesig, hauteurDesig) {
  if (!o.materiel || o.materiel.visible === false) return { prims: [], boite: null, centre: null };
  if (o.type === 'troncon' || o.type === 'fourreau' || o.type === 'note' || o.type === 'annotation' || o.type === 'masque') return { prims: [], boite: null, centre: null };
  const lignes = lignesMateriel(o, reglages);
  if (!lignes.length) return { prims: [], boite: null, centre: null };
  const x = ancreDesig.x + (o.materiel.dx || 0);
  const y = ancreDesig.y + (hauteurDesig ? hauteurDesig + 0.6 : 0) + (o.materiel.dy || 0);
  const b = blocLignes(x, y, lignes, { bloc: o.materiel, objet: o });
  return { prims: b.prims, boite: b.boite, centre: b.centre, coins: b.coins, rotation: b.rotation };
}

/* Cartouche de repère : cercle, contour / texte / fond réglables (v10 §4.4, v11 §2.3). */
export function primitivesCartouche(o, reglages, rayon, centre) {
  if (o.type === 'troncon' || o.type === 'note' || o.type === 'annotation' || o.type === 'fourreau' || o.type === 'masque') return { prims: [], boite: null };
  if (!o.repere || !o.cartouche || o.cartouche.visible === false) return { prims: [], boite: null };
  const K = CHARTE.cartouche;
  const f = (reglages.taille_texte || 1) * echelleBloc(o.cartouche, o);
  const taille = K.taille_texte * f;
  const largeur = mesurerTexte(o.repere, taille);
  const r = Math.max(K.rayon_min * f, largeur / 2 + K.marge * f);
  const cx = centre.x + rayon + r + (o.cartouche.dx ?? K.decalage.dx);
  const cy = centre.y - rayon - r + (o.cartouche.dy ?? K.decalage.dy);
  const rot = rotationLisible(o.cartouche.rotation, o.cartouche.retourner);
  const fond = o.cartouche.fond === 'transparent' ? null : K.fond;
  const local = [
    cercle(0, 0, r, { couleur: o.cartouche.couleur_contour || K.contour, epaisseur: K.epaisseur, remplissage: fond }),
    texte(0, taille * 0.36, o.repere, { taille, couleur: o.cartouche.couleur_texte || '#000000', ancre: 'milieu', suivre_rotation: true })
  ];
  const prims = transformer(local, { x: cx, y: cy, rotation: rot, echelle: 1 });
  return { prims, boite: { x: cx - r, y: cy - r, l: 2 * r, h: 2 * r }, centre: { x: cx, y: cy }, rayon: r, rotation: rot };
}

/* ---------- Annotations (v11 §6) ---------- */
function reserveTexte(c, angle, t, taille, couleur) {
  const K = CHARTE.annotations.reserve_texte;
  const l = mesurerTexte(t, taille) + 2 * K.marge, h = taille * 1.25 + 2 * K.marge;
  const rot = rotationLisible(angle, true);
  const local = [rect(-l / 2, -h / 2, l, h, { couleur: null, epaisseur: 0, remplissage: K.fond }),
    texte(0, taille * 0.36, t, { taille, couleur, ancre: 'milieu', suivre_rotation: true })];
  return transformer(local, { x: c.x, y: c.y, rotation: rot, echelle: 1 });
}

/* Simplification de Douglas-Peucker (tolérance en unités plan). */
export function simplifierPolyligne(pts, tol) {
  if (pts.length < 3) return pts.map((p) => ({ x: p.x, y: p.y }));
  const garder = new Array(pts.length).fill(false);
  garder[0] = garder[pts.length - 1] = true;
  const pile = [[0, pts.length - 1]];
  while (pile.length) {
    const [a, b] = pile.pop();
    let dmax = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distanceSegment(pts[i], pts[a], pts[b]);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > tol && idx > 0) { garder[idx] = true; pile.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => garder[i]).map((p) => ({ x: p.x, y: p.y }));
}
function distanceSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/* Taille de texte par défaut d'une annotation à texte (charte), avant échelle. */
export function tailleTexteAnnotation(o) {
  const A = CHARTE.annotations;
  if (o.taille_texte !== null && o.taille_texte !== undefined && o.taille_texte !== '') return Math.min(A.taille_texte_max, Math.max(A.taille_texte_min, Number(o.taille_texte)));
  return { rond_texte: A.rond_texte.taille_texte, cotation: A.cotation.taille_texte, nord: A.nord.taille_texte }[o.sous_type] || A.reserve_texte.taille_texte;
}

export function primitivesAnnotation(o, reglages) {
  const A = CHARTE.annotations;
  const couleur = o.couleur || CHARTE.COULEURS_ANNOTATION[0];
  const e = facteurSymbole(o, reglages);   // échelle globale de l'objet : trait, pointes, texte, symbole, hachures (v12 §2.1)
  const ep = (o.epaisseur || A.epaisseur_defaut) * e;
  const tt = tailleTexteAnnotation(o) * e * (reglages.taille_texte || 1);   // taille du texte : réglage propre × échelle
  const pts = o.points || [];
  const prims = [];
  switch (o.sous_type) {
    case 'fleche': case 'fleche_double': case 'fleche_texte': case 'fleche_double_texte': {
      if (pts.length < 2) break;
      const double = o.sous_type === 'fleche_double' || o.sous_type === 'fleche_double_texte' || (o.sous_type === 'fleche_texte' && o.attributs.double);
      prims.push(...primitivesFleche(pts[0], pts[1], couleur, ep, A.fleche.tete * e, double));
      if ((o.sous_type === 'fleche_texte' || o.sous_type === 'fleche_double_texte') && o.texte) {
        const c = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const ang = (Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180) / Math.PI;
        prims.push(...reserveTexte(c, ang, o.texte, tt, couleur));
      }
      break;
    }
    case 'cotation': {
      if (pts.length < 2) break;
      prims.push(...primitivesFleche(pts[0], pts[1], couleur, ep, A.cotation.tete * e, true));
      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y, L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L * A.cotation.repere * e, ny = dx / L * A.cotation.repere * e;
      for (const p of pts.slice(0, 2)) prims.push(ligne(p.x - nx, p.y - ny, p.x + nx, p.y + ny, couleur, ep));
      const c = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      prims.push(...reserveTexte(c, ang, o.texte || '?', tt, couleur));
      break;
    }
    case 'nord': {
      const K = A.nord;
      const local = [];
      local.push(...primitivesFleche({ x: 0, y: K.longueur / 2 }, { x: 0, y: -K.longueur / 2 }, couleur, ep / e, K.tete, false));
      local.push(poly([{ x: 0, y: -K.longueur / 2 }, { x: -K.tete * 0.5, y: -K.longueur / 2 + K.tete }, { x: 0, y: -K.longueur / 2 + K.tete * 0.7 }], { ferme: true, couleur: null, epaisseur: 0, remplissage: '#FFFFFF' }));
      local.push(texte(0, K.longueur / 2 + K.taille_texte * 1.1, 'N', { taille: tailleTexteAnnotation(o), couleur, ancre: 'milieu', suivre_rotation: true }));
      prims.push(...transformer(local, { x: o.x, y: o.y, rotation: o.rotation || 0, echelle: e }));
      break;
    }
    case 'rond_texte': {
      const K = A.rond_texte;
      const taille = tt;
      const t = o.texte || '';
      const r = Math.max(K.rayon_min * e, mesurerTexte(t, taille) / 2 + K.marge * e);
      const rot = rotationLisible(o.rotation, true);
      const local = [cercle(0, 0, r, { couleur, epaisseur: ep, remplissage: o.attributs.fond === 'transparent' ? null : '#FFFFFF' }),
        texte(0, taille * 0.36, t, { taille, couleur: o.attributs.couleur_texte || couleur, ancre: 'milieu', suivre_rotation: true })];
      prims.push(...transformer(local, { x: o.x, y: o.y, rotation: rot, echelle: 1 }));
      break;
    }
    case 'malt_libre': {
      const t = o.attributs.longueur_tige ?? CHARTE.malt.hauteur_trait;
      const local = symboleMalt(0, t, t).map((p) => ({ ...p, couleur, epaisseur: o.epaisseur || A.epaisseur_defaut }));
      prims.push(...transformer(local, { x: o.x, y: o.y, rotation: o.rotation || 0, echelle: e }));
      break;
    }
    case 'zone_hachuree': {
      if (pts.length < 3) { if (pts.length === 2) prims.push(poly(pts, { couleur, epaisseur: ep })); break; }
      const K = A.zone;
      const op = o.attributs.opacite ?? K.opacite;
      const couleurOp = melangerBlanc(couleur, op);
      if (o.attributs.remplissage) prims.push(poly(pts, { ferme: true, couleur: null, epaisseur: 0, remplissage: melangerBlanc(couleur, op * 0.25) }));
      prims.push(...hachurerPolygone(pts, { pas: (o.attributs.pas || K.pas) * e, angle_deg: o.attributs.angle_deg ?? K.angle_deg, epaisseur: ep * 0.8, couleur: couleurOp }));
      prims.push(poly(pts, { ferme: true, couleur: couleurOp, epaisseur: K.epaisseur_contour * e, remplissage: null }));
      break;
    }
    case 'stylo': case 'trait_libre':
      if (pts.length >= 2) prims.push(poly(pts, { couleur, epaisseur: ep, joint: 'round' }));
      break;
    case 'trait': {
      // Segment rectiligne prolongeable en polyligne ; extrémités : aucune, pointe (flèche aux deux bouts), point (v12 §2.3)
      // Style plein / pointillé (v1.4.4 §1) : tireté proportionnel à l'épaisseur affichée, indépendant de la couleur,
      // du surligneur, des poignées, du déplacement et de la rotation — suit le trait dans les trois exports (`tirete`,
      // déjà propagé par primitives.js/rendu-svg.js/export-pdf.js/export-png.js).
      if (pts.length < 2) break;
      const ext = o.attributs.extremites || 'aucune';
      const tirete = o.attributs.style === 'pointille' ? [ep * A.trait.pointille_tiret, ep * A.trait.pointille_espace] : null;
      prims.push(poly(pts, { couleur, epaisseur: ep, joint: 'round', tirete }));
      if (ext === 'pointe') {
        const t = A.trait.tete * e;
        const a = pts[0], b = pts[1], y = pts[pts.length - 1], z = pts[pts.length - 2];
        prims.push(...primitivesFleche(b, a, couleur, 0, t, false).slice(1), ...primitivesFleche(z, y, couleur, 0, t, false).slice(1));
      } else if (ext === 'point') {
        const r = A.trait.rayon_point * e;
        prims.push(cercle(pts[0].x, pts[0].y, r, { couleur: null, epaisseur: 0, remplissage: couleur }), cercle(pts[pts.length - 1].x, pts[pts.length - 1].y, r, { couleur: null, epaisseur: 0, remplissage: couleur }));
      }
      break;
    }
    case 'croix': {
      const K = A.croix, t = K.taille;
      const local = [ligne(-t, -t, t, t, couleur, K.epaisseur), ligne(-t, t, t, -t, couleur, K.epaisseur)];
      prims.push(...transformer(local, { x: o.x, y: o.y, rotation: o.rotation || 0, echelle: e }));
      break;
    }
    default: break;
  }
  return prims;
}

/* Couleur fusionnée sur blanc selon une opacité (PDF sans transparence). */
function melangerBlanc(hex, op) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => Math.round(x * op + 255 * (1 - op)));
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
}

/* ---------- Masques du fond de plan (gomme magique, v12 §8) ---------- */
/* Couleur du masque avec opacité : rgba à l'écran et en PNG ; transparence réelle dans le PDF
 * depuis la v1.3.5 (ExtGState /ca /CA dans export-pdf.js), plus de fusion sur blanc. */
export function couleurMasque(o) {
  const op = o.opacite === null || o.opacite === undefined ? 1 : Math.max(0, Math.min(1, Number(o.opacite)));
  const m = /^#([0-9a-f]{6})$/i.exec(o.couleur || CHARTE.masque.couleur_defaut);
  if (!m || op >= 1) return o.couleur || CHARTE.masque.couleur_defaut;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${op})`;
}

/* Formes du Dessin stockées par les 4 coins de leur boîte (tournables autour de son centre, v1.4.6 §3). */
export const FORMES_BOITE = ['rectangle', 'rectangle_arrondi', 'ellipse'];

/* Dessin : forme locale, puis rotation `o.rotation` autour du centre de la boîte (rotation nulle = rendu inchangé). */
export function primitivesMasque(o) {
  const prims = primitivesMasqueSansRotation(o);
  const r = Number(o.rotation) || 0;
  if (!r || !prims.length || !FORMES_BOITE.includes(o.sous_type)) return prims;
  const c = centreBoite(o.points || []);
  return transformer(transformer(prims, { x: -c.x, y: -c.y }), { x: c.x, y: c.y, rotation: r });
}

function primitivesMasqueSansRotation(o) {
  const pts = o.points || [];
  const couleur = couleurMasque(o);
  if (o.sous_type === 'pinceau') {
    if (pts.length < 1) return [];
    const d = Math.max(CHARTE.masque.pinceau.diametre_min, Number(o.attributs.diametre) || CHARTE.masque.pinceau.diametre_defaut);
    const trace = pts.length === 1 ? [pts[0], { x: pts[0].x + 0.01, y: pts[0].y }] : pts;
    return [poly(trace, { couleur, epaisseur: d, remplissage: null, joint: 'round' })];   // bande à extrémités arrondies (bouts ronds)
  }
  // Formes arrondies (v13.4 §2) : stockées comme le rectangle, par les quatre coins de leur boîte.
  if (o.sous_type === 'ellipse' || o.sous_type === 'rectangle_arrondi') {
    const b = boiteDeuxPoints(pts);
    if (!b) return [];
    if (o.sous_type === 'ellipse') return [ellipsePoly(b.x + b.l / 2, b.y + b.h / 2, b.l / 2, b.h / 2, { ferme: true, couleur: null, epaisseur: 0, remplissage: couleur }, CHARTE.masque.segments_ellipse)];
    return [rectArrondi(b.x, b.y, b.l, b.h, rayonArrondi(o, b), { couleur: null, epaisseur: 0, remplissage: couleur })];
  }
  if (pts.length < 3) return [];
  return [poly(pts, { ferme: true, couleur: null, epaisseur: 0, remplissage: couleur })];
}

/* Boîte englobante d'une forme stockée par ses coins (rectangle, rectangle arrondi, ellipse). */
export function boiteDeuxPoints(pts) {
  if (!pts || pts.length < 2) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const l = Math.max(...xs) - x, h = Math.max(...ys) - y;
  return l > 0 && h > 0 ? { x, y, l, h } : null;
}

/* Rayon d'angle effectif : valeur de l'objet, bornée par la charte et par la moitié du plus petit côté. */
export function rayonArrondi(o, b) {
  const K = CHARTE.masque;
  const v = Number((o.attributs || {}).rayon);
  const r = Number.isFinite(v) && v > 0 ? v : K.rayon_arrondi;
  return Math.max(0, Math.min(r, K.rayon_arrondi_max, b.l / 2, b.h / 2));
}

/* Un point est-il dans l'ellipse inscrite dans la boîte ? (test de sélection conforme à la forme dessinée) */
export function dansEllipse(p, b) {
  const rx = b.l / 2, ry = b.h / 2;
  if (!rx || !ry) return false;
  const dx = (p.x - (b.x + rx)) / rx, dy = (p.y - (b.y + ry)) / ry;
  return dx * dx + dy * dy <= 1;
}

/* Centre géométrique d'une annotation (poignées, rotation, déplacement). */
export function centreAnnotation(o) {
  const pts = o.points || [];
  if (pts.length) {
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length, y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x, y };
  }
  return { x: o.x, y: o.y };
}

/* ---------- Point d'entrée ---------- */
/* Centre du symbole d'un ponctuel (ancrage + déport). */
export function centreSymbole(o) {
  const d = o.deport || { dx: 0, dy: 0 };
  return { x: o.x + (d.dx || 0), y: o.y + (d.dy || 0) };
}

/* Retourne { corps, etiquette, boiteEtiquette, coinsEtiquette, materiel, boiteMateriel, coinsMateriel,
 *            cartouche, boiteCartouche, centreCartouche, rayon, centre, boite (notes / annotations) } */
export function primitivesObjet(o, reglages = { echelle_symbole: 1, taille_texte: 1 }) {
  const vide = { etiquette: [], boiteEtiquette: null, materiel: [], boiteMateriel: null, cartouche: [], boiteCartouche: null, rayon: 0, centre: null };
  if (o.type === 'troncon' || o.type === 'fourreau') {
    const et = primitivesEtiquette(o, reglages);
    return { ...vide, corps: o.type === 'troncon' ? primitivesTroncon(o) : primitivesFourreau(o), etiquette: et.prims, boiteEtiquette: et.boite, coinsEtiquette: et.coins, centreEtiquette: et.centre };
  }
  if (o.type === 'note') {
    const n = primitivesNote(o, reglages);
    return { ...vide, corps: n.prims, boite: n.boite };
  }
  if (o.type === 'annotation') {
    const corps = primitivesAnnotation(o, reglages);
    return { ...vide, corps, boite: boite(corps), centre: centreAnnotation(o), rayon: 0 };
  }
  if (o.type === 'masque') {
    const corps = primitivesMasque(o);
    return { ...vide, corps, boite: boite(corps), centre: centreAnnotation(o), rayon: 0 };
  }
  if (o.type === 'image') {
    // Image libre (v1.4.6 §2) : une primitive, dessinée par chaque moteur (SVG <image>, canvas, XObject PDF)
    const corps = [{ t: 'image', fond_id: o.fond_id, cx: o.x, cy: o.y, largeur: o.largeur, hauteur: o.hauteur, rotation: o.rotation || 0, opacite: o.opacite ?? 1 }];
    // v1.4.7 : image rognée = même primitive + recadrage (et l'identifiant de l'objet pour le <clipPath> écran).
    // Sans rognage, la primitive est strictement celle de la v1.4.6.
    if (!recadrageNul(o.recadrage)) { corps[0].recadrage = lireRecadrage(o.recadrage); corps[0].objet_id = o.id; }
    if (o.situation) corps.push(...primitivesSituation(o));   // v1.5.4 : cadre + rond rouge du point GPS
    return { ...vide, corps, boite: boite(corps.slice(0, 1)), centre: { x: o.x, y: o.y }, rayon: 0 };
  }
  let local;
  switch (o.type) {
    case 'support': local = symboleSupport(o); break;
    case 'coffret': local = symboleCoffret(o); break;
    case 'poste': local = symbolePoste(o); break;
    case 'boite_jonction': local = symboleBoiteJonction(o); break;
    case 'malt': {
      const t = o.attributs.longueur_tige ?? CHARTE.malt.hauteur_trait;
      // Haut de tige fixe sur le point du symbole ; l'allongement se fait vers le bas (v11 §1.2) ; couleur v1.5.1
      local = { prims: symboleMalt(0, t, t, couleurObjetMalt(o)), rayon: Math.max(t, CHARTE.malt.largeurs[0] / 2) };
      break;
    }
    case 'eras': local = symboleEras(o); break;
    case 'point_lumineux': local = symbolePointLumineux(o); break;
    case 'armoire_ep': local = symboleArmoireEp(o); break;
    case 'lanterne_ep': local = symboleLanterneEp(o); break;
    case 'boucle_ep': local = symboleBoucleEp(o); break;
    default: local = { prims: cercleEtat(2.5, o.etat), rayon: 2.5 };
  }
  const echelle = facteurSymbole(o, reglages);
  const centre = centreSymbole(o);
  const corps = transformer(local.prims, { x: centre.x, y: centre.y, rotation: o.rotation || 0, echelle });
  let rayon = local.rayon * echelle;
  if (o.type === 'eras' && o.attributs.avec_malt) {
    // MALT de l'ERAS : tige depuis le centre du rond, vers le bas du symbole ; facteur du plan seul (indépendant de l'échelle du rond)
    const eM = (reglages.echelle_symbole || 1) * compensationRendu(o).symbole;
    const t = tigeEras(o);
    corps.push(...transformer(symboleMalt(0, t, t), { x: centre.x, y: centre.y, rotation: o.rotation || 0, echelle: eM }));
    rayon = Math.max(rayon, (t + CHARTE.malt.ecart_barres * 2) * eM);
  }
  // v1.5.2 : symbole MALT porté par l'ouvrage (« MALT ex » / « Confection MALT ») : tige depuis le centre de l'ouvrage,
  // dessinée AVANT lui (second plan : le symbole plein la masque), orientable autour de lui, barres hors du symbole.
  // Le rayon de l'ouvrage n'est pas agrandi : étiquette, matériel et cartouche gardent leur place.
  const gm = geometrieSymboleMalt(o, reglages, rayon);
  if (gm) corps.unshift(...transformer(symboleMalt(0, gm.tige, gm.tige, gm.couleur), { x: gm.centre.x, y: gm.centre.y, rotation: gm.angle, echelle: gm.echelle }));
  if (centre.x !== o.x || centre.y !== o.y) {
    const D = CHARTE.deport;
    corps.unshift(ligne(o.x, o.y, centre.x, centre.y, D.ligne_rappel.couleur, D.ligne_rappel.epaisseur, { tirete: D.ligne_rappel.tirete, bout: 'butt' }));
    corps.unshift(cercle(o.x, o.y, D.rayon_ancrage, { couleur: null, epaisseur: 0, remplissage: D.ligne_rappel.couleur }));
  }
  const et = primitivesEtiquette(o, reglages, rayon, centre);
  const ma = primitivesMateriel(o, reglages, et.ancre, et.hauteur);
  const ca = primitivesCartouche(o, reglages, rayon, centre);
  return {
    corps, rayon, centre,
    etiquette: et.prims, boiteEtiquette: et.boite, coinsEtiquette: et.coins, centreEtiquette: et.centre,
    materiel: ma.prims, boiteMateriel: ma.boite, coinsMateriel: ma.coins, centreMateriel: ma.centre,
    cartouche: ca.prims, boiteCartouche: ca.boite, centreCartouche: ca.centre
  };
}

/* Primitive d'un échantillon de symbole pour la légende et la palette (local, centré). */
export function echantillonSymbole(type, etatObjet, attributs = {}, domaine = 'BTS', pose = 'aerien') {
  const faux = { type, etat: etatObjet, domaine, pose, x: 0, y: 0, rotation: 0, echelle_symbole: 1, echelle_plan_origine: null, deport: { dx: 0, dy: 0 }, repere: '', mention: '',
    cartouche: { visible: false }, materiel: { visible: false }, attributs: { renforcement: 'AUCUN', ...attributs }, etiquette: { visible: false }, materiel_associe: [] };
  const r = primitivesObjet(faux, { echelle_symbole: 1, taille_texte: 1 });
  return r.corps;
}

/* Échantillon d'annotation pour la palette Outils. */
export function echantillonAnnotation(sous_type) {
  const faux = { type: 'annotation', sous_type, x: 0, y: 0, rotation: 0, echelle_symbole: 1, couleur: '#000000', epaisseur: 0.8, taille_texte: null,
    texte: sous_type === 'cotation' ? '12 m' : (sous_type === 'rond_texte' ? 'A' : (sous_type === 'fleche_texte' || sous_type === 'fleche_double_texte' ? 'txt' : '')),
    attributs: sous_type === 'zone_hachuree' ? { pas: 3, angle_deg: 45, opacite: 1 } : (sous_type === 'malt_libre' ? { longueur_tige: 4 } : (sous_type === 'trait' ? { extremites: 'pointe' } : (sous_type === 'fleche_double_texte' ? { double: true } : {}))),
    points: { fleche: [{ x: -12, y: 0 }, { x: 12, y: 0 }], fleche_double: [{ x: -12, y: 0 }, { x: 12, y: 0 }], fleche_texte: [{ x: -14, y: 0 }, { x: 14, y: 0 }], fleche_double_texte: [{ x: -14, y: 0 }, { x: 14, y: 0 }], cotation: [{ x: -14, y: 0 }, { x: 14, y: 0 }],
      zone_hachuree: [{ x: -12, y: -7 }, { x: 12, y: -7 }, { x: 12, y: 7 }, { x: -12, y: 7 }], trait: [{ x: -12, y: 4 }, { x: 2, y: 4 }, { x: 12, y: -4 }],
      stylo: [{ x: -12, y: 4 }, { x: -8, y: -3 }, { x: -3, y: 5 }, { x: 2, y: -4 }, { x: 7, y: 3 }, { x: 12, y: -3 }] }[sous_type] || [] };
  return primitivesAnnotation(faux, { echelle_symbole: 1, taille_texte: 1 });
}

/* Échantillon de masque pour la barre d'options de la gomme magique. */
export function echantillonMasque(sous_type) {
  const rect4 = [{ x: -11, y: -6 }, { x: 11, y: -6 }, { x: 11, y: 6 }, { x: -11, y: 6 }];
  if (sous_type === 'carre' || sous_type === 'rond') {
    const carre = [{ x: -7, y: -7 }, { x: 7, y: -7 }, { x: 7, y: 7 }, { x: -7, y: 7 }];
    return primitivesMasque({ type: 'masque', sous_type: sous_type === 'carre' ? 'rectangle' : 'ellipse', couleur: '#D9DDE3', opacite: 1, attributs: { ratio_fixe: true }, points: carre });
  }
  const points = sous_type === 'pinceau' ? [{ x: -10, y: 3 }, { x: -3, y: -3 }, { x: 4, y: 3 }, { x: 10, y: -2 }]
    : (sous_type === 'polygone' ? [{ x: -10, y: -5 }, { x: 4, y: -7 }, { x: 10, y: 2 }, { x: 0, y: 7 }, { x: -9, y: 4 }] : rect4);
  const faux = { type: 'masque', sous_type, couleur: '#D9DDE3', opacite: 1, attributs: { diametre: 5, rayon: 4 }, points };
  return primitivesMasque(faux);
}

export { boite as boitePrimitives };
