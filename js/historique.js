/* historique.js — annuler / rétablir illimité.
 *
 * Principe : chaque action validée enregistre une copie complète de la liste
 * des objets du plan courant et de la légende (200 objets ≈ 100 ko : négligeable). C'est plus
 * simple et plus sûr que des commandes inversibles, et tout passe par un seul
 * point : valider(). Chaque validation déclenche l'événement 'objets' qui
 * provoque le re-rendu et la sauvegarde automatique.
 *
 * v1.4.5 : un historique PAR PLAN (clé plan.id), conservé pour la session. Changer de plan (plans.js →
 * basculerHistorique) ne perd pas l'historique de l'autre ; l'ouverture d'un projet repart de zéro (H-179 inchangé).
 */
import { etat, emettre, peutModifier, signalerLectureSeule } from './etat.js';
import { cloner, mettreAJourComplet, legendeParDefaut } from './modele.js';
import { actualiserDesignation } from './designation.js';
import { mettreAJourDescriptif } from './descriptif.js';   // v1.5.0 §2.7 : le descriptif suit le plan en direct

let pile = [];      // états passés du plan courant (le dernier = état courant)
let futur = [];     // états annulés du plan courant
let etiquetteCourante = '';
const parPlan = new Map();   // plan.id → { pile, futur, etiquette } : historiques des plans (session)
let planHistorique = null;   // id du plan auquel appartiennent `pile` et `futur`

/* Instantané = objets du plan + légende (position, taille, visibilité, aspect : annulables depuis le v13 §5)
 * + descriptif des travaux (v1.5.0 : annuler la suppression d'un objet rétablit son entrée à l'identique). */
function instantane() {
  return { objets: cloner(etat.plan.objets), legende: cloner(etat.plan.legende || legendeParDefaut()), descriptif: cloner(etat.plan.descriptif ?? null) };
}

function restaurer(s) {
  etat.plan.objets = cloner(s.objets);
  etat.plan.legende = cloner(s.legende);
  etat.plan.descriptif = s.descriptif === undefined ? (etat.plan.descriptif ?? null) : cloner(s.descriptif);
}

/* Réinitialise l'historique (ouverture d'un projet) : tous les plans repartent de zéro. */
export function reinitialiserHistorique() {
  parPlan.clear();
  // v1.5.0 : descriptifs remis à jour à l'ouverture (informations d'affaire modifiées hors du projet, passage par une
  // version antérieure partageant la même base) — mise à jour idempotente, avant le premier instantané.
  if (etat.projet) for (const pl of etat.projet.plans || []) { try { mettreAJourDescriptif(pl, etat.projet); } catch (e) { console.warn('Descriptif non mis à jour', e); } }
  pile = etat.plan ? [instantane()] : [];
  futur = [];
  etiquetteCourante = '';
  planHistorique = etat.plan ? etat.plan.id : null;
  if (planHistorique) parPlan.set(planHistorique, { pile, futur, etiquette: etiquetteCourante });
  emettre('historique', infos());
}

/* Changement de plan (v1.4.5) : range l'historique du plan quitté et reprend celui du plan affiché (etat.plan),
 * ou en crée un à partir de son état actuel. */
export function basculerHistorique() {
  if (planHistorique) parPlan.set(planHistorique, { pile, futur, etiquette: etiquetteCourante });
  const plan = etat.plan;
  planHistorique = plan ? plan.id : null;
  const h = plan ? parPlan.get(plan.id) : null;
  if (h && h.pile.length) { pile = h.pile; futur = h.futur; etiquetteCourante = h.etiquette || ''; }
  else { pile = plan ? [instantane()] : []; futur = []; etiquetteCourante = ''; if (plan) parPlan.set(plan.id, { pile, futur, etiquette: '' }); }
  emettre('historique', infos());
}

/* Valide l'état courant après une modification des objets. */
export function valider(etiquette = '') {
  if (!etat.plan) return;
  // Garde centrale (lot 1.4) : en consultation d'un archivé, toute modification déjà appliquée en mémoire est
  // annulée en revenant au dernier instantané, et aucune étape n'est créée.
  if (!peutModifier()) {
    if (pile.length) { restaurer(pile[pile.length - 1]); nettoyerSelection(); }
    emettre('objets', { etiquette: 'restauration' });
    signalerLectureSeule();
    return;
  }
  // Recalculs systématiques : désignation automatique et indicateur « complet ».
  for (const o of etat.plan.objets) { actualiserDesignation(o); mettreAJourComplet(o, etat.plan.objets); }
  try { mettreAJourDescriptif(etat.plan, etat.projet); } catch (e) { console.error('Mise à jour du descriptif impossible', e); }   // v1.5.0
  pile.push(instantane());
  futur = [];
  etiquetteCourante = etiquette;
  emettre('objets', { etiquette });
  emettre('historique', infos());
}

/* Rafraîchit l'affichage sans créer d'étape (pendant un glissement). */
export function apercu() {
  emettre('objets-apercu');
}

export function annuler() {
  if (!peutModifier()) { signalerLectureSeule(); return false; }
  if (pile.length <= 1) return false;
  futur.push(pile.pop());
  restaurer(pile[pile.length - 1]);
  nettoyerSelection();
  emettre('objets', { etiquette: 'annuler' });
  emettre('historique', infos());
  return true;
}

export function retablir() {
  if (!peutModifier()) { signalerLectureSeule(); return false; }
  if (futur.length === 0) return false;
  const s = futur.pop();
  pile.push(s);
  restaurer(s);
  nettoyerSelection();
  emettre('objets', { etiquette: 'retablir' });
  emettre('historique', infos());
  return true;
}

function nettoyerSelection() {
  const ids = new Set(etat.plan.objets.map((o) => o.id));
  let change = false;
  for (const id of [...etat.selection]) if (!ids.has(id)) { etat.selection.delete(id); change = true; }
  if (change) emettre('selection', [...etat.selection]);
}

export function infos() {
  return { peutAnnuler: pile.length > 1, peutRetablir: futur.length > 0, etiquette: etiquetteCourante };
}

/* Restaure le dernier état validé (abandon d'un glissement avec Échap). */
export function restaurerDernier() {
  if (!pile.length) return;
  restaurer(pile[pile.length - 1]);
  emettre('objets', { etiquette: 'restauration' });
}
