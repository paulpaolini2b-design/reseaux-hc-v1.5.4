/* ui/menu-contextuel.js — menu à l'appui long (ou clic droit). */
import { etat, emettre, sur, objetParId, objetsSelectionnes, selectionner, notifier, peutModifier } from '../etat.js';
import { LIBELLES, CHARTE } from '../charte.js';
import * as outils from '../outils.js';
import { valider } from '../historique.js';
import { nouvelleNote, attribuerRepere, calquePourEtat, TYPES_PONCTUELS, legendeParDefaut } from '../modele.js';
import { testerLegende } from '../accrochage.js';
import { ouvrirEditeurNote } from './notes.js';
import { echapper } from './dialogues.js';
import { modeRetourLigne } from '../symboles.js';

let menu;

export function initialiserMenuContextuel() {
  menu = document.getElementById('menu-contextuel');
  sur('menu-contextuel', ouvrir);
  sur('fermer-panneaux', fermer);
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) fermer(); }, true);
}

function fermer() { menu.hidden = true; menu.innerHTML = ''; }

function ouvrir({ x, y, plan, objet }) {
  const items = [];
  // v1.4.7 : pendant le rognage, seules la validation et l'annulation sont proposées
  if (outils.rognageActif()) {
    items.push({ l: 'Valider le rognage', f: () => outils.validerRognage() });
    items.push({ l: 'Annuler le rognage', f: () => { if (outils.annulerRognage()) notifier('Rognage annulé'); } });
    afficher(items, x, y);
    return;
  }
  if ((etat.outil === 'troncon' || etat.outil === 'fourreau' || etat.outil === 'annotation' || etat.outil === 'masque') && outils.polyligneEnCours()) {
    items.push({ l: 'Terminer le tracé', f: () => outils.terminerPolyligne() });
    items.push({ l: 'Abandonner le tracé', f: () => outils.annulerAction() });
  }
  if (objet) {
    const o = objet;
    if (o.type === 'note') {
      items.push({ l: 'Modifier la note', f: () => ouvrirEditeurNote(o.id) });
      // v1.4.4 §2 : mêmes paliers que le menu déroulant de la fiche ; sélection multiple = même sous-menu, appliqué
      // à toutes les notes sélectionnées (reprend le pattern déjà en place pour cadre/fond, pas de saisie libre ici).
      const notesSel = etat.selection.size > 1 ? objetsSelectionnes().filter((x) => x.type === 'note') : [o];
      items.push({ sous: 'Taille du texte' + (notesSel.length > 1 ? ' (sélection)' : ''), options: CHARTE.notes.tailles.map((t) => ({ l: String(t), actif: notesSel.every((n) => Number(n.taille) === t), f: () => { for (const n of notesSel) n.taille = t; valider('Taille du texte'); } })) });
    } else items.push({ l: 'Fiche de l’objet', f: () => { selectionner([o.id]); emettre('ouvrir-fiche', o.id); } });
    items.push({ l: 'Dupliquer', f: () => { selectionner([o.id], { ajouter: etat.selection.size > 1 }); outils.dupliquerSelection(); } });
    if (o.type === 'annotation' && o.sous_type === 'trait') {
      // v1.4.4 §1 : sélection multiple = tous les Traits de la sélection (même sous-menu, pattern « cadre/fond » déjà en place).
      const traitsSel = etat.selection.size > 1 ? objetsSelectionnes().filter((x) => x.type === 'annotation' && x.sous_type === 'trait') : [o];
      const LIB_STYLE = { plein: 'Plein', pointille: 'Pointillé' };
      items.push({ sous: 'Style de trait' + (traitsSel.length > 1 ? ' (sélection)' : ''), options: CHARTE.annotations.trait.styles.map((st) => ({ l: LIB_STYLE[st] || st, actif: traitsSel.every((x) => (x.attributs.style || 'plein') === st), f: () => { for (const x of traitsSel) x.attributs.style = st; valider('Style de trait'); } })) });
    }
    if (o.type === 'image') items.push({ l: 'Rogner l’image', f: () => outils.entrerRognage(o.id) });   // v1.4.7
    // Rotation au menu : dessins tournables compris (rectangle, rectangle arrondi, ellipse, polygone — v1.4.6 §3)
    if (o.type !== 'troncon' && o.type !== 'fourreau' && (o.type !== 'masque' || ['rectangle', 'rectangle_arrondi', 'ellipse', 'polygone'].includes(o.sous_type))) {
      items.push({ l: 'Tourner de +90°', f: () => outils.tournerSelection(90) });
      items.push({ l: 'Tourner de −90°', f: () => outils.tournerSelection(-90) });
    }
    if (o.type !== 'masque') {
      const lin = o.type === 'troncon' || o.type === 'fourreau';
      const f = CHARTE.echelle_symbole.pas_menu;
      const img = o.type === 'image';
      items.push({ l: (lin ? 'Épaissir le trait' : (img ? 'Agrandir l’image' : 'Agrandir le symbole')) + ' (×' + String(f).replace('.', ',') + ')', f: () => outils.changerEchelleSelection(f) });
      items.push({ l: (lin ? 'Affiner le trait' : (img ? 'Réduire l’image' : 'Réduire le symbole')) + ' (÷' + String(f).replace('.', ',') + ')', f: () => outils.changerEchelleSelection(1 / f) });
      if (o.deport && (o.deport.dx || o.deport.dy)) items.push({ l: 'Annuler le déport', f: () => { o.deport = { dx: 0, dy: 0 }; valider('Déport annulé'); } });
    }
    // MALT sur un ouvrage : deux commandes distinctes (v12 §5.1), ordre selon l'état
    if (TYPES_PONCTUELS.includes(o.type) && o.type !== 'malt') {
      const aEx = !!(o.attributs && o.attributs.malt_ex);
      const aConf = (o.materiel_associe || []).some((m) => m.package === 'MALT');
      const ex = { l: aEx ? '− MALT ex' : '+ MALT ex (aucun article)', f: () => outils.basculerMaltExistante([o.id]) };
      const conf = { l: aConf ? '− Confection MALT' : '+ Confection MALT (package)', f: () => aConf ? outils.retirerConfectionMalt([o.id]) : outils.ajouterConfectionMalt([o.id]) };
      const existant = o.etat === 'existant' || o.etat === 'a_reprendre';
      items.push(existant ? ex : conf, existant ? conf : ex);
      if (o.repere && o.cartouche) items.push({ l: o.cartouche.visible ? 'Masquer le cartouche de repère' : 'Afficher le cartouche de repère', f: () => { o.cartouche.visible = !o.cartouche.visible; valider('Cartouche'); } });
    }
    if (etat.blocActif && etat.blocActif.id === o.id) {
      const b = etat.blocActif.bloc;
      items.push({ l: 'Réinitialiser l’aspect de l’étiquette (' + { etiquette: 'désignation', materiel: 'matériel', cartouche: 'cartouche' }[b] + ')', f: () => outils.reinitialiserAspectBloc(o.id, b) });
      if (b === 'cartouche') {
        items.push({ sous: 'Contour du cartouche', options: CHARTE.COULEURS_ANNOTATION.map((c) => ({ l: c, actif: (o.cartouche.couleur_contour || '#000000').toUpperCase() === c, f: () => { o.cartouche.couleur_contour = c; valider('Couleur du cartouche'); } })) });
        items.push({ sous: 'Texte du cartouche', options: CHARTE.COULEURS_ANNOTATION.map((c) => ({ l: c, actif: (o.cartouche.couleur_texte || '#000000').toUpperCase() === c, f: () => { o.cartouche.couleur_texte = c; valider('Couleur du cartouche'); } })) });
        items.push({ l: o.cartouche.fond === 'transparent' ? 'Fond blanc opaque' : 'Fond transparent', f: () => { o.cartouche.fond = o.cartouche.fond === 'transparent' ? 'blanc' : 'transparent'; valider('Fond du cartouche'); } });
      } else {
        // Cadre et fond du bloc désignation / matériel (v12 §3.2)
        const bl = o[b];
        items.push({ sous: 'Cadre de l’étiquette', options: [['aucun', 'Aucun'], ['rectangle', 'Rectangle'], ['arrondi', 'Angles arrondis']].map(([k, l]) => ({ l, actif: (bl.cadre || 'aucun') === k, f: () => { bl.cadre = k; valider('Cadre de l’étiquette'); } })) });
        items.push({ sous: 'Couleur du cadre', options: CHARTE.COULEURS_ANNOTATION.map((c) => ({ l: c, actif: (bl.couleur_cadre || '#000000').toUpperCase() === c, f: () => { bl.couleur_cadre = c; valider('Couleur du cadre'); } })) });
        items.push({ sous: 'Fond de l’étiquette', options: [['translucide', 'Blanc translucide'], ['blanc', 'Blanc opaque'], ['transparent', 'Transparent']].map(([k, l]) => ({ l, actif: (bl.fond || 'translucide') === k, f: () => { bl.fond = k; valider('Fond de l’étiquette'); } })) });
        // v1.4.9 §2.4 : bascule du retour à la ligne de ce bloc (valeur explicite, la fiche permet de revenir au défaut)
        const surUneLigne = modeRetourLigne(bl, o) === 'jamais';
        items.push({ l: surUneLigne ? 'Retour à la ligne automatique' : 'Texte sur une ligne', f: () => { bl.retour_ligne = surUneLigne ? 'auto' : 'jamais'; valider('Retour à la ligne'); } });
      }
    }
    if (o.type === 'fourreau' && o.troncon_id) items.push({ l: 'Détacher du tronçon', f: () => { outils.detacherFourreau(o); valider('Fourreau détaché'); } });
    if (etat.selection.size > 1) items.push({ l: 'Réinitialiser les tailles (sélection)', f: () => outils.reinitialiserTailles() });
    if (o.type !== 'note' && o.type !== 'annotation' && o.type !== 'masque' && o.type !== 'image') {
      items.push({ l: o.etiquette.visible ? 'Masquer l’étiquette' : 'Afficher l’étiquette', f: () => outils.basculerEtiquettesSelection() });
      items.push({ sous: 'État', options: Object.entries(LIBELLES.etats).map(([k, l]) => ({ l, actif: o.etat === k, f: () => outils.modifierSelection({ etat: k }) })) });
    }
    if (o.type === 'troncon') {
      items.push({ l: 'Inverser le sens', f: () => { o.points.reverse(); valider('Sens inversé'); } });
    }
    items.push({ l: 'Supprimer', danger: true, f: () => { selectionner([o.id], { ajouter: etat.selection.size > 1 }); outils.supprimerSelection(); } });
  } else if (plan && !testerLegende(plan) && outils.testerDescriptif(plan)) {
    // v1.5.0 : appui long sur le descriptif — éditeur, aspect, colonnes, sortie PDF, remise en place, suppression
    const dsc = etat.plan.descriptif;
    items.push({ l: 'Ouvrir l’éditeur du descriptif', f: () => emettre('ouvrir-descriptif', null) });
    items.push({ l: 'Masquer le descriptif (réglages et texte conservés)', f: () => outils.definirDescriptifVisible(false) });
    items.push({ sous: 'Colonnes', options: [1, 2, 3].map((n) => ({ l: n + ' colonne' + (n > 1 ? 's' : ''), actif: dsc.colonnes === n, f: () => import('./descriptif.js').then((m) => m.changerColonnes(n)) })) });
    items.push({ sous: 'Sortie PDF', options: [['plan', 'Sur le plan'], ['annexe', 'Page annexe']].map(([k, l]) => ({ l, actif: (dsc.sortie_pdf || 'plan') === k, f: () => { dsc.sortie_pdf = k; valider('Descriptif — sortie'); } })) });
    items.push({ sous: 'Cadre du descriptif', options: [['aucun', 'Aucun'], ['rectangle', 'Rectangle'], ['arrondi', 'Angles arrondis']].map(([k, l]) => ({ l, actif: (dsc.cadre || CHARTE.descriptif.cadre_defaut) === k, f: () => { dsc.cadre = k; valider('Cadre du descriptif'); } })) });
    items.push({ sous: 'Couleur du cadre', options: CHARTE.COULEURS_ANNOTATION.map((c) => ({ l: c, actif: (dsc.couleur_cadre || CHARTE.descriptif.couleur_cadre_defaut).toUpperCase() === c, f: () => { dsc.couleur_cadre = c; valider('Couleur du descriptif'); } })) });
    items.push({ sous: 'Fond du descriptif', options: [['blanc', 'Blanc opaque'], ['translucide', 'Blanc translucide'], ['transparent', 'Transparent']].map(([k, l]) => ({ l, actif: (dsc.fond || CHARTE.descriptif.fond_defaut) === k, f: () => { dsc.fond = k; valider('Fond du descriptif'); } })) });
    items.push({ l: 'Replacer au coin haut-droit', f: () => { dsc.x = null; dsc.y = null; valider('Descriptif replacé'); } });
    items.push({ l: 'Supprimer le descriptif…', danger: true, f: () => import('./descriptif.js').then((m) => m.supprimer()) });
  } else if (plan && testerLegende(plan)) {
    // Appui long sur la légende : objet à part entière — masquage, cadre, fond, remise en place (v13 §5)
    const lg = etat.plan.legende;
    items.push({ l: 'Masquer la légende (réglages conservés)', f: () => outils.definirLegendeVisible(false) });
    items.push({ sous: 'Cadre de la légende', options: [['aucun', 'Aucun'], ['rectangle', 'Rectangle'], ['arrondi', 'Angles arrondis']].map(([k, l]) => ({ l, actif: (lg.cadre || CHARTE.legende.cadre_defaut) === k, f: () => { lg.cadre = k; valider('Cadre de la légende'); } })) });
    items.push({ sous: 'Couleur du cadre', options: CHARTE.COULEURS_ANNOTATION.map((c) => ({ l: c, actif: (lg.couleur_cadre || CHARTE.legende.couleur_cadre_defaut).toUpperCase() === c, f: () => { lg.couleur_cadre = c; valider('Couleur de la légende'); } })) });
    items.push({ sous: 'Fond de la légende', options: [['blanc', 'Blanc opaque'], ['translucide', 'Blanc translucide'], ['transparent', 'Transparent']].map(([k, l]) => ({ l, actif: (lg.fond || CHARTE.legende.fond_defaut) === k, f: () => { lg.fond = k; valider('Fond de la légende'); } })) });
    items.push({ l: 'Replacer et réinitialiser la légende', f: () => { etat.plan.legende = legendeParDefaut(); valider('Légende réinitialisée'); } });
  } else {
    items.push({ l: 'Ajouter une note ici', f: () => { const n = nouvelleNote(plan.x, plan.y, ''); attribuerRepere(etat.projet, n); etat.plan.objets.push(n); valider('Note'); selectionner([n.id]); ouvrirEditeurNote(n.id, { nouvelle: true }); } });
    if (etat.selection.size) items.push({ l: 'Désélectionner', f: () => { etat.selection.clear(); emettre('selection', []); } });
    items.push({ l: 'Tout sélectionner', f: () => emettre('tout-selectionner') });
    items.push({ l: outils.legendeAffichee() ? 'Masquer la légende' : 'Afficher la légende', f: () => outils.basculerLegende() });
    if (etat.plan && etat.plan.descriptif) items.push({ l: outils.descriptifAffiche() ? 'Masquer le descriptif' : 'Afficher le descriptif', f: () => outils.definirDescriptifVisible(!outils.descriptifAffiche()) });   // v1.5.0
  }
  // Consultation d'un archivé (lot 1.4) : seules les entrées sans modification restent.
  if (!peutModifier()) {
    const garder = items.filter((it) => !it.sous && ['Fiche de l’objet', 'Désélectionner', 'Tout sélectionner', 'Ouvrir l’éditeur du descriptif'].includes(it.l));
    items.length = 0;
    items.push(...garder);
    if (!items.length) return;
  }
  afficher(items, x, y);
  void calquePourEtat; void notifier; void objetParId;
}

function afficher(items, x, y) {
  menu.innerHTML = items.map((it) => it.sous
    ? `<div class="sous-menu"><div class="titre">${echapper(it.sous)}</div>${it.options.map((op, j) => `<button class="${op.actif ? 'actif' : ''}" data-sous="${items.indexOf(it)}:${j}">${echapper(op.l)}</button>`).join('')}</div>`
    : `<button class="${it.danger ? 'danger' : ''}" data-i="${items.indexOf(it)}">${echapper(it.l)}</button>`).join('');
  menu.hidden = false;
  // Position dans la zone visible
  const zone = document.getElementById('zone-plan').getBoundingClientRect();
  const l = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.min(zone.left + x, window.innerWidth - l - 8) + 'px';
  menu.style.top = Math.min(zone.top + y, window.innerHeight - h - 8) + 'px';
  menu.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { fermer(); items[Number(b.dataset.i)].f(); }));
  menu.querySelectorAll('[data-sous]').forEach((b) => b.addEventListener('click', () => { const [i, j] = b.dataset.sous.split(':').map(Number); fermer(); items[i].options[j].f(); }));
}
