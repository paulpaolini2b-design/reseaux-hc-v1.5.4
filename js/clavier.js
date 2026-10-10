/* clavier.js — raccourcis clavier (clavier physique de la tablette).
 *
 * Ctrl+Z / Ctrl+Y (ou Ctrl+Maj+Z) annuler / rétablir ; Ctrl+S sauver ; Ctrl+D dupliquer ;
 * Suppr / Retour arrière supprimer ; Échap annuler l'action / désélectionner ; Entrée terminer un tracé ;
 * Ctrl+0 ajuster ; + / - zoom ; flèches déplacer la sélection (Maj = ×10) ; 1-9 outils ;
 * E étiquettes ; A accrochage angulaire ; F fiche de l'objet sélectionné ; P pose continue / unique (v1.4.9) ; ? aide.
 * Dans une fiche : Tab passe au champ suivant, Ctrl+Entrée valide, Échap ferme.
 * Lot 1.4 : aucun raccourci du plan quand le gestionnaire de projets est affiché (il gère ses propres touches) ;
 * en consultation d'un archivé, les raccourcis de modification sont refusés (garde peutModifier).
 * v1.4.5 : Page précédente / Page suivante (PageUp / PageDown) = plan précédent / suivant, permis en consultation.
 * v1.4.7 : C = rogner l'image sélectionnée (touche libre, vérifiée dans clavier.js, outils.js, main.js et mesure.js).
 * Pendant le rognage : Entrée valide, Échap et Ctrl+Z annulent le rognage (sans toucher à l'historique) ; les
 * touches qui modifieraient l'objet (Suppr, flèches, R, F, Ctrl+D, Maj ±) sont ignorées ; zoom et aide restent.
 */
import { etat, emettre, notifier, peutModifier, signalerLectureSeule, objetParId } from './etat.js';
import { annuler, retablir } from './historique.js';
import { sauverMaintenant } from './projet.js';
import { ajuster } from './vue.js';
import { zoomerCentre } from './pointeur.js';
import * as outils from './outils.js';
import { changerPlanRelatif } from './plans.js';

function dansSaisie(e) {
  const t = e.target;
  if (!t) return false;
  const tag = (t.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
}

export function initialiserClavier() {
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const dialogueOuvert = document.querySelector('dialog[open]');
    const gestionnaire = document.getElementById('gestionnaire');
    if (gestionnaire && !gestionnaire.hidden) return;   // le gestionnaire plein écran gère Échap et sa recherche
    const editeurDescriptif = document.getElementById('editeur-descriptif');
    if (editeurDescriptif && !editeurDescriptif.hidden) return;   // v1.5.0 : l'éditeur du descriptif gère ses touches

    // Raccourcis valides même dans une saisie
    if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!etat.projet) return;
      if (!peutModifier()) { notifier('Projet archivé en consultation : rien à sauvegarder'); return; }
      sauverMaintenant().then(() => notifier('Projet sauvegardé'));
      return;
    }
    if (e.key === 'Escape') {
      if (dialogueOuvert) return;   // le <dialog> gère lui-même Échap
      if (dansSaisie(e)) { e.target.blur(); emettre('fermer-panneaux'); return; }
      e.preventDefault();
      if (!outils.annulerAction()) emettre('fermer-panneaux');
      return;
    }
    if (ctrl && e.key === 'Enter') { e.preventDefault(); emettre('valider-fiche'); return; }
    if (dansSaisie(e) || dialogueOuvert) return;

    if (!etat.projet) { if (e.key === '?') emettre('ouvrir-aide'); return; }

    // Consultation d'un archivé : navigation, zoom, étiquettes (E, réglage de session), fiche, aide seulement.
    if (!peutModifier()) {
      const k = e.key.toLowerCase();
      const refuse = (ctrl && ['z', 'y', 'd'].includes(k)) || (!ctrl && (['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'r', 'R', 'x', 'X'].includes(e.key)
        || ((e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') && e.shiftKey)
        || outils.OUTILS.some((o) => o.touche === e.key && o.id !== 'selection')));
      if (refuse) { e.preventDefault(); signalerLectureSeule(); return; }
    }

    // v1.4.7 — mode Rognage
    if (outils.rognageActif()) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.closest && e.target.closest('#barre-rognage')) return;   // bouton focalisé : son action
      const k = e.key.toLowerCase();
      if (ctrl && (k === 'z' || k === 'y')) { e.preventDefault(); outils.annulerRognage(); notifier('Rognage annulé'); return; }
      if (!ctrl && e.key === 'Enter') { e.preventDefault(); outils.validerRognage(); return; }
      const ignoree = (ctrl && k === 'd') || (!ctrl && (['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || ['r', 'f', 'c'].includes(k)
        || ((e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') && e.shiftKey)));
      if (ignoree) { e.preventDefault(); notifier('Rognage en cours : Entrée pour valider, Échap pour annuler', 2000); return; }
    }

    if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); annuler(); return; }
    if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); retablir(); return; }
    if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); outils.dupliquerSelection(); return; }
    if (ctrl && e.key === '0') { e.preventDefault(); ajuster(); return; }
    if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); emettre('tout-selectionner'); return; }
    if (ctrl) return;

    switch (e.key) {
      case 'Delete': case 'Backspace': e.preventDefault(); outils.supprimerSelection(); return;
      case 'Enter': e.preventDefault(); if (!outils.terminerPolyligne() && etat.selection.size === 1) emettre('ouvrir-fiche', [...etat.selection][0]); return;
      case '+': case '=': e.preventDefault(); if (e.shiftKey && (etat.selection.size || etat.blocActif)) outils.changerEchelleEtiquette(1.1); else zoomerCentre(1.25); return;
      case '-': case '_': e.preventDefault(); if (e.shiftKey && (etat.selection.size || etat.blocActif)) outils.changerEchelleEtiquette(1 / 1.1); else zoomerCentre(1 / 1.25); return;
      case 'ArrowLeft': e.preventDefault(); outils.deplacerSelection(e.shiftKey ? -10 : -1, 0); return;
      case 'ArrowRight': e.preventDefault(); outils.deplacerSelection(e.shiftKey ? 10 : 1, 0); return;
      case 'ArrowUp': e.preventDefault(); outils.deplacerSelection(0, e.shiftKey ? -10 : -1); return;
      case 'ArrowDown': e.preventDefault(); outils.deplacerSelection(0, e.shiftKey ? 10 : 1); return;
      case '?': e.preventDefault(); emettre('ouvrir-aide'); return;
      case 'PageUp': e.preventDefault(); changerPlanRelatif(-1); return;
      case 'PageDown': e.preventDefault(); changerPlanRelatif(1); return;
      case 'r': case 'R': e.preventDefault(); outils.tournerSelection(e.shiftKey ? -90 : 90); return;
      case 'e': case 'E': e.preventDefault(); emettre('basculer-etiquettes'); return;
      case 'a': case 'A': e.preventDefault(); etat.accrochageAngulaire = !etat.accrochageAngulaire; emettre('reglage-accrochage'); notifier('Accrochage angulaire ' + (etat.accrochageAngulaire ? 'activé (0° / 45° / 90°)' : 'désactivé')); return;
      case 'f': case 'F': e.preventDefault(); if (etat.selection.size === 1) emettre('ouvrir-fiche', [...etat.selection][0]); return;
      case 'x': case 'X': e.preventDefault(); outils.definirOutil('gomme'); return;
      case 'p': case 'P': e.preventDefault(); outils.basculerModePose(); return;   // v1.4.9 §3.3 : pose continue / unique
      case 'c': case 'C': {
        // v1.4.7 : rogner l'image, si une seule image est sélectionnée (sinon la touche ne fait rien)
        const o = etat.selection.size === 1 ? objetParId([...etat.selection][0]) : null;
        if (o && o.type === 'image') { e.preventDefault(); outils.entrerRognage(o.id); }
        return;
      }
      case 'Tab': return;
      default: break;
    }
    const outil = outils.OUTILS.find((o) => o.touche === e.key);
    if (outil) { e.preventDefault(); outils.definirOutil(outil.id); }
  });
}
