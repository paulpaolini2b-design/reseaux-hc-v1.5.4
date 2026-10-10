/* legende.js — légende générée à partir des seuls symboles réellement utilisés (annotations, notes et masques exclus).
 * Objet pilotable (v13 §5) : masquable, positionnable (glissement), redimensionnable (plan.legende.echelle, bornes
 * charte.legende), cadre et fond réglables comme les blocs d'étiquette. Reprise à l'identique en PDF et PNG.
 */
import { CHARTE, LIBELLES, LIBELLES_DOMAINE, styleTroncon, TYPES_SUPPORT, supportSansCaracteristiques, categorieMalt, LIBELLES_MALT } from './charte.js';
import { symboleMaltActif, categorieMaltHote } from './modele.js';
import { rect, texte, poly, transformer, hachurerPolyligne, ligne } from './primitives.js';
import { echantillonSymbole, primitivesFourreau, rectArrondi } from './symboles.js';
import { etenduePlan } from './vue.js';

/* Échelle bornée de la légende. */
export function echelleLegende(plan) {
  const L = CHARTE.legende;
  const e = plan && plan.legende && plan.legende.echelle;
  return Math.min(L.echelle_max, Math.max(L.echelle_min, e || L.echelle_defaut));
}

/* Hauteur locale (avant échelle) pour n entrées. */
function hauteurLocale(n) {
  const L = CHARTE.legende;
  return L.marge * 2 + L.taille_titre * 1.6 + n * L.ligne;
}

/* Libellé et clé de regroupement d'un objet ponctuel. */
function cleSymbole(o) {
  const a = o.attributs || {};
  switch (o.type) {
    case 'support': {
      // v1.4.8 : regroupement par matériau / type, classe, renforcement et état ; vignette dessinée avec le renforcement
      const TL = TYPES_SUPPORT.legende;
      const m = (a.materiau === 'BETON' ? (a.classe === 'E' ? TL.BETON_E : TL.BETON_D) : TL[a.materiau]) || 'Support';
      const renf = supportSansCaracteristiques(a.materiau) ? 'AUCUN' : (a.renforcement || 'AUCUN');
      const libRenf = TYPES_SUPPORT.renforcements_legende[renf];
      // contrefiche et hauban tournés vers la droite dans la vignette, comme sur la légende de supports du SIEEP-HC
      const angle = renf === 'CONTREFICHE' || renf === 'HAUBANE' ? 90 : 0;
      return {
        cle: 'support|' + (a.materiau || '') + '|' + (a.materiau === 'BETON' ? a.classe || '' : '') + '|' + renf + '|' + o.etat,
        libelle: m + (libRenf ? ' ' + libRenf : '') + ' ' + LIBELLES.etats[o.etat].toLowerCase(),
        attributs: { materiau: a.materiau, classe: a.classe, renforcement: renf, angle_renforcement: angle }
      };
    }
    case 'coffret': return { cle: 'coffret|' + o.etat, libelle: 'Coffret / borne BT ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: { sigle: a.sigle || '' } };
    case 'poste': return { cle: 'poste|' + o.etat, libelle: 'Poste / coupure HTA ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: { sigle: a.sigle || '' } };
    case 'boite_jonction': return { cle: 'bj|' + o.domaine + '|' + o.etat, libelle: 'Boîte de jonction ' + (LIBELLES_DOMAINE[o.domaine] || o.domaine) + ' ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: {}, domaine: o.domaine, pose: o.pose };
    case 'malt': {
      // v1.5.1 : une entrée par catégorie (existante grise, confection BT bleue, confection HTA rouge)
      const cat = categorieMalt(o.etat === 'existant' || o.etat === 'a_deposer', o.domaine);
      return entreeMalt(cat);
    }
    case 'eras': return { cle: 'eras|' + o.domaine + '|' + (a.avec_malt ? 1 : 0) + '|' + o.etat, libelle: (a.sous_type === 'BRANCHEMENT' ? 'RAS branchement' : a.sous_type === 'EP' ? 'RAS EP' : 'ERAS ' + (LIBELLES_DOMAINE[o.domaine] || o.domaine)) + (a.avec_malt ? ' avec MALT' : '') + ' ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: { avec_malt: a.avec_malt, sous_type: a.sous_type }, domaine: o.domaine, pose: o.pose };
    case 'point_lumineux': return { cle: 'pl|' + o.etat, libelle: 'Point lumineux ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: {} };
    case 'armoire_ep': return { cle: 'aep|' + o.etat, libelle: 'Armoire de commande EP ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: { sigle: a.sigle } };
    case 'lanterne_ep': return { cle: 'lt|' + o.etat, libelle: 'Lanterne EP ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: {}, domaine: 'EP' };
    case 'boucle_ep': return { cle: 'bcl|' + o.etat, libelle: 'Boucle de câble EP ' + LIBELLES.etats[o.etat].toLowerCase(), attributs: {}, domaine: 'EP' };
    default: return null;
  }
}

/* v1.5.1 — Entrée de légende d'une catégorie de MALT ; l'échantillon est un objet MALT de même couleur. */
function entreeMalt(cat) {
  return { cle: 'malt|' + cat, libelle: LIBELLES_MALT[cat], attributs: {}, etat: cat === 'ex' ? 'existant' : 'a_poser', domaine: cat === 'HTA' ? 'HTA' : 'BTS', pose: 'aerien', typeObjet: 'malt' };
}

function libelleTroncon(o) {
  const r = CHARTE.reseaux[o.domaine];
  return (r ? r.libelle : o.domaine) + ' ' + LIBELLES.poses[o.pose].toLowerCase() + ' ' + LIBELLES.etats[o.etat].toLowerCase();
}

/* Entrées de légende { type:'troncon'|'symbole', libelle, … } dédoublonnées. */
export function entreesLegende(objets) {
  const map = new Map();
  for (const o of objets) {
    if (o.type === 'note' || o.type === 'annotation' || o.type === 'masque' || o.type === 'image') continue;   // masques et images : hors légende et hors métré (v12 §8, v1.4.6 §2)
    if (o.type === 'fourreau') {
      const mat = (o.attributs.matiere || 'TPC').toUpperCase() === 'ACIER' ? 'ACIER' : 'TPC';
      const cle = 'f|' + mat + '|' + o.etat;
      if (!map.has(cle)) map.set(cle, { type: 'fourreau', libelle: 'Fourreau ' + (mat === 'ACIER' ? 'acier' : 'TPC') + ' ' + LIBELLES.etats[o.etat].toLowerCase(), matiere: mat, etat: o.etat, ordre: 0.5 });
      continue;
    }
    if (o.type === 'troncon') {
      const cle = 't|' + o.domaine + '|' + o.pose + '|' + o.etat;
      if (!map.has(cle)) map.set(cle, { type: 'troncon', libelle: libelleTroncon(o), domaine: o.domaine, pose: o.pose, etat: o.etat, ordre: 0 });
    } else {
      const s = cleSymbole(o);
      if (s && !map.has(s.cle)) map.set(s.cle, { type: 'symbole', typeObjet: o.type, etat: o.etat, ordre: 1, ...s });
      // v1.5.1 : symbole MALT porté par l'ouvrage
      if (symboleMaltActif(o)) {
        const m = entreeMalt(categorieMaltHote(o));
        if (!map.has(m.cle)) map.set(m.cle, { type: 'symbole', ordre: 1, ...m });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle, 'fr'));
}

/* Position par défaut : coin bas-droit de l'étendue du plan. */
export function positionLegende(plan, entrees, echelle) {
  const L = CHARTE.legende;
  const l = L.largeur * echelle;
  const h = hauteurLocale(entrees.length) * echelle;
  if (plan.legende.x !== null && plan.legende.y !== null) return { x: plan.legende.x, y: plan.legende.y, l, h };
  const e = etenduePlan(plan);   // étendue DU plan de la légende, pas du plan affiché (v1.4.5, H-230)
  return { x: e.x + e.l - l - L.marge_bord, y: e.y + e.h - h - L.marge_bord, l, h };
}

/* Boîte de la légende (null si elle n'a rien à lister ou si elle est masquée). */
export function boiteLegende(plan, objets) {
  if (!plan || !plan.legende || plan.legende.visible === false) return null;
  const entrees = entreesLegende(objets);
  if (!entrees.length) return null;
  return positionLegende(plan, entrees, echelleLegende(plan));
}

/* Cadre et fond de la légende, mêmes valeurs que les blocs d'étiquette (v12 §3.2, v13 §5). */
function aspectLegende(plan) {
  const L = CHARTE.legende, T = CHARTE.texte;
  const g = plan.legende || {};
  const cadre = (g.cadre || L.cadre_defaut);
  const fondCle = g.fond || L.fond_defaut;
  return {
    couleur: cadre === 'aucun' ? null : (g.couleur_cadre || L.couleur_cadre_defaut),
    arrondi: cadre === 'arrondi',
    fond: fondCle === 'transparent' ? null : (fondCle === 'translucide' ? T.fond_etiquette : L.fond)
  };
}

/* Échantillon de trait d'un tronçon (réseau, pose, état) entre x1 et x2 à l'ordonnée y. Partagé avec le descriptif
 * (v1.5.0 §2.6) : un tronçon s'y dessine exactement comme dans la légende. */
export function echantillonTroncon(domaine, pose, etatT, x1, x2, y) {
  const prims = [];
  const s = styleTroncon(domaine, pose, etatT);
  const pts = [{ x: x1, y }, { x: x2, y }];
  if (s.fluo) prims.push(poly(pts, { couleur: CHARTE.lisere.couleur, epaisseur: s.epaisseur + CHARTE.lisere.surepaisseur, tirete: s.tirete }));
  prims.push(poly(pts, { couleur: s.couleur, epaisseur: s.epaisseur, tirete: s.tirete }));
  if (s.hachure) prims.push(...hachurerPolyligne(pts, CHARTE.hachures_troncon));
  if (s.reprendre) prims.push(poly(pts, { couleur: CHARTE.a_reprendre_troncon.couleur, epaisseur: CHARTE.a_reprendre_troncon.epaisseur, tirete: CHARTE.a_reprendre_troncon.tirete }));
  return prims;
}

export function primitivesLegende(plan, objets, reglages = {}) {
  if (!plan.legende || plan.legende.visible === false) return [];
  const entrees = entreesLegende(objets);
  if (!entrees.length) return [];
  const L = CHARTE.legende;
  const echelle = echelleLegende(plan);
  const pos = positionLegende(plan, entrees, echelle);
  const prims = [];
  // Construite en local puis mise à l'échelle et positionnée
  const asp = aspectLegende(plan);
  const opt = { couleur: asp.couleur, epaisseur: asp.couleur ? L.epaisseur_cadre : 0, remplissage: asp.fond };
  const hL = hauteurLocale(entrees.length);
  if (asp.couleur || asp.fond) prims.push(asp.arrondi ? rectArrondi(0, 0, L.largeur, hL, L.rayon_cadre, opt) : rect(0, 0, L.largeur, hL, opt));
  prims.push(texte(L.marge, L.marge + L.taille_titre, 'Légende', { taille: L.taille_titre, couleur: '#000', ancre: 'debut' }));
  let y = L.marge + L.taille_titre * 1.6 + L.ligne / 2;
  const xEch = L.marge + L.longueur_echantillon / 2, xTexte = L.marge + L.longueur_echantillon + 3;
  for (const e of entrees) {
    if (e.type === 'troncon') {
      prims.push(...echantillonTroncon(e.domaine, e.pose, e.etat, L.marge, L.marge + L.longueur_echantillon, y));
    } else if (e.type === 'fourreau') {
      const faux = { type: 'fourreau', etat: e.etat, echelle_symbole: 1, troncon_id: null, attributs: { matiere: e.matiere }, points: [{ x: L.marge, y }, { x: L.marge + L.longueur_echantillon, y }] };
      prims.push(...primitivesFourreau(faux));
    } else {
      const ech = echantillonSymbole(e.typeObjet, e.etat, e.attributs, e.domaine || 'BTS', e.pose || 'aerien');
      prims.push(...transformer(ech, { x: xEch, y, rotation: 0, echelle: 0.85 }));
    }
    prims.push(texte(xTexte, y + L.taille_texte * 0.36, e.libelle, { taille: L.taille_texte, couleur: '#000', ancre: 'debut' }));
    y += L.ligne;
  }
  // ligne de séparation sous le titre
  prims.push(ligne(L.marge, L.marge + L.taille_titre * 1.35, L.largeur - L.marge, L.marge + L.taille_titre * 1.35, '#000', 0.3));
  void reglages;
  return transformer(prims, { x: pos.x, y: pos.y, rotation: 0, echelle });
}
