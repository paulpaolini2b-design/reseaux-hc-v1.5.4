/* plans.js — plans d'un projet (v1.4.5 : PDF multi-pages, un plan par page).
 *
 * Un plan = une page (ou une image) avec SES objets, sa légende, sa vue, sa calibration de mesure. Le modèle
 * `projet → plans[] → objets[]` existait depuis le lot 1 (v9 §10.1) ; cette version l'expose (écart assumé au v9,
 * qui n'en montrait qu'un).
 *
 * Événements émis :
 * - 'plan-change' (plan) : le plan affiché a changé. Ce N'EST PAS 'projet-ouvert' (qui remet tout le projet à zéro :
 *   historique, lecture seule, titre) ni 'objets' / 'fond' (que projet.js compte comme des modifications de contenu :
 *   naviguer ne modifie rien, H-153). Sauvegardé comme la vue (plan_courant), sans faire avancer modifie_le.
 * - 'plans' : la liste des plans a changé (ajout, suppression, renommage, répartition) — c'est du contenu.
 *
 * Le changement de plan est SÉRIALISÉ : une seule bascule à la fois, les demandes rapprochées (appuis rapides sur ›)
 * sont regroupées sur la dernière, et le fond du nouveau plan est entièrement préparé avant que quoi que ce soit ne
 * change à l'écran (fond.js → preparerFondPlan / appliquerFondPrepare).
 */
import { etat, emettre, sur, notifier, notifierAnnulable, peutModifier, signalerLectureSeule, deselectionner } from './etat.js';
import { nouveauPlan } from './modele.js';
import { CHARTE } from './charte.js';
import {
  preparerFondPlan, appliquerFondPrepare, abandonnerPreparation, appliquerVisibiliteCalqueFond, programmerRendu,
  infosPagesAnalyse, enregistrerAnalyse, abandonnerAnalyse, infosPagesFond
} from './fond.js';
import { restaurer, ajuster } from './vue.js';
import { basculerHistorique } from './historique.js';
import { viderCacheAccrochage } from './accrochage.js';
import * as C from './plans-calcul.js';

let demande = null;    // id du plan demandé, pas encore traité
let visee = null;      // id du dernier plan demandé (base des déplacements relatifs pendant une bascule)
let enCours = null;    // promesse de la boucle de bascule

export function initialiserPlans() {
  const remise = () => { demande = null; visee = null; };
  sur('projet-ouvert', remise);
  sur('projet-ferme', remise);
}

/* ---------- Lecture ---------- */

export function listePlans() { return etat.projet ? etat.projet.plans : []; }
export function indicePlanCourant() { return etat.projet && etat.plan ? etat.projet.plans.indexOf(etat.plan) : -1; }
export function bascule() { return !!enCours; }
/* Indice du plan visé : le dernier demandé pendant une bascule, sinon le plan affiché. */
export function indicePlanVise() {
  if (visee && etat.projet) { const i = etat.projet.plans.findIndex((p) => p.id === visee); if (i >= 0) return i; }
  return indicePlanCourant();
}

/* Plan du projet qui contient l'objet `id` (null si absent). */
export function planDeObjet(id) {
  for (const pl of listePlans()) if ((pl.objets || []).some((o) => o.id === id)) return pl;
  return null;
}

/* Vrai si le plan courant est une page d'un PDF dont certaines pages n'ont pas encore de plan. */
export function repartitionPossible() {
  const f = etat.plan && etat.plan.fond;
  if (!f || f.type !== 'pdf' || !(f.nb_pages > 1)) return false;
  return C.pagesManquantes(listePlans(), f.fond_id, f.nb_pages).length > 0;
}

/* ---------- Changement de plan ---------- */

/* Affiche le plan d'indice `index`. Résout true si ce plan est affiché à la fin. Autorisé en consultation. */
export function changerPlan(index) {
  const plan = etat.projet && etat.projet.plans[index];
  if (!plan) return Promise.resolve(false);
  return changerPlanId(plan.id);
}

export function changerPlanId(id) {
  if (!etat.projet || !etat.projet.plans.some((p) => p.id === id)) return Promise.resolve(false);
  demande = id;
  visee = id;
  if (!enCours) enCours = boucle().finally(() => { enCours = null; visee = null; emettre('plans-navigation'); });
  emettre('plans-navigation');
  return enCours.then(() => !!(etat.plan && etat.plan.id === id));
}

/* Plan précédent (-1) ou suivant (+1), sans boucler. Pendant une bascule, part du dernier plan demandé. */
export function changerPlanRelatif(delta) {
  const plans = listePlans();
  if (plans.length < 2) return Promise.resolve(false);
  const base = visee ? plans.findIndex((p) => p.id === visee) : indicePlanCourant();
  const i = base + delta;
  if (i < 0 || i >= plans.length) return Promise.resolve(false);
  return changerPlan(i);
}

async function boucle() {
  while (demande && etat.projet) {
    const id = demande;
    demande = null;
    const projet = etat.projet;
    const plan = projet.plans.find((p) => p.id === id);
    if (!plan || plan === etat.plan) continue;
    await basculer(projet, plan);
  }
}

async function basculer(projet, plan) {
  // Fin propre du travail en cours sur le plan quitté (panneaux, sélection) ; tracé et mesure : abonnés 'plan-change'.
  emettre('fermer-panneaux');
  deselectionner();
  let prep;
  try { prep = await preparerFondPlan(plan); }
  catch (e) { console.error('Fond du plan illisible', e); prep = { vide: true, illisible: true, message: e.message || String(e) }; }
  // Projet fermé ou changé, plan supprimé, ou demande plus récente : on n'applique rien.
  if (etat.projet !== projet || !projet.plans.includes(plan) || (demande && demande !== plan.id)) {
    abandonnerPreparation(prep);
    return false;
  }
  // Bascule synchrone : fond, plan courant, historique, rendu, vue — dans cet ordre, sans attente intermédiaire.
  appliquerFondPrepare(prep, plan);
  projet.plan_courant = projet.plans.indexOf(plan);
  etat.plan = plan;
  etat.selection.clear();
  viderCacheAccrochage();
  basculerHistorique();
  emettre('plan-change', plan);
  restaurer(plan);
  emettre('selection', []);
  appliquerVisibiliteCalqueFond();
  programmerRendu(0);
  if (prep.introuvable) notifier('Fond de plan introuvable dans la base : à recharger.');
  if (prep.illisible) notifier('Fond de plan illisible : ' + prep.message, 4000);
  return true;
}

/* Recharge le fond du plan courant après un remplacement (même plan : pas de 'plan-change'). */
async function reactiverPlanCourant() {
  const plan = etat.plan;
  const prep = await preparerFondPlan(plan);
  if (etat.plan !== plan) { abandonnerPreparation(prep); return; }
  appliquerFondPrepare(prep, plan);
  emettre('fond', plan.fond);    // contenu modifié : sauvegarde, mesure (signature de fond), message « plan vide »
  ajuster();
  appliquerVisibiliteCalqueFond();
  programmerRendu(0);
}

/* ---------- Import d'un fichier ---------- */

/* Intègre un fichier analysé (fond.js → analyserFichier) au projet ouvert.
 * mode 'remplacer' : le plan courant reçoit la première page (ses objets sont conservés), les pages suivantes
 *   deviennent de nouveaux plans insérés juste après lui ; c'est aussi le cas d'un plan courant sans fond.
 * mode 'ajouter' : un nouveau plan par page, en fin de liste ; le premier est affiché.
 * Le fichier est écrit UNE fois dans la base avant la création des plans : en cas d'échec, aucun plan n'est ajouté.
 * Retourne { plans: n, pages: [...] }. */
export async function integrerFichier(analyse, { pages, mode }) {
  if (!etat.projet) throw new Error('aucun projet ouvert');
  if (!peutModifier()) throw new Error('projet archivé en consultation : désarchivez-le pour changer le fond');
  const projet = etat.projet;
  const courant = etat.plan;
  const listePages = analyse.type === 'pdf' ? pages : [1];
  const infos = await infosPagesAnalyse(analyse, listePages);
  try { await enregistrerAnalyse(analyse); }
  catch (e) {
    abandonnerAnalyse(analyse);
    if (e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''))) throw new Error('stockage de la tablette plein');
    throw e;
  }
  if (etat.projet !== projet) { abandonnerAnalyse(analyse); throw new Error('le projet a été fermé pendant l’import'); }

  const fichier = { fond_id: analyse.fond_id, type: analyse.type, nb_pages: analyse.nb_pages, nom_fichier: analyse.nom_fichier };
  const nom = (i) => C.nomPlanPour({ type: analyse.type, page: i.page, nom_fichier: analyse.nom_fichier, photo: analyse.photo });
  const fabriquer = (i) => { const pl = nouveauPlan(nom(i)); pl.fond = C.fondPourPage(fichier, i); return pl; };

  const remplacer = mode === 'remplacer' || !courant.fond;
  let cible;
  if (remplacer) {
    const renommer = C.nomAutomatique(courant.nom, courant.fond);
    courant.fond = C.fondPourPage(fichier, infos[0]);
    if (renommer) courant.nom = nom(infos[0]);
    const suite = infos.slice(1).map(fabriquer);
    projet.plans.splice(projet.plans.indexOf(courant) + 1, 0, ...suite);
    cible = courant;
  } else {
    const nouveaux = infos.map(fabriquer);
    projet.plans.push(...nouveaux);
    cible = nouveaux[0];
  }
  projet.plan_courant = projet.plans.indexOf(etat.plan);
  emettre('plans');
  if (cible === etat.plan) await reactiverPlanCourant();
  else await changerPlanId(cible.id);
  if (!analyse.adopte) abandonnerAnalyse(analyse);
  return { plans: infos.length, pages: listePages };
}

/* ---------- Répartition des pages d'un projet existant ---------- */

/* Crée un plan pour chaque page du PDF du plan courant qui n'en a pas encore. Additive : ne supprime rien.
 * Le plan courant garde ses objets et reste sur sa page ; les calibrations des autres pages passent à leur plan.
 * Retourne le nombre de plans créés. */
export async function repartirPages() {
  if (!etat.projet || !etat.plan) return 0;
  if (!peutModifier()) { signalerLectureSeule(); return 0; }
  const projet = etat.projet, plan = etat.plan, f = plan.fond;
  if (!f || f.type !== 'pdf') return 0;
  let manquantes = C.pagesManquantes(projet.plans, f.fond_id, f.nb_pages);
  const max = CHARTE.plans.import_max_pages;
  const tronque = manquantes.length > max;
  if (tronque) manquantes = manquantes.slice(0, max);
  if (!manquantes.length) return 0;
  const infos = await infosPagesFond(f, manquantes);
  if (etat.projet !== projet || etat.plan !== plan) return 0;
  const fichier = { fond_id: f.fond_id, type: 'pdf', nb_pages: f.nb_pages, nom_fichier: f.nom_fichier };
  const nouveaux = infos.map((i) => {
    const pl = nouveauPlan(C.nomPlanPour({ type: 'pdf', page: i.page }));
    pl.fond = C.fondPourPage(fichier, i);
    pl.fond.opacite = f.opacite ?? 1;        // même aspect que la page d'origine
    return pl;
  });
  C.deplacerCalibrations(f, nouveaux);
  if (C.nomParDefaut(plan.nom)) plan.nom = C.nomPlanPour({ type: 'pdf', page: f.page || 1 });
  projet.plans = C.insererGroupeParPage(projet.plans, f.fond_id, nouveaux);
  projet.plan_courant = projet.plans.indexOf(plan);
  emettre('plans');
  if (tronque) notifier('Au plus ' + max + ' plans créés en une fois : relancez la répartition pour les pages suivantes', 4000);
  return nouveaux.length;
}

/* ---------- Renommage, suppression ---------- */

export function renommerPlan(id, nom) {
  if (!peutModifier()) { signalerLectureSeule(); return false; }
  const plan = listePlans().find((p) => p.id === id);
  const n = C.nettoyerNomPlan(nom, CHARTE.plans.nom_max);
  if (!plan || !n || n === plan.nom) return false;
  plan.nom = n;
  emettre('plans');
  return true;
}

/* Supprime un plan (confirmation faite par l'appelant). Refusé s'il ne reste qu'un plan. Le fond partagé n'est
 * jamais supprimé ici (purgerCorbeille retire les fonds orphelins au démarrage). Annulable 5 s ; non annulable par
 * Ctrl+Z (l'historique ne couvre que les objets d'un plan). */
export async function supprimerPlan(id) {
  if (!etat.projet) return false;
  if (!peutModifier()) { signalerLectureSeule(); return false; }
  const projet = etat.projet;
  if (projet.plans.length <= 1) { notifier('Un projet garde toujours au moins un plan'); return false; }
  let i = projet.plans.findIndex((p) => p.id === id);
  if (i < 0) return false;
  const plan = projet.plans[i];
  if (plan === etat.plan) {
    const voisin = projet.plans[i > 0 ? i - 1 : 1];
    const ok = await changerPlanId(voisin.id);
    if (!ok || etat.projet !== projet) return false;
    i = projet.plans.indexOf(plan);
    if (i < 0) return false;
  }
  projet.plans.splice(i, 1);
  projet.plan_courant = projet.plans.indexOf(etat.plan);
  emettre('plans');
  notifierAnnulable('Plan « ' + plan.nom + ' » supprimé', () => {
    if (etat.projet !== projet || !peutModifier() || projet.plans.includes(plan)) return;
    projet.plans.splice(Math.min(i, projet.plans.length), 0, plan);
    projet.plan_courant = projet.plans.indexOf(etat.plan);
    emettre('plans');
    notifier('Plan « ' + plan.nom + ' » rétabli');
  }, CHARTE.plans.delai_annulation_ms);
  return true;
}
