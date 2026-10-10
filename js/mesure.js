/* mesure.js — outil Mesure (v1.4.3), distance sur plan à titre INDICATIF.
 *
 * Principe de fiabilité (voir H-182 et suivantes) :
 * - la référence est une CALIBRATION par distance connue (deux repères pointés sur le fond + distance réelle
 *   saisie), enregistrée par fond et par page dans `plan.fond.calibrations` ; un CONTRÔLE sur une seconde distance
 *   connue la qualifie ;
 * - sans calibration, un fond PDF dont l'échelle est déclarée (projet.echelle_plan, H-64) donne une estimation
 *   « non vérifiée », recalculée à la volée et jamais enregistrée ; une image ou une photo ne donne rien.
 *
 * Intangibles :
 * - la mesure n'écrit JAMAIS dans un objet du plan (ni longueur_m, ni longueur_source, ni afficher_longueur) ;
 * - elle n'est ni annulable ni exportée : elle vit dans son propre groupe SVG (#g-mesure) et dans son panneau ;
 * - la seule donnée enregistrée est la calibration, par l'événement 'fond' (sauvegarde automatique existante).
 *
 * Aiguillage : pointeur.js appelle ce module AVANT outils.js quand l'outil courant est 'mesure' (outils.appui
 * poserait sinon un objet ponctuel pour un outil inconnu). Le clavier est intercepté en phase de capture.
 *
 * Accès : bouton « règle » de la barre du haut et touche M. L'outil n'est PAS ajouté à la barre latérale
 * (OUTILS de outils.js) : elle déborde déjà à 800 px de haut et Annuler / Rétablir sortiraient de l'écran (H-183).
 */
import { etat, sur, emettre, notifier, peutModifier, signalerLectureSeule } from './etat.js';
import { CHARTE } from './charte.js';
import { vue, pxVersPlan } from './vue.js';
import { accrocher } from './accrochage.js';
import { tolerance, definirOutil } from './outils.js';
import { formaterLongueur } from './modele.js';
import { confirmer, demander } from './ui/dialogues.js';
import * as C from './mesure-calcul.js';

const NS = 'http://www.w3.org/2000/svg';

/* État de session de l'outil (rien n'est enregistré ici). */
const s = {
  mode: 'mesure',        // 'mesure' | 'calage' | 'controle'
  points: [],            // [{ x, y, u }] en unités plan ; u = 1 px écran en unités plan au moment de la pose
  termine: false,        // mesure terminée : l'appui suivant hors point en commence une nouvelle
  actif: null,           // index du point actif (flèches du clavier)
  glisse: null,          // { i } pendant le glissement d'un point
  survol: null,          // position survolée au stylet / à la souris (aperçu), éventuellement accrochée
  accrochage: true,      // accrochage aux extrémités des ouvrages (mesure seulement, jamais en calibration)
  saisieEnCours: false,  // boîte de saisie de la distance réelle ouverte
  signature: '',         // fond + page : un changement efface la mesure en cours
  replie: false          // panneau réduit à l'état et à la valeur
};

let groupe = null;
let panneau = null;
let bouton = null;
let rafPanneau = false;

/* ---------- Initialisation ---------- */
export function initialiserMesure() {
  const gVue = document.getElementById('g-vue');
  groupe = document.createElementNS(NS, 'g');
  groupe.setAttribute('id', 'g-mesure');
  groupe.setAttribute('pointer-events', 'none');
  gVue.appendChild(groupe);

  panneau = document.createElement('div');
  panneau.id = 'panneau-mesure';
  panneau.setAttribute('role', 'region');
  panneau.setAttribute('aria-label', 'Mesure');
  panneau.hidden = true;
  // Le panneau est posé sur la zone de plan, qui capture les pointeurs (même précaution que le bandeau, H-181).
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'contextmenu', 'dblclick']) {
    panneau.addEventListener(t, (e) => e.stopPropagation());
  }
  document.getElementById('zone-plan').appendChild(panneau);

  // Bouton de la barre du haut, après « Calques »
  bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'btn-icone';
  bouton.id = 'btn-mesure';
  bouton.title = 'Mesure indicative : distance sur plan (M)';
  bouton.setAttribute('aria-label', 'Mesure indicative : distance sur plan');
  bouton.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 16.5L16.5 3 21 7.5 7.5 21z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7 12.5l2 2M10 9.5l1.5 1.5M12.5 7l2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  bouton.addEventListener('click', () => {
    if (actif()) { definirOutil('selection'); return; }
    if (!etat.projet) { notifier('Ouvrez un projet pour mesurer'); return; }
    if (!peutModifier()) { signalerLectureSeule(); return; }
    definirOutil('mesure');
  });
  const calques = document.getElementById('btn-calques');
  if (calques && calques.parentNode) calques.parentNode.insertBefore(bouton, calques.nextSibling);

  sur('outil', (o) => {
    if (o && o.id === 'mesure') activer(); else desactiver();
    if (bouton) bouton.classList.toggle('actif', actif());
  });
  sur('vue', () => {
    if (!actif()) return;
    dessiner();
    if (s.mode !== 'mesure') programmerPanneau();   // longueur écran de la référence (avertissement « référence courte »)
  });
  sur('fond', () => {
    const sig = signatureFond();
    if (sig !== s.signature) { s.signature = sig; reinitialiser(); }
    if (actif()) majTout();
  });
  sur('reglages', () => { if (actif()) majTout(); });   // échelle du plan changée dans Calques
  sur('projet-ouvert', () => {
    reinitialiser();
    s.signature = signatureFond();
    if (actif() && !peutModifier()) definirOutil('selection');
    else if (actif()) majTout();
  });
  sur('statut-projet', () => { if (actif() && !peutModifier()) definirOutil('selection'); });
  sur('plan-change', () => { reinitialiser(); s.signature = signatureFond(); if (actif()) majTout(); });   // v1.4.5 : autre plan, autre calibration
  sur('projet-ferme', () => { reinitialiser(); if (actif()) definirOutil('selection'); });

  document.addEventListener('keydown', surTouche, true);
}

function actif() { return etat.outil === 'mesure'; }

function signatureFond() {
  const f = etat.plan && etat.plan.fond;
  return f ? (f.fond_id || '') + '#' + C.clePage(f) : '';
}

function activer() {
  if (etat.projet && !peutModifier()) { signalerLectureSeule(); definirOutil('selection'); return; }
  s.signature = signatureFond();
  reinitialiser();
  panneau.hidden = false;
  majTout();
}

function desactiver() {
  reinitialiser();
  if (panneau) { panneau.hidden = true; panneau.innerHTML = ''; }
  if (groupe) groupe.textContent = '';
}

function reinitialiser() {
  s.mode = 'mesure';
  s.points = [];
  s.termine = false;
  s.actif = null;
  s.glisse = null;
  s.survol = null;
}

/* ---------- Fiabilité et calibration courante ---------- */
function fondCourant() { return (etat.plan && etat.plan.fond) || null; }

function fiabilite() {
  return C.evaluerFiabilite({
    fond: fondCourant(),
    echelle_plan: etat.projet ? etat.projet.echelle_plan : null,
    seuil_controle_pct: CHARTE.mesure.seuil_ecart_controle_pct
  });
}

function calibrationCourante() {
  const f = fondCourant();
  return f ? C.calibrationValide(f.calibrations && f.calibrations[C.clePage(f)]) : null;
}

/* ---------- Points ---------- */
function nouveauPoint(p) { return { x: p.x, y: p.y, u: pxVersPlan(1) }; }

/* Accrochage aux extrémités des ouvrages : en mesure seulement, jamais pendant une calibration ou un contrôle
 * (les repères doivent tomber sur le fond de plan, pas sur un objet dessiné). */
function accrocherSiBesoin(p, ctx) {
  if (s.mode === 'mesure' && s.accrochage) {
    const a = accrocher(p, tolerance(ctx.pointerType));
    if (a) return { x: a.x, y: a.y, accroche: true };
  }
  return { x: p.x, y: p.y };
}

function indexProche(p, tol) {
  let best = -1, dMin = Infinity;
  s.points.forEach((q, i) => {
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d <= tol && d < dMin) { dMin = d; best = i; }
  });
  return best;
}

/* ---------- Gestes (appelés par pointeur.js) ---------- */

/* Appui bref. Retourne true si le geste est consommé ; false laisse pointeur.js ajuster le plan (double appui au doigt). */
export function appui(p, ctx, { double = false } = {}) {
  if (!etat.plan) return true;
  if (double) {
    // Le premier appui du double a déjà posé un point : le second termine la mesure, comme pour un tronçon.
    if (s.mode === 'mesure' && !s.termine && s.points.length >= 2) { terminer(); return true; }
    return s.points.length > 0;
  }
  const tol = tolerance(ctx.pointerType);

  if (s.mode === 'mesure') {
    if (fiabilite().code === C.FIABILITE.AUCUNE) {
      notifier(fondCourant()
        ? 'Mesure impossible sans échelle vérifiable : appuyez sur « Calibrer »'
        : 'Chargez un fond de plan puis calibrez-le pour mesurer', 3200);
      return true;
    }
    const i = indexProche(p, tol);
    if (i >= 0) {
      // Appui sur le dernier point : termine la mesure ; sur un autre : le rend actif (flèches du clavier).
      if (!s.termine && i === s.points.length - 1 && s.points.length >= 2) { terminer(); return true; }
      s.actif = i;
      majTout();
      return true;
    }
    if (s.termine) { s.points = []; s.termine = false; }
    s.points.push(nouveauPoint(accrocherSiBesoin(p, ctx)));
    s.actif = s.points.length - 1;
    majTout();
    return true;
  }

  // Calibration / contrôle : deux repères exactement, ajustables.
  const i = indexProche(p, tol);
  if (i >= 0) { s.actif = i; majTout(); return true; }
  if (s.points.length >= 2) { notifier('Deux repères posés : ajustez-les ou saisissez la distance réelle'); return true; }
  s.points.push(nouveauPoint(p));
  s.actif = s.points.length - 1;
  majTout();
  if (s.points.length === 2) {
    avertirReferenceCourte();
    saisirDistance();
  }
  return true;
}

/* Début de glissement : pris seulement s'il part d'un point de mesure ; sinon pointeur.js navigue. */
export function debutGlisser(p, ctx) {
  if (!etat.plan) return false;
  const i = indexProche(p, tolerance(ctx.pointerType));
  if (i < 0) return false;
  s.glisse = { i };
  s.actif = i;
  return true;
}

export function glisser(p, ctx) {
  if (!s.glisse) return;
  s.points[s.glisse.i] = nouveauPoint(accrocherSiBesoin(p, ctx));
  majTout();
}

export function finGlisser() {
  if (!s.glisse) return;
  s.glisse = null;
  majTout();
}

/* Survol du stylet ou de la souris : aperçu du segment suivant et repère d'accrochage. */
export function survol(p, ctx) {
  s.survol = accrocherSiBesoin(p, ctx);
  dessiner();
}

export function finSurvol() {
  s.survol = null;
  dessiner();
}

/* ---------- Commandes ---------- */
function terminer() {
  s.termine = true;
  s.survol = null;
  majTout();
}

function nouvelleMesure() {
  s.mode = 'mesure';
  s.points = [];
  s.termine = false;
  s.actif = null;
  majTout();
}

function retirerDernierPoint() {
  if (!s.points.length) return;
  s.points.pop();
  s.termine = false;
  s.actif = s.points.length ? s.points.length - 1 : null;
  majTout();
}

function deplacerPointActif(dxPx, dyPx) {
  if (!s.points.length) return;
  const i = s.actif !== null && s.actif < s.points.length ? s.actif : s.points.length - 1;
  const p = s.points[i];
  s.points[i] = { x: p.x + pxVersPlan(dxPx), y: p.y + pxVersPlan(dyPx), u: pxVersPlan(1) };
  s.actif = i;
  majTout();
}

async function demarrerCalage() {
  if (!peutModifier()) { signalerLectureSeule(); return; }
  if (!fondCourant()) { notifier('Chargez d’abord un fond de plan'); return; }
  if (calibrationCourante()) {
    const ok = await confirmer('Remplacer la calibration de cette page ? Le contrôle associé sera aussi effacé.', { ok: 'Recalibrer' });
    if (!ok) return;
  }
  s.mode = 'calage';
  s.points = [];
  s.termine = false;
  s.actif = null;
  majTout();
  notifier('Calibration : pointez les deux extrémités d’une distance connue', 3000);
}

function demarrerControle() {
  if (!peutModifier()) { signalerLectureSeule(); return; }
  if (!calibrationCourante()) { notifier('Calibrez d’abord la page'); return; }
  s.mode = 'controle';
  s.points = [];
  s.termine = false;
  s.actif = null;
  majTout();
  notifier('Contrôle : pointez une autre distance connue', 3000);
}

function annulerCalage() {
  s.mode = 'mesure';
  s.points = [];
  s.actif = null;
  majTout();
}

function longueurEcranReference() {
  return s.points.length === 2 ? C.distance(s.points[0], s.points[1]) * vue.k : 0;
}

function avertirReferenceCourte() {
  const px = longueurEcranReference();
  if (px && px < CHARTE.mesure.longueur_min_calage_px) {
    notifier('Référence courte à l’écran : zoomez ou choisissez une distance plus longue', 3500);
  }
}

/* Saisie de la distance réelle, puis enregistrement de la calibration ou du contrôle. */
async function saisirDistance() {
  if (s.saisieEnCours || s.points.length !== 2 || s.mode === 'mesure') return;
  const L = C.distance(s.points[0], s.points[1]);
  if (!(L > 0)) { notifier('Les deux repères sont confondus : écartez-les'); return; }
  const mode = s.mode;
  s.saisieEnCours = true;
  const r = await demander(mode === 'calage' ? 'Distance réelle de référence' : 'Distance réelle de contrôle', [
    { nom: 'distance', libelle: 'Distance réelle en mètres', valeur: '', placeholder: 'ex. 35,5' }
  ], { ok: mode === 'calage' ? 'Calibrer' : 'Contrôler' });
  s.saisieEnCours = false;
  if (!r) return;                                   // annulé : les repères restent en place, ajustables
  if (s.mode !== mode || s.points.length !== 2) return;   // l'outil a changé pendant la saisie
  const d = C.lireDistance(r.distance);
  if (d === null) { notifier('Distance non valide : saisissez un nombre de mètres supérieur à 0', 3500); return; }
  if (!peutModifier()) { signalerLectureSeule(); return; }
  const f = fondCourant();
  if (!f) return;
  const cle = C.clePage(f);
  const L2 = C.distance(s.points[0], s.points[1]);

  if (mode === 'calage') {
    const uA = s.points[0].u || pxVersPlan(1), uB = s.points[1].u || pxVersPlan(1);
    const cal = {
      m_par_unite: d / L2,
      a: { x: s.points[0].x, y: s.points[0].y },
      b: { x: s.points[1].x, y: s.points[1].y },
      distance_m: d,
      incertitude_rel: C.incertitudeRelativeCalage(L2, Math.sqrt((uA * uA + uB * uB) / 2)),
      controle: null,
      le: new Date().toISOString()
    };
    f.calibrations = { ...(f.calibrations || {}), [cle]: cal };
    emettre('fond', f);   // sauvegarde automatique existante (projet.js)
    const N = f.type === 'pdf' ? C.equivalentEchelle(cal.m_par_unite) : null;
    notifier('Calibration enregistrée : 1 unité plan = ' + C.formaterRapport(cal.m_par_unite) + ' m' + (N ? ' (≈ 1/' + Math.round(N) + ')' : ''), 4000);
    nouvelleMesure();
    return;
  }

  // Contrôle
  const cal = calibrationCourante();
  if (!cal) return;
  const mesure_m = L2 * cal.m_par_unite;
  const ecart = C.ecartPct(mesure_m, d);
  cal.controle = { ecart_pct: ecart, distance_m: d, mesure_m, le: new Date().toISOString() };
  emettre('fond', f);
  if (Math.abs(ecart) <= CHARTE.mesure.seuil_ecart_controle_pct) {
    notifier('Contrôle réussi : écart de ' + C.formaterNombre(Math.abs(ecart), 1) + ' %', 3500);
  } else {
    notifier('Écart de ' + C.formaterNombre(Math.abs(ecart), 1) + ' % : calibration douteuse (plan déformé ? mauvaise référence ?)', 6000);
  }
  nouvelleMesure();
}

async function supprimerCalibration() {
  if (!peutModifier()) { signalerLectureSeule(); return; }
  const f = fondCourant();
  if (!f || !calibrationCourante()) return;
  const ok = await confirmer('Supprimer la calibration de cette page ? Les mesures redeviendront indicatives ou impossibles.', { ok: 'Supprimer', danger: true });
  if (!ok) return;
  const cals = { ...(f.calibrations || {}) };
  delete cals[C.clePage(f)];
  f.calibrations = cals;
  emettre('fond', f);
  notifier('Calibration supprimée');
  nouvelleMesure();
}

/* ---------- Clavier (phase de capture : passe avant clavier.js quand la mesure est concernée) ---------- */
function dansSaisie(t) {
  if (!t) return false;
  const tag = (t.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
}

function consommer(e) { e.preventDefault(); e.stopPropagation(); }

function surTouche(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!etat.projet) return;
  const g = document.getElementById('gestionnaire');
  if (g && !g.hidden) return;
  if (document.querySelector('dialog[open]')) return;
  if (dansSaisie(e.target)) return;
  // Entrée / espace sur un bouton du panneau : action du bouton
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.closest && e.target.closest('#panneau-mesure')) return;

  if (e.key === 'm' || e.key === 'M') {
    consommer(e);
    if (!peutModifier()) { signalerLectureSeule(); return; }
    if (!actif()) definirOutil('mesure');
    return;
  }
  if (!actif()) return;
  const pas = e.shiftKey ? 10 : 1;
  switch (e.key) {
    case 'Escape':
      if (s.mode !== 'mesure') { consommer(e); annulerCalage(); return; }
      if (s.points.length) { consommer(e); nouvelleMesure(); }
      return;   // rien à effacer : Échap garde son rôle habituel (désélectionner, fermer un panneau)
    case 'Enter':
      consommer(e);
      if (s.mode === 'mesure') { if (!s.termine && s.points.length >= 2) terminer(); }
      else if (s.points.length === 2) saisirDistance();
      return;
    case 'Backspace': case 'Delete':
      consommer(e);   // jamais de suppression d'objet du plan depuis l'outil Mesure
      retirerDernierPoint();
      return;
    case 'ArrowLeft': consommer(e); deplacerPointActif(-pas, 0); return;
    case 'ArrowRight': consommer(e); deplacerPointActif(pas, 0); return;
    case 'ArrowUp': consommer(e); deplacerPointActif(0, -pas); return;
    case 'ArrowDown': consommer(e); deplacerPointActif(0, pas); return;
    default: return;
  }
}

/* ---------- Affichage ---------- */
function majTout() { majPanneau(); dessiner(); }

function programmerPanneau() {
  if (rafPanneau) return;
  rafPanneau = true;
  requestAnimationFrame(() => { rafPanneau = false; majPanneau(); });
}

function m(v) { return formaterLongueur(v) + CHARTE.UNITE_LONGUEUR; }

function mIncertitude(u) {
  return u < 0.05 ? '±\u00A0<\u00A00,1\u00A0m' : '±\u00A0' + formaterLongueur(u) + CHARTE.UNITE_LONGUEUR;
}

/* Résultat courant : { total_m, segment_m, incertitude_m, n } ou null. */
function resultat(f) {
  if (!f.m_par_unite || s.points.length < 2) return null;
  const L = C.longueurs(s.points);
  const total_m = L.total * f.m_par_unite;
  const lecture = C.incertitudeLecture(s.points, f.m_par_unite);
  const rel = f.calibration ? f.calibration.incertitude_rel : 0;
  return {
    total_m,
    segment_m: L.segments[L.segments.length - 1] * f.m_par_unite,
    incertitude_m: C.incertitudeTotale(total_m, lecture, rel),
    n: s.points.length
  };
}

function libelleEtat(f) {
  const fond = fondCourant();
  const cal = f.calibration;
  switch (f.code) {
    case C.FIABILITE.CALIBREE_CONTROLEE: return 'Calibrée, contrôlée';
    case C.FIABILITE.CALIBREE:
      return f.controle_en_ecart
        ? 'Calibrée, contrôle en écart de ' + C.formaterNombre(Math.abs(cal.controle.ecart_pct), 1) + '\u00A0%'
        : 'Calibrée, non contrôlée';
    case C.FIABILITE.NOMINALE: return 'Indicatif : échelle 1/' + etat.projet.echelle_plan + ' déclarée, non vérifiée';
    default: return fond ? 'Non calibrée : mesure impossible' : 'Aucun fond de plan';
  }
}

function couleurEtat(f) {
  const E = CHARTE.mesure.etats;
  if (f.code === C.FIABILITE.CALIBREE && f.controle_en_ecart) return E.NOMINALE;
  return E[f.code] || E.AUCUNE;
}

function lignesDetail(f) {
  const fond = fondCourant();
  const M = CHARTE.mesure;
  const infos = [], alertes = [];
  if (f.calibration) {
    const N = fond && fond.type === 'pdf' ? C.equivalentEchelle(f.m_par_unite) : null;
    infos.push('1 unité plan = ' + C.formaterRapport(f.m_par_unite) + '\u00A0m' + (N ? ' (≈ 1/' + Math.round(N) + ')' : '')
      + ', référence ' + m(f.calibration.distance_m));
    if (f.calibration.controle && !f.controle_en_ecart) {
      infos.push('Contrôle sur ' + m(f.calibration.controle.distance_m) + ' : écart ' + C.formaterNombre(Math.abs(f.calibration.controle.ecart_pct), 1) + '\u00A0%');
    }
    if (f.controle_en_ecart) alertes.push('Calibration douteuse : plan déformé ou mauvaise référence. Recalibrez, puis contrôlez à nouveau.');
    const e = C.ecartEchelleDeclaree(fond, etat.projet && etat.projet.echelle_plan, f.m_par_unite);
    if (e !== null && Math.abs(e) > M.seuil_ecart_echelle_pct) {
      alertes.push('Échelle déclarée 1/' + etat.projet.echelle_plan + ', calibration ≈ 1/' + Math.round(C.equivalentEchelle(f.m_par_unite))
        + ' : le PDF a sans doute été réduit ou agrandi.');
    }
    if (fond && fond.type === 'image') alertes.push('Photo ou image : valable seulement dans le plan de la référence. Prise non perpendiculaire ou non redressée = indicatif.');
  } else if (f.code === C.FIABILITE.NOMINALE) {
    alertes.push('Exacte seulement si le PDF n’a été ni réduit ni agrandi. Calibrez pour fiabiliser.');
  } else if (fond) {
    infos.push('Pointez deux repères de distance connue (cote, barre d’échelle) avec « Calibrer ».'
      + (fond.type === 'pdf' ? ' À défaut, renseignez l’échelle du plan dans Calques (estimation non vérifiée).' : ''));
  }
  return { infos, alertes };
}

function majPanneau() {
  if (!panneau || panneau.hidden || !actif()) return;
  panneau.classList.toggle('replie', s.replie);
  if (s.mode !== 'mesure') { panneau.innerHTML = htmlCalage(); brancher(); return; }

  const f = fiabilite();
  const cal = f.calibration;
  const r = resultat(f);
  const { infos, alertes } = lignesDetail(f);
  const prefixe = f.code === C.FIABILITE.NOMINALE ? '≈\u00A0' : '';
  let valeur;
  if (r) {
    valeur = `<div class="mesure-valeur">Distance sur plan : <strong>${prefixe}${m(r.total_m)}</strong> <span class="mesure-incertitude">${mIncertitude(r.incertitude_m)}</span></div>`
      + (r.n > 2 ? `<div class="mesure-detail">Dernier segment ${prefixe}${m(r.segment_m)}, ${r.n} points</div>` : '');
  } else if (f.m_par_unite) {
    valeur = `<div class="mesure-consigne">${s.points.length ? 'Pointez le point suivant' : 'Pointez le premier point'}</div>`;
  } else {
    valeur = '';
  }
  const fond = fondCourant();
  panneau.innerHTML = `
    <div class="mesure-tete">
      <div class="mesure-etat" style="color:${couleurEtat(f)}"><span class="mesure-pastille" aria-hidden="true"></span><span>${libelleEtat(f)}</span></div>
      <button type="button" class="mesure-replier" data-action="replier" aria-expanded="${!s.replie}" title="${s.replie ? 'Déplier le panneau' : 'Réduire le panneau'}">${s.replie ? '▸' : '▾'}</button>
    </div>
    ${valeur}
    ${infos.map((t) => `<div class="mesure-detail mesure-secondaire">${t}</div>`).join('')}
    ${alertes.map((t) => `<div class="mesure-alerte mesure-secondaire">${t}</div>`).join('')}
    <div class="mesure-actions mesure-secondaire">
      <button type="button" data-action="nouvelle" ${s.points.length ? '' : 'disabled'}>Nouvelle mesure</button>
      <button type="button" data-action="calibrer" class="${f.code === C.FIABILITE.AUCUNE && fond ? 'primaire' : ''}" ${fond ? '' : 'disabled'}>${cal ? 'Recalibrer' : 'Calibrer'}</button>
      <button type="button" data-action="controler" ${cal ? '' : 'disabled'}>Contrôler</button>
      ${cal ? '<button type="button" data-action="supprimer">Supprimer la calibration</button>' : ''}
    </div>
    <label class="mesure-case mesure-secondaire"><input type="checkbox" data-action="accrochage" ${s.accrochage ? 'checked' : ''}> Accrocher aux extrémités des ouvrages</label>
    <div class="mesure-rappel mesure-secondaire">Distance horizontale sur plan : hors dénivelé, remontées aéro-souterraines et réserves de câble. La longueur des tronçons reste à saisir dans leur fiche.</div>`;
  brancher();
}

function htmlCalage() {
  const calage = s.mode === 'calage';
  const n = s.points.length;
  const px = longueurEcranReference();
  const court = n === 2 && px < CHARTE.mesure.longueur_min_calage_px;
  let mesureControle = '';
  if (!calage && n === 2) {
    const cal = calibrationCourante();
    if (cal) mesureControle = `<div class="mesure-detail">Distance sur plan avec la calibration : ${m(C.distance(s.points[0], s.points[1]) * cal.m_par_unite)}</div>`;
  }
  return `
    <div class="mesure-tete">
      <div class="mesure-etat" style="color:${CHARTE.mesure.calage.couleur}"><span class="mesure-pastille" aria-hidden="true"></span><span>${calage ? 'Calibration de la page' : 'Contrôle de la calibration'}</span></div>
    </div>
    <div class="mesure-consigne">${calage
      ? 'Pointez les deux extrémités d’une distance connue : cote du plan, barre d’échelle, dimension relevée sur place. Zoomez pour pointer précisément.'
      : 'Pointez une autre distance connue, de préférence longue et dans une autre direction que la référence.'}</div>
    <div class="mesure-detail">Repères posés : ${n} / 2${n ? ' (glissez un repère pour l’ajuster)' : ''}</div>
    ${mesureControle}
    ${court ? `<div class="mesure-alerte">Référence courte à l’écran (${Math.round(px)} px) : zoomez ou choisissez une distance plus longue.</div>` : ''}
    <div class="mesure-actions">
      <button type="button" data-action="saisir" class="primaire" ${n === 2 ? '' : 'disabled'}>Saisir la distance réelle</button>
      <button type="button" data-action="annuler-calage">Annuler</button>
    </div>`;
}

function brancher() {
  panneau.querySelectorAll('[data-action]').forEach((el) => {
    const a = el.dataset.action;
    if (a === 'accrochage') {
      el.addEventListener('change', () => { s.accrochage = el.checked; s.survol = null; dessiner(); });
      return;
    }
    el.addEventListener('click', () => {
      switch (a) {
        case 'replier': s.replie = !s.replie; majPanneau(); break;
        case 'nouvelle': nouvelleMesure(); break;
        case 'calibrer': demarrerCalage(); break;
        case 'controler': demarrerControle(); break;
        case 'supprimer': supprimerCalibration(); break;
        case 'saisir': saisirDistance(); break;
        case 'annuler-calage': annulerCalage(); break;
        default: break;
      }
    });
  });
}

/* ---------- Tracé écran (#g-mesure, dans #g-vue : coordonnées plan, tailles converties depuis des pixels écran) ---------- */
function el(nom, attrs) {
  const e = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, String(v));
  return e;
}

function ligne(points, couleur, { tirets = false } = {}) {
  const M = CHARTE.mesure;
  const d = points.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
  groupe.appendChild(el('path', { d, fill: 'none', stroke: '#FFFFFF', 'stroke-width': pxVersPlan(M.trait.halo_px), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.9 }));
  groupe.appendChild(el('path', {
    d, fill: 'none', stroke: couleur, 'stroke-width': pxVersPlan(M.trait.epaisseur_px), 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'stroke-dasharray': tirets ? pxVersPlan(8) + ' ' + pxVersPlan(5) : null
  }));
}

function repere(p, couleur, actifPoint, lettre) {
  const M = CHARTE.mesure;
  const r = pxVersPlan(actifPoint ? M.point.rayon_actif_px : M.point.rayon_px);
  groupe.appendChild(el('circle', { cx: p.x, cy: p.y, r, fill: actifPoint ? couleur : '#FFFFFF', 'fill-opacity': actifPoint ? 0.25 : 0.85, stroke: couleur, 'stroke-width': pxVersPlan(2) }));
  // Réticule fin : le centre exact du point
  const c = pxVersPlan(3);
  groupe.appendChild(el('path', { d: `M${p.x - c} ${p.y}L${p.x + c} ${p.y}M${p.x} ${p.y - c}L${p.x} ${p.y + c}`, stroke: couleur, 'stroke-width': pxVersPlan(1.2), fill: 'none' }));
  if (lettre) texte({ x: p.x + r + pxVersPlan(4), y: p.y - r - pxVersPlan(2) }, lettre, couleur, 'start');
}

function texte(p, contenu, couleur, ancre = 'start') {
  const M = CHARTE.mesure;
  const t = el('text', {
    x: p.x, y: p.y, fill: couleur, 'font-size': pxVersPlan(M.texte.taille_px), 'font-weight': 700,
    'font-family': 'DejaVu Sans, sans-serif', 'text-anchor': ancre,
    stroke: '#FFFFFF', 'stroke-width': pxVersPlan(M.texte.halo_px), 'paint-order': 'stroke', 'stroke-linejoin': 'round'
  });
  t.textContent = contenu;
  groupe.appendChild(t);
}

function dessiner() {
  if (!groupe) return;
  groupe.textContent = '';
  if (!actif() || !etat.plan) return;
  const M = CHARTE.mesure;
  const calage = s.mode !== 'mesure';
  const couleur = calage ? M.calage.couleur : M.trait.couleur;
  const pts = s.points;
  const apercuAutorise = !s.termine && !s.glisse && s.survol && pts.length && (s.mode === 'mesure' || pts.length < 2);
  const apercu = apercuAutorise ? s.survol : null;

  if (pts.length >= 2) ligne(pts, couleur, { tirets: calage });
  if (apercu) ligne([pts[pts.length - 1], apercu], couleur, { tirets: true });
  pts.forEach((p, i) => repere(p, couleur, i === s.actif, calage ? (i === 0 ? 'A' : 'B') : null));
  if (s.survol && s.survol.accroche) {
    groupe.appendChild(el('circle', { cx: s.survol.x, cy: s.survol.y, r: pxVersPlan(9), fill: 'none', stroke: CHARTE.ecran.accrochage, 'stroke-width': pxVersPlan(2) }));
  }

  // Valeur au dernier point (ou à l'aperçu) : cumul de la mesure.
  if (!calage) {
    const f = fiabilite();
    if (!f.m_par_unite) return;
    const chemin = apercu ? pts.concat([apercu]) : pts;
    if (chemin.length < 2) return;
    const total = C.longueurs(chemin).total * f.m_par_unite;
    const fin = chemin[chemin.length - 1];
    const prefixe = f.code === C.FIABILITE.NOMINALE ? '≈\u00A0' : '';
    texte({ x: fin.x + pxVersPlan(12), y: fin.y - pxVersPlan(12) }, prefixe + m(total), f.code === C.FIABILITE.NOMINALE ? M.etats.NOMINALE : couleur);
  }
}
