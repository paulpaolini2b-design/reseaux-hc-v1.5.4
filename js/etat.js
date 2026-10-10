/* etat.js — état partagé de l'application et bus d'événements.
 * Évite les dépendances circulaires : tous les modules lisent/écrivent ici.
 */

export const etat = {
  nomenclature: null,     // objet nomenclature.json (éventuellement enrichi par l'utilisateur)
  projet: null,           // projet courant (voir modele.js)
  plan: null,             // plan courant du projet (projet.plans[projet.plan_courant])
  fondBlob: null,         // Blob du fond de plan du plan courant
  selection: new Set(),   // ids des objets sélectionnés
  outil: 'selection',     // outil courant
  preset: null,           // préréglage de pose (issu de la palette) : { type, attributs, domaine, pose }
  courant: { domaine: 'BTS', pose: 'aerien', etat: 'a_poser' }, // couple réseau + état en cours de tracé
  accrochageAngulaire: false,
  etiquettesVisibles: true,
  modePapier: false,
  gomme: false,
  masque: { mode: 'rectangle', diametre: 8, couleur: '#FFFFFF', opacite: 1 },   // réglages courants de la gomme magique (v12 §8), initialisés depuis charte.js par barre-outils
  dernierPointeur: 'pen',
  prefs: { favoris: [], recents: [], taille_texte: 1, echelle_symbole: 1, accrochage_angulaire: false, couleur_dessin: null, surligneur: false, couleurs_recentes: [], mode_pose: 'continu' },   // mode_pose : v1.4.9 §3
  pipette: null,        // { retour } quand un prélèvement de couleur est armé (v13.3 §4.3)
  rognage: null,        // v1.4.7 : { id, recadrage } pendant le rognage d'une image (le modèle n'est écrit qu'à la validation)
  police_prete: false
};

const abonnes = new Map();

/* S'abonner à un événement. Retourne une fonction de désabonnement. */
export function sur(nom, fn) {
  if (!abonnes.has(nom)) abonnes.set(nom, new Set());
  abonnes.get(nom).add(fn);
  return () => abonnes.get(nom).delete(fn);
}

/* Émettre un événement (synchrone). */
export function emettre(nom, donnees) {
  const s = abonnes.get(nom);
  if (!s) return;
  for (const fn of s) {
    try { fn(donnees); } catch (e) { console.error('Erreur dans un abonné de', nom, e); }
  }
}

/* Raccourcis */
export function objets() { return etat.plan ? etat.plan.objets : []; }
export function objetParId(id) { return objets().find((o) => o.id === id) || null; }
export function objetsSelectionnes() { return objets().filter((o) => etat.selection.has(o.id)); }

export function selectionner(ids, { ajouter = false } = {}) {
  if (!ajouter) etat.selection.clear();
  for (const id of ids) etat.selection.add(id);
  emettre('selection', [...etat.selection]);
}
export function deselectionner() {
  if (etat.selection.size === 0) return;
  etat.selection.clear();
  emettre('selection', []);
}

/* ---------- Garde centrale de modification (lot 1.4, v14 §6.4) ----------
 * Un projet archivé s'ouvre en consultation : aucune modification de contenu, aucune écriture en base.
 * Testée par l'historique (valider), les outils, le clavier, la sauvegarde, le fond et les réglages ;
 * la désactivation dans l'interface (ui/lecture-seule.js) s'ajoute à cette garde, elle ne la remplace pas. */
export function peutModifier() {
  return !(etat.projet && etat.projet.statut === 'archive');
}

let derniereAlerteLectureSeule = 0;
/* Message unique « consultation » (au plus un toutes les 2 s, les gestes répétés ne l'empilent pas). */
export function signalerLectureSeule() {
  const t = Date.now();
  if (t - derniereAlerteLectureSeule < 2000) return;
  derniereAlerteLectureSeule = t;
  notifier('Projet archivé en consultation : désarchivez-le pour le modifier', 2600);
}

/* Notification brève à l'écran */
export function notifier(message, duree = 2200) {
  const zone = document.getElementById('notifications');
  if (!zone) { console.log(message); return; }
  const el = document.createElement('div');
  el.className = 'notification';
  el.textContent = message;
  zone.appendChild(el);
  setTimeout(() => { el.classList.add('sortie'); setTimeout(() => el.remove(), 350); }, duree);
}

/* Notification avec bouton « Annuler » (changement de statut, corbeille — v14 §4.5).
 * `annuler` n'est appelé qu'une fois, et seulement si l'utilisateur appuie avant la fin du délai. */
export function notifierAnnulable(message, annuler, duree = 5000) {
  const zone = document.getElementById('notifications');
  if (!zone) { console.log(message); return; }
  const el = document.createElement('div');
  el.className = 'notification annulable';
  const texte = document.createElement('span');
  texte.textContent = message;
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'notification-bouton';
  bouton.textContent = 'Annuler';
  el.append(texte, bouton);
  zone.appendChild(el);
  let fini = false;
  const retirer = () => { if (fini) return; fini = true; el.classList.add('sortie'); setTimeout(() => el.remove(), 350); };
  bouton.addEventListener('click', () => { if (fini) return; retirer(); try { annuler(); } catch (e) { console.error(e); } });
  setTimeout(retirer, duree);
}
