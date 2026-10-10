/* ui/projets.js — fond de plan (PDF / image / photo), échelle du plan, boîte Exporter du plan ouvert,
 * formulaire « Nouveau projet » / « Modifier les informations » et fenêtre d'export du gestionnaire.
 *
 * Lot 1.4 : la liste des projets est remplacée par le gestionnaire plein écran (ui/gestionnaire.js).
 * `ouvrirListeProjets()` est conservée comme alias pour les appels existants.
 *
 * v1.4.5 (PDF multi-pages) : le fichier choisi dans « Fond de plan » passe par ui/plans.js → importerFichierFond
 * (destination, pages, un plan par page) ; l'export PDF sort tous les plans du projet, une page par plan ; le PNG
 * reste limité au plan affiché.
 */
import { etat, notifier, sur, emettre, peutModifier, signalerLectureSeule } from '../etat.js';
import * as P from '../projet.js';
import { importerFichierFond, lancerRepartition } from './plans.js';
import { repartitionPossible } from '../plans.js';
import { exporterPdf } from '../export-pdf.js';
import { exporterPng } from '../export-png.js';
import { contexteCourant, contextesProjetOuvert, chargerContexteExport, reserverExport, libererExport } from '../contexte-export.js';
import { aujourdhui } from '../modele.js';
import { analyserGps, formaterGps, lienGoogleMaps } from '../descriptif.js';
import { ouvrirDialogue, fermerDialogue, demander, echapper } from './dialogues.js';
import { CHARTE, TYPES_AFFAIRE } from '../charte.js';
import { definirEchellePlan } from './calques.js';
import { ouvrirGestionnaire } from './gestionnaire.js';
import { confirmerAlertesExport } from './descriptif.js';   // v1.5.0 : alertes du descriptif avant export
import { migrerProjet, cloner } from '../modele.js';
import { bd } from '../bd.js';

export function initialiserProjetsUI() {
  document.getElementById('btn-projets').addEventListener('click', () => ouvrirGestionnaire());
  document.getElementById('btn-fond').addEventListener('click', () => ouvrirFondDialogue());
  document.getElementById('btn-export').addEventListener('click', ouvrirExport);
  // Appui sur le titre : informations d'affaire (§6.5), sauf en consultation d'un archivé
  const titre = document.getElementById('nom-projet');
  titre.addEventListener('click', () => {
    if (!etat.projet) { ouvrirGestionnaire(); return; }
    if (!peutModifier()) { signalerLectureSeule(); return; }
    ouvrirFormulaireInfos({ projet: etat.projet });
  });
  titre.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); titre.click(); } });
  sur('projet-ouvert', () => { document.getElementById('message-vide').hidden = !!etat.plan.fond; });
  sur('fond', () => { document.getElementById('message-vide').hidden = !!(etat.plan && etat.plan.fond); });
  sur('plan-change', () => { document.getElementById('message-vide').hidden = !!(etat.plan && etat.plan.fond); });   // v1.4.5
  sur('projet-ferme', () => { document.getElementById('message-vide').hidden = false; });
}

/* Alias conservé : l'ancienne boîte « Projets » ouvre désormais le gestionnaire. */
export function ouvrirListeProjets() { ouvrirGestionnaire(); }

export function formaterDateHeure(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/* ---------- Formulaire d'affaire (§4.6) ---------- */

/* projet : null pour « Nouveau projet ». Résout les informations validées, ou null si annulé.
 * Pour une création, le projet est créé et ouvert, puis la boîte « Fond de plan » s'enchaîne.
 * `avantCreation` : appelé juste avant la création (le gestionnaire se ferme). */
export async function ouvrirFormulaireInfos({ projet = null, avantCreation = null } = {}) {
  const creation = !projet;
  const communes = await P.communesConnues();
  const v = projet || { nom: '', commune: '', date: aujourdhui(), num_sieep: '', num_edf: '', type_affaire: null, gps: '' };
  return new Promise((resolve) => {
    const d = ouvrirDialogue('dlg-generique', `
      <form class="dialogue formulaire-affaire" novalidate>
        <h2>${creation ? 'Nouveau projet' : 'Informations de l’affaire'}</h2>
        <label>Nom de l’affaire <span class="obligatoire">*</span>
          <input name="nom" type="text" autocomplete="off" value="${echapper(v.nom || '')}" placeholder="Ex. Renforcement BT lieu-dit…">
          <span class="erreur-champ" data-erreur="nom" hidden></span></label>
        <label>Commune <span class="obligatoire">*</span>
          <input name="commune" type="text" autocomplete="off" list="liste-communes" value="${echapper(v.commune || '')}">
          <datalist id="liste-communes">${communes.map((c) => `<option value="${echapper(c)}"></option>`).join('')}</datalist>
          <span class="erreur-champ" data-erreur="commune" hidden></span></label>
        <label>Date <span class="obligatoire">*</span>
          <input name="date" type="date" value="${echapper(v.date || aujourdhui())}">
          <span class="erreur-champ" data-erreur="date" hidden></span></label>
        <div class="ligne2">
          <label>N° SIEEP<input name="num_sieep" type="text" autocomplete="off" value="${echapper(v.num_sieep || '')}"></label>
          <label>N° EDF<input name="num_edf" type="text" autocomplete="off" value="${echapper(v.num_edf || '')}"></label>
        </div>
        <label>Point GPS <small>(facultatif — copié depuis Google Maps : « 42.1028902, 9.2117636 »)</small>
          <input name="gps" type="text" autocomplete="off" inputmode="text" value="${echapper(formaterGps(v.gps || '') || v.gps || '')}" placeholder="42.1028902, 9.2117636">
          <span class="erreur-champ" data-erreur="gps" hidden></span></label>
        <div class="actions-gps">
          <button type="button" class="btn" data-gps="coller">Coller</button>
          <button type="button" class="btn" data-gps="position">Position de la tablette</button>
          <a class="btn" data-gps="carte" href="${echapper(lienGoogleMaps(v.gps || ''))}" target="_blank" rel="noopener" ${lienGoogleMaps(v.gps || '') ? '' : 'hidden'}>Voir sur Google Maps</a>
        </div>
        <label>Type d’affaire
          <select name="type_affaire">
            <option value="">Non renseigné</option>
            ${Object.entries(TYPES_AFFAIRE).map(([k, l]) => `<option value="${k}" ${v.type_affaire === k ? 'selected' : ''}>${echapper(l)}</option>`).join('')}
          </select></label>
        <div class="boutons">
          <button type="button" class="btn" data-r="non">Annuler</button>
          <button type="button" class="btn btn-primaire" data-r="ok">${creation ? 'Créer' : 'Enregistrer'}</button>
        </div>
      </form>`);
    const form = d.querySelector('form');
    let resolu = false;
    const champ = (n) => form.elements[n];
    const erreur = (n, message) => {
      const z = form.querySelector(`[data-erreur="${n}"]`);
      z.textContent = message || '';
      z.hidden = !message;
      champ(n).setAttribute('aria-invalid', message ? 'true' : 'false');
    };
    for (const n of ['nom', 'commune', 'date']) champ(n).addEventListener('input', () => erreur(n, ''));
    // v1.5.1 : point GPS — saisie souple, collage, position de la tablette, lien Google Maps
    const lienCarte = form.querySelector('[data-gps="carte"]');
    const majLien = () => { const u = lienGoogleMaps(champ('gps').value); lienCarte.hidden = !u; if (u) lienCarte.href = u; };
    const poserGps = (texte) => {
      const g = analyserGps(texte);
      if (!g) { erreur('gps', 'Coordonnées non reconnues : collez la paire « latitude, longitude » de Google Maps.'); return; }
      champ('gps').value = formaterGps(g); erreur('gps', ''); majLien();
    };
    champ('gps').addEventListener('input', () => { erreur('gps', ''); majLien(); });
    champ('gps').addEventListener('change', () => { if (champ('gps').value.trim()) poserGps(champ('gps').value); });
    form.querySelector('[data-gps="coller"]').addEventListener('click', async () => {
      try { poserGps(await navigator.clipboard.readText()); }
      catch (e) { notifier('Presse-papiers inaccessible : collez dans le champ (appui long → Coller)', 3200); champ('gps').focus(); }
    });
    form.querySelector('[data-gps="position"]').addEventListener('click', () => {
      if (!navigator.geolocation) { notifier('Position indisponible sur cet appareil', 2600); return; }
      notifier('Recherche de la position…', 1600);
      navigator.geolocation.getCurrentPosition(
        (pos) => { poserGps(pos.coords.latitude.toFixed(7) + ', ' + pos.coords.longitude.toFixed(7)); notifier('Position de la tablette (précision ≈ ' + Math.round(pos.coords.accuracy) + ' m)', 3000); },
        (e) => notifier('Position refusée ou indisponible' + (e && e.message ? ' : ' + e.message : ''), 3200),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });

    const valider = async () => {
      const r = {
        nom: champ('nom').value.trim(), commune: champ('commune').value.trim(), date: champ('date').value,
        num_sieep: champ('num_sieep').value.trim(), num_edf: champ('num_edf').value.trim(), type_affaire: champ('type_affaire').value || null,
        gps: formaterGps(champ('gps').value)
      };
      let premier = null;
      const verifier = (n, ok, message) => { erreur(n, ok ? '' : message); if (!ok && !premier) premier = n; };
      verifier('nom', !!r.nom, 'Le nom de l’affaire est obligatoire.');
      verifier('commune', !!r.commune, 'La commune est obligatoire.');
      verifier('date', /^\d{4}-\d{2}-\d{2}$/.test(r.date), 'La date est obligatoire.');
      verifier('gps', !champ('gps').value.trim() || !!r.gps, 'Coordonnées non reconnues : collez la paire « latitude, longitude » de Google Maps.');
      if (premier) { champ(premier).focus(); return; }
      resolu = true;
      d.close();
      try {
        if (creation) {
          if (avantCreation) avantCreation();
          await P.creerProjet(r);
          notifier('Projet créé — ajoutez un fond de plan');
          ouvrirFondDialogue();
        } else {
          await P.modifierInfos(projet.id, r);
          notifier('Informations enregistrées');
        }
        resolve(r);
      } catch (e) {
        console.error(e);
        notifier((creation ? 'Création impossible : ' : 'Enregistrement impossible : ') + (e.message || e), 5000);
        resolve(null);
      }
    };
    d.querySelector('[data-r="ok"]').addEventListener('click', valider);
    d.querySelector('[data-r="non"]').addEventListener('click', () => d.close());
    form.addEventListener('submit', (e) => { e.preventDefault(); valider(); });
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); valider(); return; }
      const liste = [...form.querySelectorAll('input, select')];
      const i = liste.indexOf(e.target);
      if (i < 0) return;
      e.preventDefault();
      if (i === liste.length - 1) valider(); else liste[i + 1].focus();
    });
    d.addEventListener('close', () => { if (!resolu) resolve(null); }, { once: true });
    setTimeout(() => champ(creation || !v.commune ? (v.nom ? 'commune' : 'nom') : 'nom').focus(), 50);
  });
}

/* ---------- Fond de plan ---------- */
/* ajout (v1.4.5) : le fichier choisi devient un ou plusieurs NOUVEAUX plans (liste des plans → « Ajouter un plan »).
 * Sinon, si le plan courant a déjà un fond, la destination est demandée après le choix du fichier (ui/plans.js). */
export function ouvrirFondDialogue({ ajout = false } = {}) {
  if (!etat.projet) { notifier('Ouvrez ou créez d’abord un projet'); ouvrirGestionnaire(); return; }
  if (!peutModifier()) { signalerLectureSeule(); return; }
  const f = etat.plan.fond;
  const repartir = !ajout && repartitionPossible();
  const d = ouvrirDialogue('dlg-fond', `
    <form method="dialog" class="dialogue">
      <h2>${ajout ? 'Ajouter un plan' : 'Fond de plan'}</h2>
      ${ajout ? '<p class="aide">Le fichier choisi devient un nouveau plan ; un PDF de plusieurs pages, un plan par page.</p>'
        : f ? `<p class="aide">Fond actuel : ${echapper(f.nom_fichier)}${f.type === 'pdf' && f.nb_pages > 1 ? ' (page ' + f.page + ' / ' + f.nb_pages + ')' : ''}. Vous pourrez remplacer ce fond (objets conservés) ou ajouter le nouveau fichier comme nouveau plan.</p>`
        : '<p class="aide">Choisissez un PDF, une image ou prenez une photo. Un PDF de plusieurs pages donne un plan par page. Le plan est utilisable ensuite sans connexion.</p>'}
      <div class="boutons colonne">
        <button type="button" class="btn btn-primaire" data-action="fichier">Choisir un PDF ou une image</button>
        <button type="button" class="btn" data-action="photo">Prendre une photo</button>
        ${repartir ? '<button type="button" class="btn" data-action="repartir">Répartir les pages de ce PDF en plans…</button>' : ''}
        <button type="button" class="btn" data-action="fermer">Annuler</button>
      </div>
    </form>`);
  d.querySelector('[data-action="fermer"]').addEventListener('click', () => d.close());
  const rp = d.querySelector('[data-action="repartir"]');
  if (rp) rp.addEventListener('click', () => { d.close(); lancerRepartition(); });
  const charger = (inputId, photo) => {
    const inp = document.getElementById(inputId);
    inp.onchange = async () => {
      const fichier = inp.files[0]; inp.value = '';
      if (!fichier) return;
      d.close();
      await importerFichierFond(fichier, { photo, ajout });
    };
    inp.click();
  };
  d.querySelector('[data-action="fichier"]').addEventListener('click', () => charger('fichier-fond', false));
  d.querySelector('[data-action="photo"]').addEventListener('click', () => charger('fichier-photo', true));
}

/* Échelle du plan demandée à l'import du fond (v11 §3.1) : choix rapide, saisie libre ou « inconnue ». */
export function demanderEchellePlan({ photo = false } = {}) {
  const p = etat.projet;
  const d = ouvrirDialogue('dlg-fond', `
    <form method="dialog" class="dialogue">
      <h2>Échelle du plan</h2>
      <p class="aide">${photo ? 'Photo ou fond non coté : « inconnue » convient, les tailles par défaut sont conservées.' : 'Sert aux tailles par défaut des textes et des symboles (aspect papier). Les objets déjà posés ne sont pas modifiés. Modifiable ensuite dans Calques.'}</p>
      <div class="chips echelles">
        ${CHARTE.ECHELLES_PLAN.map((e) => `<button type="button" class="chip ${p.echelle_plan === e ? 'actif' : ''}" data-echelle="${e}">1/${e}</button>`).join('')}
        <button type="button" class="chip" data-echelle="__autre__">Autre…</button>
        <button type="button" class="chip ${!p.echelle_plan ? 'actif' : ''}" data-echelle="">Inconnue</button>
      </div>
    </form>`);
  d.querySelectorAll('[data-echelle]').forEach((b) => b.addEventListener('click', async () => {
    let v = b.dataset.echelle;
    d.close();
    if (v === '__autre__') { const r = await demander('Échelle du plan', [{ nom: 'd', libelle: 'Dénominateur (ex. 250 pour 1/250)', valeur: '', type: 'number' }]); v = r && Number(r.d) > 0 ? r.d : ''; }
    const val = v ? Number(v) : null;
    if (val !== p.echelle_plan) { definirEchellePlan(val); notifier(val ? 'Échelle 1/' + val + ' : tailles par défaut adaptées' : 'Échelle inconnue : tailles par défaut conservées'); }
  }));
}

/* ---------- Suivi après livraison d'un fichier (§7, §8) ---------- */

async function apresLivraisonPdf(projetId, statutAuMoment, indiceUtilise) {
  if (statutAuMoment !== 'termine' || !indiceUtilise) return;
  try { await P.mettreAJourMeta(projetId, { indice_pdf: indiceUtilise }); } catch (e) { console.warn('Indice PDF non enregistré', e); }
}

async function apresLivraisonJson(projetId) {
  try { await P.mettreAJourMeta(projetId, { json_sauve_le: new Date().toISOString() }); } catch (e) { console.warn('Date de sauvegarde non enregistrée', e); }
}

/* ---------- Boîte Exporter du plan ouvert (comportement historique conservé) ---------- */
export function ouvrirExport() {
  if (!etat.projet) { notifier('Aucun projet ouvert'); return; }
  const nbPlans = etat.projet.plans.length;
  const d = ouvrirDialogue('dlg-export', `
    <form method="dialog" class="dialogue">
      <h2>Exporter</h2>
      <div class="boutons colonne">
        <button type="button" class="btn btn-primaire" data-action="pdf">${nbPlans > 1 ? 'PDF vectoriel — ' + nbPlans + ' pages (tous les plans, format de chaque fond, légendes, texte sélectionnable)' : 'PDF vectoriel (format du fond, légende, texte sélectionnable)'}</button>
        <label class="ligne2 compact">
          <button type="button" class="btn" data-action="png">${nbPlans > 1 ? 'Image PNG — plan affiché' : 'Image PNG'}</button>
          <select name="dpi"><option value="150">150 dpi</option><option value="200" selected>200 dpi</option><option value="300">300 dpi</option></select>
        </label>
        <button type="button" class="btn" data-action="json">Projet .json (avec fond embarqué, pour transfert)</button>
        <button type="button" class="btn" data-action="fermer">Fermer</button>
      </div>
      <p class="aide" id="export-etat"></p>
      <p class="aide">Sur Android, l’export s’ouvre dans le panneau de partage (Drive, mail, Nearby…) ; sinon le fichier est téléchargé.</p>
    </form>`);
  const etatEl = d.querySelector('#export-etat');
  const progression = (m) => { etatEl.textContent = m; };
  d.querySelector('[data-action="fermer"]').addEventListener('click', () => d.close());
  const occupe = () => { if (reserverExport()) return false; progression('Un export est déjà en préparation.'); return true; };

  d.querySelector('[data-action="pdf"]').addEventListener('click', async () => {
    if (!(await confirmerAlertesExport(etat.projet.plans))) return;   // v1.5.0 §2.7
    if (occupe()) return;
    try {
      const p = etat.projet;
      const indice = p.statut === 'termine' ? P.indiceSuivant(p.indice_pdf) : '';
      const nom = P.nomFichier(p, '.pdf', { indice });
      // v1.4.5 : tous les plans, une page par plan ; un projet mono-plan donne le même PDF qu'en v1.4.4.
      const ctxs = contextesProjetOuvert();
      let blob;
      try { blob = await exporterPdf(ctxs, { progression }); } finally { ctxs.fermer(); }
      progression('PDF prêt (' + (blob.size / 1048576).toFixed(2) + ' Mo)');
      const res = await P.livrerFichier(blob, nom, 'auto');
      if (res !== 'annule') await apresLivraisonPdf(p.id, p.statut, indice);
    } catch (e) { console.error(e); progression('Échec de l’export PDF : ' + (e.message || e)); }
    finally { libererExport(); }
  });
  d.querySelector('[data-action="png"]').addEventListener('click', async () => {
    if (!(await confirmerAlertesExport([etat.plan]))) return;   // v1.5.0 §2.7 : PNG = plan affiché
    if (occupe()) return;
    try {
      const blob = await exporterPng(contexteCourant(), { dpi: Number(d.querySelector('[name="dpi"]').value), progression });
      progression('PNG prêt (' + (blob.size / 1048576).toFixed(2) + ' Mo)');
      await P.livrerFichier(blob, P.nomFichier(etat.projet, '.png'), 'auto');
    } catch (e) { console.error(e); progression('Échec de l’export PNG : ' + (e.message || e)); }
    finally { libererExport(); }
  });
  d.querySelector('[data-action="json"]').addEventListener('click', async () => {
    if (occupe()) return;
    try {
      const id = etat.projet.id;
      const nom = P.nomFichier(etat.projet, '.json');
      progression('Préparation du fichier…');
      const blob = await P.exporterProjetJson(id, { progression });
      const mo = blob.size / 1048576;
      progression('Fichier prêt (' + mo.toFixed(1) + ' Mo)' + (mo > CHARTE.projets.alerte_json_mo ? ' — volumineux : le fond est embarqué en base64' : ''));
      const res = await P.livrerFichier(blob, nom, 'auto');
      if (res !== 'annule') await apresLivraisonJson(id);
    } catch (e) { console.error(e); progression('Échec : ' + (e.message || e)); }
    finally { libererExport(); }
  });
}

/* ---------- Fenêtre d'export du gestionnaire (§5.1) ----------
 * type : 'pdf' | 'json'. Le fichier est préparé une seule fois, puis conservé le temps de la fenêtre.
 * `surLivraison(resultat)` : appelé après chaque partage non annulé ou téléchargement (« Libérer la place »). */
export async function ouvrirFenetreExport(idProjet, type, { surLivraison = null } = {}) {
  const resume = (await P.listerProjets()).find((x) => x.id === idProjet);
  if (!resume) { notifier('Projet introuvable'); return; }
  if (type === 'pdf') {   // v1.5.0 §2.7 : alertes du descriptif (projet relu en base, ou projet ouvert)
    const ouvert = etat.projet && etat.projet.id === idProjet;
    let plans = ouvert ? etat.projet.plans : [];
    if (!ouvert) { try { const enreg = await bd.get('projets', idProjet); if (enreg) plans = migrerProjet(cloner(enreg)).plans; } catch (e) { plans = []; } }
    if (!(await confirmerAlertesExport(plans, { planOuvert: ouvert }))) return;
  }
  if (!reserverExport()) { notifier('Un export est déjà en préparation'); return; }

  const mime = type === 'pdf' ? 'application/pdf' : 'application/json';
  const indice = type === 'pdf' && resume.statut === 'termine' ? P.indiceSuivant(resume.indice_pdf) : '';
  const nom = P.nomFichier(resume, type === 'pdf' ? '.pdf' : '.json', { indice });
  const partage = P.partagePossible(nom, mime);

  const d = ouvrirDialogue('dlg-export', `
    <form method="dialog" class="dialogue fenetre-export">
      <h2>${type === 'pdf' ? 'Exporter le PDF' : 'Sauvegarder en .json'}</h2>
      <p class="nom-fichier-export">${echapper(nom)}</p>
      <p class="aide progression-export" aria-live="polite">Préparation…</p>
      <div class="boutons colonne">
        ${partage ? '<button type="button" class="btn btn-primaire btn-grand" data-action="partager" disabled>Partager (Drive, mail…)</button>' : ''}
        <button type="button" class="btn ${partage ? '' : 'btn-primaire'} btn-grand" data-action="enregistrer" disabled>Enregistrer sur la tablette</button>
        <button type="button" class="btn btn-grand" data-action="fermer">Fermer</button>
      </div>
      ${partage && type === 'json' ? `<p class="aide">Partager envoie le fichier sous le nom « ${echapper(nom)}.txt » (Android refuse l’extension .json) ; il se réimporte tel quel. Enregistrer garde le nom .json.</p>` : ''}
      ${partage ? '' : `<p class="aide">Le partage direct de ce fichier n’est pas proposé par cet appareil : enregistrez-le, puis envoyez-le depuis le dossier Téléchargements (application Fichiers ou Drive).</p>`}
    </form>`);
  const ligne = d.querySelector('.progression-export');
  const progression = (m) => { ligne.textContent = m; };
  const boutons = [...d.querySelectorAll('[data-action="partager"], [data-action="enregistrer"]')];
  let blob = null;
  let ouverte = true;
  let indiceEnregistre = false;
  d.addEventListener('close', () => { ouverte = false; }, { once: true });
  d.querySelector('[data-action="fermer"]').addEventListener('click', () => d.close());

  const livrer = async (mode) => {
    if (!blob) return;
    boutons.forEach((b) => { b.disabled = true; });
    try {
      const res = await P.livrerFichier(blob, nom, mode);
      if (res === 'annule') return;
      if (type === 'pdf') {
        if (!indiceEnregistre) { indiceEnregistre = true; await apresLivraisonPdf(idProjet, resume.statut, indice); }
      } else {
        await apresLivraisonJson(idProjet);
      }
      progression(res === 'partage' ? 'Fichier transmis au panneau de partage.' : 'Fichier enregistré dans Téléchargements.');
      if (surLivraison) surLivraison(res);
    } catch (e) {
      console.error(e);
      progression('Échec : ' + (e.message || e));
    } finally {
      boutons.forEach((b) => { b.disabled = false; });
    }
  };
  const bp = d.querySelector('[data-action="partager"]');
  if (bp) bp.addEventListener('click', () => livrer('partager'));
  d.querySelector('[data-action="enregistrer"]').addEventListener('click', () => livrer('telecharger'));

  try {
    if (type === 'pdf') {
      if (etat.projet && etat.projet.id === idProjet) await P.sauverMaintenant();
      progression('Lecture du projet…');
      const ctxs = await chargerContexteExport(idProjet);   // v1.4.5 : un contexte par plan
      try { blob = await exporterPdf(ctxs, { progression }); }
      finally { ctxs.fermer(); }
    } else {
      blob = await P.exporterProjetJson(idProjet, { progression });
    }
    const mo = blob.size / 1048576;
    if (ouverte) {
      progression('Fichier prêt (' + (mo < 0.1 ? (blob.size / 1024).toFixed(0) + ' ko' : mo.toFixed(1) + ' Mo') + ')' + (type === 'json' && mo > CHARTE.projets.alerte_json_mo ? ' — volumineux : le fond est embarqué' : '') + '.');
      boutons.forEach((b) => { b.disabled = false; });
    }
  } catch (e) {
    console.error(e);
    progression('Échec de la préparation : ' + (e.message || e));
  } finally {
    libererExport();
  }
}

export { fermerDialogue, emettre };
