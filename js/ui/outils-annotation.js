/* ui/outils-annotation.js — boîte « Outils » : palette des annotations de plan (v11 §6), des ouvrages
 * d'éclairage public à pose rapide (lanterne, boucle — v12 §7) et de l'objet « Légende » (v13 §5).
 * Annotations = repères de dessin : aucun article de nomenclature, exclusion du métré.
 * Lanterne et boucle EP = objets ponctuels du réseau EP : article, repère, état, métré.
 * v1.4.6 : « Étiquette fléchée » (§4 — note encadrée, flèche partant du coin du côté de la pointe, outil Note avec un
 * préréglage) et « Image / photo » (§2 — image de la tablette posée sur le plan, groupe « Plan »).
 */
import { etat, emettre, sur, notifier, peutModifier, signalerLectureSeule } from '../etat.js';
import { CHARTE, LIBELLES } from '../charte.js';
import { echantillonAnnotation, echantillonSymbole } from '../symboles.js';
import { boite } from '../primitives.js';
import { primVersSvg } from '../rendu-svg.js';
import { definirOutil, poserLegende, legendeAffichee, poserImage, poserDescriptif, poserPlanSituation } from '../outils.js';
import { genererCarteSituation } from '../situation.js';
import { preparerFichierImage, enregistrerImage } from '../images.js';
import { rectangleVisible } from '../vue.js';
import { normaliser } from '../nomenclature.js';
import { bd } from '../bd.js';
import { echapper } from './dialogues.js';

const NS = 'http://www.w3.org/2000/svg';
const GROUPES = [
  { titre: 'Flèches et repères', items: ['fleche', 'fleche_double', 'fleche_texte', 'fleche_double_texte', 'etiquette_flechee', 'nord', 'rond_texte', 'malt_libre', 'cotation', 'croix'] },
  { titre: 'Zones et traits', items: ['zone_hachuree', 'trait', 'stylo'] },
  { titre: 'Éclairage public (ouvrages, métré)', items: ['lanterne_ep', 'boucle_ep'] },
  { titre: 'Plan', items: ['image', 'situation', 'legende', 'descriptif'] }
];
const SPECIAUX = { etiquette_flechee: 'Étiquette fléchée', image: 'Image / photo', situation: 'Plan de situation', descriptif: 'Descriptif des travaux' };   // v1.5.4 : plan de situation   // v1.5.0 : descriptif   // v1.4.6 : ni annotation, ni ouvrage
const OUVRAGES_EP = ['lanterne_ep', 'boucle_ep'];
const OBJETS_PLAN = ['legende'];   // objets uniques du plan (v13 §5) : entrée grisée tant que l'objet est déjà affiché
const AIDES = {
  fleche: 'Deux appuis (ou glisser) : origine puis pointe', fleche_double: 'Deux appuis : les deux extrémités', fleche_texte: 'Deux appuis, puis le texte au centre',
  fleche_double_texte: 'Deux appuis, texte en réserve au centre, pointe à chaque bout',
  nord: 'Un appui ; glisser pour orienter', rond_texte: 'Un appui, puis le texte', malt_libre: 'Un appui ; tige étirable', cotation: 'Deux points, puis la valeur',
  zone_hachuree: 'Un appui par sommet, appui sur le premier pour fermer', trait: 'Deux appuis (segment) ; appuis suivants = polyligne ; A = 0/45/90°', stylo: 'Glisser au stylet (main levée, lissé)',
  croix: 'Un appui sur l’ouvrage',
  lanterne_ep: 'Un appui ; glisser pour orienter — ouvrage EP au métré', boucle_ep: 'Un appui sur le tracé ou le support — ouvrage EP au métré',
  legende: 'Repose la légende masquée (une seule par projet) ; croix sur la légende pour la masquer',
  etiquette_flechee: 'Un appui, puis le texte ; flèche depuis le coin du cadre, pointe réglable à la poignée',
  image: 'Choisir une image ou prendre une photo ; taille, rotation et opacité réglables',
  situation: 'Carte IGN centrée sur le point GPS de l’affaire, rond rouge sur le point ; connexion requise à la création',
  descriptif: 'Crée le descriptif du plan à partir des ouvrages et tronçons (ou le réaffiche) ; double appui pour l’éditer'
};

function libelleItem(st) { return SPECIAUX[st] || (OUVRAGES_EP.includes(st) || OBJETS_PLAN.includes(st) ? LIBELLES.types[st] : LIBELLES.annotations[st]); }

let panneau, filtre = { texte: '', onglet: 'tous' }, couleur = CHARTE.COULEURS_ANNOTATION[0];

export function initialiserOutilsAnnotation() {
  panneau = document.getElementById('palette-outils');
  sur('fermer-panneaux', fermer);
  sur('projet-ferme', fermer);
  sur('objet-pose', (o) => { if (o && o.type === 'annotation') enregistrerRecent(o.sous_type); else if (o && OUVRAGES_EP.includes(o.type)) enregistrerRecent(o.type); });
  sur('objets', () => { if (!panneau.hidden) majEtatEntrees(); });   // l'entrée « Légende » se grise / dégrise
}

function majEtatEntrees() {
  panneau.querySelectorAll('.article[data-item="legende"]').forEach((d) => d.classList.toggle('desactive', legendeAffichee()));
}

export function basculerOutils() { if (panneau.hidden) ouvrir(); else fermer(); }
export function fermer() { panneau.hidden = true; }

export function ouvrir() {
  document.getElementById('palette').hidden = true;
  panneau.hidden = false;
  panneau.innerHTML = `
    <header class="entete-panneau"><h2>Outils de dessin</h2><button class="btn-icone fermer" title="Fermer">✕</button></header>
    <div class="recherche"><input type="search" id="outils-recherche" placeholder="Rechercher un outil…" value="${echapper(filtre.texte)}" autocomplete="off"></div>
    <div class="onglets">
      <button data-onglet="tous" class="${filtre.onglet === 'tous' ? 'actif' : ''}">Tous</button>
      <button data-onglet="favoris" class="${filtre.onglet === 'favoris' ? 'actif' : ''}">Favoris</button>
      <button data-onglet="recents" class="${filtre.onglet === 'recents' ? 'actif' : ''}">Récents</button>
    </div>
    <div class="couleurs-outils">${CHARTE.COULEURS_ANNOTATION.map((c) => `<button type="button" class="pastille ${c === couleur ? 'actif' : ''}" data-couleur="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>
    <div class="liste" id="outils-liste"></div>
    <div class="aide">Annotations : sans nomenclature, hors métré, sur le calque « Annotations ». Lanterne et boucle EP : ouvrages du réseau EP (article, repère, métré). Étiquette fléchée : note encadrée, flèche depuis le coin du cadre. Image / photo : calque « Images et photos », hors métré et légende. Légende : objet unique du plan, reposé ici quand il a été masqué.</div>`;
  panneau.querySelector('.fermer').addEventListener('click', fermer);
  const rech = panneau.querySelector('#outils-recherche');
  rech.addEventListener('input', () => { filtre.texte = rech.value; rendre(); });
  panneau.querySelectorAll('[data-onglet]').forEach((b) => b.addEventListener('click', () => { filtre.onglet = b.dataset.onglet; panneau.querySelectorAll('[data-onglet]').forEach((x) => x.classList.toggle('actif', x === b)); rendre(); }));
  panneau.querySelectorAll('.couleurs-outils .pastille').forEach((b) => b.addEventListener('click', () => {
    couleur = b.dataset.couleur;
    panneau.querySelectorAll('.couleurs-outils .pastille').forEach((x) => x.classList.toggle('actif', x === b));
    if (etat.outil === 'annotation' && etat.preset) { etat.preset.couleur = couleur; }
  }));
  rendre();
}

function rendre() {
  const liste = panneau.querySelector('#outils-liste');
  liste.innerHTML = '';
  const mots = normaliser(filtre.texte).split(' ').filter(Boolean);
  const correspond = (st) => !mots.length || mots.every((m) => normaliser(libelleItem(st) + ' ' + (AIDES[st] || '')).includes(m));
  let groupes = GROUPES;
  if (filtre.onglet === 'favoris') groupes = [{ titre: 'Favoris', items: (etat.prefs.favoris_annotations || []) }];
  if (filtre.onglet === 'recents') groupes = [{ titre: 'Récents', items: (etat.prefs.recents_annotations || []) }];
  let n = 0;
  for (const g of groupes) {
    const items = g.items.filter(correspond);
    if (!items.length) continue;
    const h = document.createElement('div'); h.className = 'groupe-categorie'; h.textContent = g.titre; liste.appendChild(h);
    for (const st of items) { liste.appendChild(ligne(st)); n++; }
  }
  if (!n) liste.innerHTML = '<p class="vide">Aucun outil ne correspond.</p>';
}

function ligne(st) {
  const div = document.createElement('div');
  const ouvrage = OUVRAGES_EP.includes(st);
  const objetPlan = OBJETS_PLAN.includes(st);
  const actif = st === 'etiquette_flechee' ? (etat.outil === 'note' && !!(etat.preset && etat.preset.etiquette_flechee))
    : (ouvrage ? (etat.outil === st) : (!objetPlan && etat.outil === 'annotation' && etat.preset && etat.preset.sous_type === st));
  div.className = 'article posable' + (actif ? ' actif' : '') + (objetPlan && legendeAffichee() ? ' desactive' : '');
  div.dataset.item = st;
  const fav = (etat.prefs.favoris_annotations || []).includes(st);
  div.innerHTML = `<div class="apercu"></div><div class="texte"><div class="libelle">${echapper(libelleItem(st))}</div><div class="meta">${echapper(AIDES[st] || '')}</div></div><button class="btn-icone favori ${fav ? 'actif' : ''}" title="Favori">${fav ? '★' : '☆'}</button>`;
  const prims = st === 'descriptif' ? echantillonDescriptif() : st === 'etiquette_flechee' ? echantillonEtiquetteFlechee() : st === 'situation' ? echantillonSituation() : (st === 'image' ? echantillonImage()
    : (objetPlan ? echantillonLegende() : (ouvrage ? echantillonSymbole(st, etat.courant.etat, {}, 'EP', 'aerien') : echantillonAnnotation(st))));
  const b = boite(prims) || { x: -8, y: -8, l: 16, h: 16 };
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${b.x - 2} ${b.y - 2} ${b.l + 4} ${b.h + 4}`);
  for (const p of prims) { const e = primVersSvg(p); if (e) svg.appendChild(e); }
  div.querySelector('.apercu').appendChild(svg);
  div.querySelector('.favori').addEventListener('click', (e) => { e.stopPropagation(); basculerFavori(st); rendre(); });
  div.addEventListener('click', () => {
    if (st === 'image') { choisirImage(); enregistrerRecent(st); return; }
    if (st === 'situation') { poserSituation(); enregistrerRecent(st); return; }   // v1.5.4
    if (st === 'descriptif') {   // v1.5.0 §2.8
      if (!peutModifier()) { signalerLectureSeule(); return; }
      const r = poserDescriptif();
      if (r) { enregistrerRecent(st); notifier(r.cree ? 'Descriptif créé (coin haut-droit) : double appui pour l’éditer, poignée carrée pour la largeur' : 'Descriptif affiché', 3200); }
      if (window.matchMedia('(max-width: 900px)').matches) fermer();
      return;
    }
    if (st === 'etiquette_flechee') {
      definirOutil('note', { type: 'note', etiquette_flechee: true });
      enregistrerRecent(st);
      notifier(libelleItem(st) + ' — ' + AIDES[st], 2600);
      panneau.querySelectorAll('.article').forEach((x) => x.classList.remove('actif'));
      div.classList.add('actif');
      if (window.matchMedia('(max-width: 900px)').matches) fermer();
      return;
    }
    if (objetPlan) {
      // Légende : une seule par projet — grisée tant qu'elle est affichée
      if (legendeAffichee()) { notifier('La légende est déjà affichée (croix sur la légende pour la masquer)', 2400); return; }
      if (poserLegende()) { enregistrerRecent(st); majEtatEntrees(); notifier('Légende reposée : déplaçable, poignée carrée pour la taille, appui long pour le cadre et le fond', 3000); }
      return;
    }
    if (ouvrage) {
      // Ouvrage EP : outil de pose ponctuelle, réseau EP forcé (couleurs rose / violet de charte.reseaux.EP)
      definirOutil(st, { type: st, attributs: {}, domaine: 'EP' });
      if (etat.courant.domaine !== 'EP') { etat.courant.domaine = 'EP'; emettre('courant', etat.courant); }
    } else definirOutil('annotation', { type: 'annotation', sous_type: st, couleur });
    notifier(libelleItem(st) + ' — ' + (AIDES[st] || ''), 2600);
    panneau.querySelectorAll('.article').forEach((d) => d.classList.remove('actif'));
    div.classList.add('actif');
    if (window.matchMedia('(max-width: 900px)').matches) fermer();
  });
  return div;
}

/* Image / photo (v1.4.6 §2) : sélecteur de fichier de la tablette (galerie ou appareil photo, au choix d'Android).
 * Le binaire est préparé puis écrit en base AVANT la pose de l'objet (jamais d'objet sans son image). */
function choisirImage() {
  if (!etat.plan) return;
  if (!peutModifier()) { signalerLectureSeule(); return; }
  const input = document.getElementById('fichier-image');
  input.value = '';
  input.onchange = async () => {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    try {
      notifier('Préparation de l’image…', 1500);
      const prep = await preparerFichierImage(f);
      const id = await enregistrerImage(prep);
      const o = poserImage(id, prep.largeurPx, prep.hauteurPx, prep.nom_fichier, rectangleVisible());
      if (o) notifier('Image posée : poignée ronde = rotation, carré = taille, fiche = opacité', 3200);
    } catch (e) {
      console.error(e);
      notifier('Image non posée : ' + ((e && e.message) || e), 4000);
    }
  };
  if (window.matchMedia('(max-width: 900px)').matches) fermer();
  input.click();
}

/* v1.5.4 (H-305) — Plan de situation : télécharge la carte IGN centrée sur le point GPS de l'affaire, l'enregistre
 * comme une image (disponible ensuite hors ligne) et la pose au centre de la vue. */
let situationEnCours = false;
async function poserSituation() {
  if (!etat.plan) return;
  if (!peutModifier()) { signalerLectureSeule(); return; }
  if (!String(etat.projet && etat.projet.gps || '').trim()) { notifier('Renseignez d’abord le point GPS dans les informations de l’affaire', 3600); return; }
  if (situationEnCours) return;
  situationEnCours = true;
  try {
    notifier('Téléchargement de la carte IGN…', 2500);
    const carte = await genererCarteSituation(etat.projet.gps);
    const id = await enregistrerImage(carte);
    const o = poserPlanSituation(id, carte, rectangleVisible());
    if (o) notifier('Plan de situation posé : poignée carrée = taille de la carte ; fiche = taille du rond, échelle de la carte', 3600);
    if (window.matchMedia('(max-width: 900px)').matches) fermer();
  } catch (e) {
    console.error(e);
    notifier('Plan de situation non posé : ' + ((e && e.message) || e), 4500);
  } finally { situationEnCours = false; }
}

/* Vignette du plan de situation : cadre, routes, rond rouge. */
function echantillonSituation() {
  return [
    { t: 'poly', points: [{ x: -12, y: -9 }, { x: 12, y: -9 }, { x: 12, y: 9 }, { x: -12, y: 9 }], ferme: true, couleur: '#000', epaisseur: 0.7, remplissage: '#F4F1EA' },
    { t: 'poly', points: [{ x: -12, y: 4 }, { x: -3, y: 1 }, { x: 4, y: -6 }, { x: 12, y: -8 }], ferme: false, couleur: '#E8A33D', epaisseur: 1.6, remplissage: null },
    { t: 'poly', points: [{ x: -8, y: -9 }, { x: -3, y: 1 }, { x: 2, y: 9 }], ferme: false, couleur: '#FFFFFF', epaisseur: 1.4, remplissage: null },
    { t: 'cercle', cx: -1, cy: 0, r: 3.6, couleur: '#E30000', epaisseur: 0.9, remplissage: null }
  ];
}

/* Vignette de l'étiquette fléchée : cadre avec deux lignes de texte, flèche depuis le coin bas-droit. */
function echantillonEtiquetteFlechee() {
  const prims = [{ t: 'poly', points: [{ x: -13, y: -9 }, { x: 3, y: -9 }, { x: 3, y: 0 }, { x: -13, y: 0 }], ferme: true, couleur: '#000', epaisseur: 0.7, remplissage: '#fff' }];
  prims.push({ t: 'ligne', x1: -11, y1: -6, x2: 1, y2: -6, couleur: '#B00020', epaisseur: 1.1 }, { t: 'ligne', x1: -11, y1: -3, x2: -3, y2: -3, couleur: '#B00020', epaisseur: 1.1 });
  prims.push({ t: 'ligne', x1: 3, y1: 0, x2: 11, y2: 8, couleur: '#B00020', epaisseur: 0.9 });
  prims.push({ t: 'poly', points: [{ x: 12.5, y: 9.5 }, { x: 7.4, y: 7.8 }, { x: 10.8, y: 4.4 }], ferme: true, couleur: null, epaisseur: 0, remplissage: '#B00020' });
  return prims;
}

/* Vignette de l'image : cadre, soleil et relief. */
function echantillonImage() {
  return [
    { t: 'poly', points: [{ x: -12, y: -8 }, { x: 12, y: -8 }, { x: 12, y: 8 }, { x: -12, y: 8 }], ferme: true, couleur: '#6B7280', epaisseur: 0.8, remplissage: '#EEF1F5' },
    { t: 'cercle', cx: 5.5, cy: -3, r: 2.2, couleur: null, epaisseur: 0, remplissage: '#FF8A00' },
    { t: 'poly', points: [{ x: -12, y: 8 }, { x: -4, y: -2 }, { x: 2, y: 5 }, { x: 6, y: 1.5 }, { x: 12, y: 8 }], ferme: true, couleur: null, epaisseur: 0, remplissage: '#1B7F3B' }
  ];
}

/* Vignette du descriptif : cadre, repère rouge, lignes de texte. */
function echantillonDescriptif() {
  const pts = (x, y, l, h) => [{ x, y }, { x: x + l, y }, { x: x + l, y: y + h }, { x, y: y + h }];
  const prims = [{ t: 'poly', points: pts(-12, -9, 24, 18), ferme: true, couleur: '#000', epaisseur: 0.6, remplissage: '#fff' }];
  prims.push({ t: 'ligne', x1: -6, y1: -6, x2: 6, y2: -6, couleur: '#000', epaisseur: 1.1 });
  [-1.5, 3, 6.5].forEach((y) => { prims.push({ t: 'ligne', x1: -10, y1: y, x2: -7, y2: y, couleur: '#E30000', epaisseur: 1.3 }); prims.push({ t: 'ligne', x1: -5.5, y1: y, x2: 9.5, y2: y, couleur: '#6B7280', epaisseur: 0.6 }); });
  return prims;
}

/* Vignette de l'objet Légende : cadre + trois lignes. */
function echantillonLegende() {
  const pts = (x, y, l, h) => [{ x, y }, { x: x + l, y }, { x: x + l, y: y + h }, { x, y: y + h }];
  const prims = [{ t: 'poly', points: pts(-12, -8, 24, 16), ferme: true, couleur: '#000', epaisseur: 0.6, remplissage: '#fff' }];
  [-3, 1, 5].forEach((y, i) => { prims.push({ t: 'ligne', x1: -9, y1: y, x2: -3, y2: y, couleur: ['#E2001A', '#171AEB', '#7B2D8E'][i], epaisseur: 1.2 }); prims.push({ t: 'ligne', x1: -1, y1: y, x2: 9, y2: y, couleur: '#6B7280', epaisseur: 0.5 }); });
  prims.push({ t: 'ligne', x1: -9, y1: -5.5, x2: 9, y2: -5.5, couleur: '#000', epaisseur: 0.4 });
  return prims;
}

async function basculerFavori(st) {
  const f = etat.prefs.favoris_annotations || (etat.prefs.favoris_annotations = []);
  const i = f.indexOf(st);
  if (i >= 0) f.splice(i, 1); else f.unshift(st);
  await bd.put('prefs', { cle: 'favoris_annotations', valeur: f });
}

async function enregistrerRecent(st) {
  const r = (etat.prefs.recents_annotations || []).filter((x) => x !== st);
  r.unshift(st);
  etat.prefs.recents_annotations = r.slice(0, 10);
  await bd.put('prefs', { cle: 'recents_annotations', valeur: etat.prefs.recents_annotations });
}
