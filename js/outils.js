/* outils.js — outils de tracé et d'édition (machine d'états).
 *
 * pointeur.js traduit les événements bruts en gestes (appui, glisser, appui long,
 * survol) et les transmet ici. Les outils manipulent le modèle et passent par
 * historique.valider() pour chaque action terminée.
 *
 * Lot 1.2 : outil Fourreau (accroché à un tronçon ou seul), outil Annotations (palette « Outils »),
 * blocs d'étiquette réglables (déplacement, rotation, échelle), échelle des linéaires, défilement
 * des poignées superposées à l'appui long.
 * Lot 1.3 : poignée d'échelle sur tous les ponctuels, annotations et notes ; croix de masquage du
 * cartouche ; tige de la MALT d'ERAS ; commandes « + MALT ex » / « + Confection MALT » ; trait
 * rectiligne et stylo ; outil Dessin (masques du fond et aplats, rectangle / polygone / pinceau, surligneur,
 * pipette — v13.3 §4) ; lanterne
 * et boucle EP posées depuis la boîte Outils.
 * Lot 1.3.1 : changement de réseau par appliquerDomaine() (règle MALT unique, v13 §1) ; légende pilotable —
 * croix de masquage, pose depuis la boîte Outils, position / échelle / visibilité annulables (v13 §5).
 * v1.4.7 : mode « Rognage » d'une image libre (etat.rognage = { id, recadrage en cours }) — le modèle n'est écrit qu'à
 * la validation, en une seule étape d'historique ; poignées de rotation et de taille posées sur la partie visible.
 * v1.5.0 : bloc « Descriptif » (sélection 'descriptif', comme la légende) — déplacement, poignée carrée de largeur,
 * croix de masquage, flèches, double appui = éditeur sur la ligne touchée ; création par Outils → Descriptif.
 */
import { etat, emettre, sur, objets, objetParId, objetsSelectionnes, selectionner, deselectionner, notifier, peutModifier, signalerLectureSeule } from './etat.js';

/* Garde de consultation (lot 1.4) : vrai si l'action doit être refusée. */
function bloque() {
  if (peutModifier()) return false;
  signalerLectureSeule();
  return true;
}
import { CHARTE, MM, LIBELLES, MALT_CONDENSE, couleurReseau, styleTroncon, couleurFourreau } from './charte.js';
import { assurerSymboleMalt, symboleMaltActif } from './modele.js';
import { bd } from './bd.js';
import { vue, pxVersPlan, versEcran } from './vue.js';
import { nouvelObjetPonctuel, nouveauTroncon, nouveauFourreau, nouvelleAnnotation, nouveauMasque, nouvelleNote, nouvelleImage, attribuerRepere, cloner, genererId, calquePourEtat, blocParDefaut, aspectBlocParDefaut, TYPES_PONCTUELS, ANNOTATIONS_A_POINTS, ANNOTATIONS_A_TEXTE, compensationEchelle, origineEchelleCourante, appliquerDomaine, articleIncompatible, legendeParDefaut, remplacementParDefaut } from './modele.js';
import { lignesPackage } from './nomenclature.js';
import { FORMES_BOITE } from './symboles.js';
import { tourner, centreBoite, coinsMonde, redimensionnerCoin, contraindreCarre, dimensionsImage, rectangleVisible, rognerParPoignee, deplacerFenetreRognage, echelleAutourDuVisible, tournerAutourDuVisible, coinsRectangleTourne, dansRectangleTourne, lireRecadrage, bornerRecadrage, recadrageNul } from './forme-calcul.js';
import { centreSymbole, centreAnnotation, pointsFourreau, abscisseSurPolyligne, pointSurPolyligne, portionPolyligne, milieuPolyligne, primitivesTroncon, primitivesFourreau, simplifierPolyligne, primitivesAnnotation, primitivesMasque, tigeEras, geometrieSymboleMalt, couleurObjetMalt } from './symboles.js';
import { valider, apercu, restaurerDernier } from './historique.js';
import { chercherObjet, accrocher, accrocherAngle, boiteObjet, testerLegende, primsObjet } from './accrochage.js';
import { dessinerTemporaire, viderTemporaire, definirFournisseurPoignees, dessinerPoignees, surligner } from './rendu-svg.js';
import { poly, cercle } from './primitives.js';
import { boiteLegende, echelleLegende } from './legende.js';
import { boiteDescriptif, cibleDescriptif, positionDescriptif } from './descriptif-rendu.js';
import { genererDescriptif } from './descriptif.js';
import { couleurAuPoint } from './fond.js';
import { ouvrirEditeurNote } from './ui/notes.js';
import { confirmer, demander } from './ui/dialogues.js';

/* Outils principaux. Les touches 1 à 9 et X ne changent pas ; le fourreau prend 0 (v11 §5.1) ; la gomme magique n'a pas de touche. */
export const OUTILS = [
  { id: 'selection', touche: '1', libelle: 'Sélection', icone: 'M5 3l14 9-6 1-3 6z' },
  { id: 'troncon', touche: '2', libelle: 'Tronçon', icone: 'M3 19l6-8 5 4 7-10', trait: true },
  { id: 'fourreau', touche: '0', libelle: 'Fourreau', icone: 'M3 9h18M3 15h18', trait: true },
  { id: 'support', touche: '3', libelle: 'Support', type: 'support', icone: 'M6 8h12v8H6z' },
  { id: 'coffret', touche: '4', libelle: 'Coffret / borne', type: 'coffret', icone: 'M4 6h16v12H4z M8 12h8' },
  { id: 'poste', touche: '5', libelle: 'Poste HTA', type: 'poste', icone: 'M3 7h18v10H3z M7 12h10' },
  { id: 'boite_jonction', touche: '6', libelle: 'Boîte de jonction', type: 'boite_jonction', icone: 'M12 8a8 4 0 1 0 0.1 0z' },
  { id: 'eras', touche: '7', libelle: 'ERAS / RAS', type: 'eras', icone: 'M8 8a3 3 0 1 0 .1 0z M16 6v6M12 12h8M13.5 14.5h5M15 17h2' },
  { id: 'malt', touche: '8', libelle: 'MALT', type: 'malt', icone: 'M12 4v8M5 12h14M7 15h10M9.5 18h5' },
  { id: 'note', touche: '9', libelle: 'Note de terrain', icone: 'M5 4h14v12H9l-4 4z M8 8h8M8 12h5' },
  { id: 'gomme', touche: '', libelle: 'Gomme', icone: 'M4 16l8-8 6 6-6 6H8z M12 8l4-4 6 6-4 4' },
  // Dessin (ex-gomme magique) : icône de pinceau — manche en diagonale, virole, touffe pleine en bas à gauche ;
  // à ne pas confondre avec la gomme (suppression d'objets), qui garde la sienne.
  { id: 'masque', touche: '', libelle: 'Dessin : masquer une zone du fond ou poser un aplat coloré', icone: 'M20 4l-9 9M15 8l1.5 1.5M8.5 11.5l4 4L9 19H5v-4z', options: true }
];

const DECALAGE_TIGE_PX = 30;  // poignée de tige sous le pied des barres, à l'écart du cartouche
const DECALAGE_ECHELLE_PX = 30;   // poignée d'échelle des ponctuels, en bas à droite du symbole

const s = {                   // état interne des outils
  polyligne: null,            // points en cours (tronçon, fourreau seul, zone hachurée, trait, polygone de masque)
  fourreauEnCours: null,      // { troncon_id, s_debut } après le premier appui sur un tronçon
  survolPoint: null,
  glisser: null               // { mode, ... } pendant un glissement
};

export function initialiserOutils() {
  definirFournisseurPoignees(poignees);
  sur('projet-ouvert', () => { s.polyligne = null; s.fourreauEnCours = null; etat.poigneeActive = null; etat.blocActif = null; etat.survolLegende = false; etat.survolDescriptif = false; etat.pipette = false; viderTemporaire(); });
  sur('plan-change', () => { s.polyligne = null; s.fourreauEnCours = null; s.glisser = null; etat.poigneeActive = null; etat.blocActif = null; etat.survolLegende = false; etat.pipette = false; viderTemporaire(); });   // v1.4.5 : tracé en cours abandonné au changement de plan
  sur('selection', () => {
    etat.poigneeActive = null;
    // v1.4.7 : une autre sélection met fin au rognage (annulé)
    if (etat.rognage && !(etat.selection.size === 1 && etat.selection.has(etat.rognage.id))) annulerRognage();
  });
  // v1.4.7 : changer d'outil, de plan ou de projet annule le rognage ; toute modification validée ailleurs aussi
  sur('outil', () => annulerRognage());
  sur('plan-change', () => annulerRognage());
  sur('projet-ouvert', () => annulerRognage());
  sur('projet-ferme', () => annulerRognage());
  sur('objets', () => { if (etat.rognage) annulerRognage(); });
  sur('reglages', () => { if (etat.modePapier) annulerRognage(); });
}

/* Tolérance en unités plan selon le type de pointeur (12 px stylet, 48 px doigt). */
export function tolerance(pointerType) {
  return pxVersPlan(pointerType === 'touch' ? 24 : 12);
}

/* ---------- Choix de l'outil ---------- */
export function definirOutil(id, preset = null) {
  if ((etat.outil === 'troncon' || etat.outil === 'fourreau' || etat.outil === 'annotation' || etat.outil === 'masque') && id !== etat.outil) annulerAction();
  etat.outil = id;
  etat.preset = preset;
  const def = OUTILS.find((o) => o.id === id);
  if (!preset && def && def.type) etat.preset = { type: def.type, attributs: {} };
  if (['note', 'selection', 'gomme', 'troncon', 'fourreau', 'masque'].includes(id) && !preset) etat.preset = null;
  viderTemporaire();
  emettre('outil', { id, preset: etat.preset });
}

/* ---------- Mode de pose (v1.4.9 §3, H-265) ----------
 * Préférence de la tablette (store prefs, clé mode_pose) : 'continu' (défaut : l'outil reste actif) ou 'unique'
 * (après chaque pose : outil Sélection, objet sélectionné, fiche ouverte). */
export function modePose() { return etat.prefs.mode_pose === 'unique' ? 'unique' : 'continu'; }

export async function definirModePose(mode) {
  etat.prefs.mode_pose = mode === 'unique' ? 'unique' : 'continu';
  emettre('mode-pose', etat.prefs.mode_pose);
  notifier(etat.prefs.mode_pose === 'unique' ? 'Pose unique — sélection et fiche après chaque pose' : 'Pose continue — l’outil reste actif', 2200);
  try { await bd.put('prefs', { cle: 'mode_pose', valeur: etat.prefs.mode_pose }); } catch (e) { /* mémoire seule si la base refuse */ }
}

export function basculerModePose() { return definirModePose(modePose() === 'unique' ? 'continu' : 'unique'); }

/* Après la pose d'un ouvrage, en mode unique : retour à la Sélection, objet sélectionné, fiche ouverte (après la fin
 * du geste, comme l'éditeur de note, pour ne pas capter le relâchement du stylet). `fiche: false` pour les annotations
 * qui ouvrent déjà leur saisie de texte. */
function apresPose(o, { fiche = true } = {}) {
  if (!o || modePose() !== 'unique' || !peutModifier()) return;
  requestAnimationFrame(() => {
    if (!objetParId(o.id)) return;
    definirOutil('selection');
    selectionner([o.id]);
    if (fiche) emettre('ouvrir-fiche', o.id);
  });
}

/* ---------- Gestes ---------- */
export function appui(p, ctx) {
  const tol = tolerance(ctx.pointerType);
  if (etat.rognage) return appuiRognage(p, tol);   // v1.4.7
  if (!peutModifier()) {   // consultation : la sélection seule reste possible (fiche en lecture seule)
    if (etat.pipette) annulerPipette(true);
    if (etat.outil === 'selection') return appuiSelection(p, ctx, tol);
    signalerLectureSeule();
    return true;
  }
  if (etat.pipette) return prelever(p, tol);   // prélèvement en cours : l'appui suivant prend une couleur (v13.3 §4.3)
  switch (etat.outil) {
    case 'selection': return appuiSelection(p, ctx, tol);
    case 'troncon': return appuiPolyligne(p, ctx, tol);
    case 'fourreau': return appuiFourreau(p, ctx, tol);
    case 'annotation': return appuiAnnotation(p, ctx, tol);
    case 'masque': return appuiMasque(p, ctx, tol);
    case 'note': return poserNote(p);
    case 'gomme': return gommer(p, tol, true);
    default: return poserPonctuel(p, tol);
  }
}

export function doubleAppui(p, ctx) {
  if (etat.rognage) return true;   // v1.4.7 : ni fiche ni ajustement pendant le rognage
  if (s.polyligne) { terminerPolyligne(); return true; }
  if (etat.outil === 'selection') {
    const h = chercherObjet(p, tolerance(ctx.pointerType));
    if (h) { selectionner([h.objet.id]); emettre('ouvrir-fiche', h.objet.id); return true; }
    // v1.5.0 : double appui sur le descriptif → éditeur sur la ligne touchée
    const c = !testerLegende(p) && etat.plan && etat.plan.descriptif ? cibleDescriptif(etat.plan, p) : null;
    if (c) { selectionner(['descriptif']); emettre('ouvrir-descriptif', c); return true; }
  }
  return false;
}

export function appuiLong(p, ctx) {
  // Poignées superposées : l'appui long fait défiler la poignée active (v11 §1.3)
  if (cyclerPoignees(ctx.ecran, ctx.pointerType)) return true;
  if (etat.rognage) {   // v1.4.7 : menu réduit à Valider / Annuler le rognage
    emettre('menu-contextuel', { x: ctx.ecran.x, y: ctx.ecran.y, plan: p, objet: objetParId(etat.rognage.id) });
    return true;
  }
  const tol = tolerance(ctx.pointerType);
  const h = chercherObjet(p, tol);
  if (h && !etat.selection.has(h.objet.id)) selectionner([h.objet.id]);
  emettre('menu-contextuel', { x: ctx.ecran.x, y: ctx.ecran.y, plan: p, objet: h ? h.objet : null });
  return true;
}

/* Appui bref sur une poignée (sans glissement) : la croix du cartouche masque le cartouche (v12 §3.3),
 * la croix de la légende la masque (v13 §5). */
export function appuiPoignee(id) {
  if (!peutModifier()) return false;
  const [role, objId] = String(id || '').split(':');
  if (role === 'descriptif-x') { definirDescriptifVisible(false); notifier('Descriptif masqué (réglages et texte conservés) — Outils → Descriptif ou Calques pour le réafficher', 3000); return true; }
  if (role === 'legende-x') { definirLegendeVisible(false); notifier('Légende masquée — case dans Calques, ou objet « Légende » de la boîte Outils pour la reposer', 3000); return true; }
  if (role === 'cartouche-x') {
    const o = objetParId(objId);
    if (!o || !o.cartouche) return false;
    o.cartouche.visible = false;
    if (etat.blocActif && etat.blocActif.id === o.id && etat.blocActif.bloc === 'cartouche') etat.blocActif = null;
    valider('Cartouche masqué');
    notifier('Cartouche de repère masqué (la case de la fiche le réaffiche)', 2600);
    return true;
  }
  return false;
}

/* Poignées dont la zone tactile contient le point écran. */
function poigneesSous(ecran, pointerType) {
  const R = pointerType === 'pen' ? Math.max(CHARTE.ecran.poignee_stylet_px, 12) : CHARTE.ecran.poignee_px;
  return poignees().filter((h) => h.id && Math.hypot(versEcran(h).x - ecran.x, versEcran(h).y - ecran.y) <= R);
}

export function cyclerPoignees(ecran, pointerType) {
  const liste = poigneesSous(ecran, pointerType);
  if (liste.length < 2) return false;
  const i = liste.findIndex((h) => h.id === etat.poigneeActive);
  etat.poigneeActive = liste[(i + 1) % liste.length].id;
  dessinerPoignees();
  notifier('Poignée : ' + libellePoignee(etat.poigneeActive), 1400);
  return true;
}

function libellePoignee(id) {
  const role = (id || '').split(':')[0];
  return { rotation: 'rotation', deport: 'déport', tige: 'tige MALT', 'malt-tige': 'orienter / allonger la MALT', sommet: 'sommet', milieu: 'insérer un sommet', etiquette: 'étiquette', cartouche: 'cartouche',
    'bloc-mv': 'déplacer le bloc', 'bloc-rot': 'rotation du bloc', 'bloc-ech': 'échelle du bloc', 'echelle-lin': 'échelle du trait', 'echelle-obj': 'échelle du symbole',
    'echelle-img': 'taille de l’image', rog: 'rognage', 'cartouche-x': 'masquer le cartouche', glissant: 'extrémité du fourreau', fleche: 'flèche', 'legende-x': 'masquer la légende', 'echelle-legende': 'échelle de la légende', 'descriptif-x': 'masquer le descriptif', 'largeur-descriptif': 'largeur du descriptif' }[role] || role;
}

/* Survol du stylet : surbrillance de l'objet qui serait sélectionné, aperçu de tracé. */
export function survol(p, ctx) {
  s.survolPoint = p;
  if (s.polyligne) { dessinerApercuPolyligne(p, ctx); return; }
  if (etat.outil === 'fourreau' && s.fourreauEnCours) { dessinerApercuFourreau(p, ctx); return; }
  if (etat.outil === 'selection' || etat.outil === 'gomme') {
    const h = chercherObjet(p, tolerance('pen'));
    surligner(h ? h.objet.id : null);
    // Survol de la légende : sa croix de masquage apparaît (v13 §5)
    const surLegende = etat.outil === 'selection' && !h && !!testerLegende(p);
    if (surLegende !== !!etat.survolLegende) { etat.survolLegende = surLegende; dessinerPoignees(); }
    const surDescriptif = etat.outil === 'selection' && !h && !surLegende && !!testerDescriptif(p);   // v1.5.0
    if (surDescriptif !== !!etat.survolDescriptif) { etat.survolDescriptif = surDescriptif; dessinerPoignees(); }
  } else if (etat.outil === 'fourreau') {
    const h = chercherObjet(p, tolerance('pen'), { types: ['troncon'] });
    surligner(h ? h.objet.id : null);
    viderTemporaire();
  } else if (etat.pipette) {
    const h = chercherObjet(p, tolerance('pen'));
    surligner(h ? h.objet.id : null);   // l'objet visé est mis en évidence : on sait ce qu'on va prélever
    viderTemporaire();
  } else if (etat.outil === 'masque') {
    surligner(null);
    if (etat.masque.mode === 'pinceau') dessinerTemporaire([cercle(p.x, p.y, etat.masque.diametre / 2, { couleur: CHARTE.masque.contour_ecran.couleur, epaisseur: pxVersPlan(1), remplissage: null })]);
    else viderTemporaire();
  } else {
    surligner(null);
    const a = accrocher(p, tolerance('pen'));
    if (a) dessinerTemporaire([cercle(a.x, a.y, pxVersPlan(7), { couleur: CHARTE.ecran.accrochage, epaisseur: pxVersPlan(1.5), remplissage: null })]);
    else viderTemporaire();
  }
}

export function finSurvol() { surligner(null); if (etat.survolLegende || etat.survolDescriptif) { etat.survolLegende = false; etat.survolDescriptif = false; dessinerPoignees(); } if (!s.polyligne && !s.fourreauEnCours) viderTemporaire(); }

/* Début de glissement. Retourne true si l'outil prend le geste (sinon : navigation). */
export function debutGlisser(p, ctx) {
  if (!peutModifier()) return false;   // consultation : tout glissement devient une navigation
  if (etat.rognage) return debutGlisserRognage(p, ctx);   // v1.4.7
  const tol = tolerance(ctx.pointerType);
  if (ctx.poignee) return debutPoignee(ctx.poignee, p, ctx);
  switch (etat.outil) {
    case 'selection': {
      const h = chercherObjet(p, tol);
      if (h) {
        if (!etat.selection.has(h.objet.id)) {
          if (ctx.pointerType === 'touch') return false;   // au doigt, on ne déplace qu'un objet déjà sélectionné
          selectionner([h.objet.id], { ajouter: ctx.shift });
        }
        if (['etiquette', 'materiel', 'cartouche'].includes(h.partie)) {
          etat.blocActif = { id: h.objet.id, bloc: h.partie };
          s.glisser = { mode: 'bloc-mv', bloc: h.partie, origine: p, id: h.objet.id, avant: cloner(h.objet[h.partie]) };
        } else {
          s.glisser = { mode: 'deplacer', origine: p, id: h.objet.id, avant: cloner(objetsSelectionnes()) };
        }
        return true;
      }
      const lg = testerLegende(p);
      if (lg) { selectionner(['legende']); s.glisser = { mode: 'legende', origine: p, depart: { x: lg.x, y: lg.y } }; return true; }
      const ds = testerDescriptif(p);   // v1.5.0
      if (ds) { selectionner(['descriptif']); s.glisser = { mode: 'descriptif', origine: p, depart: { x: ds.x, y: ds.y } }; return true; }
      if (ctx.pointerType === 'touch') return false;
      deselectionner();
      s.glisser = { mode: 'lasso', origine: p };
      return true;
    }
    case 'troncon': {
      if (ctx.pointerType === 'touch') return false;
      if (!s.polyligne) { const a = accrocher(p, tol); s.polyligne = [a ? { x: a.x, y: a.y } : p]; }
      s.glisser = { mode: 'segment' };
      return true;
    }
    case 'fourreau': {
      if (ctx.pointerType === 'touch') return false;
      if (s.fourreauEnCours) return false;
      const h = chercherObjet(p, tol, { types: ['troncon'] });
      if (h) return false;   // sur un tronçon : par appuis successifs
      if (!s.polyligne) { const a = accrocher(p, tol); s.polyligne = [a ? { x: a.x, y: a.y } : p]; }
      s.glisser = { mode: 'segment' };
      return true;
    }
    case 'annotation': {
      if (ctx.pointerType === 'touch') return false;
      const st = etat.preset && etat.preset.sous_type;
      if (st === 'stylo') { s.glisser = { mode: 'main-levee', points: [p] }; return true; }
      if (['fleche', 'fleche_double', 'fleche_texte', 'fleche_double_texte', 'cotation'].includes(st)) {
        // glisser = du premier point au second
        s.glisser = { mode: 'segment-annotation', depart: p };
        return true;
      }
      if (st === 'zone_hachuree' || st === 'trait') { if (!s.polyligne) s.polyligne = [p]; s.glisser = { mode: 'segment' }; return true; }
      // ponctuel : poser puis orienter
      const o = poserAnnotation(st, { x: p.x, y: p.y }, { sansValider: true });
      if (!o) return false;
      s.glisser = { mode: 'orienter', id: o.id, centre: { x: o.x, y: o.y } };
      return true;
    }
    case 'masque': {
      if (ctx.pointerType === 'touch') return false;
      const mode = etat.masque.mode;
      // Rectangle, rectangle arrondi et ellipse : même geste (glisser d'un coin à l'autre de la boîte, v13.4 §2)
      if (mode === 'rectangle' || mode === 'rectangle_arrondi' || mode === 'ellipse') { s.glisser = { mode: 'masque-rect', depart: p, forme: mode }; return true; }
      // Carré et rond (v1.4.6 §3) : même geste, boîte contrainte à 1:1 ; posés en rectangle / ellipse à proportions fixes
      if (mode === 'carre' || mode === 'rond') { s.glisser = { mode: 'masque-rect', depart: p, forme: mode === 'carre' ? 'rectangle' : 'ellipse', carre: true }; return true; }
      if (mode === 'pinceau') { s.glisser = { mode: 'masque-pinceau', points: [p] }; return true; }
      if (!s.polyligne) s.polyligne = [p];
      s.glisser = { mode: 'segment' };
      return true;
    }
    case 'gomme':
      s.glisser = { mode: 'gomme', supprimes: 0 };
      gommer(p, tol, false);
      return true;
    case 'note':
      return false;
    default: {
      if (ctx.pointerType === 'touch') return false;
      const o = poserPonctuel(p, tol, { sansValider: true });
      if (!o) return false;
      s.glisser = { mode: 'orienter', id: o.id, centre: { x: o.x, y: o.y } };
      return true;
    }
  }
}

export function glisser(p, ctx) {
  const g = s.glisser;
  if (!g) return;
  switch (g.mode) {
    case 'deplacer': {
      const dx = p.x - g.origine.x, dy = p.y - g.origine.y;
      for (const o of objetsSelectionnes()) {
        const av = g.avant.find((a) => a.id === o.id);
        if (av) deplacerObjet(o, av, dx, dy);
      }
      apercu(); break;
    }
    case 'bloc-mv': {
      const o = objetParId(g.id);
      if (o && o[g.bloc]) { o[g.bloc].dx = (g.avant.dx ?? 0) + (p.x - g.origine.x); o[g.bloc].dy = (g.avant.dy ?? 0) + (p.y - g.origine.y); apercu(); }
      break;
    }
    case 'bloc-rot': {
      const o = objetParId(g.id);
      if (o && o[g.bloc]) {
        let r = angleVers(g.centre, p) - g.decalage;
        if (ctx.shift) r = Math.round(r / 15) * 15;
        if (etat.accrochageAngulaire) r = Math.round(r / 45) * 45;
        o[g.bloc].rotation = ((Math.round(r) % 360) + 360) % 360; apercu();
      }
      break;
    }
    case 'bloc-ech': {
      const o = objetParId(g.id);
      if (o && o[g.bloc]) {
        const K = CHARTE.bloc_etiquette;
        const d = Math.hypot(p.x - g.centre.x, p.y - g.centre.y);
        o[g.bloc].echelle = Math.min(K.echelle_max, Math.max(K.echelle_min, Math.round(g.avant * (d / (g.d0 || 1)) * 100) / 100)); apercu();
      }
      break;
    }
    case 'echelle-lin': {
      const o = objetParId(g.id);
      if (o) {
        const K = CHARTE.echelle_lineaire;
        const d = Math.hypot(p.x - g.centre.x, p.y - g.centre.y);
        o.echelle_symbole = Math.min(K.max, Math.max(K.min, Math.round(g.avant * (d / (g.d0 || 1)) * 100) / 100)); apercu();
      }
      break;
    }
    case 'echelle-obj': {
      // Échelle d'un ponctuel, d'une annotation ou d'une note : rapport des distances au centre (v12 §2.1, §5.5)
      const o = objetParId(g.id);
      if (o) {
        const K = CHARTE.echelle_symbole;
        const d = Math.hypot(p.x - g.centre.x, p.y - g.centre.y);
        o.echelle_symbole = Math.min(K.max, Math.max(K.min, Math.round(g.avant * (d / (g.d0 || 1)) * 100) / 100)); apercu();
      }
      break;
    }
    case 'glissant': {
      const o = objetParId(g.id);
      const parent = o && objetParId(o.troncon_id);
      if (o && parent) {
        const sv = abscisseSurPolyligne(parent.points, p);
        if (g.index === 0) o.s_debut = sv; else o.s_fin = sv;
        apercu();
      }
      break;
    }
    case 'descriptif': {
      etat.plan.descriptif.x = g.depart.x + (p.x - g.origine.x);
      etat.plan.descriptif.y = g.depart.y + (p.y - g.origine.y);
      apercu(); break;
    }
    case 'largeur-descriptif': {
      // Largeur totale du bloc (la hauteur découle du contenu) ; bord gauche fixe ; colonnes ≥ largeur_min_colonne
      const d = etat.plan.descriptif, K = CHARTE.descriptif;
      const n = d.colonnes || 1;
      const min = 2 * K.marge + n * K.largeur_min_colonne + (n - 1) * K.espace_colonnes;
      d.x = g.x0; d.y = g.y0;
      d.largeur = Math.max(min, Math.round(((p.x - g.x0) / g.echelle) * 10) / 10);
      apercu(); break;
    }
    case 'legende': {
      etat.plan.legende.x = g.depart.x + (p.x - g.origine.x);
      etat.plan.legende.y = g.depart.y + (p.y - g.origine.y);
      apercu(); break;
    }
    case 'echelle-legende': {
      // Échelle = rapport des distances au coin haut-gauche (bornes charte.legende, v13 §5)
      const b = boiteLegende(etat.plan, objets());
      if (b) {
        const K = CHARTE.legende;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        etat.plan.legende.echelle = Math.min(K.echelle_max, Math.max(K.echelle_min, Math.round(g.avant * (d / (g.d0 || 1)) * 100) / 100)); apercu();
      }
      break;
    }
    case 'lasso':
      dessinerTemporaire([poly(rectPoints(g.origine, p), { ferme: true, couleur: CHARTE.ecran.selection, epaisseur: pxVersPlan(1), remplissage: CHARTE.ecran.lasso, tirete: [pxVersPlan(4), pxVersPlan(3)] })]);
      break;
    case 'segment':
      dessinerApercuPolyligne(p, ctx);
      break;
    case 'segment-annotation': {
      const st = etat.preset.sous_type;
      const faux = { type: 'annotation', sous_type: st, points: [g.depart, p], couleur: CHARTE.ecran.selection, epaisseur: 0.8, echelle_symbole: 1, echelle_plan_origine: null, texte: '', taille_texte: null, attributs: {} };
      dessinerTemporaire(primitivesAnnotation(faux, etat.projet.reglages));
      break;
    }
    case 'main-levee': {
      g.points.push(p);
      dessinerTemporaire([poly(g.points, { couleur: (etat.preset && etat.preset.couleur) || CHARTE.COULEURS_ANNOTATION[0], epaisseur: CHARTE.annotations.epaisseur_defaut, joint: 'round' })]);
      break;
    }
    case 'masque-rect': {
      const pts = rectPoints(g.depart, contraindreForme(g, p, ctx));
      const faux = { type: 'masque', sous_type: g.forme || 'rectangle', points: pts, couleur: etat.masque.couleur, opacite: etat.masque.opacite, attributs: { rayon: etat.masque.rayon, ratio_fixe: !!g.carre } };
      dessinerTemporaire([...primitivesMasque(faux), poly(pts, { ferme: true, couleur: CHARTE.masque.contour_ecran.couleur, epaisseur: pxVersPlan(1), tirete: [pxVersPlan(4), pxVersPlan(3)] })]);
      break;
    }
    case 'masque-pinceau': {
      g.points.push(p);
      const faux = { type: 'masque', sous_type: 'pinceau', points: g.points, couleur: etat.masque.couleur, opacite: etat.masque.opacite, attributs: { diametre: etat.masque.diametre } };
      dessinerTemporaire([...primitivesMasque(faux), poly(g.points, { couleur: CHARTE.masque.contour_ecran.couleur, epaisseur: pxVersPlan(0.8), tirete: [pxVersPlan(3), pxVersPlan(3)] })]);
      break;
    }
    case 'orienter': {
      const o = objetParId(g.id);
      if (o) { const d = Math.hypot(p.x - g.centre.x, p.y - g.centre.y); if (d > tolerance(ctx.pointerType) / 2) { o.rotation = angleVers(g.centre, p); apercu(); } }
      break;
    }
    case 'rotation': {
      const o = objetParId(g.id);
      if (o) {
        o.rotation = Math.round(angleVers(g.centre, p) - g.decalage); if (ctx.shift) o.rotation = Math.round(o.rotation / 15) * 15; if (etat.accrochageAngulaire) o.rotation = Math.round(o.rotation / 45) * 45;
        if (g.image) { const t = tournerAutourDuVisible(g.image, o.rotation); o.x = t.x; o.y = t.y; }   // v1.4.7 : pivot = centre visible
        apercu();
      }
      break;
    }
    case 'rotation-points': {
      // Polygone du Dessin (v1.4.6 §3) : les sommets tournent autour du centre de la forme, sans attribut de rotation
      const o = objetParId(g.id);
      if (o) {
        let d = angleVers(g.centre, p) - g.depart;
        if (ctx.shift) d = Math.round(d / 15) * 15;
        if (etat.accrochageAngulaire) d = Math.round(d / 45) * 45;
        o.points = g.avant.map((q) => tourner(q, g.centre, d)); apercu();
      }
      break;
    }
    case 'echelle-img': {
      // Image libre (v1.4.6 §2) : proportions toujours conservées, rapport des distances au centre.
      // v1.4.7 : centre = centre de la partie visible (fixe à l'écran) ; minimum sur la largeur visible.
      const o = objetParId(g.id);
      if (o) {
        const K = CHARTE.image;
        const d = Math.hypot(p.x - g.centre.x, p.y - g.centre.y);
        const l = Math.min(K.largeur_max, Math.max(K.largeur_min / fractionLargeurVisible(g.avant), g.avant.largeur * (d / (g.d0 || 1))));
        o.largeur = Math.round(l * 100) / 100; o.hauteur = Math.round(l * (g.avant.hauteur / (g.avant.largeur || 1)) * 100) / 100;
        const e = echelleAutourDuVisible(g.avant, o.largeur / (g.avant.largeur || 1));
        o.x = e.x; o.y = e.y;
        apercu();
      }
      break;
    }
    case 'deport': {
      const o = objetParId(g.id);
      if (o) {
        let dx = g.avant.dx + (p.x - g.origine.x), dy = g.avant.dy + (p.y - g.origine.y);
        if (Math.hypot(dx, dy) < tolerance(ctx.pointerType) / 2) { dx = 0; dy = 0; }
        o.deport = { dx, dy }; apercu();
      }
      break;
    }
    case 'tige': {
      const o = objetParId(g.id);
      if (o) {
        // Haut de tige fixe : la longueur est la projection du pointeur sur l'axe depuis le point du symbole (vers le bas)
        const c = o.type === 'annotation' ? { x: o.x, y: o.y } : centreSymbole(o);
        const a = ((o.rotation || 0) * Math.PI) / 180;
        const ux = -Math.sin(a), uy = Math.cos(a);
        const ech = facteurTige(o);
        const proj = ((p.x - c.x) * ux + (p.y - c.y) * uy - pxVersPlan(DECALAGE_TIGE_PX)) / ech;   // la poignée est décalée sous le pied des barres
        const B = o.type === 'eras' ? CHARTE.eras : CHARTE.malt;
        o.attributs.longueur_tige = Math.min(B.tige_max, Math.max(B.tige_min, Math.round(proj * 2) / 2)); apercu();
      }
      break;
    }
    case 'malt-tige': {
      // v1.5.2 : poignée du pied de la MALT portée par l'ouvrage — rotation autour du centre de l'ouvrage (angle) et
      // longueur (distance au centre), jamais plus courte que le symbole de l'ouvrage + dépassement minimal
      const o = objetParId(g.id);
      const gm = o ? geometrieSymboleMalt(o, etat.projet.reglages, primsObjet(o).rayon) : null;
      if (gm) {
        const K = CHARTE.malt;
        const vx = p.x - gm.centre.x, vy = p.y - gm.centre.y;
        const d = Math.hypot(vx, vy);
        if (d > 1e-6) {
          const pas = etat.accrochageAngulaire ? K.pas_angle_accroche : K.pas_angle;
          let angle = Math.round(((Math.atan2(-vx, vy) * 180) / Math.PI) / pas) * pas;
          angle = ((angle % 360) + 360) % 360;
          const t = (d - pxVersPlan(DECALAGE_TIGE_PX)) / (gm.echelle || 1);
          o.malt_symbole.angle = angle;
          o.malt_symbole.longueur_tige = Math.min(K.tige_max, Math.max(gm.tigeMin, Math.round(t * 2) / 2));
          apercu();
        }
      }
      break;
    }
    case 'sommet': {
      const o = objetParId(g.id);
      if (o) {
        const a = (o.type === 'annotation' || o.type === 'masque') ? null : accrocher(p, tolerance(ctx.pointerType), { exclureId: o.id });
        let q = a ? { x: a.x, y: a.y } : p;
        if (etat.accrochageAngulaire && !a) { const voisin = o.points[g.index - 1] || o.points[g.index + 1]; if (voisin) q = accrocherAngle(voisin, q); }
        if (o.type === 'masque' && FORMES_BOITE.includes(o.sous_type) && o.points.length === 4) {
          // rectangle conservé : le sommet opposé reste fixe, les deux voisins suivent (poignées de coin, v12 §8) ;
          // v1.4.6 §3 : dans le repère de la forme tournée, carré / rond gardent leurs proportions
          o.points = redimensionnerCoin(o.points, g.index, p, Number(o.rotation) || 0, !!(o.attributs && o.attributs.ratio_fixe));
        } else o.points[g.index] = q;
        apercu();
      }
      break;
    }
    case 'fleche': {
      const o = objetParId(g.id);
      if (o) { o.fleche = { x: p.x, y: p.y }; apercu(); }
      break;
    }
    case 'gomme':
      gommer(p, tolerance(ctx.pointerType), false);
      break;
    case 'rognage-poignee': {
      // v1.4.7 : côté ou coin suivi par le pointeur, dans le repère de l'image ; aperçu sans historique
      const o = objetParId(g.id);
      if (o && etat.rognage) { etat.rognage.recadrage = rognerParPoignee({ ...o, recadrage: etat.rognage.recadrage }, g.cote, p, CHARTE.image.recadrage.visible_min); apercu(); }
      break;
    }
    case 'rognage-fenetre': {
      // v1.4.7 : la fenêtre glisse sur l'image sans en sortir, taille visible conservée
      const o = objetParId(g.id);
      if (o && etat.rognage) { etat.rognage.recadrage = deplacerFenetreRognage(o, g.avant, p.x - g.origine.x, p.y - g.origine.y); apercu(); }
      break;
    }
  }
}

/* Facteur appliqué à la tige d'une MALT (objet ou libre) ou d'une ERAS pour convertir la poignée en longueur. */
function facteurTige(o) {
  const g = etat.projet.reglages.echelle_symbole || 1;
  const comp = compensationEchelle(o).symbole;
  if (o.type === 'eras') return g * comp;   // la tige de l'ERAS ne suit pas l'échelle du rond (v12 §5.4.2)
  const K = CHARTE.echelle_symbole;
  return g * comp * Math.min(K.max, Math.max(K.min, o.echelle_symbole || 1));
}

export function finGlisser(p, ctx) {
  const g = s.glisser;
  s.glisser = null;
  if (!g) return;
  switch (g.mode) {
    case 'deplacer': valider('Déplacement'); break;
    case 'bloc-mv': valider('Bloc déplacé'); break;
    case 'bloc-rot': valider('Rotation du bloc'); break;
    case 'bloc-ech': valider('Échelle du bloc'); break;
    case 'echelle-lin': valider('Échelle du trait'); break;
    case 'echelle-obj': valider('Échelle du symbole'); break;
    case 'glissant': valider('Extrémité du fourreau'); break;
    case 'legende': valider('Légende déplacée'); break;
    case 'descriptif': valider('Descriptif déplacé'); break;
    case 'largeur-descriptif': valider('Largeur du descriptif'); break;
    case 'echelle-legende': valider('Échelle de la légende'); break;
    case 'lasso': {
      viderTemporaire();
      const rect = { x: Math.min(g.origine.x, p.x), y: Math.min(g.origine.y, p.y), l: Math.abs(p.x - g.origine.x), h: Math.abs(p.y - g.origine.y) };
      selectionner(objetsDansRect(rect).map((o) => o.id), { ajouter: ctx.shift });
      break;
    }
    case 'segment': {
      const tol = tolerance(ctx.pointerType);
      const a = (etat.outil === 'annotation' || etat.outil === 'masque') ? null : accrocher(p, tol);
      let q = a ? { x: a.x, y: a.y } : p;
      const dernier = s.polyligne[s.polyligne.length - 1];
      if (etat.accrochageAngulaire && !a) q = accrocherAngle(dernier, q);
      if (Math.hypot(q.x - dernier.x, q.y - dernier.y) > tol / 2) s.polyligne.push(q);
      dessinerApercuPolyligne(null, ctx);
      break;
    }
    case 'segment-annotation': {
      viderTemporaire();
      if (Math.hypot(p.x - g.depart.x, p.y - g.depart.y) > tolerance(ctx.pointerType)) poserAnnotation(etat.preset.sous_type, { points: [g.depart, p] });
      break;
    }
    case 'main-levee': {
      viderTemporaire();
      const pts = simplifierPolyligne(g.points, pxVersPlan(CHARTE.annotations.stylo.tolerance_px));
      if (pts.length >= 2) poserAnnotation('stylo', { points: pts });
      break;
    }
    case 'masque-rect': {
      viderTemporaire();
      const q = contraindreForme(g, p, ctx);
      if (Math.abs(q.x - g.depart.x) > tolerance(ctx.pointerType) / 2 && Math.abs(q.y - g.depart.y) > tolerance(ctx.pointerType) / 2) poserMasque(g.forme || 'rectangle', rectPoints(g.depart, q), { ratio_fixe: !!g.carre });
      break;
    }
    case 'masque-pinceau': {
      viderTemporaire();
      const pts = simplifierPolyligne(g.points, pxVersPlan(CHARTE.masque.pinceau.tolerance_px));
      if (pts.length >= 1) poserMasque('pinceau', pts);   // un coup de pinceau = un seul objet, une seule étape d'annulation
      break;
    }
    case 'orienter': { valider('Objet posé'); const o = objetParId(g.id); apresPose(o, { fiche: !(o && o.type === 'annotation' && ANNOTATIONS_A_TEXTE.includes(o.sous_type)) }); break; }   // v1.4.9 §3.2 : après l'orientation
    case 'rotation': valider('Rotation'); break;
    case 'rotation-points': valider('Rotation'); break;
    case 'echelle-img': valider('Taille de l’image'); break;
    case 'deport': valider('Déport'); break;
    case 'tige': valider('Tige MALT'); break;
    case 'malt-tige': valider('MALT orientée'); break;
    case 'sommet': valider('Sommet déplacé'); break;
    case 'fleche': valider('Flèche de note'); break;
    case 'gomme': if (g.supprimes) valider('Suppression'); break;
    case 'rognage-poignee': case 'rognage-fenetre': break;   // v1.4.7 : écrit seulement à la validation du mode
  }
  dessinerPoignees();
}

/* Annule l'action en cours (Échap). */
export function annulerAction() {
  if (annulerRognage()) { notifier('Rognage annulé'); return true; }   // v1.4.7 : Échap annule d'abord le rognage
  if (annulerPipette()) return true;   // Échap annule d'abord un prélèvement armé (v13.3 §4.3)
  if (s.glisser) {
    if (['deplacer', 'rotation', 'rotation-points', 'echelle-img', 'sommet', 'bloc-mv', 'bloc-rot', 'bloc-ech', 'echelle-lin', 'echelle-obj', 'glissant', 'deport', 'tige', 'malt-tige', 'legende', 'echelle-legende', 'descriptif', 'largeur-descriptif'].includes(s.glisser.mode)) restaurerDernier();
    s.glisser = null;
  }
  if (s.polyligne) { s.polyligne = null; viderTemporaire(); notifier('Tracé abandonné'); return true; }
  if (s.fourreauEnCours) { s.fourreauEnCours = null; viderTemporaire(); notifier('Fourreau abandonné'); return true; }
  if (etat.blocActif) { etat.blocActif = null; }
  if (etat.selection.size) { deselectionner(); return true; }
  return false;
}

/* ---------- Sélection ---------- */
function appuiSelection(p, ctx, tol) {
  const h = chercherObjet(p, tol);
  if (h) {
    if (ctx.shift && etat.selection.has(h.objet.id)) { etat.selection.delete(h.objet.id); emettre('selection', [...etat.selection]); }
    else selectionner([h.objet.id], { ajouter: ctx.shift });
    etat.blocActif = ['etiquette', 'materiel', 'cartouche'].includes(h.partie) ? { id: h.objet.id, bloc: h.partie } : null;
    emettre('objet-touche', h.objet.id);
    return true;
  }
  if (testerLegende(p)) { selectionner(['legende']); return true; }
  if (testerDescriptif(p)) { selectionner(['descriptif']); return true; }   // v1.5.0
  deselectionner();
  emettre('fermer-panneaux');
  return true;
}

function objetsDansRect(rect) {
  const res = [];
  for (const o of objets()) {
    const b = boiteObjet(o);
    if (!b) continue;
    if (b.x >= rect.x && b.y >= rect.y && b.x + b.l <= rect.x + rect.l && b.y + b.h <= rect.y + rect.h) res.push(o);
  }
  return res;
}

function rectPoints(a, b) { return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }]; }

function deplacerObjet(o, av, dx, dy) {
  if (o.type === 'troncon' || (o.type === 'fourreau' && !o.troncon_id) || ((o.type === 'annotation' || o.type === 'masque') && av.points && av.points.length)) {
    o.points = av.points.map((q) => ({ x: q.x + dx, y: q.y + dy }));
    if (o.type === 'annotation' || o.type === 'masque') { o.x = (av.x || 0) + dx; o.y = (av.y || 0) + dy; }
    return;
  }
  if (o.type === 'fourreau' && o.troncon_id) {
    // fourreau accroché : glisse le long de son tronçon
    const parent = objetParId(o.troncon_id);
    if (!parent) return;
    const pts = parent.points;
    const c = pointSurPolyligne(pts, (av.s_debut + av.s_fin) / 2);
    const s1 = abscisseSurPolyligne(pts, { x: c.x + dx, y: c.y + dy });
    const delta = s1 - (av.s_debut + av.s_fin) / 2;
    const lg = av.s_fin - av.s_debut;
    let d0 = av.s_debut + delta, d1 = av.s_fin + delta;
    if (d0 < 0) { d0 = 0; d1 = lg; }
    if (d1 > 1) { d1 = 1; d0 = 1 - lg; }
    o.s_debut = d0; o.s_fin = d1;
    return;
  }
  o.x = av.x + dx; o.y = av.y + dy;
  if (o.type === 'note' && av.fleche) o.fleche = { x: av.fleche.x + dx, y: av.fleche.y + dy };
}

function angleVers(centre, p) {
  return (Math.atan2(p.y - centre.y, p.x - centre.x) * 180) / Math.PI + 90;
}

/* Déplacement au clavier (flèches) : pas en pixels écran. */
export function deplacerSelection(dxPx, dyPx) {
  if (bloque()) return;
  if (etat.selection.has('descriptif') && etat.plan && etat.plan.descriptif) {   // v1.5.0 : déplacement fin aux flèches
    const pos = positionDescriptif(etat.plan);
    etat.plan.descriptif.x = pos.x + pxVersPlan(dxPx);
    etat.plan.descriptif.y = pos.y + pxVersPlan(dyPx);
    valider('Descriptif déplacé');
    return;
  }
  const sel = objetsSelectionnes();
  if (!sel.length) return;
  const dx = pxVersPlan(dxPx), dy = pxVersPlan(dyPx);
  for (const o of sel) deplacerObjet(o, cloner(o), dx, dy);
  valider('Déplacement');
}

export async function supprimerSelection() {
  if (bloque()) return;
  if (etat.selection.has('legende')) { etat.selection.delete('legende'); definirLegendeVisible(false); }
  if (etat.selection.has('descriptif')) { etat.selection.delete('descriptif'); definirDescriptifVisible(false); }   // v1.5.0 : masque, comme la légende
  const ids = new Set(etat.selection);
  if (!ids.size) return;
  // Tronçons parents de fourreaux : supprimer aussi les fourreaux, ou les détacher (v11 §5.2)
  const fourreauxLies = objets().filter((o) => o.type === 'fourreau' && o.troncon_id && ids.has(o.troncon_id) && !ids.has(o.id));
  if (fourreauxLies.length) {
    const supprimerAussi = await confirmer(`${fourreauxLies.length} fourreau${fourreauxLies.length > 1 ? 'x' : ''} accroché${fourreauxLies.length > 1 ? 's' : ''} au tronçon supprimé.`, { ok: 'Supprimer aussi les fourreaux', annuler: 'Les détacher', danger: true });
    for (const f of fourreauxLies) {
      if (supprimerAussi) ids.add(f.id);
      else detacherFourreau(f);
    }
  }
  etat.plan.objets = objets().filter((o) => !ids.has(o.id));
  deselectionner();
  valider('Suppression');
}

/* Un fourreau détaché garde une géométrie figée. */
export function detacherFourreau(f) {
  f.points = pointsFourreau(f);
  f.troncon_id = null;
  f.s_debut = 0; f.s_fin = 1;
}

export function dupliquerSelection() {
  if (bloque()) return;
  const sel = objetsSelectionnes();
  if (!sel.length) return;
  const d = pxVersPlan(24);
  const clones = sel.map((o) => {
    const c = cloner(o); c.id = genererId(); c.repere = ''; c.repere_manuel = false; attribuerRepere(etat.projet, c);
    if (c.type === 'fourreau' && c.troncon_id) { const lg = c.s_fin - c.s_debut; c.s_debut = Math.min(1 - lg, c.s_fin); c.s_fin = c.s_debut + lg; }
    else deplacerObjet(c, o, d, d);
    return c;
  });
  etat.plan.objets.push(...clones);
  selectionner(clones.map((c) => c.id));
  valider('Duplication');
}

export function tournerSelection(deg) {
  if (bloque()) return;
  // Bloc d'étiquette actif : la touche R tourne le bloc, pas l'objet (v11 §2.2)
  if (etat.blocActif) {
    const o = objetParId(etat.blocActif.id);
    if (o && o[etat.blocActif.bloc]) { const b = o[etat.blocActif.bloc]; b.rotation = (((b.rotation || 0) + deg) % 360 + 360) % 360; valider('Rotation du bloc'); return; }
  }
  const sel = objetsSelectionnes().filter((o) => o.type !== 'troncon' && o.type !== 'fourreau' && (o.type !== 'masque' || masqueTournable(o)));
  if (!sel.length) return;
  for (const o of sel) {
    // Polygone du Dessin : sommets tournés autour du centre (v1.4.6 §3) ; toute autre forme : attribut rotation
    if (o.type === 'masque' && o.sous_type === 'polygone') { const c = centreBoite(o.points); o.points = o.points.map((q) => tourner(q, c, deg)); continue; }
    if (o.type === 'image') { const t = tournerAutourDuVisible(o, ((o.rotation || 0) + deg + 360) % 360); o.x = t.x; o.y = t.y; o.rotation = t.rotation; continue; }   // v1.4.7
    o.rotation = ((o.rotation || 0) + deg + 360) % 360;
  }
  valider('Rotation');
}

/* Échelle du bloc d'étiquette actif (ou de la désignation de la sélection) : raccourci Maj + / Maj − */
export function changerEchelleEtiquette(facteur) {
  if (bloque()) return;
  const K = CHARTE.bloc_etiquette;
  const cibles = [];
  if (etat.blocActif) { const o = objetParId(etat.blocActif.id); if (o && o[etat.blocActif.bloc]) cibles.push(o[etat.blocActif.bloc]); }
  else for (const o of objetsSelectionnes()) for (const cle of ['etiquette', 'materiel', 'cartouche']) if (o[cle]) cibles.push(o[cle]);
  if (!cibles.length) return;
  for (const b of cibles) b.echelle = Math.min(K.echelle_max, Math.max(K.echelle_min, Math.round((b.echelle || 1) * facteur * 100) / 100));
  valider('Échelle d’étiquette');
}

/* Réinitialise l'aspect d'un bloc (échelle, rotation, couleurs, cadre, fond, position). */
export function reinitialiserAspectBloc(id, bloc) {
  const o = objetParId(id);
  if (!o || !o[bloc]) return;
  const visible = o[bloc].visible;
  const aspect = aspectBlocParDefaut();
  if (bloc === 'cartouche') o.cartouche = blocParDefaut({ visible, dx: CHARTE.cartouche.decalage.dx, dy: CHARTE.cartouche.decalage.dy, couleur_contour: CHARTE.cartouche.contour, couleur_texte: CHARTE.texte.couleur_texte_defaut, fond: 'blanc' });
  else if (bloc === 'etiquette') o.etiquette = blocParDefaut({ visible, dx: CHARTE.texte.decalage_etiquette.dx, dy: CHARTE.texte.decalage_etiquette.dy, detail_malt: o.etiquette.detail_malt, ...aspect });
  else o.materiel = blocParDefaut({ visible, ...aspect });
  valider('Aspect du bloc réinitialisé');
}

/* Remet toutes les tailles à 1,0 sur la sélection (v11 §3). L'aspect hérité de l'échelle de plan d'origine est conservé (v12 §1.1). */
export function reinitialiserTailles() {
  const sel = objetsSelectionnes();
  if (!sel.length) return;
  for (const o of sel) {
    if (o.type === 'masque' || o.type === 'image') continue;
    o.echelle_symbole = 1;
    for (const cle of ['etiquette', 'materiel', 'cartouche']) if (o[cle]) o[cle].echelle = 1;
  }
  valider('Tailles réinitialisées');
}

/* Aligne tous les objets du projet sur l'échelle de plan courante : seul geste qui change l'aspect des anciens objets (v12 §1.1). */
export function alignerSurEchelleCourante() {
  if (bloque()) return 0;
  const org = origineEchelleCourante();
  let n = 0;
  for (const plan of etat.projet.plans) for (const o of plan.objets) { if (o.type === 'note') continue; o.echelle_plan_origine = { ...org }; n++; }
  valider('Objets alignés sur l’échelle courante');
  return n;
}

/* Modification groupée d'attributs communs (état, domaine, pose, calque…) — bandeau du bas, menu contextuel.
 * Le réseau passe par appliquerDomaine() : règle MALT réévaluée, type d'ERAS aligné, article incompatible conservé
 * mais signalé (v13 §1.2, §1.4). Un objet passé « à remplacer » reçoit son champ « remplacé par » vide (§2.2). */
export function modifierSelection(champs) {
  const sel = objetsSelectionnes().filter((o) => o.type !== 'annotation' && o.type !== 'masque' && o.type !== 'image');
  if (!sel.length) return;
  let incoherents = 0, maltsRetirees = 0;
  for (const o of sel) {
    const { domaine, ...reste } = champs;
    Object.assign(o, reste);
    if (domaine) {
      const avecMalt = o.type === 'eras' && !!o.attributs.avec_malt;
      appliquerDomaine(o, domaine);
      if (avecMalt && !o.attributs.avec_malt) maltsRetirees++;
      if (o.type !== 'note' && articleIncompatible(o)) incoherents++;
    }
    if (champs.etat && o.type !== 'note') { o.calque = calquePourEtat(champs.etat, o.type); if (!o.remplacement_par) o.remplacement_par = remplacementParDefaut(); }
    if (champs.pose && o.type === 'fourreau') o.pose = 'souterrain';
  }
  valider('Modification groupée');
  if (incoherents) notifier(incoherents + ' article' + (incoherents > 1 ? 's' : '') + ' incompatible' + (incoherents > 1 ? 's' : '') + ' avec le nouveau réseau : conservé' + (incoherents > 1 ? 's' : '') + ', objet' + (incoherents > 1 ? 's' : '') + ' « à compléter »', 3200);
  else if (maltsRetirees) notifier('MALT retirée : pas de MALT sur une remontée BRT / EP', 2400);
}

/* ---------- Légende pilotable (v13 §5) ---------- */
export function legendeAffichee() {
  return !!(etat.plan && etat.plan.legende && etat.plan.legende.visible !== false);
}

/* Masque ou affiche la légende sans perdre ses réglages (position, échelle, cadre, fond). Annulable. */
export function definirLegendeVisible(visible) {
  if (!etat.plan) return;
  if (!etat.plan.legende) etat.plan.legende = legendeParDefaut();
  if (!!etat.plan.legende.visible === !!visible) return;
  etat.plan.legende.visible = !!visible;
  if (!visible && etat.selection.has('legende')) { etat.selection.delete('legende'); emettre('selection', [...etat.selection]); }
  valider(visible ? 'Légende affichée' : 'Légende masquée');
}

export function basculerLegende() { definirLegendeVisible(!legendeAffichee()); }

/* Objet « Légende » de la boîte Outils : la repose (une seule légende par projet) et la sélectionne. */
export function poserLegende() {
  if (!etat.plan) return false;
  if (legendeAffichee()) { notifier('La légende est déjà affichée'); return false; }
  definirLegendeVisible(true);
  const b = boiteLegende(etat.plan, objets());
  if (!b) notifier('Légende vide : elle apparaîtra dès qu\'un ouvrage sera tracé', 2600);
  else selectionner(['legende']);
  return true;
}

/* ---------- Descriptif des travaux (v1.5.0 §2.8, §2.10) ---------- */
/* Bloc sous le point (boîte écran, page annexe comprise) ou null. */
export function testerDescriptif(p) {
  const b = etat.plan ? boiteDescriptif(etat.plan, { ecran: true }) : null;
  return b && p.x >= b.x && p.y >= b.y && p.x <= b.x + b.l && p.y <= b.y + b.h ? b : null;
}

export function descriptifAffiche() {
  return !!(etat.plan && etat.plan.descriptif && etat.plan.descriptif.visible !== false);
}

/* Masque ou affiche le bloc sans perdre ses réglages ni son texte. Annulable. */
export function definirDescriptifVisible(visible) {
  const d = etat.plan && etat.plan.descriptif;
  if (!d || !!d.visible === !!visible) return;
  if (bloque()) return;
  d.visible = !!visible;
  if (!visible && etat.selection.has('descriptif')) { etat.selection.delete('descriptif'); emettre('selection', [...etat.selection]); }
  valider(visible ? 'Descriptif affiché' : 'Descriptif masqué');
}

/* Outils → Descriptif : crée le descriptif du plan courant (génération complète) et le place ; s'il existe, le réaffiche. */
export function poserDescriptif() {
  if (!etat.plan || bloque()) return null;
  let cree = false;
  if (!etat.plan.descriptif) { genererDescriptif(etat.plan, etat.projet); cree = true; }
  else etat.plan.descriptif.visible = true;
  valider(cree ? 'Descriptif créé' : 'Descriptif affiché');
  selectionner(['descriptif']);
  return { cree, descriptif: etat.plan.descriptif };
}

/* « Supprimer le descriptif » (menu du bloc, confirmation par l'appelant) : plan.descriptif = null, annulable. */
export function supprimerDescriptif() {
  if (!etat.plan || bloque()) return;
  etat.plan.descriptif = null;
  if (etat.selection.has('descriptif')) { etat.selection.delete('descriptif'); emettre('selection', [...etat.selection]); }
  valider('Descriptif supprimé');
}

/* ---------- Image / photo libre (v1.4.6 §2) ---------- */
/* Pose une image déjà enregistrée dans `fonds` (images.js → enregistrerImage) au centre de la vue : largeur = fraction
 * de la largeur visible, proportions du fichier. Sélectionnée aussitôt pour régler taille, rotation et opacité. */
export function poserImage(fond_id, largeurPx, hauteurPx, nom_fichier, rectVisible) {
  if (bloque() || !etat.plan) return null;
  const K = CHARTE.image;
  const l = Math.min(K.largeur_max, Math.max(K.largeur_min, rectVisible.l * K.fraction_vue));
  const d = dimensionsImage(largeurPx, hauteurPx, l);
  const o = nouvelleImage(rectVisible.x + rectVisible.l / 2, rectVisible.y + rectVisible.h / 2, d.largeur, d.hauteur, fond_id, nom_fichier);
  attribuerRepere(etat.projet, o);
  etat.plan.objets.push(o);
  emettre('objet-pose', o);
  valider('Image posée');
  selectionner([o.id]);
  return o;
}

/* v1.5.4 (H-305) — Plan de situation : image de la carte IGN (déjà enregistrée dans `fonds`) posée au centre de la vue,
 * à la largeur de pose de la charte (mm papier), avec le rond rouge du point GPS. Retourne l'objet. */
export function poserPlanSituation(fond_id, carte, rectVisible) {
  if (bloque() || !etat.plan) return null;
  const S = CHARTE.situation;
  const l = S.largeur_pose_mm * MM;
  const h = Math.round(l * (carte.hauteurPx / (carte.largeurPx || 1)) * 100) / 100;
  const o = nouvelleImage(rectVisible.x + rectVisible.l / 2, rectVisible.y + rectVisible.h / 2, l, h, fond_id, carte.nom_fichier);
  o.situation = { lat: carte.lat, lon: carte.lon, zoom: carte.zoom, diametre_mm: S.rond.diametre_mm, source: 'PLANIGNV2', date: new Date().toISOString().slice(0, 10) };
  attribuerRepere(etat.projet, o);
  etat.plan.objets.push(o);
  emettre('objet-pose', o);
  valider('Plan de situation posé');
  selectionner([o.id]);
  return o;
}

/* Agrandir / réduire les symboles (ponctuels, annotations, notes) ou les traits (linéaires) sélectionnés. */
export function changerEchelleSelection(facteur) {
  const sel = objetsSelectionnes().filter((o) => o.type !== 'masque');
  if (!sel.length) return;
  const KL = CHARTE.echelle_lineaire, KS = CHARTE.echelle_symbole;
  for (const o of sel) {
    if (o.type === 'image') {   // v1.4.6 §2 : l'image change de taille, proportions conservées
      // v1.4.7 : autour du centre visible (même calcul que la poignée et la fiche) ; minimum sur la largeur visible
      const K = CHARTE.image, r = o.hauteur / (o.largeur || 1);
      const l = Math.min(K.largeur_max, Math.max(K.largeur_min / fractionLargeurVisible(o), o.largeur * facteur));
      const e = echelleAutourDuVisible(o, l / (o.largeur || 1));
      o.x = e.x; o.y = e.y; o.largeur = l; o.hauteur = o.largeur * r;
      continue;
    }
    const lin = o.type === 'troncon' || o.type === 'fourreau';
    const [mn, mx] = lin ? [KL.min, KL.max] : [KS.min, KS.max];
    o.echelle_symbole = Math.min(mx, Math.max(mn, Math.round((o.echelle_symbole || 1) * facteur * 100) / 100));
  }
  valider('Taille');
}

export function basculerEtiquettesSelection() {
  const sel = objetsSelectionnes().filter((o) => o.type !== 'masque' && o.type !== 'annotation' && o.type !== 'note' && o.type !== 'image');
  if (!sel.length) return;
  const cible = !sel.every((o) => o.etiquette.visible);
  for (const o of sel) { o.etiquette.visible = cible; if (o.materiel) o.materiel.visible = cible; if (o.cartouche) o.cartouche.visible = cible; }
  valider('Étiquettes');
}

/* ---------- MALT sur un ouvrage : deux commandes distinctes (v12 §5.1) ---------- */
/* « + MALT ex » : signale une MALT existante (étiquette « MALT ex »), sans aucun article. Bascule. */
export function basculerMaltExistante(ids = [...etat.selection]) {
  const cibles = ids.map(objetParId).filter((o) => o && TYPES_PONCTUELS.includes(o.type) && o.type !== 'malt');
  if (!cibles.length) return false;
  const cible = !cibles.every((o) => o.attributs.malt_ex);
  for (const o of cibles) { o.attributs.malt_ex = cible; if (cible) assurerSymboleMalt(o); }   // v1.5.1 : symbole posé d'office
  valider(cible ? MALT_CONDENSE.existante : 'MALT ex retirée');
  return cible;
}

/* « + Confection MALT » : ajoute les articles du package regles.packages.MALT (étiquette « Confection MALT »), quel que soit l'état de l'ouvrage. */
export function ajouterConfectionMalt(ids = [...etat.selection]) {
  const cibles = ids.map(objetParId).filter((o) => o && TYPES_PONCTUELS.includes(o.type) && o.type !== 'malt');
  if (!cibles.length) return 0;
  const lignes = lignesPackage('MALT');
  if (!lignes.length) { notifier('Package MALT absent de la nomenclature'); return 0; }
  let n = 0;
  for (const o of cibles) {
    if (o.materiel_associe.some((m) => m.package === 'MALT')) continue;   // une seule confection par ouvrage
    o.materiel_associe.push(...cloner(lignes)); n++;
    assurerSymboleMalt(o);   // v1.5.1 : symbole posé d'office
  }
  if (n) valider(MALT_CONDENSE.confection); else notifier('Confection MALT déjà présente sur l’ouvrage');
  return n;
}

export function retirerConfectionMalt(ids = [...etat.selection]) {
  const cibles = ids.map(objetParId).filter((o) => o && o.materiel_associe.some((m) => m.package === 'MALT'));
  if (!cibles.length) return;
  for (const o of cibles) o.materiel_associe = o.materiel_associe.filter((m) => m.package !== 'MALT');
  valider('Confection MALT retirée');
}

/* ---------- Pose d'objets ponctuels ---------- */
function poserPonctuel(p, tol, { sansValider = false } = {}) {
  const preset = etat.preset || { type: 'support', attributs: {} };
  if (preset.type === 'troncon') { notifier('Cet article se trace comme un tronçon : utilisez l’outil Tronçon.'); return null; }
  if (preset.type === 'fourreau') { notifier('Cet article se pose comme un fourreau : utilisez l’outil Fourreau (0).'); return null; }
  const a = accrocher(p, tol);
  const q = a ? { x: a.x, y: a.y } : p;
  const courant = { ...etat.courant };
  if (preset.domaine) courant.domaine = preset.domaine;
  if (preset.pose) courant.pose = preset.pose;
  const o = nouvelObjetPonctuel(preset.type, q.x, q.y, courant, preset.attributs || {});
  if (preset.ref_article) o.ref_article = preset.ref_article;
  // Outil 8 : une MALT à poser porte les articles du package ; une MALT existante / à remplacer / à déposer n'en a aucun (v12 §5.2)
  if (preset.type === 'malt' && o.etat === 'a_poser') o.materiel_associe = lignesPackage('MALT');
  attribuerRepere(etat.projet, o);
  etat.plan.objets.push(o);
  emettre('objet-pose', o);
  if (!sansValider) { valider('Objet posé'); apresPose(o); }   // glissement d'orientation : basculement à la fin du geste
  return o;
}

function poserNote(p) {
  const n = nouvelleNote(p.x, p.y, '');
  // Étiquette fléchée (v1.4.6 §4, boîte Outils) : note encadrée, flèche partant du coin du côté de la pointe ; la pointe
  // est placée à la validation du texte, quand la taille du cadre est connue (ui/notes.js)
  if (etat.preset && etat.preset.etiquette_flechee) { n.cadre = 'rectangle'; n.fleche_depart = 'coin'; n.etiquette_flechee = true; }
  attribuerRepere(etat.projet, n);
  etat.plan.objets.push(n);
  valider('Note');
  selectionner([n.id]);
  requestAnimationFrame(() => ouvrirEditeurNote(n.id, { nouvelle: true }));   // après la fin du geste (v13.4 §3)
  return true;
}

/* ---------- Polylignes (tronçon, fourreau seul, zone hachurée, trait, polygone de masque) ---------- */
function appuiPolyligne(p, ctx, tol) {
  const sansAccroche = etat.outil === 'annotation' || etat.outil === 'masque';
  const a = sansAccroche ? null : accrocher(p, tol);
  let q = a ? { x: a.x, y: a.y } : p;
  if (!s.polyligne) { s.polyligne = [q]; dessinerApercuPolyligne(null, ctx); return true; }
  const dernier = s.polyligne[s.polyligne.length - 1];
  if (Math.hypot(q.x - dernier.x, q.y - dernier.y) <= tol) { terminerPolyligne(); return true; }   // appui sur le dernier point = fin
  const premier = s.polyligne[0];
  const ferme = (etat.outil === 'annotation' && etat.preset && etat.preset.sous_type === 'zone_hachuree') || etat.outil === 'masque';
  if (ferme && s.polyligne.length > 2 && Math.hypot(q.x - premier.x, q.y - premier.y) <= tol) { terminerPolyligne(); return true; }   // zone / masque : appui sur le premier point = fermeture
  if (etat.accrochageAngulaire && !a) q = accrocherAngle(dernier, q);
  s.polyligne.push(q);
  dessinerApercuPolyligne(null, ctx);
  return true;
}

function dessinerApercuPolyligne(p, ctx) {
  if (!s.polyligne) { viderTemporaire(); return; }
  const pts = [...s.polyligne];
  let accroche = null;
  const sansAccroche = etat.outil === 'annotation' || etat.outil === 'masque';
  if (p) {
    const a = sansAccroche ? null : accrocher(p, tolerance(ctx ? ctx.pointerType : 'pen'));
    let q = a ? { x: a.x, y: a.y } : p;
    if (etat.accrochageAngulaire && !a) q = accrocherAngle(pts[pts.length - 1], q);
    pts.push(q);
    if (a) accroche = a;
  }
  let prims = [];
  if (pts.length > 1) {
    if (etat.outil === 'troncon') prims = primitivesTroncon({ domaine: etat.courant.domaine, pose: etat.courant.pose, etat: etat.courant.etat, points: pts, echelle_symbole: 1, echelle_plan_origine: null });
    else if (etat.outil === 'fourreau') prims = primitivesFourreau({ etat: etat.courant.etat, echelle_symbole: 1, echelle_plan_origine: null, troncon_id: null, attributs: { matiere: (etat.preset && etat.preset.attributs && etat.preset.attributs.matiere) || 'TPC' }, points: pts });
    else if (etat.outil === 'masque') prims = [...primitivesMasque({ type: 'masque', sous_type: 'polygone', points: pts.length > 2 ? pts : [], couleur: etat.masque.couleur, opacite: etat.masque.opacite, attributs: {} }), poly(pts, { couleur: CHARTE.masque.contour_ecran.couleur, epaisseur: pxVersPlan(1), tirete: [pxVersPlan(4), pxVersPlan(3)] })];
    else if (etat.outil === 'annotation' && etat.preset && etat.preset.sous_type === 'trait') prims = primitivesAnnotation({ type: 'annotation', sous_type: 'trait', points: pts, couleur: etat.preset.couleur || CHARTE.COULEURS_ANNOTATION[0], epaisseur: CHARTE.annotations.epaisseur_defaut, echelle_symbole: 1, echelle_plan_origine: null, attributs: { extremites: 'aucune', style: etat.preset.style || CHARTE.annotations.trait.styles[0] } }, etat.projet.reglages);
    else prims = [poly(pts, { couleur: CHARTE.ecran.selection, epaisseur: pxVersPlan(1.2), tirete: [pxVersPlan(4), pxVersPlan(3)] })];
  }
  const r = pxVersPlan(5);
  for (const q of s.polyligne) prims.push(cercle(q.x, q.y, r, { couleur: CHARTE.ecran.selection, epaisseur: pxVersPlan(1.5), remplissage: '#fff' }));
  const dernier = s.polyligne[s.polyligne.length - 1];
  prims.push(cercle(dernier.x, dernier.y, r * 1.8, { couleur: CHARTE.ecran.selection, epaisseur: pxVersPlan(1), remplissage: null, tirete: [pxVersPlan(3), pxVersPlan(2)] }));
  if (accroche) prims.push(cercle(accroche.x, accroche.y, pxVersPlan(7), { couleur: CHARTE.ecran.accrochage, epaisseur: pxVersPlan(1.5), remplissage: null }));
  dessinerTemporaire(prims);
}

export function terminerPolyligne() {
  if (!s.polyligne) return false;
  const pts = s.polyligne;
  s.polyligne = null;
  viderTemporaire();
  if (etat.outil === 'masque') {
    if (pts.length < 3) { notifier('Masque polygonal : au moins trois sommets.'); return false; }
    poserMasque('polygone', pts);
    return true;
  }
  if (etat.outil === 'annotation') {
    const st = etat.preset && etat.preset.sous_type;
    if (st === 'trait') {
      if (pts.length < 2) { notifier('Trait : au moins deux points.'); return false; }
      poserAnnotation('trait', { points: pts });
      return true;
    }
    if (pts.length < 3) { notifier('Zone : au moins trois sommets.'); return false; }
    poserAnnotation('zone_hachuree', { points: pts });
    return true;
  }
  if (pts.length < 2) { notifier('Tracé trop court : au moins deux points.'); return false; }
  const preset = etat.preset && (etat.preset.type === 'troncon' || etat.preset.type === 'fourreau') ? etat.preset : null;
  const courant = { ...etat.courant };
  if (preset && preset.domaine) courant.domaine = preset.domaine;
  if (preset && preset.pose) courant.pose = preset.pose;
  let t;
  if (etat.outil === 'fourreau') t = nouveauFourreau(courant, { points: pts, attributs: preset ? preset.attributs : {} });
  else t = nouveauTroncon(pts, courant, preset ? preset.attributs : {});
  if (preset && preset.ref_article) t.ref_article = preset.ref_article;
  attribuerRepere(etat.projet, t);
  etat.plan.objets.push(t);
  emettre('objet-pose', t);
  valider(etat.outil === 'fourreau' ? 'Fourreau tracé' : 'Tronçon tracé');
  apresPose(t);   // v1.4.9 §3.2 : tracé terminé (un tracé abandonné ou trop court n'arrive pas ici)
  return true;
}

export function polyligneEnCours() { return s.polyligne; }

/* ---------- Fourreau (v11 §5) ---------- */
function appuiFourreau(p, ctx, tol) {
  const h = chercherObjet(p, tol, { types: ['troncon'] });
  if (s.polyligne) return appuiPolyligne(p, ctx, tol);
  if (h) {
    const sv = abscisseSurPolyligne(h.objet.points, p);
    if (s.fourreauEnCours && s.fourreauEnCours.troncon_id === h.objet.id) {
      const f = s.fourreauEnCours; s.fourreauEnCours = null; viderTemporaire();
      if (Math.abs(sv - f.s_debut) < CHARTE.fourreau.portion_min) { notifier('Fourreau trop court.'); return true; }
      const preset = etat.preset && etat.preset.type === 'fourreau' ? etat.preset : null;
      const o = nouveauFourreau({ ...etat.courant }, { troncon_id: h.objet.id, s_debut: Math.min(f.s_debut, sv), s_fin: Math.max(f.s_debut, sv), attributs: preset ? preset.attributs : {} });
      if (preset && preset.ref_article) o.ref_article = preset.ref_article;
      attribuerRepere(etat.projet, o);
      etat.plan.objets.push(o);
      emettre('objet-pose', o);
      valider('Fourreau posé');
      selectionner([o.id]);
      apresPose(o);   // v1.4.9 §3.2
      return true;
    }
    s.fourreauEnCours = { troncon_id: h.objet.id, s_debut: sv };
    dessinerApercuFourreau(null, ctx);
    notifier('Second appui sur le tracé pour fixer l’autre extrémité');
    return true;
  }
  if (s.fourreauEnCours) { notifier('Appuyez sur le même tronçon pour terminer, Échap pour abandonner'); return true; }
  return appuiPolyligne(p, ctx, tol);   // fourreau seul
}

function dessinerApercuFourreau(p, ctx) {
  const f = s.fourreauEnCours;
  if (!f) return;
  const parent = objetParId(f.troncon_id);
  if (!parent) { s.fourreauEnCours = null; return; }
  const a = pointSurPolyligne(parent.points, f.s_debut);
  const prims = [cercle(a.x, a.y, pxVersPlan(6), { couleur: CHARTE.ecran.accrochage, epaisseur: pxVersPlan(2), remplissage: '#fff' })];
  if (p) {
    const sv = abscisseSurPolyligne(parent.points, p);
    const faux = { etat: etat.courant.etat, echelle_symbole: 1, echelle_plan_origine: null, troncon_id: null, attributs: { matiere: (etat.preset && etat.preset.attributs && etat.preset.attributs.matiere) || 'TPC' }, points: portionPolyligne(parent.points, f.s_debut, sv) };
    if (faux.points.length > 1) prims.unshift(...primitivesFourreau(faux));
  }
  dessinerTemporaire(prims);
  void ctx;
}

/* ---------- Annotations (v11 §6, v12 §2) ---------- */
function appuiAnnotation(p, ctx, tol) {
  const st = etat.preset && etat.preset.sous_type;
  if (!st) { notifier('Choisissez un outil dans la boîte « Outils »'); return true; }
  if (st === 'zone_hachuree' || st === 'trait') return appuiPolyligne(p, ctx, tol);
  if (['fleche', 'fleche_double', 'fleche_texte', 'fleche_double_texte', 'cotation'].includes(st)) {
    if (!s.polyligne) { s.polyligne = [p]; dessinerApercuPolyligne(null, ctx); return true; }
    const pts = [s.polyligne[0], p]; s.polyligne = null; viderTemporaire();
    if (Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) <= tol) return true;
    poserAnnotation(st, { points: pts });
    return true;
  }
  if (st === 'stylo') { notifier('Stylo : glissez au stylet (tracé à main levée)'); return true; }
  const o = poserAnnotation(st, { x: p.x, y: p.y });
  apresPose(o, { fiche: !ANNOTATIONS_A_TEXTE.includes(st) });   // v1.4.9 §3.2 : annotations ponctuelles seulement
  return true;
}

function poserAnnotation(st, { x = 0, y = 0, points = null }, { sansValider = false } = {}) {
  const o = nouvelleAnnotation(st, { x, y, points });
  if (etat.preset && etat.preset.couleur) o.couleur = etat.preset.couleur;
  if (st === 'trait' && etat.preset && etat.preset.style) o.attributs.style = etat.preset.style;   // v1.4.4 §1 : suit le réglage de la barre d'options, comme la couleur
  attribuerRepere(etat.projet, o);
  etat.plan.objets.push(o);
  emettre('objet-pose', o);
  if (!sansValider) valider('Annotation');
  if (ANNOTATIONS_A_TEXTE.includes(st)) {
    // Ouverture APRÈS la fin du geste : showModal() dans le gestionnaire de pointerup expose la boîte au click
    // résiduel du même appui (v13.4 §3). La saisie annulée laisse l'annotation en place, texte vide : une
    // annotation qui disparaît sans trace est le pire retour possible.
    requestAnimationFrame(() => {
      demander(LIBELLES.annotations[st] || 'Texte', [{ nom: 't', libelle: st === 'cotation' ? 'Valeur (ex. 12,5 m)' : 'Texte', valeur: '' }]).then((r) => {
        const obj = objetParId(o.id);
        if (!obj) return;
        if (r && r.t.trim()) { obj.texte = r.t.trim(); valider('Texte d’annotation'); }
        else notifier('Texte non renseigné : ' + (LIBELLES.annotations[st] || 'annotation') + ' conservée, texte à saisir dans sa fiche', 3200);
      });
    });
  }
  return o;
}

/* ---------- Gomme magique : masques du fond de plan (v12 §8) ---------- */
function appuiMasque(p, ctx, tol) {
  const mode = etat.masque.mode;
  if (mode === 'polygone' || s.polyligne) return appuiPolyligne(p, ctx, tol);
  if (mode === 'pinceau') {
    // un appui bref au pinceau : une pastille ronde du diamètre courant
    poserMasque('pinceau', [p]);
    return true;
  }
  notifier('Rectangle : glissez au stylet d’un coin à l’autre');
  return true;
}

/* Dessin tournable : rectangle, rectangle arrondi, ellipse (attribut rotation) et polygone (sommets tournés). */
function masqueTournable(o) {
  return !!(o && o.type === 'masque' && (FORMES_BOITE.includes(o.sous_type) || o.sous_type === 'polygone'));
}

/* Ellipse : Maj enfoncé ou accrochage angulaire actif → cercle (boîte carrée). Carré et rond : toujours (v1.4.6 §3). */
function contraindreForme(g, p, ctx) {
  if (g.carre) return contraindreCarre(g.depart, p);
  if (g.forme !== 'ellipse' || !(ctx && ctx.shift) && !etat.accrochageAngulaire) return p;
  const c = Math.max(Math.abs(p.x - g.depart.x), Math.abs(p.y - g.depart.y));
  return { x: g.depart.x + Math.sign(p.x - g.depart.x || 1) * c, y: g.depart.y + Math.sign(p.y - g.depart.y || 1) * c };
}

function poserMasque(sous_type, points, { ratio_fixe = false } = {}) {
  const o = nouveauMasque(sous_type, points, { diametre: etat.masque.diametre, rayon: etat.masque.rayon });
  if (ratio_fixe) o.attributs.ratio_fixe = true;   // carré / rond (v1.4.6 §3)
  o.couleur = etat.masque.couleur;
  o.opacite = etat.masque.opacite;
  o.attributs.surligneur = !!etat.masque.surligneur;   // au-dessus des ouvrages (v13.3 §4.1 bis)
  attribuerRepere(etat.projet, o);
  etat.plan.objets.push(o);
  emettre('objet-pose', o);
  valider(o.attributs.surligneur ? 'Surlignage' : 'Dessin');
  return o;
}

/* ---------- Pipette (v13.3 §4.3) ---------- */
/* Arme le prélèvement : l'appui suivant sur le plan prend une couleur. `retour` reçoit le HEX prélevé. */
export function armerPipette(retour) {
  etat.pipette = { retour: typeof retour === 'function' ? retour : null };
  emettre('pipette', true);
  notifier('Pipette : touchez un ouvrage pour reprendre sa couleur, ou le fond pour prélever sa teinte (Échap pour annuler)', 4000);
}

export function annulerPipette(silencieux = false) {
  if (!etat.pipette) return false;
  etat.pipette = null;
  emettre('pipette', false);
  if (!silencieux) notifier('Pipette annulée');
  return true;
}

export function pipetteArmee() { return !!etat.pipette; }

/* Prélèvement : l'objet tracé sous le point prime sur le fond — viser un trait pour en reprendre la teinte est un
 * geste délibéré, viser le vide ne peut désigner que le fond. La couleur rendue est celle réellement affichée. */
function prelever(p, tol) {
  const retour = etat.pipette && etat.pipette.retour;
  const h = chercherObjet(p, tol);
  let couleur = null, source = null;
  if (h && h.objet) {
    couleur = couleurAffichee(h.objet);
    source = (LIBELLES.types[h.objet.type] || 'objet') + (h.objet.repere ? ' ' + h.objet.repere : '');
  }
  if (!couleur) {
    const r = couleurAuPoint(p);
    if (r.couleur) { couleur = r.couleur; source = 'fond de plan'; }
    else { annulerPipette(true); notifier(r.erreur === 'illisible' ? 'Pipette indisponible : fond de plan non lisible' : 'Pipette indisponible : aucun fond de plan chargé', 3200); return true; }
  }
  annulerPipette(true);
  etat.masque.couleur = couleur;
  if (retour) retour(couleur);
  notifier('Couleur prélevée sur ' + (source === 'fond de plan' ? 'le fond de plan' : 'le ' + source) + ' : ' + couleur, 2600);
  emettre('couleur-outil', couleur);
  return true;
}

/* Couleur effectivement affichée d'un objet : couleur de réseau calculée pour un ouvrage, couleur propre pour une
 * annotation, une note ou un dessin. Retourne null si l'objet n'en porte aucune (cartouche, étiquette seules). */
export function couleurAffichee(o) {
  if (!o || o.type === 'image') return null;   // image libre : pas de couleur propre (la pipette lit alors le fond)
  if (o.type === 'masque' || o.type === 'annotation' || o.type === 'note') {
    const c = o.couleur || (o.type === 'masque' ? CHARTE.masque.couleur_defaut : CHARTE.notes.couleur_defaut);
    return /^#[0-9A-Fa-f]{6}$/.test(c) ? c.toUpperCase() : null;
  }
  if (o.type === 'poste') return CHARTE.poste.couleur;
  if (o.type === 'malt') return couleurObjetMalt(o).toUpperCase();   // v1.5.1 : grise / BT / HTA
  if (o.type === 'support' || o.type === 'coffret' || o.type === 'armoire_ep') return '#000000';
  if (o.type === 'fourreau') return couleurFourreau(o).toUpperCase();   // v1.4.9 : couleur du fourreau (charte ou manuelle)
  const c = o.type === 'troncon' ? styleTroncon(o.domaine, o.pose, o.etat, o.couleur_manuelle).couleur : couleurReseau(o.domaine, o.pose, o.etat);
  return typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c) ? c.toUpperCase() : null;
}

/* ---------- Gomme ---------- */
function gommer(p, tol, validerTout) {
  const h = chercherObjet(p, tol);
  if (!h) return false;
  etat.plan.objets = objets().filter((o) => o.id !== h.objet.id);
  etat.selection.delete(h.objet.id);
  if (s.glisser && s.glisser.mode === 'gomme') s.glisser.supprimes++;
  if (validerTout) valider('Suppression'); else apercu();
  return true;
}

export function appuiGomme(p, ctx) { if (bloque()) return; gommer(p, tolerance(ctx.pointerType), true); }
export function debutGlisserGomme(p, ctx) { if (bloque()) { s.glisser = null; return true; } s.glisser = { mode: 'gomme', supprimes: 0 }; gommer(p, tolerance(ctx.pointerType), false); return true; }
export function finGlisserGomme(p, ctx) { finGlisser(p, ctx); }

/* ---------- Rognage d'une image libre (v1.4.7 §1) ---------- */
/* Principe : le binaire n'est jamais touché ; o.recadrage est un masque réversible. Pendant le mode, le recadrage en
 * cours vit dans etat.rognage (rendu, poignées, gestes) : rien n'est écrit dans l'objet, donc rien ne peut être
 * sauvegardé ni entrer dans l'historique avant « Valider » (une seule étape « Rognage de l'image »). */
function etatImage(o) {
  return { x: o.x, y: o.y, largeur: o.largeur, hauteur: o.hauteur, rotation: o.rotation || 0, recadrage: lireRecadrage(o.recadrage) };
}

function fractionLargeurVisible(o) {
  const r = lireRecadrage(o.recadrage);
  return Math.max(CHARTE.image.recadrage.visible_min, 1 - r.g - r.d);
}

export function rognageActif() { return !!etat.rognage; }

/* Entrée du mode : bouton « Rogner » de la fiche, menu contextuel, touche C. Une seule image, calque utilisable. */
export function entrerRognage(id = null) {
  if (bloque()) return false;
  const cible = id || (etat.selection.size === 1 ? [...etat.selection][0] : null);
  const o = cible ? objetParId(cible) : null;
  if (!o || o.type !== 'image') { notifier('Rognage : sélectionnez une seule image', 2400); return false; }
  const c = etat.projet.calques[o.calque] || etat.projet.calques.images;
  if (c && (!c.visible || c.verrou)) { notifier('Calque « Images et photos » masqué ou verrouillé : rognage impossible', 3000); return false; }
  if (etat.rognage && etat.rognage.id === o.id) return true;
  annulerRognage();
  if (etat.outil !== 'selection') definirOutil('selection');
  if (etat.pipette) annulerPipette(true);
  s.glisser = null;
  selectionner([o.id]);
  etat.blocActif = null;
  etat.poigneeActive = null;
  etat.rognage = { id: o.id, recadrage: lireRecadrage(o.recadrage) };
  emettre('rognage', true);
  apercu();
  return true;
}

/* Valider : bouton flottant, Entrée, appui hors de l'image. Une étape d'historique si le recadrage a changé. */
export function validerRognage() {
  const r = etat.rognage;
  if (!r) return false;
  etat.rognage = null;
  s.glisser = null;
  emettre('rognage', false);
  const o = objetParId(r.id);
  const avant = o ? lireRecadrage(o.recadrage) : null;
  const arrondi = (v) => Math.round(v * 1e6) / 1e6;
  const n = bornerRecadrage({ g: arrondi(r.recadrage.g), h: arrondi(r.recadrage.h), d: arrondi(r.recadrage.d), b: arrondi(r.recadrage.b) }, CHARTE.image.recadrage.visible_min);
  if (!o || (n.g === avant.g && n.h === avant.h && n.d === avant.d && n.b === avant.b)) { apercu(); dessinerPoignees(); return false; }
  o.recadrage = n;
  valider('Rognage de l’image');
  return true;
}

/* Annuler : bouton « Annuler », Échap, changement d'outil / de plan / de projet. Rien n'a été écrit : rien à défaire. */
export function annulerRognage() {
  if (!etat.rognage) return false;
  etat.rognage = null;
  if (s.glisser && String(s.glisser.mode).startsWith('rognage')) s.glisser = null;
  emettre('rognage', false);
  apercu();
  dessinerPoignees();
  return true;
}

/* « Réinitialiser le rognage » (fiche) : image entière, une étape d'historique. */
export function reinitialiserRognage(id) {
  if (bloque()) return false;
  const o = objetParId(id);
  if (!o || o.type !== 'image' || recadrageNul(o.recadrage)) return false;
  o.recadrage = { g: 0, h: 0, d: 0, b: 0 };
  valider('Rognage réinitialisé');
  return true;
}

/* Appui bref pendant le mode : dans l'image entière (partie grisée comprise) = rien ; ailleurs = validation. */
function appuiRognage(p, tol) {
  const o = objetParId(etat.rognage.id);
  if (!o) { annulerRognage(); return true; }
  if (dansRectangleTourne(p, o.x, o.y, o.largeur || 0, o.hauteur || 0, o.rotation || 0, tol / 2)) return true;
  validerRognage();
  return true;
}

/* Glissement pendant le mode : poignée de rognage, ou intérieur de la partie retenue (déplace la fenêtre).
 * Ailleurs : navigation (le plan se déplace, le mode reste actif). */
function debutGlisserRognage(p, ctx) {
  const o = objetParId(etat.rognage.id);
  if (!o) { annulerRognage(); return false; }
  const [role, , cote] = String(ctx.poignee || '').split(':');
  if (role === 'rog') { s.glisser = { mode: 'rognage-poignee', id: o.id, cote }; return true; }
  if (ctx.poignee) return false;
  const v = rectangleVisible({ ...o, recadrage: etat.rognage.recadrage });
  if (dansRectangleTourne(p, v.cx, v.cy, v.l, v.h, o.rotation || 0, 0)) {
    s.glisser = { mode: 'rognage-fenetre', id: o.id, origine: p, avant: { ...etat.rognage.recadrage } };
    return true;
  }
  return false;
}

/* Poignées du mode : cadre tireté de la partie retenue, 4 coins, 4 milieux de côté (zone tactile commune ≥ 44 px). */
function poigneesRognage() {
  const o = objetParId(etat.rognage.id);
  if (!o) return [];
  const rot = o.rotation || 0;
  const v = rectangleVisible({ ...o, recadrage: etat.rognage.recadrage });
  const c = coinsRectangleTourne(v.cx, v.cy, v.l, v.h, rot);   // hg, hd, bd, bg
  const mil = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const res = [{ forme: 'cadre-rognage', points: c }];
  const cotes = [['h', mil(c[0], c[1]), rot], ['d', mil(c[1], c[2]), rot + 90], ['b', mil(c[2], c[3]), rot], ['g', mil(c[3], c[0]), rot + 90]];
  for (const [k, q, angle] of cotes) res.push({ id: `rog:${o.id}:${k}`, role: 'rognage-cote', forme: 'barre-rognage', angle, x: q.x, y: q.y });
  ['hg', 'hd', 'bd', 'bg'].forEach((k, i) => res.push({ id: `rog:${o.id}:${k}`, role: 'rognage-coin', forme: 'coin-rognage', coin: k, angle: rot, x: c[i].x, y: c[i].y }));
  return res;
}

/* ---------- Poignées ---------- */
function debutPoignee(id, p, ctx) {
  const [role, objId, idx] = id.split(':');
  if (role === 'echelle-legende') {
    const b = boiteLegende(etat.plan, objets());
    if (!b) return false;
    s.glisser = { mode: 'echelle-legende', d0: Math.hypot(p.x - b.x, p.y - b.y), avant: echelleLegende(etat.plan) };
    return true;
  }
  if (role === 'legende-x' || role === 'descriptif-x') return false;   // appui bref seulement (appuiPoignee)
  if (role === 'largeur-descriptif') {
    const pos = etat.plan && etat.plan.descriptif ? positionDescriptif(etat.plan) : null;
    if (!pos) return false;
    s.glisser = { mode: 'largeur-descriptif', x0: pos.x, y0: pos.y, echelle: pos.echelle };
    return true;
  }
  const o = objetParId(objId);
  if (!o) return false;
  const r = primsObjet(o);
  switch (role) {
    case 'rotation': {
      if (o.type === 'masque' && o.sous_type === 'polygone') {
        const centre = centreBoite(o.points);
        s.glisser = { mode: 'rotation-points', id: o.id, centre, depart: angleVers(centre, p), avant: cloner(o.points) };
        return true;
      }
      if (o.type === 'image') {   // v1.4.7 : pivot au centre de la partie visible
        const v = rectangleVisible(o), centre = { x: v.cx, y: v.cy };
        s.glisser = { mode: 'rotation', id: o.id, centre, decalage: angleVers(centre, p) - (o.rotation || 0), image: etatImage(o) };
        return true;
      }
      const centre = o.type === 'masque' ? centreBoite(o.points) : ((o.type === 'note' || o.type === 'annotation') ? { x: o.x, y: o.y } : centreSymbole(o));
      s.glisser = { mode: 'rotation', id: o.id, centre, decalage: angleVers(centre, p) - (o.rotation || 0) };
      return true;
    }
    case 'echelle-img': {
      const v = rectangleVisible(o), c = { x: v.cx, y: v.cy };   // v1.4.7 : centre visible (= centre de l'image sans rognage)
      s.glisser = { mode: 'echelle-img', id: o.id, centre: c, d0: Math.hypot(p.x - c.x, p.y - c.y), avant: etatImage(o) };
      return true;
    }
    case 'deport': s.glisser = { mode: 'deport', id: o.id, origine: p, avant: { dx: o.deport.dx || 0, dy: o.deport.dy || 0 } }; return true;
    case 'tige': s.glisser = { mode: 'tige', id: o.id }; return true;
    case 'malt-tige': s.glisser = { mode: 'malt-tige', id: o.id }; return true;
    case 'sommet': s.glisser = { mode: 'sommet', id: o.id, index: parseInt(idx, 10) }; return true;
    case 'milieu': {
      const i = parseInt(idx, 10);
      o.points.splice(i + 1, 0, { x: p.x, y: p.y });
      s.glisser = { mode: 'sommet', id: o.id, index: i + 1 };
      return true;
    }
    case 'glissant': s.glisser = { mode: 'glissant', id: o.id, index: parseInt(idx, 10) }; return true;
    case 'echelle-lin': {
      const pts = o.type === 'fourreau' ? pointsFourreau(o) : o.points;
      const m = milieuPolyligne(pts);
      s.glisser = { mode: 'echelle-lin', id: o.id, centre: { x: m.x, y: m.y }, d0: Math.hypot(p.x - m.x, p.y - m.y), avant: o.echelle_symbole || 1 };
      return true;
    }
    case 'echelle-obj': {
      const c = centreEchelle(o, r);
      s.glisser = { mode: 'echelle-obj', id: o.id, centre: c, d0: Math.hypot(p.x - c.x, p.y - c.y), avant: o.echelle_symbole || 1 };
      return true;
    }
    case 'bloc-mv': etat.blocActif = { id: o.id, bloc: idx }; s.glisser = { mode: 'bloc-mv', bloc: idx, origine: p, id: o.id, avant: cloner(o[idx]) }; return true;
    case 'bloc-rot': {
      const c = centreBloc(r, idx); if (!c) return false;
      etat.blocActif = { id: o.id, bloc: idx };
      s.glisser = { mode: 'bloc-rot', bloc: idx, id: o.id, centre: c, decalage: angleVers(c, p) - (o[idx].rotation || 0) };
      return true;
    }
    case 'bloc-ech': {
      const c = centreBloc(r, idx); if (!c) return false;
      etat.blocActif = { id: o.id, bloc: idx };
      s.glisser = { mode: 'bloc-ech', bloc: idx, id: o.id, centre: c, d0: Math.hypot(p.x - c.x, p.y - c.y), avant: o[idx].echelle || 1 };
      return true;
    }
    case 'cartouche-x': return false;   // appui bref seulement (appuiPoignee)
    case 'fleche': s.glisser = { mode: 'fleche', id: o.id }; return true;
    default: return false;
  }
}

/* Centre de référence de la poignée d'échelle d'un objet. */
function centreEchelle(o, r) {
  if (o.type === 'note') return { x: o.x, y: o.y };
  if (o.type === 'annotation') return centreAnnotation(o);
  return r.centre || centreSymbole(o);
}

function centreBloc(r, bloc) {
  return bloc === 'etiquette' ? r.centreEtiquette : (bloc === 'materiel' ? r.centreMateriel : r.centreCartouche);
}

/* Poignées d'un bloc d'étiquette : déplacement (coin haut-gauche), rotation, échelle (coin bas-droit) ; croix de masquage sur le cartouche. */
function poigneesBloc(o, r, bloc) {
  const res = [];
  const coins = bloc === 'etiquette' ? r.coinsEtiquette : (bloc === 'materiel' ? r.coinsMateriel : null);
  const c = centreBloc(r, bloc);
  if (!c) return res;
  if (coins) {
    res.push({ id: 'bloc-mv:' + o.id + ':' + bloc, role: 'etiquette', forme: 'petit', x: coins.hg.x, y: coins.hg.y });
    res.push({ id: 'bloc-ech:' + o.id + ':' + bloc, role: 'bloc-ech', forme: 'echelle', x: coins.bd.x, y: coins.bd.y });
    const rot = ((o[bloc].rotation || 0) * Math.PI) / 180;
    const d = pxVersPlan(26);
    const hd = coins.hd;
    res.push({ id: 'bloc-rot:' + o.id + ':' + bloc, role: 'bloc-rot', forme: 'rond', x: hd.x + Math.sin(rot) * d, y: hd.y - Math.cos(rot) * d });
  } else {
    const b = r.boiteCartouche;
    // poignées du cartouche vers le haut (loin du bloc de désignation qui commence en dessous à droite du symbole)
    res.push({ id: 'bloc-mv:' + o.id + ':' + bloc, role: 'cartouche', forme: 'petit', x: b.x + b.l, y: b.y });
    res.push({ id: 'bloc-ech:' + o.id + ':' + bloc, role: 'bloc-ech', forme: 'echelle', x: b.x, y: b.y });
    res.push({ id: 'bloc-rot:' + o.id + ':' + bloc, role: 'bloc-rot', forme: 'rond', x: c.x, y: b.y - pxVersPlan(26) });
    // croix de masquage du cartouche (v12 §3.3) : en bas à droite, indépendante du reste de l'objet
    res.push({ id: 'cartouche-x:' + o.id, role: 'cartouche-x', forme: 'x', x: b.x + b.l, y: b.y + b.h });
  }
  return res;
}

function poignees() {
  const res = [];
  if (!etat.plan) return res;
  // Ordre d'empilement : gros repères dessous, petites poignées devant (v11 §1.3) ; la poignée active passe au-dessus (rendu-svg)
  const PRIORITE = { contour: 0, lien: 0, rotation: 1, 'bloc-rot': 1, deport: 2, tige: 3, sommet: 4, glissant: 4, fleche: 4, echelle: 5, 'bloc-ech': 5, 'echelle-lin': 5, 'echelle-obj': 5, milieu: 6, etiquette: 7, cartouche: 7, 'cartouche-x': 8, 'legende-x': 8, 'descriptif-x': 8, 'largeur-descriptif': 5, 'rognage-cote': 5, 'rognage-coin': 6 };
  const trier = (l) => l.sort((a, b) => (PRIORITE[a.role || a.forme] || 0) - (PRIORITE[b.role || b.forme] || 0));
  if (etat.rognage) return trier(poigneesRognage());   // v1.4.7 : seules les poignées de rognage pendant le mode
  if (etat.selection.has('legende') || etat.survolLegende) {
    const b = boiteLegende(etat.plan, objets());
    if (b) {
      if (etat.selection.has('legende')) { res.push({ forme: 'contour', ...b }); res.push({ id: 'echelle-legende', role: 'echelle', forme: 'echelle', x: b.x + b.l, y: b.y + b.h }); }
      // croix de masquage : en haut à droite, au survol comme à la sélection (v13 §5)
      res.push({ id: 'legende-x', role: 'legende-x', forme: 'x', x: b.x + b.l, y: b.y });
    }
  }
  if (etat.selection.has('descriptif') || etat.survolDescriptif) {   // v1.5.0
    const b = boiteDescriptif(etat.plan, { ecran: true });
    if (b) {
      if (etat.selection.has('descriptif') && peutModifier()) { res.push({ forme: 'contour', ...b }); res.push({ id: 'largeur-descriptif', role: 'largeur-descriptif', forme: 'echelle', x: b.x + b.l, y: b.y + b.h / 2 }); }
      if (peutModifier()) res.push({ id: 'descriptif-x', role: 'descriptif-x', forme: 'x', x: b.x + b.l, y: b.y });
    }
  }
  const sel = objetsSelectionnes();
  const unique = sel.length === 1;
  for (const o of sel) {
    const b = boiteObjet(o);
    if (b) res.push({ forme: 'contour', ...b });
    if (!unique) continue;
    const r = primsObjet(o);
    if (o.type === 'troncon' || o.type === 'fourreau') {
      const pts = o.type === 'fourreau' ? pointsFourreau(o) : o.points;
      if (o.type === 'fourreau' && o.troncon_id) {
        if (pts.length) {
          res.push({ id: 'glissant:' + o.id + ':0', role: 'glissant', forme: 'glissant', x: pts[0].x, y: pts[0].y });
          res.push({ id: 'glissant:' + o.id + ':1', role: 'glissant', forme: 'glissant', x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
        }
      } else {
        o.points.forEach((q, i) => res.push({ id: 'sommet:' + o.id + ':' + i, role: 'sommet', forme: 'carre', x: q.x, y: q.y }));
        for (let i = 0; i + 1 < o.points.length; i++) res.push({ id: 'milieu:' + o.id + ':' + i, role: 'milieu', forme: 'petit', x: (o.points[i].x + o.points[i + 1].x) / 2, y: (o.points[i].y + o.points[i + 1].y) / 2 });
      }
      if (pts.length > 1) {
        const m = milieuPolyligne(pts);
        const d = pxVersPlan(40);   // à l'écart des poignées de sommet / milieu
        res.push({ id: 'echelle-lin:' + o.id, role: 'echelle-lin', forme: 'echelle', x: m.x + m.uy * d, y: m.y - m.ux * d });
      }
    } else if (o.type === 'image') {
      // Image libre (v1.4.6 §2) : rotation au-dessus du centre, taille au coin bas-droit (proportions conservées).
      // v1.4.7 : centre et coin de la partie VISIBLE (identiques à la v1.4.6 sans rognage)
      const v = rectangleVisible(o);
      const a = ((o.rotation || 0) * Math.PI) / 180;
      const d = (v.h || 0) / 2 + pxVersPlan(34);
      const hx = v.cx + Math.sin(a) * d, hy = v.cy - Math.cos(a) * d;
      res.push({ forme: 'lien', x: v.cx, y: v.cy, x2: hx, y2: hy });
      res.push({ id: 'rotation:' + o.id, role: 'rotation', forme: 'rond', x: hx, y: hy });
      const coin = tourner({ x: v.cx + v.l / 2, y: v.cy + v.h / 2 }, { x: v.cx, y: v.cy }, o.rotation || 0);
      res.push({ id: 'echelle-img:' + o.id, role: 'echelle-obj', forme: 'echelle', x: coin.x, y: coin.y });
    } else if (o.type === 'masque') {
      if (o.sous_type === 'pinceau') continue;   // bande de pinceau : déplacement et suppression seulement
      const rot = FORMES_BOITE.includes(o.sous_type) ? (Number(o.rotation) || 0) : 0;
      (rot ? coinsMonde(o.points, rot) : o.points).forEach((q, i) => res.push({ id: 'sommet:' + o.id + ':' + i, role: 'sommet', forme: 'carre', x: q.x, y: q.y }));
      if (masqueTournable(o) && o.points.length >= 3) {
        // Poignée de rotation (v1.4.6 §3) : au-dessus du centre de la forme, dans l'axe de sa rotation
        const c = centreBoite(o.points);
        const rayon = Math.max(...o.points.map((q) => Math.hypot(q.x - c.x, q.y - c.y)));
        const a = (rot * Math.PI) / 180, d = rayon + pxVersPlan(30);
        const hx = c.x + Math.sin(a) * d, hy = c.y - Math.cos(a) * d;
        res.push({ forme: 'lien', x: c.x, y: c.y, x2: hx, y2: hy });
        res.push({ id: 'rotation:' + o.id, role: 'rotation', forme: 'rond', x: hx, y: hy });
      }
      if (o.sous_type === 'polygone') for (let i = 0; i < o.points.length; i++) { const q1 = o.points[i], q2 = o.points[(i + 1) % o.points.length]; if (i + 1 < o.points.length) res.push({ id: 'milieu:' + o.id + ':' + i, role: 'milieu', forme: 'petit', x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 }); }
    } else if (o.type === 'note') {
      const a = ((o.rotation || 0) * Math.PI) / 180;
      const d = pxVersPlan(38);
      res.push({ id: 'rotation:' + o.id, role: 'rotation', forme: 'rond', x: o.x + Math.sin(a) * d, y: o.y - Math.cos(a) * d });
      res.push({ forme: 'lien', x: o.x, y: o.y, x2: o.x + Math.sin(a) * d, y2: o.y - Math.cos(a) * d });
      if (r.boite) res.push({ id: 'echelle-obj:' + o.id, role: 'echelle-obj', forme: 'echelle', x: r.boite.x + r.boite.l + pxVersPlan(8), y: r.boite.y + r.boite.h + pxVersPlan(8) });
      if (o.fleche) res.push({ id: 'fleche:' + o.id, role: 'fleche', forme: 'losange', x: o.fleche.x, y: o.fleche.y });
    } else if (o.type === 'annotation') {
      if (o.points && o.points.length && o.sous_type !== 'stylo') {
        o.points.forEach((q, i) => res.push({ id: 'sommet:' + o.id + ':' + i, role: 'sommet', forme: 'carre', x: q.x, y: q.y }));
        if (o.sous_type === 'zone_hachuree' || o.sous_type === 'trait') for (let i = 0; i + 1 < o.points.length; i++) { const q1 = o.points[i], q2 = o.points[i + 1]; res.push({ id: 'milieu:' + o.id + ':' + i, role: 'milieu', forme: 'petit', x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 }); }
      } else if (!o.points || !o.points.length) {
        const a = ((o.rotation || 0) * Math.PI) / 180;
        const d = (r.boite ? Math.max(r.boite.l, r.boite.h) / 2 : 6) + pxVersPlan(30);
        const hx = o.x + Math.sin(a) * d, hy = o.y - Math.cos(a) * d;
        res.push({ forme: 'lien', x: o.x, y: o.y, x2: hx, y2: hy });
        res.push({ id: 'rotation:' + o.id, role: 'rotation', forme: 'rond', x: hx, y: hy });
        if (o.sous_type === 'malt_libre') {
          const t = (o.attributs.longueur_tige ?? CHARTE.malt.hauteur_trait) * facteurTige(o);
          const dt = t + pxVersPlan(DECALAGE_TIGE_PX);
          res.push({ id: 'tige:' + o.id, role: 'tige', forme: 'tige', x: o.x - Math.sin(a) * dt, y: o.y + Math.cos(a) * dt });
        }
      }
      // poignée d'échelle (toutes les annotations, v12 §2.1) : en bas à droite de la boîte
      if (r.boite) res.push({ id: 'echelle-obj:' + o.id, role: 'echelle-obj', forme: 'echelle', x: r.boite.x + r.boite.l + pxVersPlan(10), y: r.boite.y + r.boite.h + pxVersPlan(10) });
    } else {
      const c = r.centre || { x: o.x, y: o.y };
      const a = ((o.rotation || 0) * Math.PI) / 180;
      const d = (r.rayon || 3) + pxVersPlan(34);
      const hx = c.x + Math.sin(a) * d, hy = c.y - Math.cos(a) * d;
      res.push({ forme: 'lien', x: c.x, y: c.y, x2: hx, y2: hy });
      res.push({ id: 'rotation:' + o.id, role: 'rotation', forme: 'rond', x: hx, y: hy });
      const dd = (r.rayon || 3) + pxVersPlan(30);
      res.push({ id: 'deport:' + o.id, role: 'deport', forme: 'croix', x: c.x - Math.cos(a) * dd, y: c.y - Math.sin(a) * dd });
      // poignée d'échelle du symbole (tous les ponctuels, v12 §5.5) : en bas à droite, à 45° de l'axe de l'objet
      const de = (r.rayon || 3) + pxVersPlan(DECALAGE_ECHELLE_PX);
      const ae = a + Math.PI * 0.75;
      res.push({ id: 'echelle-obj:' + o.id, role: 'echelle-obj', forme: 'echelle', x: c.x + Math.sin(ae) * de, y: c.y - Math.cos(ae) * de });
      if (o.type === 'malt') {
        const t = (o.attributs.longueur_tige ?? CHARTE.malt.hauteur_trait) * facteurTige(o);
        const dt = t + pxVersPlan(DECALAGE_TIGE_PX);
        res.push({ id: 'tige:' + o.id, role: 'tige', forme: 'tige', x: c.x - Math.sin(a) * dt, y: c.y + Math.cos(a) * dt });
      }
      if (o.type === 'eras' && o.attributs.avec_malt) {
        // tige de la MALT d'ERAS : facteur propre, indépendant de l'échelle du rond (v12 §5.4.2)
        const t = tigeEras(o) * facteurTige(o);
        const dt = t + pxVersPlan(DECALAGE_TIGE_PX);
        res.push({ id: 'tige:' + o.id, role: 'tige', forme: 'tige', x: c.x - Math.sin(a) * dt, y: c.y + Math.cos(a) * dt });
      }
      if (symboleMaltActif(o)) {
        // v1.5.2 : poignée unique au-delà des barres, dans l'axe de la tige — tourner autour de l'ouvrage et allonger
        const gm = geometrieSymboleMalt(o, etat.projet.reglages, r.rayon);
        if (gm) {
          const dp = pxVersPlan(DECALAGE_TIGE_PX);
          res.push({ forme: 'lien', x: gm.pied.x, y: gm.pied.y, x2: gm.pied.x + gm.direction.x * dp, y2: gm.pied.y + gm.direction.y * dp });
          res.push({ id: 'malt-tige:' + o.id, role: 'malt-tige', forme: 'tige', x: gm.pied.x + gm.direction.x * dp, y: gm.pied.y + gm.direction.y * dp });
        }
      }
    }
    if (etat.etiquettesVisibles && o.type !== 'note' && o.type !== 'annotation' && o.type !== 'masque') {
      if (r.boiteEtiquette) res.push(...poigneesBloc(o, r, 'etiquette'));
      if (r.boiteMateriel) res.push(...poigneesBloc(o, r, 'materiel'));
      if (r.boiteCartouche) res.push(...poigneesBloc(o, r, 'cartouche'));
    }
  }
  return trier(res);
}

export { TYPES_PONCTUELS, ANNOTATIONS_A_POINTS, vue };
