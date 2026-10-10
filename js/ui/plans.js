/* ui/plans.js — interface des plans (v1.4.5 : PDF multi-pages, un plan par page).
 *
 * - Sélecteur `#selecteur-plans` (‹ nom k/N ›), en bas à droite de la zone de plan, visible seulement à partir de
 *   2 plans : un projet mono-plan n'affiche rien de nouveau. Pas dans la barre latérale (H-191, H-200 : Annuler /
 *   Rétablir y sont déjà hors écran sous ~900 px de hauteur). Il se hisse au-dessus du bandeau réseau / état quand
 *   les deux se chevaucheraient (portrait, écran étroit).
 * - Liste des plans (appui sur le nom) : ouvrir, renommer, supprimer, ajouter, répartir les pages d'un PDF.
 * - Dialogues d'import d'un fond : destination (remplacer le fond du plan courant / nouveaux plans), pages à importer.
 *
 * La zone de plan capture les pointeurs (pointeur.js → setPointerCapture) : le sélecteur arrête la propagation de
 * ses événements de pointeur, comme le bandeau d'archive (H-181), sinon l'appui serait pris par le plan.
 */
import { etat, sur, notifier, peutModifier, signalerLectureSeule } from '../etat.js';
import { CHARTE } from '../charte.js';
import { ouvrirDialogue, confirmer, demander, echapper } from './dialogues.js';
import {
  listePlans, indicePlanCourant, changerPlanId, changerPlanRelatif, renommerPlan, supprimerPlan, repartirPages,
  repartitionPossible, integrerFichier, bascule, indicePlanVise
} from '../plans.js';
import { analyserFichier, abandonnerAnalyse } from '../fond.js';
import { analyserPages, toutesLesPages, resumePages, pagesManquantes } from '../plans-calcul.js';
import { ouvrirFondDialogue, demanderEchellePlan } from './projets.js';

let racine, zone, courant;
let placement = 0;

export function initialiserPlansUI() {
  racine = document.getElementById('selecteur-plans');
  zone = document.getElementById('zone-plan');
  courant = document.getElementById('selecteur-courant');
  racine.innerHTML = `
    <button type="button" class="sp-fleche" data-sens="-1" title="Plan précédent (Page préc.)" aria-label="Plan précédent">‹</button>
    <button type="button" class="sp-nom" title="Liste des plans" aria-haspopup="dialog">
      <span class="sp-libelle"></span><span class="sp-position"></span>
    </button>
    <button type="button" class="sp-fleche" data-sens="1" title="Plan suivant (Page suiv.)" aria-label="Plan suivant">›</button>`;
  // Le plan capture les pointeurs : sans cela, l'appui sur le sélecteur serait interprété comme un geste de plan.
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'dblclick', 'contextmenu']) racine.addEventListener(t, (e) => e.stopPropagation());
  racine.querySelectorAll('.sp-fleche').forEach((b) => b.addEventListener('click', () => changerPlanRelatif(Number(b.dataset.sens))));
  racine.querySelector('.sp-nom').addEventListener('click', ouvrirListePlans);

  for (const ev of ['projet-ouvert', 'projet-ferme', 'plan-change', 'plans', 'plans-navigation', 'statut-projet']) sur(ev, maj);
  sur('fermer-panneaux', () => programmerPlacement());
  sur('outil', () => programmerPlacement());   // panneau de mesure, barre d'options d'un outil
  window.addEventListener('resize', () => programmerPlacement());
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => programmerPlacement());
    ro.observe(courant);
    ro.observe(zone);
    for (const id of ['panneau-mesure', 'options-outil']) { const el = document.getElementById(id); if (el) ro.observe(el); }
  }
  // Ouverture / fermeture des panneaux de droite : ils décalent le sélecteur (CSS) et le bandeau réseau / état.
  const mo = new MutationObserver(() => programmerPlacement());
  document.querySelectorAll('.panneau, .tiroir').forEach((p) => mo.observe(p, { attributes: true, attributeFilter: ['hidden'] }));
  maj();
}

/* ---------- Sélecteur ---------- */

function maj() {
  const plans = listePlans();
  const i = indicePlanCourant();
  racine.hidden = !etat.projet || plans.length < 2 || i < 0;
  if (racine.hidden) return;
  const plan = plans[i];
  racine.querySelector('.sp-libelle').textContent = plan.nom || 'Plan ' + (i + 1);
  racine.querySelector('.sp-position').textContent = (i + 1) + '/' + plans.length;
  const [prec, suiv] = racine.querySelectorAll('.sp-fleche');
  const v = indicePlanVise();   // pendant une bascule, les flèches partent du plan demandé
  prec.disabled = v <= 0;
  suiv.disabled = v >= plans.length - 1;
  racine.classList.toggle('en-bascule', bascule());   // plan en cours de chargement
  programmerPlacement();
}

function programmerPlacement() {
  cancelAnimationFrame(placement);
  placement = requestAnimationFrame(placer);
}

/* Place le sélecteur : coin bas-droit (CSS), hissé au-dessus du bandeau réseau / état s'ils se chevauchent ; en format
 * compact (nom masqué, « k/N » seul) s'il touche encore le panneau de mesure ou la barre d'options d'un outil
 * (petit écran, panneau de droite ouvert : constaté en 1024 × 600). */
function placer() {
  if (!racine || racine.hidden) return;
  racine.style.bottom = '';
  racine.classList.remove('compact');
  const touche = (el, marge = 8) => {
    if (!el || el.hidden || getComputedStyle(el).display === 'none') return null;
    const a = racine.getBoundingClientRect(), c = el.getBoundingClientRect();
    return c.width && c.right > a.left - marge && c.left < a.right + marge && c.bottom > a.top - marge && c.top < a.bottom + marge ? c : null;
  };
  const c = touche(courant);
  if (c) racine.style.bottom = Math.max(8, Math.round(zone.getBoundingClientRect().bottom - c.top + 8)) + 'px';
  const autres = [document.getElementById('panneau-mesure'), document.getElementById('options-outil')];
  if (autres.some((el) => touche(el, 4))) racine.classList.add('compact');
}

/* ---------- Liste des plans ---------- */

function detailPlan(plan) {
  const f = plan.fond;
  const incomplets = (plan.objets || []).filter((o) => o.type !== 'note' && o.type !== 'annotation' && o.type !== 'masque' && o.type !== 'image' && o.complet === false).length;
  const n = (plan.objets || []).length;
  const fond = !f ? 'sans fond' : (f.type === 'pdf' ? 'page ' + (f.page || 1) + ' / ' + (f.nb_pages || 1) + ' de ' + f.nom_fichier : f.nom_fichier);
  return fond + ' — ' + n + ' objet' + (n > 1 ? 's' : '') + (incomplets ? ', ' + incomplets + ' à compléter' : '');
}

export function ouvrirListePlans() {
  if (!etat.projet) return;
  const plans = listePlans();
  const modifiable = peutModifier();
  const d = ouvrirDialogue('dlg-generique', `
    <form method="dialog" class="dialogue liste-plans">
      <h2>Plans du projet (${plans.length})</h2>
      <div class="lignes-plans">
        ${plans.map((pl, i) => `
        <div class="ligne-plan${pl === etat.plan ? ' courant' : ''}" data-id="${pl.id}">
          <button type="button" class="lp-ouvrir" ${pl === etat.plan ? 'aria-current="true"' : ''}>
            <span class="lp-numero">${i + 1}</span>
            <span class="lp-texte"><span class="lp-nom">${echapper(pl.nom || 'Plan ' + (i + 1))}</span><span class="lp-detail">${echapper(detailPlan(pl))}</span></span>
          </button>
          ${modifiable ? `<button type="button" class="btn-icone lp-menu" aria-label="Actions sur ce plan" aria-expanded="false">⋮</button>` : ''}
          <div class="lp-actions" hidden>
            <button type="button" class="btn" data-action="renommer">Renommer</button>
            <button type="button" class="btn btn-danger" data-action="supprimer" ${plans.length <= 1 ? 'disabled title="Un projet garde toujours au moins un plan"' : ''}>Supprimer</button>
          </div>
        </div>`).join('')}
      </div>
      <p class="aide">Page préc. / Page suiv. au clavier ; ‹ › sur le plan. Chaque plan a ses objets, sa légende, sa vue et sa calibration de mesure.</p>
      <div class="boutons colonne">
        ${modifiable ? '<button type="button" class="btn" data-action="ajouter">Ajouter un plan (PDF, image ou photo)…</button>' : ''}
        ${modifiable && repartitionPossible() ? '<button type="button" class="btn" data-action="repartir">Répartir les pages du PDF en plans…</button>' : ''}
        <button type="button" class="btn" data-action="fermer">Fermer</button>
      </div>
    </form>`);
  d.querySelectorAll('.ligne-plan').forEach((ligne) => {
    const id = ligne.dataset.id;
    ligne.querySelector('.lp-ouvrir').addEventListener('click', () => { d.close(); changerPlanId(id); });
    const menu = ligne.querySelector('.lp-menu');
    if (menu) menu.addEventListener('click', () => {
      const actions = ligne.querySelector('.lp-actions');
      d.querySelectorAll('.lp-actions').forEach((x) => { if (x !== actions) x.hidden = true; });
      d.querySelectorAll('.lp-menu').forEach((x) => { if (x !== menu) x.setAttribute('aria-expanded', 'false'); });
      actions.hidden = !actions.hidden;
      menu.setAttribute('aria-expanded', String(!actions.hidden));
    });
    ligne.querySelector('[data-action="renommer"]').addEventListener('click', async () => {
      d.close();
      await lancerRenommage(id);
      ouvrirListePlans();
    });
    ligne.querySelector('[data-action="supprimer"]').addEventListener('click', async () => {
      d.close();
      await lancerSuppression(id);
    });
  });
  const aj = d.querySelector('[data-action="ajouter"]');
  if (aj) aj.addEventListener('click', () => { d.close(); ouvrirFondDialogue({ ajout: true }); });
  const rp = d.querySelector('[data-action="repartir"]');
  if (rp) rp.addEventListener('click', () => { d.close(); lancerRepartition(); });
  d.querySelector('[data-action="fermer"]').addEventListener('click', () => d.close());
}

async function lancerRenommage(id) {
  const plan = listePlans().find((p) => p.id === id);
  if (!plan) return;
  const r = await demander('Renommer le plan', [{ nom: 'nom', libelle: 'Nom du plan (' + CHARTE.plans.nom_max + ' caractères au plus)', valeur: plan.nom || '', type: 'text' }], { ok: 'Renommer' });
  if (!r) return;
  if (!String(r.nom || '').trim()) { notifier('Nom vide : le plan garde son nom'); return; }
  renommerPlan(id, r.nom);
}

async function lancerSuppression(id) {
  if (!peutModifier()) { signalerLectureSeule(); return; }
  const plan = listePlans().find((p) => p.id === id);
  if (!plan) return;
  if (listePlans().length <= 1) { notifier('Un projet garde toujours au moins un plan'); return; }
  const n = (plan.objets || []).length;
  const ok = await confirmer('Supprimer le plan « ' + plan.nom + ' »' + (n ? ' et ses ' + n + ' objet' + (n > 1 ? 's' : '') : '') + ' ? « Annuler » reste proposé 5 s ; Ctrl+Z ne le rétablit pas. Le fichier du fond reste disponible pour les autres plans.', { ok: 'Supprimer', danger: true });
  if (!ok) return;
  await supprimerPlan(id);
}

/* Répartition des pages du PDF du plan courant (projets antérieurs à la v1.4.5). */
export async function lancerRepartition() {
  if (!peutModifier()) { signalerLectureSeule(); return; }
  if (!repartitionPossible()) { notifier('Toutes les pages de ce PDF ont déjà leur plan'); return; }
  const f = etat.plan.fond;
  const manquantes = pagesManquantes(listePlans(), f.fond_id, f.nb_pages);
  const n = (etat.plan.objets || []).length;
  const ok = await confirmer(
    'Créer un plan pour chacune des ' + (manquantes.length > 1 ? manquantes.length + ' autres pages' : 'autre page') + ' de « ' + f.nom_fichier + ' » (' + resumePages(manquantes) + ') ? '
    + (n ? 'Les ' + n + ' objets déjà tracés restent sur la page ' + (f.page || 1) + '. Vérifiez qu’ils sont bien sur la bonne page : avant la v1.4.5, changer de page laissait les objets en place. ' : '')
    + 'Rien n’est supprimé.', { ok: 'Répartir' });
  if (!ok) return;
  try {
    const cree = await repartirPages();
    if (cree) notifier(cree + ' plan' + (cree > 1 ? 's' : '') + ' créé' + (cree > 1 ? 's' : '') + ' : Page préc. / Page suiv. ou ‹ › pour passer de l’un à l’autre', 3500);
  } catch (e) {
    console.error(e);
    notifier('Répartition impossible : ' + (e.message || e), 5000);
  }
}

/* ---------- Import d'un fond : destination et pages ---------- */

/* Boîte à choix sur #dlg-fond. `brancher(d, finir)` pose les écouteurs ; finir(valeur) ferme et résout.
 * Fermeture sans choix (Échap, appui extérieur) : null.
 * La promesse n'est résolue qu'à l'événement `close`, qui arrive APRÈS la fermeture (tâche suivante) : résoudre plus
 * tôt laissait la boîte suivante s'ouvrir sur le même <dialog>, puis recevoir ce `close` en retard et se refermer
 * aussitôt (constaté en essai : destination puis choix des pages). */
function boite(html, brancher) {
  return new Promise((resolve) => {
    let valeur = null, fini = false;
    const d = ouvrirDialogue('dlg-fond', html);
    d.addEventListener('close', () => { fini = true; resolve(valeur); }, { once: true });
    const finir = (v) => { if (fini) return; fini = true; valeur = v; if (d.open) d.close(); else resolve(valeur); };
    brancher(d, finir);
  });
}

function choisirDestination(a) {
  const nomPlan = etat.plan.nom || 'Plan';
  const plusieurs = a.type === 'pdf' && a.nb_pages > 1;
  return boite(`
    <form method="dialog" class="dialogue">
      <h2>Où placer ce fond ?</h2>
      <p class="aide">Le plan « ${echapper(nomPlan)} » a déjà un fond (${echapper(etat.plan.fond.nom_fichier)}).</p>
      <div class="boutons colonne">
        <button type="button" class="btn btn-primaire" data-choix="ajouter">Ajouter comme ${plusieurs ? 'nouveaux plans' : 'nouveau plan'}</button>
        <button type="button" class="btn" data-choix="remplacer">Remplacer le fond du plan « ${echapper(nomPlan)} » (objets conservés)</button>
        <button type="button" class="btn" data-choix="">Annuler</button>
      </div>
    </form>`, (d, finir) => {
    d.querySelectorAll('[data-choix]').forEach((b) => b.addEventListener('click', () => finir(b.dataset.choix || null)));
  });
}

function choisirPages(a, mode) {
  const n = a.nb_pages;
  const max = CHARTE.plans.import_max_pages;
  const toutes = toutesLesPages(n, max);
  const libelleToutes = n > max ? 'Pages 1 à ' + max + ' (au plus ' + max + ' par import)' : 'Toutes les pages (' + n + ')';
  return boite(`
    <form method="dialog" class="dialogue choix-pages" novalidate>
      <h2>Pages à importer</h2>
      <p class="aide">« ${echapper(a.nom_fichier)} » compte ${n} pages. Un plan par page ; le fichier n’est stocké qu’une fois.
        ${mode === 'remplacer' && etat.plan.fond ? ' La première page choisie remplace le fond du plan « ' + echapper(etat.plan.nom) + ' » ; les suivantes deviennent de nouveaux plans.' : ''}</p>
      <div class="boutons colonne">
        <button type="button" class="btn btn-primaire btn-grand" data-action="toutes">${libelleToutes}</button>
      </div>
      <label>Ou seulement les pages :
        <input name="pages" type="text" inputmode="numeric" autocomplete="off" placeholder="ex. 2 ; 1-3 ; 1,3 ; 1-3; 5">
      </label>
      <p class="erreur-champ" aria-live="polite" hidden></p>
      <div class="boutons">
        <button type="button" class="btn" data-action="annuler">Annuler</button>
        <button type="button" class="btn btn-primaire" data-action="choisies">Importer ces pages</button>
      </div>
    </form>`, (d, finir) => {
    const champ = d.querySelector('[name="pages"]');
    const err = d.querySelector('.erreur-champ');
    const valider = () => {
      const r = analyserPages(champ.value, n, max);
      if (r.erreur) { err.textContent = r.erreur; err.hidden = false; champ.focus(); return; }
      finir(r.pages);
    };
    d.querySelector('[data-action="toutes"]').addEventListener('click', () => finir(toutes));
    d.querySelector('[data-action="choisies"]').addEventListener('click', valider);
    d.querySelector('[data-action="annuler"]').addEventListener('click', () => finir(null));
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); valider(); } });
    champ.addEventListener('input', () => { err.hidden = true; });
  });
}

/* Import complet d'un fichier choisi dans la boîte « Fond de plan ». ajout : forcer de nouveaux plans. */
export async function importerFichierFond(fichier, { photo = false, ajout = false } = {}) {
  if (!etat.projet) return;
  if (!peutModifier()) { signalerLectureSeule(); return; }
  notifier('Chargement du fond…');
  let a;
  try { a = await analyserFichier(fichier, { photo }); }
  catch (e) { console.error(e); notifier('Chargement impossible : ' + (e.message || e), 5000); return; }
  try {
    const avaitFond = !!(etat.plan && etat.plan.fond);
    let mode = ajout ? 'ajouter' : 'remplacer';
    if (!ajout && avaitFond) {
      mode = await choisirDestination(a);
      if (!mode) { abandonnerAnalyse(a); return; }
    }
    let pages = [1];
    if (a.type === 'pdf' && a.nb_pages > 1) {
      pages = await choisirPages(a, mode);
      if (!pages) { abandonnerAnalyse(a); return; }
    }
    const echelleDejaConnue = !!etat.projet.echelle_plan;
    const r = await integrerFichier(a, { pages, mode });
    if (a.type === 'pdf') {
      if (a.nb_pages === 1) notifier('PDF chargé (1 page)');
      else if (r.plans === 1) notifier('PDF chargé : page ' + pages[0] + ' sur ' + a.nb_pages);
      else notifier('PDF chargé : ' + r.plans + ' plans (' + resumePages(pages) + ')', 3000);
    } else notifier('Image chargée');
    // Échelle du plan : une seule fois par import, jamais pour un simple ajout si elle est déjà renseignée.
    if (mode !== 'ajouter' || !echelleDejaConnue) demanderEchellePlan({ photo: photo || a.type === 'image' });
  } catch (e) {
    console.error(e);
    abandonnerAnalyse(a);
    notifier('Chargement impossible : ' + (e.message || e), 5000);
  }
}
