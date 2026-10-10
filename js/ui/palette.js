/* ui/palette.js — tiroir « bibliothèque » alimenté par nomenclature.json :
 * recherche, filtre par catégorie et par statut (BPU / existant), favoris et récents.
 * Choisir un article règle l'outil de pose (ou ajoute l'article au matériel associé
 * des objets sélectionnés quand il ne se pose pas comme symbole).
 */
import { etat, emettre, sur, notifier, objetsSelectionnes, peutModifier, signalerLectureSeule } from '../etat.js';
import { LIBELLES } from '../charte.js';
import { rechercher, categories, libelleCategorie, presetDepuisArticle, articleParId, importerNomenclature, exporterNomenclatureJson, restaurerNomenclatureDepot } from '../nomenclature.js';
import { echantillonSymbole } from '../symboles.js';
import { boite } from '../primitives.js';
import { primVersSvg } from '../rendu-svg.js';
import { definirOutil } from '../outils.js';
import { valider } from '../historique.js';
import { bd } from '../bd.js';
import { telechargerBlob } from '../projet.js';
import { echapper, confirmer } from './dialogues.js';

const NS = 'http://www.w3.org/2000/svg';
let palette, filtre = { texte: '', categorie: '', statut: 'auto', onglet: 'tous' };

export function initialiserPalette() {
  palette = document.getElementById('palette');
  sur('fermer-panneaux', () => fermerPalette());
  sur('objet-pose', (o) => enregistrerRecent(o.ref_article));
  sur('courant', () => { if (!palette.hidden) rendreListe(); });
}

export function basculerPalette() { if (palette.hidden) ouvrirPalette(); else fermerPalette(); }
export function fermerPalette() { palette.hidden = true; }

export function ouvrirPalette(options = {}) {
  if (options.categorie !== undefined) filtre.categorie = options.categorie;
  palette.hidden = false;
  palette.innerHTML = `
    <header class="entete-panneau">
      <h2>Bibliothèque</h2>
      <button class="btn-icone fermer" title="Fermer">✕</button>
    </header>
    <div class="recherche"><input type="search" id="palette-recherche" placeholder="Rechercher (libellé, sigle, section…)" value="${echapper(filtre.texte)}" autocomplete="off"></div>
    <div class="onglets">
      <button data-onglet="tous" class="${filtre.onglet === 'tous' ? 'actif' : ''}">Tous</button>
      <button data-onglet="favoris" class="${filtre.onglet === 'favoris' ? 'actif' : ''}">Favoris</button>
      <button data-onglet="recents" class="${filtre.onglet === 'recents' ? 'actif' : ''}">Récents</button>
    </div>
    <div class="filtres">
      <select id="palette-categorie">
        <option value="">Toutes les catégories</option>
        ${categories().map((c) => `<option value="${c}" ${filtre.categorie === c ? 'selected' : ''}>${echapper(libelleCategorie(c))}</option>`).join('')}
      </select>
      <select id="palette-statut">
        <option value="auto" ${filtre.statut === 'auto' ? 'selected' : ''}>Selon l’état en cours</option>
        <option value="BPU" ${filtre.statut === 'BPU' ? 'selected' : ''}>Marché (BPU)</option>
        <option value="EXISTANT_HORS_BPU" ${filtre.statut === 'EXISTANT_HORS_BPU' ? 'selected' : ''}>Existant hors BPU</option>
        <option value="" ${filtre.statut === '' ? 'selected' : ''}>Tout</option>
      </select>
    </div>
    <div class="liste" id="palette-liste"></div>
    <footer class="pied-panneau">
      <button class="btn" id="palette-importer">Importer une nomenclature</button>
      <button class="btn" id="palette-exporter">Exporter</button>
      <button class="btn" id="palette-restaurer" title="Revenir au fichier nomenclature.json du dépôt">Restaurer</button>
    </footer>`;
  palette.querySelector('.fermer').addEventListener('click', fermerPalette);
  const rech = palette.querySelector('#palette-recherche');
  rech.addEventListener('input', () => { filtre.texte = rech.value; rendreListe(); });
  palette.querySelector('#palette-categorie').addEventListener('change', (e) => { filtre.categorie = e.target.value; rendreListe(); });
  palette.querySelector('#palette-statut').addEventListener('change', (e) => { filtre.statut = e.target.value; rendreListe(); });
  palette.querySelectorAll('[data-onglet]').forEach((b) => b.addEventListener('click', () => { filtre.onglet = b.dataset.onglet; palette.querySelectorAll('[data-onglet]').forEach((x) => x.classList.toggle('actif', x === b)); rendreListe(); }));
  palette.querySelector('#palette-importer').addEventListener('click', () => {
    if (!peutModifier()) { signalerLectureSeule(); return; }
    const inp = document.getElementById('fichier-nomenclature');
    inp.onchange = async () => {
      const f = inp.files[0]; inp.value = '';
      if (!f) return;
      try { const n = await importerNomenclature(f); notifier(n + ' articles chargés'); rendreListe(); }
      catch (e) { notifier('Import impossible : ' + e.message, 4000); }
    };
    inp.click();
  });
  palette.querySelector('#palette-exporter').addEventListener('click', () => telechargerBlob(exporterNomenclatureJson(), 'nomenclature.json', { partager: true }));
  palette.querySelector('#palette-restaurer').addEventListener('click', async () => {
    if (!peutModifier()) { signalerLectureSeule(); return; }
    if (await confirmer('Remplacer la nomenclature chargée par celle du dépôt ?')) { await restaurerNomenclatureDepot(); rendreListe(); notifier('Nomenclature du dépôt restaurée'); }
  });
  rendreListe();
  if (!('ontouchstart' in window)) setTimeout(() => rech.focus(), 50);
}

function statutEffectif() {
  if (filtre.statut === 'auto') return etat.courant.etat === 'a_poser' ? 'BPU' : null;
  return filtre.statut || null;
}

function rendreListe() {
  const liste = palette.querySelector('#palette-liste');
  let articles;
  if (filtre.onglet === 'favoris') articles = etat.prefs.favoris.map(articleParId).filter(Boolean);
  else if (filtre.onglet === 'recents') articles = etat.prefs.recents.map(articleParId).filter(Boolean);
  else articles = rechercher(filtre.texte, { categorie: filtre.categorie || null, statut: statutEffectif() }, 120);
  if (filtre.onglet !== 'tous' && (filtre.texte || filtre.categorie)) {
    articles = articles.filter((a) => (!filtre.categorie || a.categorie === filtre.categorie) && rechercher(filtre.texte, {}, 2000).includes(a));
  }
  // Existant hors BPU en tête quand l'état n'est pas « à poser »
  if (statutEffectif() === null && etat.courant.etat !== 'a_poser') articles.sort((a, b) => (a.statut === 'EXISTANT_HORS_BPU' ? 0 : 1) - (b.statut === 'EXISTANT_HORS_BPU' ? 0 : 1));
  liste.innerHTML = '';
  if (!articles.length) { liste.innerHTML = '<p class="vide">Aucun article ne correspond.</p>'; return; }
  let categorieCourante = null;
  for (const a of articles) {
    if (filtre.onglet === 'tous' && a.categorie !== categorieCourante) {
      categorieCourante = a.categorie;
      const h = document.createElement('div'); h.className = 'groupe-categorie'; h.textContent = libelleCategorie(a.categorie); liste.appendChild(h);
    }
    liste.appendChild(ligneArticle(a));
  }
}

function ligneArticle(a) {
  const preset = presetDepuisArticle(a);
  const div = document.createElement('div');
  div.className = 'article' + (preset ? ' posable' : ' associable') + (etat.preset && etat.preset.ref_article === a.id ? ' actif' : '');
  const fav = etat.prefs.favoris.includes(a.id);
  div.innerHTML = `
    <div class="apercu"></div>
    <div class="texte">
      <div class="libelle">${echapper(a.libelle)}</div>
      <div class="meta">${a.attributs && a.attributs.designation_plan ? echapper(a.attributs.designation_plan) + ' · ' : ''}${a.statut === 'EXISTANT_HORS_BPU' ? 'existant hors BPU' : 'BPU'}${a.unite ? ' · ' + echapper(a.unite) : ''}${preset ? '' : ' · matériel associé'}</div>
    </div>
    <button class="btn-icone favori ${fav ? 'actif' : ''}" title="Favori">${fav ? '★' : '☆'}</button>`;
  const ap = div.querySelector('.apercu');
  if (preset && preset.type !== 'troncon') ap.appendChild(apercuSymbole(preset));
  else if (preset && preset.type === 'troncon') ap.innerHTML = '<svg viewBox="0 0 40 24"><path d="M3 18L14 8l9 8 14-10" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  else ap.innerHTML = '<svg viewBox="0 0 40 24"><path d="M8 12h24M20 4v16" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/></svg>';
  div.querySelector('.favori').addEventListener('click', (e) => { e.stopPropagation(); basculerFavori(a.id); rendreListe(); });
  div.addEventListener('click', () => choisirArticle(a, preset));
  return div;
}

function apercuSymbole(preset) {
  const prims = echantillonSymbole(preset.type, etat.courant.etat, preset.attributs || {}, preset.domaine || etat.courant.domaine, preset.pose || etat.courant.pose);
  const b = boite(prims) || { x: -5, y: -5, l: 10, h: 10 };
  const svg = document.createElementNS(NS, 'svg');
  const m = 1.5;
  svg.setAttribute('viewBox', `${b.x - m} ${b.y - m} ${b.l + 2 * m} ${b.h + 2 * m}`);
  for (const p of prims) { const e = primVersSvg(p); if (e) svg.appendChild(e); }
  return svg;
}

function choisirArticle(a, preset) {
  if (preset) {
    if (preset.type === 'troncon') {
      definirOutil('troncon', { ...preset, ref_article: a.id, libelle: a.libelle });
      if (preset.domaine) { etat.courant.domaine = preset.domaine; }
      if (preset.pose) { etat.courant.pose = preset.pose; }
      emettre('courant', etat.courant);
      notifier('Outil tronçon : ' + a.libelle);
    } else {
      definirOutil(preset.type, { ...preset, ref_article: a.id, libelle: a.libelle });
      if (preset.domaine) { etat.courant.domaine = preset.domaine; emettre('courant', etat.courant); }
      notifier('Prêt à poser : ' + a.libelle);
    }
    palette.querySelectorAll('.article').forEach((d) => d.classList.remove('actif'));
    if (window.matchMedia('(max-width: 900px)').matches) fermerPalette();
    return;
  }
  const sel = objetsSelectionnes();
  if (!sel.length) { notifier('Cet article s’ajoute au matériel associé : sélectionnez d’abord un objet.', 3500); return; }
  for (const o of sel) o.materiel_associe.push({ source: 'NOMENCLATURE', ref_article: a.id, libelle: a.libelle, quantite: 1, unite: a.unite || '' });
  valider('Matériel associé');
  enregistrerRecent(a.id);
  notifier('Ajouté au matériel associé de ' + sel.length + ' objet' + (sel.length > 1 ? 's' : ''));
}

async function basculerFavori(id) {
  const f = etat.prefs.favoris;
  const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.unshift(id);
  await bd.put('prefs', { cle: 'favoris', valeur: f });
}

async function enregistrerRecent(id) {
  if (!id) return;
  const r = etat.prefs.recents.filter((x) => x !== id);
  r.unshift(id);
  etat.prefs.recents = r.slice(0, 20);
  await bd.put('prefs', { cle: 'recents', valeur: etat.prefs.recents });
}

export { LIBELLES };
