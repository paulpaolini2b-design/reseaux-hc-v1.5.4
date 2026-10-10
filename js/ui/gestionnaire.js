/* ui/gestionnaire.js — gestionnaire de projets plein écran (lot 1.4, v14 §4).
 *
 * Onglets de statut avec compteurs, recherche (nom, commune, N° SIEEP, N° EDF, sans accents ni casse), filtre par
 * type d'affaire, tri, liste compacte à pastilles, feuille d'actions par statut, import .json avec choix en cas de
 * doublon, « Libérer la place » pour les archivés. Onglet, filtre et tri mémorisés (prefs/gestionnaire).
 * Échap et le bouton retour d'Android (popstate) ferment le gestionnaire quand un projet est ouvert.
 */
import { etat, sur, notifier, notifierAnnulable } from '../etat.js';
import { bd } from '../bd.js';
import * as P from '../projet.js';
import { CHARTE, TYPES_AFFAIRE, LIBELLES_STATUTS } from '../charte.js';
import { ouvrirDialogue, confirmer, echapper } from './dialogues.js';
import { ouvrirFormulaireInfos, ouvrirFenetreExport, formaterDateHeure } from './projets.js';

const ONGLETS = ['en_cours', 'termine', 'archive', 'corbeille'];
const LIBELLES_ONGLETS = { en_cours: 'En cours', termine: 'Terminés', archive: 'Archivés', corbeille: 'Corbeille' };
const VIDES = {
  en_cours: 'Aucun projet en cours. Créez-en un avec Nouveau projet.',
  termine: 'Aucun projet terminé.',
  archive: 'Aucun projet archivé.',
  corbeille: 'La corbeille est vide.'
};
const TRIS = { modification: 'Modification récente', nom: 'Nom', commune: 'Commune', date: 'Date d’affaire' };

let racine = null;
let prefs = { onglet: 'en_cours', type: 'tous', tri: 'modification' };
let recherche = '';
let projets = [];
let minuterieRecherche = null;
let entreeHistorique = false;

/* ---------- Initialisation ---------- */

export function initialiserGestionnaire() {
  racine = document.getElementById('gestionnaire');
  racine.innerHTML = `
    <div class="gest-cadre">
      <header class="gest-entete">
        <button type="button" class="btn gest-retour" data-action="retour" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Retour au plan
        </button>
        <h1>Projets</h1>
        <div class="gest-actions">
          <button type="button" class="btn" data-action="importer">Importer un .json</button>
          <button type="button" class="btn btn-primaire" data-action="nouveau">Nouveau projet</button>
        </div>
      </header>
      <nav class="gest-onglets" role="tablist" aria-label="Statut des projets"></nav>
      <div class="gest-recherche">
        <input type="search" placeholder="Rechercher : nom, commune, N° SIEEP, N° EDF" aria-label="Rechercher un projet" autocomplete="off" enterkeyhint="search">
        <button type="button" class="gest-effacer" data-action="effacer" aria-label="Effacer la recherche" hidden>✕</button>
      </div>
      <div class="gest-filtres">
        <div class="gest-types" role="radiogroup" aria-label="Type d’affaire"></div>
        <label class="gest-tri">Tri
          <select aria-label="Tri">${Object.entries(TRIS).map(([k, l]) => `<option value="${k}">${echapper(l)}</option>`).join('')}</select>
        </label>
      </div>
      <div class="gest-liste" role="list"></div>
      <footer class="gest-pied">
        <span class="gest-stockage"></span>
        <button type="button" class="btn btn-danger" data-action="vider" hidden>Vider la corbeille</button>
      </footer>
    </div>
    <div class="gest-feuille-fond" hidden></div>
    <div class="gest-feuille" role="menu" hidden></div>`;

  racine.querySelector('[data-action="retour"]').addEventListener('click', () => fermerGestionnaire());
  racine.querySelector('[data-action="nouveau"]').addEventListener('click', nouveauProjet);
  racine.querySelector('[data-action="importer"]').addEventListener('click', choisirImport);
  racine.querySelector('[data-action="vider"]').addEventListener('click', viderCorbeille);
  const champ = racine.querySelector('.gest-recherche input');
  champ.addEventListener('input', () => {
    clearTimeout(minuterieRecherche);
    racine.querySelector('[data-action="effacer"]').hidden = !champ.value;
    minuterieRecherche = setTimeout(() => { recherche = champ.value; rendreListe(); }, CHARTE.projets.delai_recherche_ms);
  });
  racine.querySelector('[data-action="effacer"]').addEventListener('click', () => {
    champ.value = ''; recherche = ''; racine.querySelector('[data-action="effacer"]').hidden = true; rendreListe(); champ.focus();
  });
  racine.querySelector('.gest-tri select').addEventListener('change', (e) => { prefs.tri = e.target.value; memoriser(); rendreListe(); });
  racine.querySelector('.gest-feuille-fond').addEventListener('click', fermerFeuille);

  racine.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    if (!racine.querySelector('.gest-feuille').hidden) { fermerFeuille(); return; }
    if (champ.value) { champ.value = ''; recherche = ''; racine.querySelector('[data-action="effacer"]').hidden = true; rendreListe(); return; }
    fermerGestionnaire();
  });
  document.addEventListener('keydown', (e) => {
    // Échap reçu hors du conteneur (focus resté sur le corps de page)
    if (e.key === 'Escape' && estOuvert() && !racine.contains(e.target) && !document.querySelector('dialog[open]')) { e.preventDefault(); fermerGestionnaire(); }
  });

  window.addEventListener('popstate', () => {
    if (!estOuvert()) { entreeHistorique = false; return; }
    entreeHistorique = false;
    if (!racine.querySelector('.gest-feuille').hidden) { fermerFeuille(); pousserHistorique(); return; }
    if (etat.projet) fermerGestionnaire({ depuisHistorique: true });
  });

  sur('projets-changes', () => { if (estOuvert()) rafraichir(); });
  sur('projet-ouvert', () => { if (estOuvert()) majEntete(); });
  sur('projet-ferme', () => { if (estOuvert()) { majEntete(); rafraichir(); } });
  const orientation = new MutationObserver(() => { if (estOuvert()) rendreListe(); });
  orientation.observe(document.getElementById('app'), { attributes: true, attributeFilter: ['data-orientation'] });
}

export function estOuvert() { return !!racine && !racine.hidden; }

function pousserHistorique() {
  try { history.pushState({ gestionnaire: true }, ''); entreeHistorique = true; } catch (e) { /* ignore */ }
}

export async function ouvrirGestionnaire({ onglet = null } = {}) {
  if (!racine) return;
  try { const pr = await bd.get('prefs', 'gestionnaire'); if (pr && pr.valeur) prefs = { ...prefs, ...pr.valeur }; } catch (e) { /* première ouverture */ }
  if (!ONGLETS.includes(prefs.onglet)) prefs.onglet = 'en_cours';
  if (!TRIS[prefs.tri]) prefs.tri = 'modification';
  if (onglet) prefs.onglet = onglet;
  document.querySelectorAll('dialog[open]').forEach((d) => { if (d.id !== 'dlg-generique') d.close(); });
  const dejaOuvert = estOuvert();
  racine.hidden = false;
  document.body.classList.add('gestionnaire-ouvert');
  if (!dejaOuvert) pousserHistorique();
  majEntete();
  racine.querySelector('.gest-tri select').value = prefs.tri;
  await rafraichir();
  if (!dejaOuvert) racine.querySelector('.gest-liste').scrollTop = 0;
}

export function fermerGestionnaire({ depuisHistorique = false } = {}) {
  if (!estOuvert()) return;
  fermerFeuille();
  racine.hidden = true;
  document.body.classList.remove('gestionnaire-ouvert');
  if (!depuisHistorique && entreeHistorique) { entreeHistorique = false; try { history.back(); } catch (e) { /* ignore */ } }
}

function memoriser() {
  bd.put('prefs', { cle: 'gestionnaire', valeur: { onglet: prefs.onglet, type: prefs.type, tri: prefs.tri } }).catch(() => {});
}

function majEntete() {
  racine.querySelector('[data-action="retour"]').hidden = !etat.projet;
}

/* ---------- Données ---------- */

async function rafraichir() {
  try { projets = await P.listerProjets(); }
  catch (e) { console.error(e); projets = []; notifier('Lecture des projets impossible : ' + (e.message || e), 5000); }
  rendreOnglets();
  rendreTypes();
  rendreListe();
  const espace = await bd.espace().catch(() => null);
  racine.querySelector('.gest-stockage').textContent = espace
    ? `Stockage utilisé : ${(espace.utilise / 1048576).toFixed(1)} Mo${espace.quota ? ' · disponible : ' + ((espace.quota - espace.utilise) / 1048576).toFixed(0) + ' Mo' : ''}`
    : '';
}

export function normaliser(t) {
  return String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function projetsFiltres() {
  const q = normaliser(recherche);
  let l = projets.filter((p) => p.statut === prefs.onglet);
  if (prefs.type === 'aucun') l = l.filter((p) => !p.type_affaire);
  else if (prefs.type !== 'tous') l = l.filter((p) => p.type_affaire === prefs.type);
  if (q) l = l.filter((p) => [p.nom, p.commune, p.num_sieep, p.num_edf].some((v) => normaliser(v).includes(q)));
  const cmp = (a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true });
  switch (prefs.tri) {
    case 'nom': l.sort((a, b) => cmp(a.nom, b.nom)); break;
    case 'commune': l.sort((a, b) => cmp(a.commune, b.commune) || cmp(a.nom, b.nom)); break;
    case 'date': l.sort((a, b) => (b.date || '').localeCompare(a.date || '') || cmp(a.nom, b.nom)); break;
    default: l.sort((a, b) => (b.modifie_le || '').localeCompare(a.modifie_le || ''));
  }
  return l;
}

/* ---------- Rendu ---------- */

function rendreOnglets() {
  const nav = racine.querySelector('.gest-onglets');
  nav.innerHTML = ONGLETS.map((o) => {
    const n = projets.filter((p) => p.statut === o).length;
    return `<button type="button" role="tab" class="gest-onglet ${prefs.onglet === o ? 'actif' : ''}" aria-selected="${prefs.onglet === o}" data-onglet="${o}">${LIBELLES_ONGLETS[o]} <span class="compteur">(${n})</span></button>`;
  }).join('');
  nav.querySelectorAll('[data-onglet]').forEach((b) => b.addEventListener('click', () => {
    prefs.onglet = b.dataset.onglet; memoriser(); rendreOnglets(); rendreListe();
    racine.querySelector('.gest-liste').scrollTop = 0;
  }));
  racine.querySelector('[data-action="vider"]').hidden = prefs.onglet !== 'corbeille' || !projets.some((p) => p.statut === 'corbeille');
}

function rendreTypes() {
  const z = racine.querySelector('.gest-types');
  const choix = [['tous', 'Tous'], ...Object.entries(TYPES_AFFAIRE), ['aucun', 'Non renseigné']];
  if (prefs.type !== 'tous' && prefs.type !== 'aucun' && !TYPES_AFFAIRE[prefs.type]) prefs.type = 'tous';
  z.innerHTML = choix.map(([k, l]) => `<button type="button" role="radio" class="chip ${prefs.type === k ? 'actif' : ''}" aria-checked="${prefs.type === k}" data-type="${k}">${echapper(l)}</button>`).join('');
  z.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { prefs.type = b.dataset.type; memoriser(); rendreTypes(); rendreListe(); }));
}

function pastilles(p, portrait) {
  const l = [];
  if (etat.projet && etat.projet.id === p.id) l.push({ c: 'bleu', t: 'Ouvert' });
  if (p.statut !== 'corbeille') {
    if (!p.json_sauve_le) l.push({ c: 'orange', t: 'Jamais sauvegardé hors tablette', i: '⚠' });
    else if ((p.modifie_le || '') > p.json_sauve_le) l.push({ c: 'orange', t: 'Modifié depuis la sauvegarde', i: '●' });
  }
  if (!p.commune) l.push({ c: 'rouge', t: 'Commune à renseigner' });
  if (p.indice_pdf) l.push({ c: 'gris', t: 'Indice ' + p.indice_pdf });
  return l.map((x) => (portrait && x.c === 'orange')
    ? `<span class="etiquette-projet etiquette-${x.c} icone" title="${echapper(x.t)}" aria-label="${echapper(x.t)}" role="img">${x.i}</span>`
    : `<span class="etiquette-projet etiquette-${x.c}">${echapper(x.t)}</span>`).join('');
}

function formaterDateAffaire(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function rendreListe() {
  const z = racine.querySelector('.gest-liste');
  const l = projetsFiltres();
  const portrait = document.getElementById('app').dataset.orientation === 'portrait';
  if (!l.length) {
    z.innerHTML = `<p class="gest-vide">${recherche.trim() ? `Aucun projet ne correspond à « ${echapper(recherche.trim())} ».` : VIDES[prefs.onglet]}</p>`;
    return;
  }
  z.innerHTML = l.map((p) => {
    const l2 = [p.commune, p.type_affaire ? TYPES_AFFAIRE[p.type_affaire] : '', p.num_sieep ? 'SIEEP ' + p.num_sieep : '', p.num_edf ? 'EDF ' + p.num_edf : ''].filter(Boolean);
    const l3 = [formaterDateAffaire(p.date), p.modifie_le ? 'modifié le ' + formaterDateHeure(p.modifie_le) : '', p.nb_objets + ' objet' + (p.nb_objets > 1 ? 's' : ''), p.fond ? '' : 'sans fond'].filter(Boolean);
    if (p.statut === 'corbeille' && p.supprime_le) l3.push('à la corbeille le ' + formaterDateHeure(p.supprime_le));
    const ouvert = etat.projet && etat.projet.id === p.id;
    return `
      <div class="gest-ligne ${ouvert ? 'ouvert' : ''}" role="listitem" data-id="${p.id}">
        <button type="button" class="gest-ligne-principal" data-action="principal">
          <span class="gest-l1">${echapper(p.nom || 'Sans nom')}</span>
          ${l2.length ? `<span class="gest-l2">${echapper(l2.join(' · '))}</span>` : ''}
          <span class="gest-l3">${echapper(l3.join(' · '))}</span>
        </button>
        <span class="gest-pastilles">${pastilles(p, portrait)}</span>
        <button type="button" class="btn-icone gest-menu" data-action="menu" aria-label="Actions sur ${echapper(p.nom)}" title="Actions">⋮</button>
      </div>`;
  }).join('');
  z.querySelectorAll('.gest-ligne').forEach((ligne) => brancherLigne(ligne, l.find((p) => p.id === ligne.dataset.id)));
}

function brancherLigne(ligne, p) {
  const principal = ligne.querySelector('[data-action="principal"]');
  let minuterie = null, long = false, x0 = 0, y0 = 0;
  principal.addEventListener('pointerdown', (e) => {
    long = false; x0 = e.clientX; y0 = e.clientY;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => { long = true; ouvrirFeuille(p); }, CHARTE.projets.delai_appui_long_ms);
  });
  const annulerLong = (e) => { if (!e || Math.hypot(e.clientX - x0, e.clientY - y0) > 12) clearTimeout(minuterie); };
  principal.addEventListener('pointermove', annulerLong);
  principal.addEventListener('pointerup', () => clearTimeout(minuterie));
  principal.addEventListener('pointercancel', () => clearTimeout(minuterie));
  principal.addEventListener('pointerleave', () => clearTimeout(minuterie));
  principal.addEventListener('contextmenu', (e) => { e.preventDefault(); clearTimeout(minuterie); if (!long) { long = true; ouvrirFeuille(p); } });
  principal.addEventListener('click', (e) => {
    if (long) { e.preventDefault(); long = false; return; }
    actionPrincipale(p);
  });
  ligne.querySelector('[data-action="menu"]').addEventListener('click', () => ouvrirFeuille(p));
}

/* ---------- Actions ---------- */

async function actionPrincipale(p) {
  if (p.statut === 'corbeille') {
    if (await confirmer(`Restaurer « ${p.nom} » ?`, { ok: 'Restaurer' })) await restaurer(p);
    return;
  }
  await ouvrir(p);
}

async function ouvrir(p) {
  if (etat.projet && etat.projet.id === p.id) { fermerGestionnaire(); return; }
  try {
    fermerGestionnaire();
    await P.ouvrirProjet(p.id);
    if (p.statut === 'archive') notifier('Archivé : consultation seule');
  } catch (e) {
    console.error(e);
    notifier('Ouverture impossible : ' + (e.message || e), 5000);
    ouvrirGestionnaire();
  }
}

function entreesMenu(p) {
  const e = [];
  const commun = [
    { l: 'Modifier les informations', f: () => ouvrirFormulaireInfos({ projet: p }).then((r) => { if (r) rafraichir(); }) },
    { l: 'Exporter le PDF…', f: () => ouvrirFenetreExport(p.id, 'pdf') },
    { l: 'Sauvegarder en .json…', f: () => ouvrirFenetreExport(p.id, 'json') }
  ];
  const dupliquer = { l: 'Dupliquer', f: () => dupliquer(p) };
  const corbeille = { l: 'Mettre à la corbeille', danger: true, f: () => statut(p, 'corbeille') };
  switch (p.statut) {
    case 'en_cours':
      e.push({ l: 'Ouvrir', f: () => ouvrir(p) }, ...commun, dupliquer,
        { l: 'Marquer comme terminé', f: () => statut(p, 'termine') },
        { l: 'Archiver', f: () => statut(p, 'archive') }, corbeille);
      break;
    case 'termine':
      e.push({ l: 'Ouvrir', f: () => ouvrir(p) }, ...commun, dupliquer,
        { l: 'Remettre en cours', f: () => statut(p, 'en_cours') },
        { l: 'Archiver', f: () => statut(p, 'archive') }, corbeille);
      break;
    case 'archive':
      e.push({ l: 'Consulter', f: () => ouvrir(p) }, ...commun,
        { l: 'Dupliquer (la copie est « En cours »)', f: () => dupliquer(p) },
        { l: 'Désarchiver', f: () => statut(p, 'en_cours') },
        { l: 'Libérer la place…', f: () => libererPlace(p) }, corbeille);
      break;
    default:
      e.push({ l: 'Restaurer', f: () => restaurer(p) },
        { l: 'Supprimer définitivement', danger: true, f: () => supprimerDefinitivement(p) });
  }
  return e;
}

function ouvrirFeuille(p) {
  const feuille = racine.querySelector('.gest-feuille');
  const entrees = entreesMenu(p);
  feuille.innerHTML = `
    <div class="gest-feuille-titre">${echapper(p.nom || 'Sans nom')}${p.commune ? ` <span>${echapper(p.commune)}</span>` : ''}</div>
    ${entrees.map((x, i) => `<button type="button" role="menuitem" class="gest-feuille-entree ${x.danger ? 'danger' : ''}" data-i="${i}">${echapper(x.l)}</button>`).join('')}
    <button type="button" class="gest-feuille-entree annuler" data-action="annuler">Annuler</button>`;
  feuille.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
    fermerFeuille();
    Promise.resolve(entrees[Number(b.dataset.i)].f()).catch((e) => { console.error(e); notifier('Action impossible : ' + (e.message || e), 5000); });
  }));
  feuille.querySelector('[data-action="annuler"]').addEventListener('click', fermerFeuille);
  racine.querySelector('.gest-feuille-fond').hidden = false;
  feuille.hidden = false;
  const premier = feuille.querySelector('.gest-feuille-entree');
  if (premier) setTimeout(() => premier.focus(), 30);
}

function fermerFeuille() {
  if (!racine) return;
  racine.querySelector('.gest-feuille').hidden = true;
  racine.querySelector('.gest-feuille-fond').hidden = true;
}

const MESSAGES_STATUT = {
  termine: 'Projet marqué comme terminé',
  en_cours: 'Projet remis en cours',
  archive: 'Projet archivé',
  corbeille: 'Projet mis à la corbeille'
};

async function statut(p, nouveau) {
  const avant = await P.changerStatut(p.id, nouveau);
  const message = nouveau === 'en_cours' && p.statut === 'archive' ? 'Projet désarchivé' : MESSAGES_STATUT[nouveau];
  await rafraichir();
  notifierAnnulable(message, async () => {
    try { await P.mettreAJourMeta(p.id, avant); notifier('Action annulée'); }
    catch (e) { notifier('Annulation impossible : ' + (e.message || e), 4000); }
  }, CHARTE.projets.duree_notification_annuler_ms);
}

async function restaurer(p) {
  const avant = await P.changerStatut(p.id, 'restaurer');
  await rafraichir();
  const enreg = projets.find((x) => x.id === p.id);
  notifier('Projet restauré dans « ' + (LIBELLES_STATUTS[enreg ? enreg.statut : 'en_cours'] || 'En cours') + ' »');
  void avant;
}

async function dupliquer(p) {
  const copie = await P.dupliquerProjet(p.id);
  if (!copie) { notifier('Duplication impossible'); return; }
  if (prefs.onglet !== 'en_cours') { prefs.onglet = 'en_cours'; memoriser(); }
  await rafraichir();
  notifier('Copie créée dans « En cours »');
}

async function supprimerDefinitivement(p) {
  if (!(await confirmer(`Supprimer définitivement « ${p.nom} » ? Le fond de plan est supprimé aussi. Cette action est irréversible.`, { ok: 'Supprimer définitivement', danger: true }))) return;
  await P.supprimerProjet(p.id);
  await rafraichir();
  notifier('Projet supprimé définitivement');
}

async function viderCorbeille() {
  const l = projets.filter((p) => p.statut === 'corbeille');
  if (!l.length) return;
  const noms = l.length === 1 ? `« ${l[0].nom} »` : `${l.length} projets (${l.slice(0, 3).map((p) => '« ' + p.nom + ' »').join(', ')}${l.length > 3 ? '…' : ''})`;
  if (!(await confirmer(`Vider la corbeille : supprimer définitivement ${noms} ? Le fond de plan est supprimé aussi.`, { ok: 'Vider la corbeille', danger: true }))) return;
  for (const p of l) { try { await P.supprimerProjet(p.id); } catch (e) { console.error(e); } }
  await rafraichir();
  notifier('Corbeille vidée');
}

function nouveauProjet() {
  ouvrirFormulaireInfos({ avantCreation: () => fermerGestionnaire() });
}

/* ---------- Import ---------- */

function choisirImport() {
  const inp = document.getElementById('fichier-projet');
  inp.onchange = async () => {
    const f = inp.files[0]; inp.value = '';
    if (!f) return;
    let analyse;
    try { analyse = await P.analyserImport(f); }
    catch (e) { console.error(e); notifier('Import impossible : ' + (e.message || e), 6000); return; }
    let mode = 'nouveau';
    if (analyse.existant) {
      mode = await choisirModeImport(analyse);
      if (!mode) return;
    }
    try {
      notifier('Import en cours…');
      const id = await P.importerAnalyse(analyse, mode);
      const projets2 = await P.listerProjets();
      const importe = projets2.find((x) => x.id === id);
      if (importe) { prefs.onglet = importe.statut; memoriser(); }
      await rafraichir();
      notifier(mode === 'remplacer' ? 'Projet remplacé par le fichier' : 'Projet importé');
    } catch (e) {
      console.error(e);
      notifier('Import impossible : ' + (e.message || e), 6000);
    }
  };
  inp.click();
}

function choisirModeImport({ projet, existant }) {
  return new Promise((resolve) => {
    const tablette = existant.modifie_le || '';
    const fichier = projet.modifie_le || '';
    const verdict = fichier === tablette ? 'Les deux versions ont la même date de modification.'
      : (fichier > tablette ? 'Le fichier est plus récent' : 'La tablette est plus récente');
    const d = ouvrirDialogue('dlg-generique', `
      <form method="dialog" class="dialogue">
        <h2>Ce projet existe déjà</h2>
        <p>« ${echapper(existant.nom)} » est déjà sur la tablette.</p>
        <p class="dates-import">Sur la tablette : <strong>${echapper(formaterDateHeure(tablette) || 'date inconnue')}</strong><br>
        Dans le fichier : <strong>${echapper(formaterDateHeure(fichier) || 'date inconnue')}</strong></p>
        <p class="verdict-import"><strong>${echapper(verdict)}</strong></p>
        <div class="boutons colonne">
          <button type="button" class="btn btn-primaire btn-grand" data-r="remplacer">Remplacer</button>
          <button type="button" class="btn btn-grand" data-r="copie">Garder les deux</button>
          <button type="button" class="btn btn-grand" data-r="non">Annuler</button>
        </div>
        <p class="aide">Remplacer : le projet de la tablette et son fond sont remplacés par le fichier${etat.projet && etat.projet.id === existant.id ? ' ; le projet ouvert est fermé puis rouvert, l’historique d’annulation est perdu' : ''}. Garder les deux : le fichier est ajouté sous le nom « ${echapper(projet.nom)} (importé) ».</p>
      </form>`);
    let r = null;
    d.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { r = b.dataset.r === 'non' ? null : b.dataset.r; d.close(); }));
    d.addEventListener('close', () => resolve(r), { once: true });
  });
}

/* ---------- Libérer la place (§4.8) ---------- */

async function libererPlace(p) {
  const taille = await P.tailleProjet(p.id);
  const nomJson = P.nomFichier(p, '.json');
  let sauve = !!p.json_sauve_le && !((p.modifie_le || '') > p.json_sauve_le);
  const d = ouvrirDialogue('dlg-generique', `
    <form method="dialog" class="dialogue">
      <h2>Libérer la place</h2>
      <p>« ${echapper(p.nom)} » et son fond de plan seront retirés de la tablette, sans passer par la corbeille.<br>
      Vous le retrouverez en réimportant son fichier .json. Place récupérée : <strong>${(taille / 1048576).toFixed(1)} Mo</strong>.</p>
      <div class="zone-sauvegarde"></div>
      <label class="case confirmation-liberer" hidden><input type="checkbox" name="verifie"> J’ai vérifié que le fichier « ${echapper(nomJson)} » est bien enregistré</label>
      <div class="boutons">
        <button type="button" class="btn" data-r="non">Annuler</button>
        <button type="button" class="btn btn-danger" data-r="retirer" disabled>Retirer de la tablette</button>
      </div>
    </form>`);
  const zone = d.querySelector('.zone-sauvegarde');
  const confirmation = d.querySelector('.confirmation-liberer');
  const caseVerifie = d.querySelector('[name="verifie"]');
  const retirer = d.querySelector('[data-r="retirer"]');
  const majZone = () => {
    zone.innerHTML = sauve
      ? '<p class="aide">Une sauvegarde .json à jour a été produite. Vérifiez qu’elle est bien arrivée (Drive, Téléchargements) avant de retirer le projet.</p><button type="button" class="btn" data-action="resauver">Sauvegarder à nouveau en .json…</button>'
      : '<p class="aide alerte">Aucune sauvegarde .json à jour : elle doit être faite d’abord.</p><button type="button" class="btn btn-primaire" data-action="resauver">Sauvegarder en .json…</button>';
    confirmation.hidden = !sauve;
    zone.querySelector('[data-action="resauver"]').addEventListener('click', lancerSauvegarde);
  };
  const lancerSauvegarde = () => ouvrirFenetreExport(p.id, 'json', { surLivraison: () => { sauve = true; if (d.open) majZone(); } });
  caseVerifie.addEventListener('change', () => { retirer.disabled = !caseVerifie.checked; });
  d.querySelector('[data-r="non"]').addEventListener('click', () => d.close());
  retirer.addEventListener('click', async () => {
    if (!caseVerifie.checked) return;
    d.close();
    try {
      await P.supprimerProjet(p.id);
      await rafraichir();
      notifier('Projet retiré de la tablette');
    } catch (e) { notifier('Retrait impossible : ' + (e.message || e), 5000); }
  });
  majZone();
  if (!sauve) lancerSauvegarde();
}
