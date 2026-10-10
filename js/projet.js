/* projet.js — projets : création, ouverture, sauvegarde automatique, classement (statuts, corbeille),
 * export / import .json (fond de plan embarqué en base64), nom des fichiers exportés.
 *
 * Lot 1.4 (v14) :
 * - `modifie_le` signifie « contenu modifié » : la vue, un changement de statut ou un export ne le touchent plus (§3.3) ;
 * - un projet archivé ouvert en consultation n'est jamais écrit en base (garde peutModifier, §6.4) ;
 * - toute mise à jour hors contenu (statut, json_sauve_le, indice_pdf) passe par mettreAJourMeta(), qui met à jour
 *   le projet ouvert en mémoire ET l'enregistrement : la sauvegarde suivante ne peut plus l'écraser.
 *
 * v1.4.5 (PDF multi-pages) : plusieurs plans peuvent partager un même fond (`fond_id`). Duplication, suppression,
 * purge, taille et export / import .json raisonnent sur l'ensemble des fonds RÉFÉRENCÉS (plans-calcul.js →
 * fondsReferences), chacun une seule fois : un PDF de 3 pages n'est ni copié, ni embarqué, ni supprimé 3 fois.
 * Le plan affiché (`plan_courant`) est enregistré comme la vue : naviguer ne fait pas avancer `modifie_le`.
 */
import { etat, emettre, sur, deselectionner, notifier, peutModifier } from './etat.js';
import { bd } from './bd.js';
import { CHARTE, LIBELLES_STATUTS } from './charte.js';
import { nouveauProjet, migrerProjet, recalculerCompteurs, cloner, genererId, VERSION_SCHEMA } from './modele.js';
import { reinitialiserHistorique } from './historique.js';
import { ouvrirFondProjet } from './fond.js';
import { restaurer } from './vue.js';
import { viderCacheAccrochage } from './accrochage.js';
import { fondsReferences, indicePlanBorne, remapperImages } from './plans-calcul.js';

let minuterie = null;
let sauvegardeEnCours = null;       // promesse de l'écriture en cours
let modifieDepuisSauvegarde = false;
let contenuModifie = false;         // drapeau cumulatif jusqu'à l'écriture effective (§3.3)
let chargement = false;             // événements émis pendant l'ouverture d'un projet : ignorés
let termineAverti = false;          // notification « projet terminé modifié », une fois par session de projet

export function initialiserProjet() {
  sur('objets', () => programmerSauvegarde(400, { contenu: true }));
  sur('vue', () => programmerSauvegarde(1500, { contenu: false }));
  sur('calques', () => programmerSauvegarde(400, { contenu: true }));
  sur('fond', () => programmerSauvegarde(0, { contenu: true }));
  sur('reglages', () => programmerSauvegarde(400, { contenu: true }));
  sur('plan-change', () => programmerSauvegarde(1500, { contenu: false }));   // plan affiché : comme la vue (v1.4.5)
  sur('plans', () => programmerSauvegarde(0, { contenu: true }));             // ajout, suppression, renommage de plans
  // Sauvegarde à la mise en arrière-plan (fermeture de l'application sur tablette)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sauverMaintenant(); });
  window.addEventListener('pagehide', () => sauverMaintenant());
}

function indicateur(texte, classe) {
  const el = document.getElementById('etat-sauvegarde');
  if (!el) return;
  el.textContent = texte;
  el.className = classe || '';
}

export function programmerSauvegarde(delai = 400, { contenu = false } = {}) {
  if (!etat.projet || chargement) return;
  if (!peutModifier()) return;       // consultation : rien n'est écrit, pas même la vue
  if (contenu) {
    contenuModifie = true;
    if (etat.projet.statut === 'termine' && !termineAverti) {
      termineAverti = true;
      notifier('Projet terminé modifié — remettez-le en cours si besoin', CHARTE.projets.duree_notification_termine_ms);
    }
  }
  modifieDepuisSauvegarde = true;
  indicateur('●', 'modifie');
  clearTimeout(minuterie);
  minuterie = setTimeout(sauverMaintenant, delai);
}

export async function sauverMaintenant() {
  clearTimeout(minuterie);
  if (sauvegardeEnCours) { await sauvegardeEnCours; if (!modifieDepuisSauvegarde) return; }
  if (!etat.projet) return;
  if (!peutModifier()) { modifieDepuisSauvegarde = false; contenuModifie = false; return; }
  if (!modifieDepuisSauvegarde && !contenuModifie) return;
  const tache = (async () => {
    try {
      const contenu = contenuModifie;
      contenuModifie = false;
      modifieDepuisSauvegarde = false;
      if (contenu) etat.projet.modifie_le = new Date().toISOString();
      await bd.put('projets', cloner(etat.projet));
      indicateur('✓', 'sauve');
      if (contenu) emettre('projet-modifie', etat.projet.id);
    } catch (e) {
      console.error(e);
      contenuModifie = true; modifieDepuisSauvegarde = true;
      indicateur('!', 'erreur');
      notifier('Sauvegarde impossible : ' + (e.message || e));
    }
  })();
  sauvegardeEnCours = tache;
  try { await tache; } finally { sauvegardeEnCours = null; }
}

/* Écrit ce qui est en attente pour le projet ouvert, avant qu'on le relise en base (export, statut, import). */
async function ecrireProjetOuvertSi(id) {
  if (etat.projet && etat.projet.id === id) {
    if (sauvegardeEnCours) await sauvegardeEnCours;
    await sauverMaintenant();
  }
}

/* ---------- Mises à jour hors contenu ---------- */

/* Applique `patch` au projet `id` sans toucher `modifie_le` (sauf si le patch le contient).
 * Projet ouvert et modifiable : le patch va dans etat.projet puis le projet est écrit tel quel.
 * Sinon (projet fermé, ou archivé en consultation) : seul l'enregistrement en base reçoit le patch — les réglages
 * d'affichage d'une consultation ne sont jamais écrits. */
export async function mettreAJourMeta(id, patch) {
  const ouvert = etat.projet && etat.projet.id === id;
  if (ouvert && peutModifier()) {
    await ecrireProjetOuvertSi(id);
    Object.assign(etat.projet, patch);
    await bd.put('projets', cloner(etat.projet));
  } else {
    const enreg = await bd.get('projets', id);
    if (!enreg) throw new Error('Projet introuvable.');
    Object.assign(enreg, patch);
    await bd.put('projets', enreg);
    if (ouvert) Object.assign(etat.projet, patch);
  }
  if (ouvert) { majTitre(); emettre('statut-projet', etat.projet); }
  emettre('projets-changes', id);
}

/* Change le statut. Retourne le patch inverse (pour « Annuler »). Le projet mis à la corbeille est fermé d'abord. */
export async function changerStatut(id, statut) {
  const enreg = (etat.projet && etat.projet.id === id) ? etat.projet : await bd.get('projets', id);
  if (!enreg) throw new Error('Projet introuvable.');
  const avant = {
    statut: enreg.statut || 'en_cours', statut_le: enreg.statut_le || null,
    statut_avant_corbeille: enreg.statut_avant_corbeille ?? null, supprime_le: enreg.supprime_le ?? null
  };
  const maintenant = new Date().toISOString();
  let patch;
  if (statut === 'corbeille') {
    if (etat.projet && etat.projet.id === id) await fermerProjet();
    patch = { statut: 'corbeille', statut_le: maintenant, statut_avant_corbeille: avant.statut === 'corbeille' ? (avant.statut_avant_corbeille || 'en_cours') : avant.statut, supprime_le: maintenant };
  } else if (statut === 'restaurer') {
    patch = { statut: avant.statut_avant_corbeille || 'en_cours', statut_le: maintenant, statut_avant_corbeille: null, supprime_le: null };
  } else {
    patch = { statut, statut_le: maintenant, statut_avant_corbeille: null, supprime_le: null };
  }
  await mettreAJourMeta(id, patch);
  return avant;
}

/* Informations d'affaire (formulaire) : c'est une modification de contenu, `modifie_le` avance. */
export async function modifierInfos(id, infos) {
  const patch = {
    nom: infos.nom, commune: infos.commune, date: infos.date,
    num_sieep: infos.num_sieep || '', num_edf: infos.num_edf || '', type_affaire: infos.type_affaire || null,
    gps: infos.gps || '',   // v1.5.1
    modifie_le: new Date().toISOString()
  };
  await mettreAJourMeta(id, patch);
}

/* ---------- Liste ---------- */

export async function listerProjets() {
  const tous = await bd.tout('projets');
  return tous.map((p) => {
    const plan = p.plans && (p.plans[p.plan_courant || 0] || p.plans[0]);
    return {
      id: p.id, nom: p.nom || '', commune: p.commune || '', date: p.date || '',
      num_sieep: p.num_sieep || '', num_edf: p.num_edf || '', type_affaire: p.type_affaire || null, gps: p.gps || '',
      statut: p.statut || 'en_cours', statut_le: p.statut_le || p.modifie_le || '',
      supprime_le: p.supprime_le || null,
      modifie_le: p.modifie_le || '', json_sauve_le: p.json_sauve_le ?? null, indice_pdf: p.indice_pdf || '',
      nb_objets: (p.plans || []).reduce((n, pl) => n + (pl.objets || []).length, 0),
      fond: plan && plan.fond ? plan.fond.nom_fichier : '',
      version_schema: p.version_schema || 1
    };
  });
}

/* Communes déjà utilisées (suggestions du formulaire), sans doublon, triées. */
export async function communesConnues() {
  const tous = await bd.tout('projets');
  const set = new Map();
  for (const p of tous) { const c = (p.commune || '').trim(); if (c && !set.has(c.toLowerCase())) set.set(c.toLowerCase(), c); }
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

/* ---------- Création, ouverture, fermeture ---------- */

export async function creerProjet(infos) {
  const p = nouveauProjet(infos);
  await bd.put('projets', cloner(p));
  await ouvrirProjet(p.id);
  return p;
}

export async function ouvrirProjet(id) {
  await sauverMaintenant();
  const p = await bd.get('projets', id);
  if (!p) throw new Error('Projet introuvable.');
  chargement = true;
  try {
    migrerProjet(p);
    recalculerCompteurs(p);
    p.plan_courant = indicePlanBorne(p.plan_courant, p.plans.length);   // v1.4.5 : indice hors bornes → premier plan
    etat.projet = p;
    etat.plan = p.plans[p.plan_courant];
    etat.selection.clear();
    viderCacheAccrochage();
    await bd.put('prefs', { cle: 'dernier_projet', valeur: id });
    await ouvrirFondProjet();
    restaurer(etat.plan);
    reinitialiserHistorique();
    emettre('projet-ouvert', p);
    emettre('selection', []);
    majTitre();
  } finally {
    chargement = false;
    clearTimeout(minuterie);
    contenuModifie = false;
    modifieDepuisSauvegarde = false;
    termineAverti = false;
  }
  indicateur('✓', 'sauve');
  emettre('statut-projet', p);
  return p;
}

export async function fermerProjet() {
  await sauverMaintenant();
  etat.projet = null; etat.plan = null; etat.fondBlob = null;
  deselectionner();
  emettre('projet-ferme');
  majTitre();
  indicateur('', '');
  emettre('statut-projet', null);
}

/* Titre de la barre du haut : « Nom — Commune » + pastille si le projet n'est pas en cours (§6.5). */
export function majTitre() {
  const nom = document.getElementById('nom-projet');
  const pastille = document.getElementById('statut-projet');
  const p = etat.projet;
  if (nom) nom.textContent = p ? (p.nom || 'Sans nom') + (p.commune ? ' — ' + p.commune : '') : 'Aucun projet';
  if (pastille) {
    const s = p ? (p.statut || 'en_cours') : 'en_cours';
    pastille.hidden = !p || s === 'en_cours';
    pastille.textContent = p ? (LIBELLES_STATUTS[s] || '') : '';
    pastille.className = 'pastille-statut statut-' + s;
  }
}

export async function renommerProjet(id, { nom, commune, date }) {
  const enreg = (etat.projet && etat.projet.id === id) ? etat.projet : await bd.get('projets', id);
  if (!enreg) return;
  await modifierInfos(id, { ...enreg, nom: nom ?? enreg.nom, commune: commune ?? enreg.commune, date: date ?? enreg.date });
}

export async function dupliquerProjet(id) {
  await ecrireProjetOuvertSi(id);
  const src = await bd.get('projets', id);
  if (!src) return null;
  const copie = cloner(src);
  const maintenant = new Date().toISOString();
  copie.id = genererId('prj');
  copie.nom = src.nom + ' (copie)';
  copie.cree_le = copie.modifie_le = maintenant;
  // La copie repart « En cours », jamais sauvegardée hors tablette, sans indice (H-151).
  Object.assign(copie, { statut: 'en_cours', statut_le: maintenant, statut_avant_corbeille: null, supprime_le: null, json_sauve_le: null, indice_pdf: '' });
  const ops = [];
  // Chaque fond copié UNE fois (v1.4.5) : les plans qui le partageaient partagent la copie.
  const corr = {};
  for (const id of fondsReferences(copie)) {
    const f = await bd.get('fonds', id);
    if (f) { const nf = { ...f, id: genererId('fd') }; ops.push({ store: 'fonds', type: 'put', valeur: nf }); corr[id] = nf.id; }
  }
  for (const plan of copie.plans) {
    if (plan.fond && plan.fond.fond_id && corr[plan.fond.fond_id]) plan.fond.fond_id = corr[plan.fond.fond_id];
    for (const f of plan.fonds || []) if (f && f.fond_id && corr[f.fond_id]) f.fond_id = corr[f.fond_id];
  }
  remapperImages(copie, corr);   // v1.4.6 §2 : les images libres pointent leur propre copie
  ops.push({ store: 'projets', type: 'put', valeur: copie });
  await bd.ecrireGroupe(ops);
  emettre('projets-changes', copie.id);
  return copie;
}

/* Suppression définitive : projet et fond(s), sans corbeille. Le projet ouvert est fermé sans sauvegarde. */
export async function supprimerProjet(id) {
  const p = (etat.projet && etat.projet.id === id) ? etat.projet : await bd.get('projets', id);
  const ops = [];
  if (p) for (const cle of fondsReferences(p)) ops.push({ store: 'fonds', type: 'del', cle });
  ops.push({ store: 'projets', type: 'del', cle: id });
  if (etat.projet && etat.projet.id === id) {
    clearTimeout(minuterie); contenuModifie = false; modifieDepuisSauvegarde = false;
    etat.projet = null; etat.plan = null; etat.fondBlob = null;
    deselectionner(); emettre('projet-ferme'); majTitre(); indicateur('', ''); emettre('statut-projet', null);
  }
  await bd.ecrireGroupe(ops);
  emettre('projets-changes', id);
}

/* Taille approximative d'un projet sur la tablette (enregistrement + fonds), en octets. */
export async function tailleProjet(id) {
  const p = await bd.get('projets', id);
  if (!p) return 0;
  let n = new Blob([JSON.stringify(p)]).size;
  for (const cle of fondsReferences(p)) { const f = await bd.get('fonds', cle); if (f && f.blob) n += f.blob.size; }
  return n;
}

export async function dernierProjetId() {
  const d = await bd.get('prefs', 'dernier_projet');
  return d ? d.valeur : null;
}

/* Purge au démarrage (§6.2) : projets en corbeille depuis plus de `corbeille_jours`, puis fonds orphelins. */
export async function purgerCorbeille() {
  const limite = Date.now() - CHARTE.projets.corbeille_jours * 86400000;
  const tous = await bd.tout('projets');
  let n = 0;
  for (const p of tous) {
    if (p.statut !== 'corbeille' || !p.supprime_le) continue;
    const t = Date.parse(p.supprime_le);
    if (!isFinite(t) || t > limite) continue;
    const ops = [];
    for (const cle of fondsReferences(p)) ops.push({ store: 'fonds', type: 'del', cle });
    ops.push({ store: 'projets', type: 'del', cle: p.id });
    await bd.ecrireGroupe(ops);
    n++;
  }
  // Fonds orphelins (import interrompu, fond remplacé…) : aucun projet ne les référence.
  const restants = n ? await bd.tout('projets') : tous;
  const references = new Set();
  for (const p of restants) for (const cle of fondsReferences(p)) references.add(cle);
  const cles = await bd.cles('fonds');
  const orphelins = cles.filter((c) => !references.has(c));
  if (orphelins.length) await bd.ecrireGroupe(orphelins.map((cle) => ({ store: 'fonds', type: 'del', cle })));
  return { projets: n, fonds: orphelins.length };
}

/* ---------- Export / import .json ---------- */
function blobVersBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64VersBlob(b64, type) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

/* Export .json d'un projet quelconque, relu en base (le projet ouvert est écrit d'abord), toujours avec le fond. */
export async function exporterProjetJson(idProjet = etat.projet && etat.projet.id, { progression = () => {} } = {}) {
  if (!idProjet) throw new Error('Aucun projet.');
  await ecrireProjetOuvertSi(idProjet);
  progression('Lecture du projet…');
  const enreg = await bd.get('projets', idProjet);
  if (!enreg) throw new Error('Projet introuvable sur la tablette.');
  const p = migrerProjet(cloner(enreg));
  // Suivi propre à la tablette : un fichier ne sait pas où il sera enregistré (H-152).
  p.json_sauve_le = null;
  const fonds = [];
  // Chaque fond embarqué UNE fois (v1.4.5) : un PDF de 3 pages pèse le poids d'un seul PDF dans le .json.
  for (const cle of fondsReferences(p)) {
    progression('Lecture du fond…');
    const f = await bd.get('fonds', cle);
    if (f) fonds.push({ id: f.id, type: f.type, nom_fichier: f.nom_fichier, mime: f.blob.type, base64: await blobVersBase64(f.blob) });
  }
  progression('Écriture du .json…');
  const contenu = { application: 'reseaux-hc', version_schema: p.version_schema, exporte_le: new Date().toISOString(), projet: p, fonds };
  return new Blob([JSON.stringify(contenu)], { type: 'application/json' });
}

/* Erreur d'import dont le message est la cause affichée à l'utilisateur. */
function erreurImport(message) { const e = new Error(message); e.importCause = true; return e; }

/* Lecture et contrôle d'un fichier .json (§4.7). Ne modifie rien.
 * Retourne { donnees, projet (migré), existant (résumé ou null) }. */
export async function analyserImport(fichier) {
  let texte;
  try { texte = await fichier.text(); } catch (e) { throw erreurImport('fichier illisible'); }
  let d;
  try { d = JSON.parse(texte); } catch (e) { throw erreurImport('fichier illisible (ce n’est pas un .json valide)'); }
  if (!d || typeof d !== 'object' || !d.projet || !Array.isArray(d.projet.plans) || (d.application && d.application !== 'reseaux-hc')) {
    throw erreurImport('ce fichier n’est pas un projet Réseaux HC');
  }
  const schema = Number(d.version_schema || d.projet.version_schema || 1);
  if (schema > VERSION_SCHEMA) throw erreurImport('Projet créé par une version plus récente de l’application : mettez-la à jour');
  const projet = migrerProjet(d.projet);
  if (!projet.id) projet.id = genererId('prj');
  const enreg = await bd.get('projets', projet.id);
  const existant = enreg ? { id: enreg.id, nom: enreg.nom, modifie_le: enreg.modifie_le || '', statut: enreg.statut || 'en_cours' } : null;
  return { donnees: d, projet, existant };
}

/* Import effectif. mode : 'nouveau' (identifiant absent), 'remplacer', 'copie' (garder les deux).
 * Écriture en une transaction (fonds + projet, et suppression des anciens fonds en remplacement). Retourne l'id. */
export async function importerAnalyse({ donnees, projet, existant }, mode = 'nouveau') {
  const p = projet;
  const maintenant = new Date().toISOString();
  if (!p.modifie_le) p.modifie_le = maintenant;             // `modifie_le` du fichier conservé (corrige E-6)
  p.json_sauve_le = maintenant;                               // il existe hors de la tablette : on vient de l'y trouver
  if (p.statut === 'corbeille') Object.assign(p, { statut: 'en_cours', statut_le: maintenant, statut_avant_corbeille: null, supprime_le: null });

  const ops = [];
  let rouvrir = false;
  if (mode === 'copie') {
    p.id = genererId('prj');
    p.nom = (p.nom || 'Projet') + ' (importé)';
  } else if (mode === 'remplacer' && existant) {
    if (etat.projet && etat.projet.id === existant.id) { await fermerProjet(); rouvrir = true; }
    const ancien = await bd.get('projets', existant.id);
    if (ancien) for (const cle of fondsReferences(ancien)) ops.push({ store: 'fonds', type: 'del', cle });
  }

  // Blobs préparés avant la transaction
  const corr = {};
  for (const f of donnees.fonds || []) {
    if (!f || !f.base64) continue;
    let blob;
    try { blob = base64VersBlob(f.base64, f.mime || (f.type === 'pdf' ? 'application/pdf' : 'image/jpeg')); }
    catch (e) { throw erreurImport('fichier illisible (fond de plan endommagé)'); }
    const nid = genererId('fd');
    corr[f.id] = nid;
    ops.push({ store: 'fonds', type: 'put', valeur: { id: nid, type: f.type, nom_fichier: f.nom_fichier, mime: blob.type, blob } });
  }
  // Table ancien id → nouvel id : les plans qui partageaient un fond dans le fichier partagent le fond importé.
  for (const plan of p.plans) {
    if (plan.fond && plan.fond.fond_id) {
      if (corr[plan.fond.fond_id]) plan.fond.fond_id = corr[plan.fond.fond_id];
      else plan.fond = null;   // fond référencé mais absent du fichier : le plan s'ouvre sans fond
    }
  }
  // v1.4.6 §2 : images libres ; une image dont le binaire manque dans le fichier est retirée, avec un avertissement
  const imagesRetirees = remapperImages(p, corr, { retirerAbsentes: true });
  if (imagesRetirees) notifier(imagesRetirees + ' image' + (imagesRetirees > 1 ? 's' : '') + ' absente' + (imagesRetirees > 1 ? 's' : '') + ' du fichier : retirée' + (imagesRetirees > 1 ? 's' : '') + ' du projet importé', 4500);
  p.plan_courant = indicePlanBorne(p.plan_courant, p.plans.length);
  ops.push({ store: 'projets', type: 'put', valeur: p });
  try {
    await bd.ecrireGroupe(ops);
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''))) throw erreurImport('stockage de la tablette plein');
    throw e;
  }
  emettre('projets-changes', p.id);
  if (rouvrir) await ouvrirProjet(p.id);
  return p.id;
}

/* Compatibilité : import direct (identifiant existant → copie « (importé) »). */
export async function importerProjetJson(fichier) {
  const a = await analyserImport(fichier);
  return importerAnalyse(a, a.existant ? 'copie' : 'nouveau');
}

/* ---------- Livraison d'un fichier ---------- */

/* Chrome Android n'accepte au partage qu'une liste fermée d'extensions (pdf, png, txt…) où `.json` ne figure pas :
 * canShare() répond oui, puis navigator.share() échoue en « Permission denied » (constaté sur tablette, v1.4.0).
 * Le .json est donc PARTAGÉ comme texte, sous le nom « ….json.txt » ; l'import accepte ce nom tel quel.
 * L'enregistrement sur la tablette garde l'extension .json. (H-178) */
export function versionPartageable(blob, nomFichier) {
  if (/\.json$/i.test(nomFichier)) return { blob: new Blob([blob], { type: 'text/plain' }), nom: nomFichier + '.txt' };
  return { blob, nom: nomFichier };
}

/* Vrai si le panneau de partage Android accepte ce fichier (type et extension, après adaptation). */
export function partagePossible(nomFichier, type) {
  try {
    if (!navigator.canShare || !navigator.share) return false;
    const c = versionPartageable(new Blob([''], { type }), nomFichier);
    return navigator.canShare({ files: [new File([c.blob], c.nom, { type: c.blob.type })] });
  } catch (e) { return false; }
}

/* mode : 'partager' (panneau Android, erreur si impossible), 'telecharger', 'auto' (partage, sinon téléchargement).
 * Résout 'partage', 'telecharge' ou 'annule' (panneau fermé sans choix : aucun message). */
export async function livrerFichier(blob, nomFichier, mode = 'auto') {
  if (mode !== 'telecharger') {
    const c = versionPartageable(blob, nomFichier);
    const f = new File([c.blob], c.nom, { type: c.blob.type });
    let possible = false;
    try { possible = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch (e) { possible = false; }
    if (possible) {
      try { await navigator.share({ files: [f], title: c.nom }); return 'partage'; }
      catch (e) {
        if (e && e.name === 'AbortError') return 'annule';
        if (mode === 'partager') {
          if (e && e.name === 'NotAllowedError') throw new Error('Android a refusé le partage de ce fichier (' + (e.message || 'Permission denied') + ') : utilisez « Enregistrer sur la tablette »');
          throw new Error('partage impossible (' + (e.message || e.name || e) + ')');
        }
      }
    } else if (mode === 'partager') {
      throw new Error('ce type de fichier ne peut pas être partagé sur cet appareil');
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000);
  return 'telecharge';
}

/* Compatibilité (nomenclature, anciens appels) : partage si demandé et possible, sinon téléchargement. */
export async function telechargerBlob(blob, nomFichier, { partager = false } = {}) {
  await livrerFichier(blob, nomFichier, partager ? 'auto' : 'telecharger');
}

/* ---------- Nom des fichiers exportés (§7) ---------- */

/* Indice suivant : '' → A → B … Z → AA → AB … */
export function indiceSuivant(indice = '') {
  const s = String(indice || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return 'A';
  const lettres = s.split('');
  let i = lettres.length - 1;
  while (i >= 0) {
    if (lettres[i] !== 'Z') { lettres[i] = String.fromCharCode(lettres[i].charCodeAt(0) + 1); return lettres.join(''); }
    lettres[i] = 'A';
    i--;
  }
  return 'A' + lettres.join('');
}

function nettoyerSegment(t) {
  return String(t ?? '')
    .replace(/[\/\\:*?"<>|\u0000-\u001F\u007F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/* N°SIEEP_Commune_Nom_AAAAMMJJ[_Indice].ext — segments renseignés seulement, 120 caractères au plus
 * (le nom de l'affaire est tronqué en premier). */
export function nomFichier(projet, ext, { indice = '' } = {}) {
  const p = projet || {};
  const extension = ext.startsWith('.') ? ext : '.' + ext;
  const avant = [nettoyerSegment(p.num_sieep), nettoyerSegment(p.commune)].filter(Boolean);
  let nom = nettoyerSegment(p.nom);
  const apres = [nettoyerSegment((p.date || '').replace(/-/g, '')), nettoyerSegment(indice)].filter(Boolean);
  const max = CHARTE.projets.longueur_max_nom_fichier;
  const assembler = () => [...avant, nom, ...apres].filter(Boolean).join('_') + extension;
  let r = assembler();
  if (r.length > max && nom) {
    const exces = r.length - max;
    nom = nom.slice(0, Math.max(0, nom.length - exces)).trim();
    r = assembler();
  }
  if (r.length > max) r = r.slice(0, max - extension.length) + extension;
  if (r === extension) r = 'projet' + extension;
  return r;
}

/* Compatibilité : nom du projet ouvert. */
export function nomFichierProjet(ext) {
  return nomFichier(etat.projet, ext);
}
