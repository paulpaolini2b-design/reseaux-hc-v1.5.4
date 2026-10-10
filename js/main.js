/* main.js — amorçage : nomenclature → base → purge de la corbeille → interface → service worker →
 * dernier projet s'il est « En cours », sinon gestionnaire de projets (lot 1.4, v14 §6.1). */
import { etat, notifier, sur } from './etat.js';
import { CHARTE } from './charte.js';
import { bd } from './bd.js';
import { chargerNomenclature } from './nomenclature.js';
import { initialiserFond } from './fond.js';
import { initialiserRendu } from './rendu-svg.js';
import { initialiserPointeur } from './pointeur.js';
import { initialiserOutils } from './outils.js';
import { initialiserClavier } from './clavier.js';
import { initialiserProjet, dernierProjetId, ouvrirProjet, purgerCorbeille } from './projet.js';
import { tailleEcran } from './vue.js';
import { definirMesureurCanvas } from './export-pdf.js';
import { initialiserBarreOutils } from './ui/barre-outils.js';
import { initialiserPalette } from './ui/palette.js';
import { initialiserFiche } from './ui/fiche-objet.js';
import { initialiserCalques } from './ui/calques.js';
import { initialiserProjetsUI } from './ui/projets.js';
import { initialiserGestionnaire, ouvrirGestionnaire } from './ui/gestionnaire.js';
import { initialiserLectureSeule } from './ui/lecture-seule.js';
import { initialiserACompleter } from './ui/a-completer.js';
import { initialiserMenuContextuel } from './ui/menu-contextuel.js';
import { initialiserOutilsAnnotation } from './ui/outils-annotation.js';
import { initialiserMesure } from './mesure.js';   // v1.4.3 : outil Mesure
import { initialiserPlans } from './plans.js';     // v1.4.5 : plans d'un projet (PDF multi-pages)
import { initialiserPlansUI } from './ui/plans.js';
import { initialiserBarreRognage } from './ui/rognage.js';   // v1.4.7 : rognage des images libres
import { initialiserEditeurDescriptif } from './ui/descriptif.js';   // v1.5.0 : descriptif des travaux

async function chargerPolice() {
  try {
    const police = new FontFace('DejaVu Sans', 'url(vendor/fonts/DejaVuSans.ttf)');
    await police.load();
    document.fonts.add(police);
    etat.police_prete = true;
  } catch (e) {
    console.warn('Police DejaVu Sans indisponible, repli sur la police système', e);
  }
  // v1.4.6 §1 : gras, italique et gras italique de la même famille (DejaVu 2.37) — vraies graisses, mêmes largeurs
  // qu'au PDF, jamais de gras simulé par le navigateur. Chargées sans bloquer le démarrage.
  for (const [fichier, weight, style] of [['DejaVuSans-Bold.ttf', 'bold', 'normal'], ['DejaVuSans-Oblique.ttf', 'normal', 'italic'], ['DejaVuSans-BoldOblique.ttf', 'bold', 'italic']]) {
    try { const f = new FontFace('DejaVu Sans', `url(vendor/fonts/${fichier})`, { weight, style }); await f.load(); document.fonts.add(f); }
    catch (e) { console.warn('Police ' + fichier + ' indisponible', e); }
  }
  // Mesureur de texte partagé (largeurs identiques entre l'écran et le calcul des cadres)
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  definirMesureurCanvas((texte, taille, style) => {
    const st = style ? (style.italique ? 'italic ' : '') + (style.gras ? 'bold ' : '') : '';
    ctx.font = `${st}${taille * 10}px ${CHARTE.texte.police}`;   // ×10 pour la précision, puis /10
    return ctx.measureText(texte).width / 10;
  });
}

async function chargerPrefs() {
  try {
    const f = await bd.get('prefs', 'favoris'); if (f) etat.prefs.favoris = f.valeur || [];
    const r = await bd.get('prefs', 'recents'); if (r) etat.prefs.recents = r.valeur || [];
    const fa = await bd.get('prefs', 'favoris_annotations'); if (fa) etat.prefs.favoris_annotations = fa.valeur || [];
    const ra = await bd.get('prefs', 'recents_annotations'); if (ra) etat.prefs.recents_annotations = ra.valeur || [];
    const cr = await bd.get('prefs', 'couleurs_recentes'); if (cr) etat.prefs.couleurs_recentes = cr.valeur || [];   // sélecteur de couleur (v13.4)
    const mp = await bd.get('prefs', 'mode_pose'); if (mp && (mp.valeur === 'unique' || mp.valeur === 'continu')) etat.prefs.mode_pose = mp.valeur;   // v1.4.9 §3
  } catch (e) { /* première ouverture */ }
}

function orientation() {
  document.getElementById('app').dataset.orientation = window.innerWidth >= window.innerHeight ? 'paysage' : 'portrait';
}

async function demarrer() {
  orientation();
  window.addEventListener('resize', orientation);
  tailleEcran();

  await bd.ouvrir();
  bd.persister();
  await chargerPrefs();
  // Purge silencieuse de la corbeille (§6.2) : un échec est retenté au démarrage suivant.
  try { await purgerCorbeille(); } catch (e) { console.warn('Purge de la corbeille reportée au prochain démarrage', e); }
  await chargerPolice();
  try { await chargerNomenclature(); }
  catch (e) { console.error(e); notifier('Nomenclature introuvable : vérifiez le déploiement de nomenclature.json', 6000); etat.nomenclature = { articles: [], categories: [], regles: {}, designations_supports: null }; }

  initialiserFond();
  initialiserRendu();
  initialiserOutils();
  initialiserPointeur();
  initialiserClavier();
  initialiserProjet();
  initialiserPlans();
  initialiserBarreOutils();
  initialiserMesure();
  initialiserPalette();
  initialiserFiche();
  initialiserCalques();
  initialiserProjetsUI();
  initialiserGestionnaire();
  initialiserLectureSeule();
  initialiserACompleter();
  initialiserMenuContextuel();
  initialiserOutilsAnnotation();
  initialiserPlansUI();
  initialiserBarreRognage();
  initialiserEditeurDescriptif();

  // Service worker : rend l'application disponible hors ligne après la première ouverture
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nv = reg.installing;
        nv && nv.addEventListener('statechange', () => { if (nv.state === 'installed' && navigator.serviceWorker.controller) notifier('Nouvelle version installée : relancez l’application pour l’utiliser', 5000); });
      });
    }).catch((e) => console.warn('Service worker non enregistré', e));
  }

  // Réouverture du dernier projet à l'identique s'il est « En cours » ; sinon gestionnaire sur « En cours ».
  const id = await dernierProjetId();
  if (id) {
    try {
      const p = await bd.get('projets', id);
      if (p && (p.statut || 'en_cours') === 'en_cours') { await ouvrirProjet(id); return; }
    } catch (e) { console.warn(e); }
  }
  ouvrirGestionnaire({ onglet: 'en_cours' });
}

sur('projet-ouvert', () => { document.body.classList.add('projet-ouvert'); });
sur('projet-ferme', () => { document.body.classList.remove('projet-ouvert'); });

demarrer().catch((e) => { console.error(e); notifier('Erreur au démarrage : ' + (e.message || e), 8000); });
