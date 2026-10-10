/* ui/lecture-seule.js — consultation d'un projet archivé (lot 1.4, v14 §6.4).
 *
 * Interface seulement : la garde centrale est peutModifier() (etat.js), testée par l'historique, les outils,
 * le clavier, la sauvegarde, le fond et les réglages. Ce module :
 * - pose la classe `lecture-seule` sur <body> (barre d'outils, bandeau réseau/état et options d'outil inactifs) ;
 * - affiche le bandeau « Archivé — consultation » et son bouton « Désarchiver pour modifier » ;
 * - désactive les champs de la fiche, de l'éditeur de note, des réglages de Calques et de la Bibliothèque,
 *   y compris quand ces panneaux se reconstruisent (MutationObserver sur leurs enfants).
 */
import { etat, sur, notifier, peutModifier } from '../etat.js';
import { changerStatut } from '../projet.js';

/* Réglages de Calques qui modifient le projet : désactivés en consultation (visibilité et opacité restent libres). */
const REGLAGES_CALQUES = ['#reg-texte', '#reg-symbole', '#reg-echelle-plan', '#reg-aligner', '#reg-longueurs', '#reg-legende', '#reg-legende-cadre', '#reg-legende-fond', '#reg-legende-couleur', '#reg-legende-reinit', '#fond-page', '#desc-creer', '#desc-visible', '#desc-colonnes', '#desc-sortie', '#desc-cadre', '#desc-fond', '#desc-couleur', '#desc-echelle', '#desc-replacer', '#desc-supprimer'];   // v1.5.0 : descriptif
const BOUTONS_BIBLIOTHEQUE = ['#palette-importer', '#palette-restaurer'];

let bandeau;

export function initialiserLectureSeule() {
  bandeau = document.getElementById('bandeau-archive');
  // Le bandeau est posé sur la zone de plan, qui capture les pointeurs (pointeur.js → setPointerCapture) : sans cet
  // arrêt de propagation, l'appui sur « Désarchiver pour modifier » partait au plan et le bouton ne réagissait pas (v1.4.2).
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) bandeau.addEventListener(t, (e) => e.stopPropagation());
  bandeau.querySelector('[data-action="desarchiver"]').addEventListener('click', async () => {
    if (!etat.projet) return;
    try {
      await changerStatut(etat.projet.id, 'en_cours');
      notifier('Projet désarchivé : il est de nouveau modifiable');
    } catch (e) { notifier('Désarchivage impossible : ' + (e.message || e), 4000); }
  });
  sur('projet-ouvert', appliquer);
  sur('projet-ferme', appliquer);
  sur('statut-projet', appliquer);

  const observer = new MutationObserver(() => { if (!peutModifier()) verrouillerTout(); });
  for (const id of ['fiche', 'dlg-note', 'panneau-calques', 'palette']) {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { childList: true, subtree: true });
  }
  appliquer();
}

function appliquer() {
  const consultation = !!etat.projet && !peutModifier();
  document.body.classList.toggle('lecture-seule', consultation);
  bandeau.hidden = !consultation;
  if (consultation) verrouillerTout(); else deverrouillerTout();
}

/* Un bouton qui ne fait que fermer ou annuler reste actif. */
function estBoutonDeFermeture(b) {
  if (b.classList.contains('fermer') || b.dataset.action === 'fermer' || b.dataset.r === 'non') return true;
  const t = (b.textContent || '').trim();
  return t === '✕' || t === 'Fermer' || t === 'Annuler';
}

function verrouiller(el) {
  if (!el || el.disabled) return;
  el.disabled = true;
  el.dataset.verrouLectureSeule = '1';
}

function verrouillerTout() {
  const fiche = document.getElementById('fiche');
  if (fiche) fiche.querySelectorAll('input, select, textarea, button').forEach((el) => { if (el.tagName !== 'BUTTON' || !estBoutonDeFermeture(el)) verrouiller(el); });
  const note = document.getElementById('dlg-note');
  if (note) note.querySelectorAll('input, select, textarea, button').forEach((el) => { if (el.tagName !== 'BUTTON' || !estBoutonDeFermeture(el)) verrouiller(el); });
  const calques = document.getElementById('panneau-calques');
  if (calques) REGLAGES_CALQUES.forEach((sel) => verrouiller(calques.querySelector(sel)));
  const palette = document.getElementById('palette');
  if (palette) BOUTONS_BIBLIOTHEQUE.forEach((sel) => verrouiller(palette.querySelector(sel)));
}

function deverrouillerTout() {
  document.querySelectorAll('[data-verrou-lecture-seule="1"]').forEach((el) => {
    el.disabled = false;
    delete el.dataset.verrouLectureSeule;
  });
}
