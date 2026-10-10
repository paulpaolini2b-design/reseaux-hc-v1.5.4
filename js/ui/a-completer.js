/* ui/a-completer.js — indicateur et parcours des objets dont la fiche est incomplète.
 *
 * v1.4.5 : les objets incomplets sont comptés et listés sur TOUS les plans du projet (le bureau parcourt les fiches
 * sans en oublier sur une autre page), regroupés par plan ; un appui sur un objet d'un autre plan affiche ce plan,
 * puis centre l'objet et ouvre sa fiche. Les textes illisibles ne sont calculés que sur le plan affiché (H-224). */
import { etat, emettre, sur, objets, selectionner } from '../etat.js';
import { LIBELLES } from '../charte.js';
import { designationAffichee, motifsACompleter } from '../modele.js';
import { vue, appliquer } from '../vue.js';
import { echapper } from './dialogues.js';
import { blocsIllisibles } from '../rendu-svg.js';
import { primsObjet } from '../accrochage.js';
import { CHARTE } from '../charte.js';
import { pointsFourreau } from '../symboles.js';
import { changerPlanId, listePlans } from '../plans.js';
import { alertesDescriptif } from '../descriptif.js';   // v1.5.0 : rubrique « Descriptif »
import { corrigerEntree } from './descriptif.js';

let panneau, badge;

export function initialiserACompleter() {
  panneau = document.getElementById('panneau-a-completer');
  badge = document.getElementById('badge-a-completer');
  document.getElementById('btn-a-completer').addEventListener('click', () => { if (panneau.hidden) ouvrir(); else fermer(); });
  sur('objets', () => { majBadge(); if (!panneau.hidden) ouvrir(); });
  sur('projet-ouvert', majBadge);
  sur('plan-change', () => { majBadge(); if (!panneau.hidden) ouvrir(); });
  sur('plans', () => { majBadge(); if (!panneau.hidden) ouvrir(); });
  sur('projet-ferme', () => { fermer(); majBadge(); });
  sur('fermer-panneaux', fermer);
}

function estIncomplet(o) {
  return o.type !== 'note' && o.type !== 'annotation' && o.type !== 'masque' && o.type !== 'image' && o.complet === false;
}

/* Objets incomplets, tous plans confondus : [{ plan, objets: [...] }] dans l'ordre des plans (plans vides omis). */
function incompletsParPlan() {
  return listePlans().map((plan) => ({ plan, objets: (plan.objets || []).filter(estIncomplet) })).filter((g) => g.objets.length);
}

function incomplets() {
  return incompletsParPlan().flatMap((g) => g.objets);
}

/* Objets dont un bloc de texte tombe sous le seuil de lisibilité papier (v11 §2.4). */
function illisibles() {
  return objets().filter((o) => o.type !== 'note' && o.type !== 'annotation' && o.type !== 'masque' && o.type !== 'image' && blocsIllisibles(primsObjet(o)).length);
}

/* Alertes des descriptifs, tous plans confondus (v1.5.0 §2.7). */
function alertesDescriptifs() {
  return listePlans().flatMap((p) => alertesDescriptif(p));
}

function majBadge() {
  const n = etat.plan ? incomplets().length + illisibles().length + alertesDescriptifs().length : 0;
  badge.hidden = n === 0;
  badge.textContent = String(n);
}

function fermer() { panneau.hidden = true; }

function ligneObjet(o, plan) {
  return `
        <button class="objet-ligne" data-id="${o.id}" data-plan="${plan.id}">
          <span class="type">${echapper(LIBELLES.types[o.type] || o.type)}</span>
          <span class="repere">${echapper(o.repere)}</span>
          <span class="designation">${echapper(designationAffichee(o) || '—')}</span>
          <span class="manque">${echapper(motifsACompleter(o, plan.objets).join(', '))}</span>
        </button>`;
}

function ouvrir() {
  if (!etat.plan) return;
  const groupes = incompletsParPlan();
  const liste = groupes.flatMap((g) => g.objets);
  const plusieurs = listePlans().length > 1;
  const petits = illisibles();
  const alertesDesc = alertesDescriptifs();
  document.getElementById('fiche').hidden = true;
  document.getElementById('panneau-calques').hidden = true;
  panneau.hidden = false;
  panneau.innerHTML = `
    <header class="entete-panneau"><h2>À compléter <span class="repere">${liste.length}</span></h2><button class="btn-icone fermer" title="Fermer">✕</button></header>
    <div class="contenu">
      ${alertesDesc.length ? `<h3>Descriptif <span class="repere">${alertesDesc.length}</span></h3><div class="liste-objets">${alertesDesc.map((a) => `
        <button class="objet-ligne ligne-alerte-desc" data-desc-entree="${a.entree.id}" data-plan="${a.plan.id}">
          <span class="type">Descriptif${plusieurs ? ' — ' + echapper(a.plan.nom) : ''}</span>
          <span class="designation">${echapper(a.titre)}</span>
          <span class="manque">${echapper(a.libelle)}</span>
        </button>`).join('')}</div>` : ''}
      ${liste.length ? `<p class="aide">Appuyez sur un objet pour le centrer et ouvrir sa fiche${plusieurs ? ' (le plan s’affiche au besoin)' : ''}.</p>
      ${groupes.map((g) => `${plusieurs ? `<h3 class="titre-plan-a-completer${g.plan === etat.plan ? ' courant' : ''}">${echapper(g.plan.nom)} <span class="repere">${g.objets.length}</span></h3>` : ''}
      <div class="liste-objets">${g.objets.map((o) => ligneObjet(o, g.plan)).join('')}</div>`).join('')}` : (alertesDesc.length ? '' : '<p class="vide">Toutes les fiches sont complètes.</p>')}
      ${petits.length ? `<h3>Textes sous ${CHARTE.bloc_etiquette.seuil_lisibilite_mm} mm à l'export${plusieurs ? ' — ' + echapper(etat.plan.nom) : ''}</h3><div class="liste-objets">${petits.map((o) => `
        <button class="objet-ligne" data-id="${o.id}" data-plan="${etat.plan.id}">
          <span class="type">${echapper(LIBELLES.types[o.type] || o.type)}</span>
          <span class="repere">${echapper(o.repere)}</span>
          <span class="designation">${echapper(designationAffichee(o) || '—')}</span>
          <span class="manque">étiquette illisible sur papier : agrandir le bloc</span>
        </button>`).join('')}</div>` : ''}
    </div>`;
  panneau.querySelector('.fermer').addEventListener('click', fermer);
  panneau.querySelectorAll('[data-desc-entree]').forEach((b) => b.addEventListener('click', () => { fermer(); corrigerEntree(b.dataset.plan, b.dataset.descEntree); }));
  panneau.querySelectorAll('.objet-ligne:not([data-desc-entree])').forEach((b) => b.addEventListener('click', async () => {
    const idObjet = b.dataset.id, idPlan = b.dataset.plan;
    if (idPlan && etat.plan && etat.plan.id !== idPlan) {
      const ok = await changerPlanId(idPlan);
      if (!ok) return;
    }
    const o = objets().find((x) => x.id === idObjet);
    if (!o) return;
    centrerSur(o);
    selectionner([o.id]);
    emettre('ouvrir-fiche', o.id);
  }));
}

function centrerSur(o) {
  const pts = o.type === 'troncon' ? o.points : (o.type === 'fourreau' ? pointsFourreau(o) : null);
  const p = pts ? pts[Math.floor(pts.length / 2)] : { x: o.x || 0, y: o.y || 0 };
  const k = Math.max(vue.k, 2);
  appliquer({ k, tx: vue.largeurEcran / 2 - p.x * k, ty: vue.hauteurEcran / 2 - p.y * k });
}
