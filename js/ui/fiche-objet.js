/* ui/fiche-objet.js — fiche de l'objet sélectionné (phase bureau).
 *
 * Aucun champ n'est obligatoire. Les listes sont filtrées depuis la nomenclature
 * (matériau → hauteur → classe → effort) et chaque liste accepte une valeur libre.
 * Toute modification est appliquée immédiatement (annulable), la désignation
 * automatique se recalcule, l'indicateur « complet » aussi.
 *
 * Lot 1.1 : repère éditable en tête (v10 §2.4, §4.4), champs souterrains masqués en aérien / façade
 * (§2.1), longueur affichée (§2.2), déport et échelle de symbole (§3.2), tige MALT, matériel
 * associé réordonnable avec quantité explicite (§4.1), option « détailler le matériel MALT » (§4.3),
 * armement choisi dans une liste à libellés longs (§4.2).
 * Lot 1.3 : cadre / fond des blocs (v12 §3.2), angle en grades (§6), sections retenues (§4), deux commandes
 * MALT (§5.1), règle MALT des ERAS et tige (§5.4), sections raccordées des boîtes (§5.5), articles de
 * raccordement proposés (§9), lanterne / boucle EP (§7), fiche des masques (§8), taille du texte et
 * extrémités des annotations (§2).
 * Lot 1.3.1 (v13) : mise à jour ciblée des listes (matériel associé) sans rechargement du panneau — position de
 * défilement, sections dépliées et focus clavier conservés (§4) ; champ « remplacé par » avec le sélecteur du type (§2.2) ;
 * réseau et type d'ERAS passés par appliquerDomaine() / appliquerSousTypeEras() (règle MALT unique, §1) ; MALT manuelle
 * possible sur une RAS BRT / EP, signalée « à compléter » (§1.3).
 */
import { etat, emettre, sur, objetParId, notifier, selectionner } from '../etat.js';
import { LIBELLES, LIBELLES_DOMAINE, CHARTE, MM, libelleMasque, libelleFicheArticle, SECTIONS_DERIVEES, RACCORDEMENTS_PROPOSES, ABREVIATIONS_ETIQUETTE, MALT_CONDENSE, TYPES_SUPPORT, supportSansCaracteristiques, SECTIONS_BT_NUS, estSectionNu, couleurManuelleValide, couleurCharteLineaire, effortHorsMarche } from '../charte.js';
import { calquePourEtat, designationAffichee, etiquetteTroncon, fourreauChevauche, articleSectionsDerivees, sectionAffichee, formaterAngle, analyserAngle, ANNOTATIONS_A_TEXTE, appliquerDomaine, appliquerSousTypeEras, maltApplicable, articleIncompatible, remplacementParDefaut, remplacementRenseigne, motifsACompleter, suffixeEtat, sectionNuHorsDomaine, peutPorterSymboleMalt, symboleMaltActif, assurerSymboleMalt, categorieMaltHote } from '../modele.js';
import { objets } from '../etat.js';
import { declencheurCouleur, brancherDeclencheurs } from './selecteur-couleur.js';
import { valider } from '../historique.js';
import { designationAuto, designationSupport, materiauMetalliqueParDefaut } from '../designation.js';
import { tailleTexteAnnotation } from '../symboles.js';
import * as N from '../nomenclature.js';
import { echapper, demander } from './dialogues.js';
import { ouvrirEditeurNote } from './notes.js';
import { preparerFichierImage, enregistrerImage } from '../images.js';
import { genererCarteSituation, metresParPixel } from '../situation.js';
import { formaterGps } from '../descriptif.js';
import { FORMES_BOITE } from '../symboles.js';
import { rectangleVisible, recadrageNul, lireRecadrage, echelleAutourDuVisible, tournerAutourDuVisible } from '../forme-calcul.js';

let fiche, idCourant = null;
let majCiblee = null;   // { focus } : la prochaine notification 'objets' ne redessine que les listes (v13 §4)

const FONCTIONS = ['', 'ALIGNEMENT', 'ANGLE', 'ARRET', 'DERIVATION', 'ANCRAGE', 'DOUBLE_ANCRAGE', 'REMONTEE_AERO_SOUTERRAINE', 'TRAVERSEE'];
const RENFORCEMENTS = [['AUCUN', 'Aucun'], ['CONTREFICHE', 'Contrefiché'], ['JUMELE', 'Jumelé'], ['HAUBANE', 'Haubané'], ['PORTIQUE', 'Portique']];
const NATURES_TERRAIN = ['', 'CHAUSSEE', 'TROTTOIR', 'ACCOTEMENT', 'TERRE', 'ROCHE', 'ENROBE', 'BETON', 'PAVES', 'ESPACE_VERT', 'RICCIATA', 'BICOUCHE'];   // v1.5.2 : Ricciata, Bi-couche
const CADRES = [['aucun', 'Aucun'], ['rectangle', 'Rectangle'], ['arrondi', 'Rectangle à angles arrondis']];
const FONDS_BLOC = [['translucide', 'Blanc translucide (défaut)'], ['blanc', 'Blanc opaque'], ['transparent', 'Transparent']];

export function initialiserFiche() {
  fiche = document.getElementById('fiche');
  sur('ouvrir-fiche', (id) => ouvrirFiche(id));
  sur('objet-touche', (id) => { if (!fiche.hidden) ouvrirFiche(id); });
  sur('selection', (ids) => { if (!fiche.hidden) { if (ids.length === 1 && ids[0] !== 'legende' && ids[0] !== 'descriptif') ouvrirFiche(ids[0]); else fermerFiche(); } });
  sur('objets', () => {
    if (fiche.hidden || !idCourant) return;
    const o = objetParId(idCourant);
    if (!o) { fermerFiche(); return; }
    if (majCiblee && o.type !== 'annotation' && o.type !== 'masque' && o.type !== 'note') {
      // Manipulation d'une liste (matériel associé…) : seules les listes sont redessinées, le panneau ne bouge pas (v13 §4)
      const m = majCiblee; majCiblee = null;
      rafraichirListes(o, m);
      return;
    }
    majCiblee = null;
    // Autre modification (fiche, annuler / rétablir, menu) : rendu complet avec défilement, sections et focus conservés
    ouvrirFiche(idCourant, { conserver: true });
  });
  sur('fermer-panneaux', () => fermerFiche());
  sur('valider-fiche', () => { if (!fiche.hidden) { fermerFiche(); notifier('Fiche validée'); } });
  sur('projet-ferme', () => fermerFiche());
  sur('rognage', (actif) => { if (actif) fermerFiche(); });   // v1.4.7 : la fiche libère le plan pendant le rognage
}

export function fermerFiche() { fiche.hidden = true; idCourant = null; }

function masquerAutresPanneaux() {
  document.getElementById('palette').hidden = true;
  document.getElementById('panneau-calques').hidden = true;
  document.getElementById('panneau-a-completer').hidden = true;
}

export function ouvrirFiche(id, { conserver = false } = {}) {
  const o = objetParId(id);
  if (!o) { fermerFiche(); return; }
  if (o.type === 'note') { ouvrirEditeurNote(id); fermerFiche(); return; }
  if (o.type === 'annotation') { ouvrirFicheAnnotation(o, conserver); return; }
  if (o.type === 'masque') { ouvrirFicheMasque(o, conserver); return; }
  if (o.type === 'image') { ouvrirFicheImage(o, conserver); return; }
  const memo = conserver ? capturerEtatFiche() : null;
  idCourant = id;
  fiche.hidden = false;
  masquerAutresPanneaux();
  const ponctuel = o.type !== 'troncon' && o.type !== 'fourreau';
  const lineaire = !ponctuel;
  const K = CHARTE.bloc_etiquette;
  const KS = CHARTE.echelle_symbole;
  const blocHtml = (cle, titre) => `
        <details class="bloc-reglages"><summary>${titre}</summary>
          <div class="ligne2">
            <label>Échelle (× ${K.echelle_min}–${K.echelle_max})<input type="number" name="${cle}.echelle" value="${o[cle].echelle ?? 1}" step="0.1" min="${K.echelle_min}" max="${K.echelle_max}"></label>
            <label>Rotation (°)<input type="number" name="${cle}.rotation" value="${Math.round(o[cle].rotation || 0)}" step="5"></label>
          </div>
          <label class="case"><input type="checkbox" name="${cle}.retourner" ${o[cle].retourner !== false ? 'checked' : ''}> Retourner automatiquement pour rester lisible</label>
          ${cle === 'cartouche' ? `
          <div class="ligne2">
            <label>Contour${palette(cle + '.couleur_contour', o.cartouche.couleur_contour || '#000000')}</label>
            <label>Texte${palette(cle + '.couleur_texte', o.cartouche.couleur_texte || '#000000')}</label>
          </div>
          <label>Fond<select name="cartouche.fond"><option value="blanc" ${o.cartouche.fond !== 'transparent' ? 'selected' : ''}>Blanc opaque</option><option value="transparent" ${o.cartouche.fond === 'transparent' ? 'selected' : ''}>Transparent</option></select></label>` : `
          <div class="ligne2">
            <label>Cadre<select name="${cle}.cadre">${CADRES.map(([k, l]) => `<option value="${k}" ${(o[cle].cadre || 'aucun') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label>Fond<select name="${cle}.fond">${FONDS_BLOC.map(([k, l]) => `<option value="${k}" ${(o[cle].fond || 'translucide') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>
          <label>Couleur du cadre${palette(cle + '.couleur_cadre', o[cle].couleur_cadre || CHARTE.texte.couleur_cadre_defaut)}</label>
          <label>Couleur du texte${palette(cle + '.couleur_texte', o[cle].couleur_texte || CHARTE.texte.couleur_texte_defaut)}</label>`}
          <button class="btn" data-action="reinit-bloc" data-bloc="${cle}">Réinitialiser l'aspect</button>
        </details>`;
  // v1.4.9 §2.4 : retour à la ligne par bloc ; « Par défaut » affiche la valeur résolue pour ce type d'objet
  const retourHtml = (cle, titre) => {
    const v = o[cle].retour_ligne === 'auto' || o[cle].retour_ligne === 'jamais' ? o[cle].retour_ligne : 'defaut';
    const def = CHARTE.texte.retour_ligne_defaut[lineaire ? 'lineaire' : 'ponctuel'];
    const choix = [['defaut', 'Par défaut (' + (def === 'jamais' ? 'sur une ligne' : 'automatique') + ')'], ['auto', 'Automatique'], ['jamais', 'Jamais (sur une ligne)']];
    return `<label>${titre}<select name="${cle}.retour_ligne">${choix.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  };
  // v1.4.9 §4 : couleur manuelle d'un tronçon / fourreau — fonction d'exception, dans Avancé seulement
  const couleurPerso = lineaire ? couleurManuelleValide(o.couleur_manuelle) : null;
  const couleurHtml = lineaire ? `
          <div class="ligne-couleur-trace">
            <label>Couleur du tracé ${couleurPerso ? '<small>Personnalisée</small>' : '<small>Charte</small>'}${palette('couleur_manuelle', couleurPerso || couleurCharteLineaire(o), { pipette: true, titre: 'Couleur du tracé' })}</label>
            ${couleurPerso ? '<button class="btn" data-action="couleur-charte">Revenir à la couleur de la charte</button>' : ''}
          </div>
          <div class="aide">À n'utiliser qu'en cas de besoin : seule la couleur change (épaisseur, tiretés et hachures restent ceux de la charte) ; elle est conservée si l'état ou le réseau change et n'apparaît pas dans la légende.</div>` : '';
  fiche.innerHTML = `
    <header class="entete-panneau">
      <h2>${echapper(LIBELLES.types[o.type] || o.type)}</h2>
      <input class="repere-saisie" name="repere" value="${echapper(o.repere)}" title="Repère (libre, ex. A1, S1, R1)" placeholder="Repère" size="5" autocomplete="off">
      <span class="complet ${o.complet ? 'oui' : 'non'}" title="${o.complet ? 'Fiche complète' : 'Fiche à compléter'}">${o.complet ? '✓' : '!'}</span>
      <button class="btn-icone fermer" title="Fermer (Échap)">✕</button>
    </header>
    <div class="contenu">
      ${couleurPerso ? '<div class="aide rappel-couleur-perso">Couleur personnalisée — ne suit plus la charte (fiche, Avancé).</div>' : ''}
      <section class="bloc">
        <div class="chips" data-champ="etat">${Object.entries(LIBELLES.etats).map(([k, l]) => `<button class="chip ${o.etat === k ? 'actif' : ''}" data-valeur="${k}">${l}</button>`).join('')}</div>
        <div class="ligne2">
          <label>Réseau<select name="domaine">${Object.entries(LIBELLES.domaines).map(([k, l]) => `<option value="${k}" ${o.domaine === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Pose<select name="pose">${Object.entries(LIBELLES.poses).map(([k, l]) => `<option value="${k}" ${o.pose === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
      </section>
      <section class="bloc" id="fiche-remplacement" ${o.etat === 'a_reprendre' ? '' : 'hidden'}></section>
      <section class="bloc" id="fiche-specifique"></section>
      <section class="bloc">
        <h3>Désignation</h3>
        <div class="designation-auto"></div>
        <label>Désignation manuelle (prioritaire, sans suffixe d'état)<input name="designation_manuelle" value="${echapper(o.designation_manuelle)}" placeholder="Laisser vide pour l'automatique"></label>
        <label>Mention libre (dernière ligne de l'étiquette ; le commentaire, lui, n'apparaît jamais sur le plan)<input name="mention" value="${echapper(o.mention || '')}" placeholder="Ex. Traversée RT10, accord riverain obtenu"></label>
        <label class="case"><input type="checkbox" name="etiquette_visible" ${o.etiquette.visible ? 'checked' : ''}> Afficher l'étiquette sur le plan</label>
        ${retourHtml('etiquette', 'Retour à la ligne de la désignation')}
        ${blocHtml('etiquette', 'Aspect du bloc désignation')}
        ${ponctuel ? `<label class="case"><input type="checkbox" name="materiel_visible" ${o.materiel.visible !== false ? 'checked' : ''}> Afficher le bloc matériel + mention</label>
        ${retourHtml('materiel', 'Retour à la ligne du matériel')}
        ${blocHtml('materiel', 'Aspect du bloc matériel')}
        <label class="case"><input type="checkbox" name="cartouche_visible" ${o.cartouche.visible ? 'checked' : ''}> Afficher le cartouche de repère (la croix rouge sur le cartouche le masque en un appui)</label>
        ${blocHtml('cartouche', 'Aspect du cartouche')}` : ''}
      </section>
      ${lineaire ? `
      <section class="bloc">
        <h3>Trait</h3>
        <label>Échelle du trait (épaisseur, tiretés, écartement ; × ${CHARTE.echelle_lineaire.min}–${CHARTE.echelle_lineaire.max})<input type="number" name="echelle_symbole" value="${o.echelle_symbole || 1}" step="0.1" min="${CHARTE.echelle_lineaire.min}" max="${CHARTE.echelle_lineaire.max}"></label>
      </section>` : ''}
      ${ponctuel ? `
      <section class="bloc">
        <h3>Symbole</h3>
        <div class="ligne2">
          <label>Taille du symbole (× ${KS.min}–${KS.max})<input type="number" name="echelle_symbole" value="${o.echelle_symbole || 1}" step="0.1" min="${KS.min}" max="${KS.max}"></label>
          <label>Rotation (°)<input type="number" name="rotation" value="${Math.round(o.rotation || 0)}" step="5"></label>
        </div>
        <div class="ligne2">
          <label>Déport X (unités plan)<input type="number" name="deport.dx" value="${arrondi(o.deport.dx)}" step="1"></label>
          <label>Déport Y<input type="number" name="deport.dy" value="${arrondi(o.deport.dy)}" step="1"></label>
        </div>
        <div class="aide">Le déport écarte le symbole de son point d'ancrage (ligne de rappel) ; l'ancrage reste le point de référence. Taille réglable aussi par la poignée carrée fléchée, déport par la poignée en croix.</div>
      </section>` : ''}
      <section class="bloc" id="fiche-materiel" ${lineaire && o.type === 'fourreau' ? 'hidden' : ''}>
        <h3>Matériel associé</h3>
        <div class="liste-materiel"></div>
        <div class="ajout-materiel">
          <input type="search" name="rech_materiel" placeholder="Ajouter depuis la nomenclature…" autocomplete="off">
          <div class="resultats" hidden></div>
        </div>
        <div class="ligne2">
          <input name="materiel_libre" placeholder="Matériel libre (ex. ferrure FT)">
          <button class="btn" data-action="ajouter-libre">Ajouter</button>
        </div>
        <div class="commandes-malt"></div>
        ${raccordementsHtml(o)}
        <div class="packages">${N.nomsPackages().filter((p) => p !== 'MALT' || o.type === 'malt').map((p) => `<button class="chip petit" data-package="${p}">+ ${echapper(p.replace(/_/g, ' '))}</button>`).join('')}</div>
        <div class="option-detail-malt"></div>
      </section>
      <section class="bloc">
        <h3>Commentaire</h3>
        <textarea name="commentaire" rows="3" placeholder="Ex. le dernier support sur la 3ᵉ branche est difficilement accessible…">${echapper(o.commentaire)}</textarea>
      </section>
      <section class="bloc avance">
        <details>
          <summary>Avancé</summary>
          <label>Calque<select name="calque">${Object.entries(LIBELLES.calques).filter(([k]) => k !== 'fond' && k !== 'masques').map(([k, l]) => `<option value="${k}" ${o.calque === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${ponctuel ? `<div class="ligne2">
            <label>Cartouche : déport X<input type="number" name="cartouche.dx" value="${arrondi(o.cartouche.dx)}" step="1"></label>
            <label>Cartouche : déport Y<input type="number" name="cartouche.dy" value="${arrondi(o.cartouche.dy)}" step="1"></label>
          </div>` : ''}
          ${couleurHtml}
          ${o.echelle_plan_origine ? `<div class="aide">Échelle de plan à la pose : facteur symboles × ${o.echelle_plan_origine.echelle_symbole}, textes × ${o.echelle_plan_origine.taille_texte} (« Aligner tous les objets » dans Calques pour reprendre l'échelle courante).</div>` : ''}
        </details>
      </section>
    </div>
    <footer class="pied-panneau">
      <button class="btn" data-action="dupliquer">Dupliquer</button>
      <button class="btn btn-danger" data-action="supprimer">Supprimer</button>
      <button class="btn btn-primaire" data-action="valider" title="Ctrl+Entrée">Valider</button>
    </footer>`;

  rendreRemplacement(o);
  rendreSpecifique(o);
  rendreDesignationAuto(o);
  rendreMateriel(o);
  brancher(o);
  brancherPalettes(o);
  if (memo) restaurerEtatFiche(memo);
}

function arrondi(v) { return Math.round((Number(v) || 0) * 10) / 10; }

/* ---------- Conservation de l'état du panneau entre deux rendus (v13 §4) ---------- */
function conteneurDefilant() { return fiche.querySelector('.contenu'); }

/* Clé stable d'un élément focalisable de la fiche (nom de champ, ligne de liste, action). */
function cleElement(el) {
  if (!el || !fiche.contains(el)) return null;
  const lm = el.closest('.ligne-materiel');
  if (lm) return 'm:' + lm.dataset.i + ':' + (el.dataset.action || (el.classList.contains('qte') ? 'qte' : ''));
  if (el.name) return 'n:' + el.name;
  if (el.dataset.action) return 'a:' + el.dataset.action + ':' + (el.dataset.bloc || '');
  if (el.dataset.valeur) return 'v:' + el.dataset.valeur;
  if (el.dataset.package) return 'p:' + el.dataset.package;
  if (el.dataset.malt) return 'k:' + el.dataset.malt;
  if (el.dataset.article) return 'r:' + el.dataset.article;
  return null;
}

function elementParCle(cle) {
  if (!cle) return null;
  const [k, ...r] = cle.split(':');
  const v = r.join(':');
  try {
    switch (k) {
      case 'm': { const [i, act] = r; const l = fiche.querySelector(`.ligne-materiel[data-i="${i}"]`); return l ? (act === 'qte' ? l.querySelector('.qte') : l.querySelector(`[data-action="${act}"]`)) : null; }
      case 'n': return fiche.querySelector(`[name="${CSS.escape(v)}"]`);
      case 'a': { const [act, bloc] = r; return fiche.querySelector(bloc ? `[data-action="${act}"][data-bloc="${bloc}"]` : `[data-action="${act}"]`); }
      case 'v': return fiche.querySelector(`[data-valeur="${CSS.escape(v)}"]`);
      case 'p': return fiche.querySelector(`[data-package="${CSS.escape(v)}"]`);
      case 'k': return fiche.querySelector(`[data-malt="${CSS.escape(v)}"]`);
      case 'r': return fiche.querySelector(`[data-article="${CSS.escape(v)}"]`);
      default: return null;
    }
  } catch (e) { return null; }
}

function capturerEtatFiche() {
  const c = conteneurDefilant();
  const a = document.activeElement;
  const ouverts = {};
  fiche.querySelectorAll('details').forEach((d) => { const t = d.querySelector('summary'); if (t) ouverts[t.textContent.trim()] = d.open; });
  const cle = cleElement(a);
  const sel = a && typeof a.selectionStart === 'number' ? { debut: a.selectionStart, fin: a.selectionEnd } : null;
  return { scroll: c ? c.scrollTop : 0, ouverts, focus: cle, sel };
}

function restaurerEtatFiche(m) {
  fiche.querySelectorAll('details').forEach((d) => { const t = d.querySelector('summary'); if (t && t.textContent.trim() in m.ouverts) d.open = m.ouverts[t.textContent.trim()]; });
  const c = conteneurDefilant();
  if (c) c.scrollTop = m.scroll;
  if (m.focus) {
    const el = elementParCle(m.focus);
    if (el && !el.disabled) {
      try { el.focus({ preventScroll: true }); if (m.sel && typeof el.setSelectionRange === 'function' && /^(text|search|number|)$/.test(el.type || '')) { try { el.setSelectionRange(m.sel.debut, m.sel.fin); } catch (e) { /* type sans sélection */ } } } catch (e) { /* élément non focalisable */ }
      if (c) c.scrollTop = m.scroll;   // le focus ne doit pas faire défiler
    }
  }
}

/* Redessine les seules parties dépendantes des listes : liste de matériel, commandes MALT, option de détail,
 * désignation automatique, indicateur « complet », partie spécifique quand elle affiche le matériel (ERAS). */
function rafraichirListes(o, m = {}) {
  const c = conteneurDefilant();
  const scroll = c ? c.scrollTop : 0;
  rendreMateriel(o);
  rendreDesignationAuto(o);
  rendreIndicateurComplet(o);
  if (c) c.scrollTop = scroll;
  const cible = m.focus ? elementParCle(m.focus) : null;
  if (cible && !cible.disabled) {
    try { cible.focus({ preventScroll: true }); } catch (e) { /* ignoré */ }
    if (c) c.scrollTop = scroll;
    // à défaut de garder la position (liste raccourcie), la ligne manipulée reste visible
    const ligne = cible.closest('.ligne-materiel');
    if (ligne && c) { const rl = ligne.getBoundingClientRect(), rc = c.getBoundingClientRect(); if (rl.top < rc.top || rl.bottom > rc.bottom) ligne.scrollIntoView({ block: 'nearest' }); }
  }
}

function rendreIndicateurComplet(o) {
  const e = fiche.querySelector('.entete-panneau .complet');
  if (!e) return;
  e.className = 'complet ' + (o.complet ? 'oui' : 'non');
  e.title = o.complet ? 'Fiche complète' : 'Fiche à compléter : ' + motifsACompleter(o, objets()).join(', ');
  e.textContent = o.complet ? '✓' : '!';
}

function rendreDesignationAuto(o) {
  const z = fiche.querySelector('.designation-auto');
  if (!z) return;
  const ponctuel = o.type !== 'troncon' && o.type !== 'fourreau';
  const auto = designationAuto(o);
  const affichee = o.designation_manuelle && o.designation_manuelle.trim() ? o.designation_manuelle : (auto ? auto + suffixeEtat(o) : '');
  z.innerHTML = `Automatique : <strong>${echapper(auto || '—')}</strong> · affichée : <strong>${echapper(affichee.trim() || '—')}</strong>${ponctuel ? '' : ` · étiquette : <strong>${echapper(etiquetteTroncon(o, etat.projet.reglages) || '—')}</strong>`}`;
}

/* Validation d'une manipulation de liste : la notification 'objets' qui suit ne redessine que les listes (v13 §4). */
function validerListe(o, etiquette, focus = null) {
  majCiblee = { focus };
  valider(etiquette);   // synchrone : la notification 'objets' est traitée ici même
  majCiblee = null;
}

/* ---------- Champ « remplacé par » (v13 §2.2) ---------- */
/* Même sélecteur que le type de l'objet (support : matériau → hauteur → classe → effort, valeurs libres), repli en texte libre.
 * Stocké dans remplacement_par { article_id, designation, attributs } ; « à compléter » tant que la cible est vide. */
function rendreRemplacement(o) {
  const z = fiche.querySelector('#fiche-remplacement');
  if (!z) return;
  if (o.etat !== 'a_reprendre') { z.hidden = true; z.innerHTML = ''; return; }
  if (!o.remplacement_par) o.remplacement_par = remplacementParDefaut();
  const r = o.remplacement_par;
  const ra = r.attributs || (r.attributs = {});
  z.hidden = false;
  let sel = '';
  switch (o.type) {
    case 'support': {
      const materiaux = N.materiauxSupports();
      const libMat = TYPES_SUPPORT.fiche;
      const hauteurs = ra.materiau ? N.hauteursSupports(ra.materiau) : [];
      const classes = ra.materiau ? N.classesSupports(ra.materiau, ra.hauteur_m) : [];
      const efforts = ra.materiau ? N.effortsSupports(ra.materiau, ra.hauteur_m, ra.classe) : [];
      if (supportSansCaracteristiques(ra.materiau)) {
        // v1.4.8 : remplaçant console / ancrage en façade (type d'ancrage seulement)
        const typesA = ra.materiau === 'ANCRAGE' ? N.typesAncrage(o.domaine) : [];
        sel = `<label>Matériau / type du remplaçant<select name="r.materiau">${opt(['', ...materiaux], ra.materiau, { libelles: libMat })}</select></label>
        ${ra.materiau === 'ANCRAGE' ? `<label>Type d'ancrage du remplaçant<select name="r.type_ancrage"><option value="">—</option>${typesA.map((x) => `<option value="${x.id}" ${ra.armement_ref === x.id ? 'selected' : ''}>${echapper(libelleFicheArticle(x))}</option>`).join('')}</select></label>` : ''}`;
        break;
      }
      sel = `<label>Matériau / type du remplaçant<select name="r.materiau">${opt(['', ...materiaux], ra.materiau, { libelles: libMat })}</select></label>
        <div class="ligne2">
          <label>Hauteur (m)<select name="r.hauteur_m" ${!ra.materiau ? 'disabled' : ''}>${opt(['', ...hauteurs], ra.hauteur_m)}</select></label>
          <label>Classe<select name="r.classe" ${!ra.materiau || (ra.materiau !== 'BETON' && ra.materiau !== 'BOIS' && !classes.length) ? 'disabled' : ''}>${opt(['', ...classes], ra.classe)}</select></label>
        </div>
        <label>Effort (daN)<select name="r.effort_daN" ${!ra.materiau || ra.materiau === 'BOIS' ? 'disabled' : ''}>${opt(['', ...efforts], ra.effort_daN)}</select></label>`;
      break;
    }
    case 'coffret': sel = `<label>Sigle du remplaçant<select name="r.sigle">${opt(['', ...N.sigles(['COFFRET_BT', 'ECLAIRAGE_PUBLIC']).map((x) => x.sigle)], ra.sigle)}</select></label>`; break;
    case 'poste': sel = `<label>Sigle du remplaçant<select name="r.sigle">${opt(['', ...N.sigles(['POSTE', 'COUPURE_HTA']).map((x) => x.sigle)], ra.sigle)}</select></label>`; break;
    case 'armoire_ep': sel = `<label>Sigle du remplaçant<input name="r.sigle" value="${echapper(ra.sigle || '')}"></label>`; break;
    case 'troncon': sel = `<label>Section / câble du remplaçant<select name="r.section">${opt(['', ...N.sectionsCables(o.domaine, o.pose, 'a_poser').map((x) => x.section)], ra.section)}</select></label>`; break;
    case 'fourreau': sel = `<label>Fourreau de remplacement<select name="r.fourreau_article"><option value="">—</option>${N.fourreaux().map((f) => `<option value="${f.article.id}" ${r.article_id === f.article.id ? 'selected' : ''}>${echapper(f.article.libelle)}</option>`).join('')}</select></label>`; break;
    case 'eras': sel = `<label>Type du remplaçant<select name="r.sous_type"><option value="">—</option>${Object.entries(CHARTE.DESIGNATIONS_DEFAUT.eras).map(([k, l]) => `<option value="${k}" ${ra.sous_type === k ? 'selected' : ''}>${echapper(l)}</option>`).join('')}</select></label>`; break;
    case 'lanterne_ep': case 'boucle_ep': sel = `<label>Article du remplaçant (nomenclature ÉCLAIRAGE PUBLIC)<select name="r.article_ep"><option value="">—</option>${N.articlesEclairagePublic().map((a) => `<option value="${a.id}" ${r.article_id === a.id ? 'selected' : ''}>${echapper(a.libelle)}</option>`).join('')}</select></label>`; break;
    default: sel = '';
  }
  const vide = !remplacementRenseigne(o);
  z.innerHTML = `<h3>Remplacé par</h3>
    ${sel}
    <label>Désignation du remplaçant (texte libre, reprise telle quelle sur l'étiquette)<input name="r.designation" value="${echapper(r.designation || '')}" placeholder="${sel ? 'Remplie par le sélecteur ci-dessus, modifiable' : 'Ex. BJ BT 150/150'}"></label>
    <div class="aide">${vide ? '<strong>Cible du remplacement à renseigner</strong> : l’objet reste « à compléter » tant qu’elle est vide (un remplacement sans cible n’est pas chiffrable). Étiquette : « … à remplacer ».' : 'Étiquette : « ' + echapper((designationAuto(o) || '') + suffixeEtat(o)) + ' »' + (r.article_id ? ' · article ' + echapper(r.article_id) : '') + '. Au métré (lot 3) : dépose de l’ouvrage existant + pose du remplaçant, deux articles distincts.'}</div>`;
}

/* Applique un champ « r.* » du remplacement : le sélecteur recalcule désignation et article ; le texte libre prime. */
function appliquerRemplacement(o, champ, valeur) {
  if (!o.remplacement_par) o.remplacement_par = remplacementParDefaut();
  const r = o.remplacement_par;
  const ra = r.attributs || (r.attributs = {});
  if (champ === 'designation') { r.designation = String(valeur || '').trim(); if (!r.designation) r.article_id = null; return; }
  if (['hauteur_m', 'effort_daN'].includes(champ) && valeur !== null && valeur !== '' && !isNaN(Number(valeur))) valeur = Number(valeur);
  if (o.type === 'support' && champ === 'type_ancrage') {
    // v1.4.8 : type d'ancrage du remplaçant → armement_ref, article et désignation « Ancrage EAF »
    ra.armement_ref = valeur || null;
    r.article_id = ra.armement_ref;
    r.designation = designationSupport({ attributs: { materiau: 'ANCRAGE', armement_ref: ra.armement_ref }, etat: 'a_poser' });
    return;
  }
  ra[champ] = valeur;
  switch (o.type) {
    case 'support': {
      if (champ === 'materiau' && supportSansCaracteristiques(valeur)) {
        // v1.4.8 : console / ancrage — pas de hauteur, classe, effort
        ra.hauteur_m = null; ra.classe = ''; ra.effort_daN = null;
        if (valeur !== 'ANCRAGE') ra.armement_ref = null;
        r.article_id = valeur === 'ANCRAGE' ? (ra.armement_ref || null) : null;
        r.designation = designationSupport({ attributs: { materiau: valeur, armement_ref: ra.armement_ref }, etat: 'a_poser' });
        break;
      }
      if (champ === 'materiau') ra.armement_ref = null;
      if (champ === 'materiau') {
        const h = N.hauteursSupports(valeur);
        if (h.length && !h.includes(Number(ra.hauteur_m))) ra.hauteur_m = null;
        if (valeur !== 'BETON' && valeur !== 'BOIS') ra.classe = '';
        if (valeur === 'BOIS') ra.effort_daN = null;
      }
      if (champ === 'hauteur_m') { const c = N.classesSupports(ra.materiau, ra.hauteur_m); if (c.length && ra.classe && !c.includes(ra.classe)) ra.classe = ''; }
      if (champ === 'hauteur_m' || champ === 'classe') { const e = N.effortsSupports(ra.materiau, ra.hauteur_m, ra.classe); if (e.length && ra.effort_daN && !e.includes(Number(ra.effort_daN))) ra.effort_daN = null; }
      const art = ra.materiau ? N.articleSupport({ materiau: ra.materiau, hauteur_m: ra.hauteur_m, classe: ra.classe || '', effort_daN: ra.effort_daN }) : null;
      r.article_id = art ? art.id : null;
      r.designation = ra.materiau ? designationSupport({ attributs: { materiau: ra.materiau, hauteur_m: ra.hauteur_m, classe: ra.classe || '', effort_daN: ra.effort_daN, renforcement: 'AUCUN' }, etat: 'a_poser' }) : '';
      break;
    }
    case 'coffret': case 'poste': {
      const e = N.sigles(o.type === 'coffret' ? ['COFFRET_BT', 'ECLAIRAGE_PUBLIC'] : ['POSTE', 'COUPURE_HTA']).find((x) => x.sigle === valeur);
      r.article_id = e ? e.article.id : null;
      r.designation = valeur ? String(valeur) : '';
      break;
    }
    case 'armoire_ep': r.article_id = null; r.designation = valeur ? String(valeur) : ''; break;
    case 'troncon': {
      const e = N.sectionsCables(o.domaine, o.pose, 'a_poser').find((x) => x.section === valeur);   // le remplaçant est posé : jamais de « Nu »
      r.article_id = e && e.article ? e.article.id : null;
      r.designation = valeur ? String(valeur) : '';
      break;
    }
    case 'fourreau': {
      const f = N.fourreaux().find((x) => x.article.id === valeur);
      r.article_id = f ? f.article.id : null;
      r.designation = f ? f.notation : '';
      break;
    }
    case 'eras': r.article_id = null; r.designation = CHARTE.DESIGNATIONS_DEFAUT.eras[valeur] || ''; break;
    case 'lanterne_ep': case 'boucle_ep': {
      const a = valeur ? N.articleParId(valeur) : null;
      r.article_id = a ? a.id : null;
      r.designation = a ? (ABREVIATIONS_ETIQUETTE[a.id] || a.libelle) : '';
      break;
    }
    default: break;
  }
}

/* Deux commandes MALT distinctes (v12 §5.1) : « + MALT ex » (aucun article) et « + Confection MALT » (package) ; ordre selon l'état. */
function commandesMaltHtml(o) {
  const aEx = !!o.attributs.malt_ex;
  const aConf = (o.materiel_associe || []).some((m) => m.package === 'MALT');
  const ex = `<button class="chip petit ${aEx ? 'actif' : ''}" data-malt="ex">${aEx ? '− MALT ex' : '+ MALT ex'}</button>`;
  const conf = `<button class="chip petit ${aConf ? 'actif' : ''}" data-malt="confection">${aConf ? '− Confection MALT' : '+ Confection MALT'}</button>`;
  const existant = o.etat === 'existant' || o.etat === 'a_reprendre';
  // v1.5.1 : symbole MALT dessiné sur le plan (posé d'office par les commandes, masquable ici)
  const symbole = peutPorterSymboleMalt(o) && categorieMaltHote(o) !== null
    ? `<label class="case"><input type="checkbox" data-malt-symbole ${symboleMaltActif(o) ? 'checked' : ''}> Symbole MALT sur le plan (${categorieMaltHote(o) === 'ex' ? 'gris : MALT existante' : categorieMaltHote(o) === 'HTA' ? 'rouge : confection sur la HTA' : 'bleu : confection sur la BT'}) — part du centre de l'ouvrage ; poignée au bout des barres pour la tourner autour de l'ouvrage et l'allonger</label>
      ${symboleMaltActif(o) ? `<div class="ligne2">
        <label>Orientation MALT (°, 0 = vers le bas)<input type="number" data-malt-champ="angle" value="${Math.round(Number(o.malt_symbole.angle) || 0)}" step="15" min="-360" max="360"></label>
        <label>Longueur de tige<input type="number" data-malt-champ="longueur_tige" value="${o.malt_symbole.longueur_tige ?? ''}" step="0.5" min="0" max="${CHARTE.malt.tige_max}" placeholder="auto"></label>
      </div>` : ''}`
    : '';
  return `<div class="packages" data-malt-commandes>${existant ? ex + conf : conf + ex}</div>
    ${symbole}
    <div class="aide">« MALT ex » signale une mise à la terre existante (aucun article, une seule ligne sur l'étiquette). « Confection MALT » ajoute les ${N.lignesPackage('MALT').length} articles du package, sur un support neuf comme sur un support existant maintenu.</div>`;
}

/* Articles de raccordement / jonction proposés en un appui (v12 §9) sur supports, coffrets et ERAS. */
function raccordementsHtml(o) {
  if (!RACCORDEMENTS_PROPOSES.types.includes(o.type)) return '';
  const articles = RACCORDEMENTS_PROPOSES.ids.map(N.articleParId).filter(Boolean);
  if (!articles.length) return '';
  return `<div class="aide">Raccordements et jonctions :</div><div class="packages" data-raccordements>${articles.map((a) => `<button class="chip petit" data-article="${a.id}" title="${echapper(a.libelle)}">+ ${echapper(ABREVIATIONS_ETIQUETTE[a.id] || a.libelle)}</button>`).join('')}</div>`;
}

/* Palette de couleurs de la charte + saisie HEX libre (v11 §2.3, §6). */
/* Choix d'une couleur : pastille cliquable ouvrant le sélecteur unique (v13.4 §1). Le champ caché porte la valeur,
 * la fiche continue de la lire par `[name=…]` et de recevoir l'événement `change`. */
function palette(nom, valeur, { pipette = false, titre = 'Couleur' } = {}) {
  return declencheurCouleur(nom, valeur, { pipette, titre });
}

/* Fiche d'une annotation de plan : aucun matériel, aucune nomenclature (v11 §6, v12 §2). */
function ouvrirFicheAnnotation(o, conserver) {
  const memo = conserver ? capturerEtatFiche() : null;
  idCourant = o.id;
  fiche.hidden = false;
  masquerAutresPanneaux();
  const A = CHARTE.annotations;
  const KS = CHARTE.echelle_symbole;
  const avecTexte = ANNOTATIONS_A_TEXTE.includes(o.sous_type) || o.sous_type === 'nord';
  fiche.innerHTML = `
    <header class="entete-panneau">
      <h2>${echapper(LIBELLES.annotations[o.sous_type] || 'Annotation')}</h2>
      <span class="repere">${echapper(o.repere)}</span>
      <button class="btn-icone fermer" title="Fermer (Échap)">✕</button>
    </header>
    <div class="contenu">
      <section class="bloc">
        ${ANNOTATIONS_A_TEXTE.includes(o.sous_type) ? `<label>${o.sous_type === 'cotation' ? 'Valeur' : 'Texte'}<input name="texte" value="${echapper(o.texte || '')}"></label>` : ''}
        <label>Couleur${palette('couleur', o.couleur || '#000000')}</label>
        ${o.sous_type === 'rond_texte' ? `<label>Couleur du texte${palette('a.couleur_texte', o.attributs.couleur_texte || o.couleur || '#000000')}</label>
        <label>Fond<select name="a.fond"><option value="blanc" ${o.attributs.fond !== 'transparent' ? 'selected' : ''}>Blanc opaque</option><option value="transparent" ${o.attributs.fond === 'transparent' ? 'selected' : ''}>Transparent</option></select></label>` : ''}
        <div class="ligne2">
          <label>Épaisseur du trait (${A.epaisseur_min}–${A.epaisseur_max})<input type="number" name="epaisseur" value="${o.epaisseur ?? A.epaisseur_defaut}" step="0.1" min="${A.epaisseur_min}" max="${A.epaisseur_max}"></label>
          <label>Échelle de l'objet (× ${KS.min}–${KS.max})<input type="number" name="echelle_symbole" value="${o.echelle_symbole || 1}" step="0.1" min="${KS.min}" max="${KS.max}"></label>
        </div>
        ${avecTexte ? `<label>Taille du texte (${A.taille_texte_min}–${A.taille_texte_max}, vide = défaut ${tailleTexteAnnotation({ ...o, taille_texte: null })})<input type="number" name="taille_texte" value="${o.taille_texte ?? ''}" step="0.5" min="${A.taille_texte_min}" max="${A.taille_texte_max}" placeholder="défaut"></label>` : ''}
        ${!o.points || !o.points.length ? `<label>Rotation (°)<input type="number" name="rotation" value="${Math.round(o.rotation || 0)}" step="5"></label>` : ''}
        ${o.sous_type === 'fleche_texte' ? `<label class="case"><input type="checkbox" name="a.double" ${o.attributs.double ? 'checked' : ''}> Double pointe</label>` : ''}
        ${o.sous_type === 'trait' ? `<div class="ligne2">
          <label>Extrémités<select name="a.extremites">${A.trait.extremites.map((e) => `<option value="${e}" ${(o.attributs.extremites || 'aucune') === e ? 'selected' : ''}>${{ aucune: 'Aucune', pointe: 'Pointes de flèche', point: 'Points' }[e] || e}</option>`).join('')}</select></label>
          <label>Style<select name="a.style">${A.trait.styles.map((s) => `<option value="${s}" ${(o.attributs.style || 'plein') === s ? 'selected' : ''}>${{ plein: 'Plein', pointille: 'Pointillé' }[s] || s}</option>`).join('')}</select></label>
        </div>` : ''}
        ${o.sous_type === 'malt_libre' ? `<label>Longueur de la tige<input type="number" name="a.longueur_tige" value="${o.attributs.longueur_tige ?? CHARTE.malt.hauteur_trait}" step="0.5" min="${CHARTE.malt.tige_min}" max="${CHARTE.malt.tige_max}"></label>` : ''}
        ${o.sous_type === 'zone_hachuree' ? `
        <div class="ligne2">
          <label>Pas des hachures<input type="number" name="a.pas" value="${o.attributs.pas ?? A.zone.pas}" step="0.5" min="0.5"></label>
          <label>Angle (°)<input type="number" name="a.angle_deg" value="${o.attributs.angle_deg ?? A.zone.angle_deg}" step="15"></label>
        </div>
        <label>Opacité<input type="range" name="a.opacite" min="0.1" max="1" step="0.05" value="${o.attributs.opacite ?? A.zone.opacite}"></label>
        <label class="case"><input type="checkbox" name="a.remplissage" ${o.attributs.remplissage ? 'checked' : ''}> Fond coloré léger</label>` : ''}
        <div class="aide">Annotation de plan : aucune nomenclature, jamais comptée au métré, calque « Annotations ». L'échelle (poignée carrée fléchée) agit sur le trait, les pointes, le texte et les hachures ; épaisseur et taille du texte restent réglables séparément.</div>
      </section>
      <section class="bloc">
        <h3>Commentaire</h3>
        <textarea name="commentaire" rows="2">${echapper(o.commentaire || '')}</textarea>
      </section>
    </div>
    <footer class="pied-panneau">
      <button class="btn" data-action="dupliquer">Dupliquer</button>
      <button class="btn btn-danger" data-action="supprimer">Supprimer</button>
      <button class="btn btn-primaire" data-action="valider" title="Ctrl+Entrée">Valider</button>
    </footer>`;
  brancherCommun(o);
  if (memo) restaurerEtatFiche(memo);
}

/* Fiche d'un dessin : masque du fond ou aplat coloré, surligneur, pipette (v12 §8, v13.3 §4). */
function ouvrirFicheMasque(o, conserver) {
  const memo = conserver ? capturerEtatFiche() : null;
  idCourant = o.id;
  fiche.hidden = false;
  masquerAutresPanneaux();
  const M = CHARTE.masque;
  fiche.innerHTML = `
    <header class="entete-panneau">
      <h2>Dessin — ${echapper(libelleMasque(o))}</h2>
      <span class="repere">${echapper(o.repere)}</span>
      <button class="btn-icone fermer" title="Fermer (Échap)">✕</button>
    </header>
    <div class="contenu">
      <section class="bloc">
        <label>Couleur${palette('couleur', o.couleur || M.couleur_defaut, { pipette: true })}</label>
        <label>Opacité (${M.opacite_min}–1)<input type="range" name="opacite" min="${M.opacite_min}" max="1" step="0.05" value="${o.opacite ?? M.opacite_defaut}"></label>
        ${o.sous_type === 'pinceau' ? `<label>Diamètre du pinceau (${M.pinceau.diametre_min}–${M.pinceau.diametre_max} unités plan)<input type="number" name="a.diametre" value="${o.attributs.diametre ?? M.pinceau.diametre_defaut}" step="1" min="${M.pinceau.diametre_min}" max="${M.pinceau.diametre_max}"></label>` : ''}
        ${o.sous_type === 'rectangle_arrondi' ? `<label>Rayon d'angle (${M.rayon_arrondi_min}–${M.rayon_arrondi_max} unités plan, borné à la moitié du plus petit côté)<input type="number" name="a.rayon" value="${o.attributs.rayon ?? M.rayon_arrondi}" step="0.5" min="${M.rayon_arrondi_min}" max="${M.rayon_arrondi_max}"></label>` : ''}
        ${FORMES_BOITE.includes(o.sous_type) ? `<label>Rotation (°, aussi par la poignée ronde)<input type="number" name="rotation" value="${Math.round(o.rotation || 0)}" step="15"></label>` : ''}
        <label class="case"><input type="checkbox" name="a.surligneur" ${o.attributs.surligneur ? 'checked' : ''}> ${LIBELLES.dessin.surligneur}</label>
        <div class="aide">Le dessin cache une zone du fond de plan importé (mention erronée, ouvrage déposé, tampon) sans le modifier, ou pose un aplat coloré. ${o.attributs.surligneur ? '<strong>Surligneur</strong> : posé au-dessus des ouvrages, en semi-transparent, pour mettre un tracé en évidence.' : 'Dessiné sous tous les objets tracés.'} Calque « Dessins et masques » (visibilité, verrou, opacité) ; exclu du métré et de la légende. ${o.sous_type === 'pinceau' ? 'Bande à extrémités arrondies : déplaçable, non redimensionnable.' : (o.attributs.ratio_fixe ? 'Poignées de coin pour redimensionner (proportions conservées).' : 'Poignées de coin pour redimensionner.') + (o.sous_type === 'pinceau' ? '' : ' Poignée ronde pour tourner.')}</div>
        <div class="aide">Pipette : touchez un ouvrage pour reprendre sa couleur, ou le fond de plan pour prélever sa teinte (Échap annule).</div>
      </section>
      <section class="bloc">
        <h3>Commentaire</h3>
        <textarea name="commentaire" rows="2">${echapper(o.commentaire || '')}</textarea>
      </section>
    </div>
    <footer class="pied-panneau">
      <button class="btn" data-action="dupliquer">Dupliquer</button>
      <button class="btn btn-danger" data-action="supprimer">Supprimer</button>
      <button class="btn btn-primaire" data-action="valider" title="Ctrl+Entrée">Valider</button>
    </footer>`;
  brancherCommun(o);
  if (memo) restaurerEtatFiche(memo);
}

/* Fiche d'une image / photo libre (v1.4.6 §2). */
function ouvrirFicheImage(o, conserver) {
  const memo = conserver ? capturerEtatFiche() : null;
  idCourant = o.id;
  fiche.hidden = false;
  masquerAutresPanneaux();
  const K = CHARTE.image;
  const mm = (v) => String(Math.round((v / MM) * 10) / 10).replace('.', ',');
  // v1.4.7 : dimensions VISIBLES (celles du papier) ; l'image entière n'est rappelée que si elle est rognée
  const v = rectangleVisible(o);
  const rognee = !recadrageNul(o.recadrage);
  fiche.innerHTML = `
    <header class="entete-panneau">
      <h2>${o.situation ? 'Plan de situation' : 'Image / photo'}</h2>
      <span class="repere">${echapper(o.repere)}</span>
      <button class="btn-icone fermer" title="Fermer (Échap)">✕</button>
    </header>
    <div class="contenu">
      <section class="bloc">
        <div class="aide">${echapper(o.nom_fichier || 'image')} — ${mm(v.l)} × ${mm(v.h)} mm sur le papier${rognee ? ` (rognée ; image entière ${mm(o.largeur)} × ${mm(o.hauteur)} mm)` : ''}</div>
        <label>Opacité (${K.opacite_min}–1)<input type="range" name="opacite" min="${K.opacite_min}" max="1" step="0.05" value="${o.opacite ?? 1}"></label>
        <div class="ligne2">
          <label>Largeur (mm)<input name="img.largeur_mm" value="${mm(v.l)}" inputmode="decimal" autocomplete="off"></label>
          <label>Rotation (°)<input type="number" name="rotation" value="${Math.round(o.rotation || 0)}" step="15"></label>
        </div>
        <div class="boutons-image">
          <button class="btn" data-action="rogner-image" title="Rogner (C)">Rogner</button>
          <button class="btn" data-action="reinit-rognage" ${rognee ? '' : 'disabled'}>Réinitialiser le rognage</button>
          ${o.situation ? '' : '<button class="btn" data-action="remplacer-image">Remplacer l’image…</button>'}
        </div>
        ${o.situation ? htmlSituation(o) : ''}
        <div class="aide">Posée sur le fond de plan, sous les dessins et le réseau. Calque « Images et photos » (visibilité, verrou, opacité) ; exclue du métré et de la légende. Poignée ronde : rotation ; poignée carrée : taille, proportions conservées. Rognage non destructif : le fichier n’est jamais modifié.</div>
      </section>
      <section class="bloc">
        <h3>Commentaire</h3>
        <textarea name="commentaire" rows="2">${echapper(o.commentaire || '')}</textarea>
      </section>
    </div>
    <footer class="pied-panneau">
      <button class="btn" data-action="dupliquer">Dupliquer</button>
      <button class="btn btn-danger" data-action="supprimer">Supprimer</button>
      <button class="btn btn-primaire" data-action="valider" title="Ctrl+Entrée">Valider</button>
    </footer>`;
  brancherCommun(o);
  fiche.querySelector('[data-action="rogner-image"]').addEventListener('click', () => import('../outils.js').then((m) => m.entrerRognage(o.id)));
  fiche.querySelector('[data-action="reinit-rognage"]').addEventListener('click', () => import('../outils.js').then((m) => m.reinitialiserRognage(o.id)));
  if (o.situation) brancherSituation(o);
  const btRemplacer = fiche.querySelector('[data-action="remplacer-image"]');
  if (btRemplacer) btRemplacer.addEventListener('click', () => {
    const input = document.getElementById('fichier-image');
    input.value = '';
    input.onchange = async () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (!f) return;
      try {
        const prep = await preparerFichierImage(f);
        const id = await enregistrerImage(prep);   // l'ancien binaire est libéré par la purge des orphelins s'il n'est plus utilisé
        // v1.4.7 : le cadrage de l'ancienne image n'a pas de sens sur la nouvelle → recadrage remis à zéro. Image
        // rognée : la nouvelle est posée au centre et à la largeur de l'ancienne partie VISIBLE (H-251) ; sans
        // rognage, visible = entière : comportement de la v1.4.6 inchangé.
        const vis = rectangleVisible(o);
        if (!recadrageNul(o.recadrage)) { o.x = vis.cx; o.y = vis.cy; o.largeur = Math.round(vis.l * 100) / 100; }
        o.fond_id = id; o.nom_fichier = prep.nom_fichier;
        o.hauteur = Math.round(o.largeur * (prep.hauteurPx / (prep.largeurPx || 1)) * 100) / 100;
        o.recadrage = { g: 0, h: 0, d: 0, b: 0 };
        valider('Image remplacée');
      } catch (e) { notifier('Image non remplacée : ' + ((e && e.message) || e), 4000); }
    };
    input.click();
  });
  if (memo) restaurerEtatFiche(memo);
}

/* ---------- v1.5.4 (H-305) : plan de situation ---------- */
function htmlSituation(o) {
  const S = CHARTE.situation, st = o.situation;
  const d = Number(st.diametre_mm) || S.rond.diametre_mm;
  const emprise = (z) => Math.round(metresParPixel(st.lat, z) * S.largeur_px / 10) * 10;
  const km = (m) => (m >= 1000 ? String(Math.round(m / 100) / 10).replace('.', ',') + ' km' : m + ' m');
  const niveaux = [];
  for (let z = S.zoom_min; z <= S.zoom_max; z++) niveaux.push(`<option value="${z}" ${z === st.zoom ? 'selected' : ''}>Niveau ${z} — carte de ${km(emprise(z))} de large</option>`);
  const gpsAffaire = formaterGps(etat.projet && etat.projet.gps);
  const gpsCarte = formaterGps({ lat: st.lat, lon: st.lon });
  return `
    <h3>Point GPS</h3>
    <div class="ligne2">
      <label>Diamètre du rond (mm)<input type="number" name="sit.diametre_mm" value="${d}" min="${S.rond.diametre_min_mm}" max="${S.rond.diametre_max_mm}" step="0.5" inputmode="decimal"></label>
      <label>&nbsp;<input type="range" name="sit.diametre_mm" value="${d}" min="${S.rond.diametre_min_mm}" max="${Math.min(30, S.rond.diametre_max_mm)}" step="0.5" aria-label="Diamètre du rond"></label>
    </div>
    <label>Échelle de la carte<select name="sit.zoom">${niveaux.join('')}</select></label>
    <div class="boutons-image">
      <button class="btn" data-action="maj-situation">Retélécharger la carte${gpsAffaire && gpsAffaire !== gpsCarte ? ' (nouveau point GPS)' : ''}</button>
    </div>
    <div class="aide">Carte centrée sur ${echapper(gpsCarte)} (Plan IGN, ${echapper(st.date || '')}).${gpsAffaire && gpsAffaire !== gpsCarte ? ` <strong>Le point GPS de l’affaire a changé (${echapper(gpsAffaire)}) : retélécharger la carte.</strong>` : ''} Changer d’échelle ou retélécharger demande une connexion ; ensuite la carte reste disponible hors ligne. Taille de la carte : largeur ci-dessus ou poignée carrée.</div>`;
}

let situationMaj = false;
async function regenererSituation(o, zoom) {
  if (situationMaj) return;
  situationMaj = true;
  try {
    notifier('Téléchargement de la carte IGN…', 2500);
    const gps = String(etat.projet && etat.projet.gps || '').trim() || { lat: o.situation.lat, lon: o.situation.lon };
    const carte = await genererCarteSituation(gps, zoom ?? o.situation.zoom);
    const id = await enregistrerImage(carte);   // l'ancien binaire est libéré par la purge des orphelins
    const vis = rectangleVisible(o);
    if (!recadrageNul(o.recadrage)) { o.largeur = Math.round(vis.l * 100) / 100; }
    o.fond_id = id; o.nom_fichier = carte.nom_fichier;
    o.hauteur = Math.round(o.largeur * (carte.hauteurPx / (carte.largeurPx || 1)) * 100) / 100;
    o.recadrage = { g: 0, h: 0, d: 0, b: 0 };
    o.situation = { ...o.situation, lat: carte.lat, lon: carte.lon, zoom: carte.zoom, date: new Date().toISOString().slice(0, 10) };
    valider('Plan de situation mis à jour');
    notifier('Carte mise à jour', 1800);
  } catch (e) {
    notifier('Carte non mise à jour : ' + ((e && e.message) || e), 4500);
    ouvrirFiche(o.id, { conserver: true });
  } finally { situationMaj = false; }
}

function brancherSituation(o) {
  const b = fiche.querySelector('[data-action="maj-situation"]');
  if (b) b.addEventListener('click', () => regenererSituation(o, null));
}

function brancherCommun(o) {
  fiche.querySelector('.fermer').addEventListener('click', fermerFiche);
  fiche.querySelectorAll('select, input, textarea').forEach((el) => el.addEventListener('change', () => appliquerChamp(o, el)));
  brancherPalettes(o);
  fiche.querySelector('[data-action="dupliquer"]').addEventListener('click', () => { selectionner([o.id]); import('../outils.js').then((m) => m.dupliquerSelection()); });
  fiche.querySelector('[data-action="supprimer"]').addEventListener('click', () => { selectionner([o.id]); import('../outils.js').then((m) => { m.supprimerSelection(); fermerFiche(); }); });
  fiche.querySelector('[data-action="valider"]').addEventListener('click', () => { fermerFiche(); notifier('Fiche validée'); });
}

function brancherPalettes(o) {
  brancherDeclencheurs(fiche);
  const bc = fiche.querySelector('[data-action="couleur-charte"]');
  if (bc) bc.addEventListener('click', () => { delete o.couleur_manuelle; valider('Couleur de la charte'); ouvrirFiche(o.id, { conserver: true }); });
  fiche.querySelectorAll('[data-action="reinit-bloc"]').forEach((b) => b.addEventListener('click', () => import('../outils.js').then((m) => m.reinitialiserAspectBloc(o.id, b.dataset.bloc))));
}

/* ---------- Champs propres à chaque type ---------- */
function opt(valeurs, courant, { libelles = null, vide = '—' } = {}) {
  const liste = valeurs.map((v) => `<option value="${echapper(v)}" ${String(v) === String(courant ?? '') ? 'selected' : ''}>${echapper(libelles ? libelles[v] ?? v : (v === '' ? vide : v))}</option>`);
  const present = valeurs.some((v) => String(v) === String(courant ?? ''));
  if (!present && courant !== null && courant !== undefined && courant !== '') liste.unshift(`<option value="${echapper(courant)}" selected>${echapper(courant)} (libre)</option>`);
  liste.push(`<option value="__libre__">Autre…</option>`);
  return liste.join('');
}

/* Liste des efforts d'un support (v1.5.0 §1) : efforts anciens hors marché (existant / à déposer / à remplacer, béton D)
 * dans un groupe placé AVANT ceux de la nomenclature, ordre croissant dans chaque groupe ; « Autre… » conservé. Sans
 * effort ancien applicable, la liste est exactement celle de opt() (comportement v1.4.9). */
function optEfforts(efforts, anciens, courant) {
  if (!anciens.length) return opt(['', ...efforts], courant);
  const sel = (v) => (String(v) === String(courant ?? '') ? 'selected' : '');
  const liste = [`<option value="" ${sel('')}>—</option>`];
  const tous = [...anciens, ...efforts];
  if (courant !== null && courant !== undefined && courant !== '' && !tous.some((v) => String(v) === String(courant))) liste.push(`<option value="${echapper(courant)}" selected>${echapper(courant)} (libre)</option>`);
  liste.push(`<optgroup label="Anciens — hors marché">${anciens.map((v) => `<option value="${v}" ${sel(v)}>${v}</option>`).join('')}</optgroup>`);
  liste.push(`<optgroup label="Nomenclature">${efforts.filter((v) => !anciens.includes(v)).map((v) => `<option value="${v}" ${sel(v)}>${v}</option>`).join('')}</optgroup>`);
  liste.push('<option value="__libre__">Autre…</option>');
  return liste.join('');
}

/* Liste d'armements : valeur = id d'article, libellé = forme longue de charte.LIBELLES_FICHE. */
function optionsArmement(o) {
  const a = o.attributs;
  const articles = etat.nomenclature.articles.filter((x) => x.categorie === (o.domaine === 'HTA' ? 'ARMEMENT_HTA' : 'ARMEMENT_BT'));
  const liste = [`<option value="" ${!a.armement ? 'selected' : ''}>—</option>`];
  if (a.armement && !a.armement_ref) liste.push(`<option value="__courant__" selected>${echapper(a.armement)} (libre)</option>`);
  for (const art of articles) liste.push(`<option value="${art.id}" ${a.armement_ref === art.id ? 'selected' : ''}>${echapper(libelleFicheArticle(art))}</option>`);
  liste.push('<option value="__libre__">Autre…</option>');
  return liste.join('');
}

/* Liste d'articles ECLAIRAGE_PUBLIC pour les lanternes et boucles EP (v12 §7). */
function optionsArticleEp(o) {
  const liste = N.articlesEclairagePublic(N.statutPourEtat(o.etat));
  if (o.ref_article && !liste.some((a) => a.id === o.ref_article)) { const a = N.articleParId(o.ref_article); if (a) liste.unshift(a); }
  return `<option value="" ${!o.ref_article ? 'selected' : ''}>—</option>` + liste.map((a) => `<option value="${a.id}" ${o.ref_article === a.id ? 'selected' : ''}>${echapper(a.libelle)}</option>`).join('');
}

function rendreSpecifique(o) {
  const z = fiche.querySelector('#fiche-specifique');
  const a = o.attributs;
  switch (o.type) {
    case 'support': {
      const materiaux = N.materiauxSupports();
      const libMat = TYPES_SUPPORT.fiche;
      const hauteurs = a.materiau ? N.hauteursSupports(a.materiau) : [];
      const classes = a.materiau ? N.classesSupports(a.materiau, a.hauteur_m) : [];
      const efforts = a.materiau ? N.effortsSupports(a.materiau, a.hauteur_m, a.classe) : [];
      const effortsAnciens = a.materiau ? N.effortsHorsMarche(a.materiau, a.classe, { etat: o.etat }) : [];   // v1.5.0 §1
      const F = CHARTE.texte.format_angle;
      const angleEnEvidence = a.fonction === 'ANGLE';
      const facade = supportSansCaracteristiques(a.materiau);   // v1.4.8 : console / ancrage en façade
      const blocAngle = `
        <div class="ligne2 ${angleEnEvidence ? 'en-evidence' : ''}">
          <label>Angle (grades, ${F.min}–${F.max}, une décimale)<input name="a.angle_gr" value="${a.angle_gr === null || a.angle_gr === undefined ? '' : String(a.angle_gr).replace('.', ',')}" inputmode="decimal" placeholder="Ex. 45 ou 12,5" autocomplete="off"></label>
          <div class="aide">${a.angle_gr !== null && a.angle_gr !== undefined ? 'Étiquette : ' + echapper(formaterAngle(a.angle_gr)) : (angleEnEvidence ? 'Support d’angle : renseignez l’angle en grades.' : 'Ligne « φ = … gr » sous la désignation ; un support d’arrêt peut porter un angle résiduel.')}</div>
        </div>`;
      const blocFonction = `<label>Fonction<select name="a.fonction">${FONCTIONS.map((f) => `<option value="${f}" ${a.fonction === f ? 'selected' : ''}>${f ? f.replace(/_/g, ' ').toLowerCase() : '—'}</option>`).join('')}</select></label>`;
      if (facade) {
        const typesA = a.materiau === 'ANCRAGE' ? N.typesAncrage(o.domaine) : [];
        if (a.armement_ref && a.materiau === 'ANCRAGE' && !typesA.some((x) => x.id === a.armement_ref)) { const art = N.articleParId(a.armement_ref); if (art) typesA.unshift(art); }
        z.innerHTML = `
        <h3>Support</h3>
        <label>Matériau / type<select name="a.materiau">${opt(['', ...materiaux], a.materiau, { libelles: libMat })}</select></label>
        ${a.materiau === 'ANCRAGE' ? `<label>Type d'ancrage<select name="a.type_ancrage"><option value="" ${!a.armement_ref ? 'selected' : ''}>—</option>${typesA.map((x) => `<option value="${x.id}" ${a.armement_ref === x.id ? 'selected' : ''}>${echapper(libelleFicheArticle(x))}</option>`).join('')}</select></label>
        <div class="aide">${a.armement_ref ? 'Article ' + echapper(a.armement_ref) + '.' : '<strong>Type d’ancrage à renseigner</strong> : l’objet reste « à compléter » tant qu’il est vide.'}</div>` : '<div class="aide">Console de façade : ni hauteur, ni classe, ni effort, ni renforcement.</div>'}
        <div class="ligne2">${blocFonction}</div>
        ${blocAngle}`;
        break;
      }
      z.innerHTML = `
        <h3>Support</h3>
        <label>Matériau / type<select name="a.materiau">${opt(['', ...materiaux], a.materiau, { libelles: libMat })}</select></label>
        ${!a.materiau ? `<div class="aide">Métallique : ${materiauMetalliqueParDefaut(o.etat) === 'ME_TUB' ? 'ME tub proposé pour un support neuf' : 'ME ptr proposé pour un support existant'}.</div>` : ''}
        <div class="ligne2">
          <label>Hauteur (m)<select name="a.hauteur_m" ${!a.materiau ? 'disabled' : ''}>${opt(['', ...hauteurs], a.hauteur_m)}</select></label>
          <label>Classe<select name="a.classe" ${!a.materiau || (a.materiau !== 'BETON' && a.materiau !== 'BOIS' && !classes.length) ? 'disabled' : ''}>${opt(['', ...classes], a.classe)}</select></label>
        </div>
        <div class="ligne2">
          <label>Effort (daN)<select name="a.effort_daN" ${!a.materiau || a.materiau === 'BOIS' ? 'disabled' : ''}>${optEfforts(efforts, effortsAnciens, a.effort_daN)}</select></label>
          ${blocFonction}
        </div>
        ${blocAngle}
        <div class="ligne2">
          <label>Renforcement<select name="a.renforcement">${RENFORCEMENTS.map(([k, l]) => `<option value="${k}" ${a.renforcement === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Sens du renforcement (°)<input type="number" name="a.angle_renforcement" value="${a.angle_renforcement || 0}" step="15" ${a.renforcement === 'AUCUN' || a.renforcement === 'JUMELE' ? 'disabled' : ''}></label>
        </div>
        <label>Armement<select name="a.armement_ref">${optionsArmement(o)}</select></label>`;
      break;
    }
    case 'coffret': {
      const sig = N.sigles(['COFFRET_BT', 'ECLAIRAGE_PUBLIC']).map((s) => s.sigle);
      const plages = N.plagesRembt(a.sigle);
      const grilles = N.grillesCibe(a.section_reseau);
      z.innerHTML = `
        <h3>Coffret / borne</h3>
        <label>Sigle<select name="a.sigle">${opt(['', ...sig], a.sigle)}</select></label>
        <div class="ligne2">
          <label>Nombre de plages<input type="number" name="a.nb_plages" value="${a.nb_plages ?? ''}" min="0"></label>
          <label>Section du réseau entrant<input name="a.section_reseau" value="${echapper(a.section_reseau)}" placeholder="Ex. 3x150+70"></label>
        </div>
        ${plages ? `<div class="aide">${echapper(a.sigle)} : ${plages} plages selon la nomenclature.</div>` : ''}
        ${grilles.length ? `<div class="aide">Grilles CIBE conseillées : ${grilles.map(echapper).join(', ')}.</div>` : ''}`;
      break;
    }
    case 'poste': {
      const sig = N.sigles(['POSTE', 'COUPURE_HTA']).map((s) => s.sigle);
      z.innerHTML = `
        <h3>Poste / coupure HTA</h3>
        <label>Sigle<select name="a.sigle">${opt(['', ...sig], a.sigle)}</select></label>
        <label>Puissance (kVA)<input type="number" name="a.puissance_kva" value="${a.puissance_kva ?? ''}" min="0"></label>
        <label>Nom du poste (facultatif, descriptif)<input name="a.nom" value="${echapper(a.nom || '')}" placeholder="Ex. SUALI" autocomplete="off"></label>`;
      break;
    }
    case 'boite_jonction':
      z.innerHTML = `<h3>Boîte de jonction</h3>
        <label>Sections raccordées (texte court, ex. 150/150, 95/150, 240/95)<input name="a.sections" value="${echapper(a.sections)}" placeholder="Ex. 150/150"></label>
        <div class="aide">Affiché sur la ligne de désignation : « BJ ${echapper(LIBELLES.domaines[o.domaine] || o.domaine)}${a.sections ? ' ' + echapper(a.sections) : ' 150/150'} ». Vide : rien n'est ajouté. La mention libre reste la dernière ligne du bloc.</div>`;
      break;
    case 'malt': {
      const aide = N.aideMalt();
      const K = CHARTE.malt;
      z.innerHTML = `<h3>MALT</h3>
        <div class="ligne2">
          <label>Longueur de la tige (${K.tige_min} à ${K.tige_max})<input type="number" name="a.longueur_tige" value="${a.longueur_tige ?? K.hauteur_trait}" min="${K.tige_min}" max="${K.tige_max}" step="0.5"></label>
          <label>Convention / repère<input name="a.convention" value="${echapper(a.convention)}"></label>
        </div>
        <div class="aide">Étiquette : « ${echapper(o.etat === 'a_poser' ? MALT_CONDENSE.objet_a_poser : MALT_CONDENSE.objet_autre + suffixeEtat(o))} » (une seule ligne). ${o.etat === 'a_poser' ? 'Les articles du package MALT sont au matériel associé.' : 'MALT existante : aucun article.'} La tige s'étire avec la poignée en losange au pied du symbole.</div>
        ${aide ? `<div class="aide">${echapper(aide.convention)}<br>Systématique : ${aide.systematique.map(echapper).join(', ')}.<br>Jamais : ${aide.jamais.map(echapper).join(', ')}.</div>` : ''}`;
      break;
    }
    case 'eras': {
      const K = CHARTE.eras;
      const regle = a.malt_regle === undefined ? maltApplicable(o) : a.malt_regle;
      const art = o.ref_article ? N.articleParId(o.ref_article) : null;
      const incompatible = articleIncompatible(o);
      z.innerHTML = `<h3>ERAS / RAS</h3>
        <label>Type<select name="a.sous_type">${[['BT_RESEAU', 'ERAS BT réseau'], ['HTA', 'ERAS HTA'], ['BRANCHEMENT', 'RAS branchement'], ['EP', 'RAS éclairage public']].map(([k, l]) => `<option value="${k}" ${a.sous_type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${art ? `<div class="aide">Article : ${echapper(art.libelle)}${incompatible ? ' — <strong>réseau de l’article (' + echapper(LIBELLES_DOMAINE[art.attributs.domaine] || art.attributs.domaine) + ') différent de celui de l’objet (' + echapper(LIBELLES_DOMAINE[o.domaine] || o.domaine) + ')</strong> : article conservé, objet « à compléter »' : ''}</div>` : ''}
        <label class="case"><input type="checkbox" name="a.avec_malt" ${a.avec_malt ? 'checked' : ''}> Avec MALT${regle === 'oui' ? ' (systématique en BT réseau et HTA)' : (regle === 'non' ? ' — hors règle : pas de MALT sur une remontée BRT / EP' : ' (cas non couvert par la nomenclature)')}</label>
        ${regle === 'non' && !a.avec_malt ? `<div class="aide">Pas de MALT sur une remontée de branchement ni d'éclairage public${art && art.attributs && art.attributs.note ? ' — ' + echapper(art.attributs.note) : ''}. Une MALT cochée ici à la main est conservée et signalée « à compléter ».</div>` : ''}
        ${a.avec_malt && regle !== 'oui' ? `<div class="aide"><strong>MALT ajoutée à la main${regle === 'non' ? ' sur une remontée BRT/EP' : ' hors règle'}</strong> : conservée telle quelle, jamais retirée en silence ; l’objet reste « à compléter » tant qu’elle est cochée.</div>` : ''}
        ${a.avec_malt ? `<label>Longueur de la tige de MALT (${K.tige_min} à ${K.tige_max})<input type="number" name="a.longueur_tige" value="${a.longueur_tige ?? K.tige_defaut}" min="${K.tige_min}" max="${K.tige_max}" step="0.5"></label>
        <div class="aide">La tige part du centre du rond et s'allonge vers le bas du symbole (poignée en losange) ; agrandir le rond ne la rallonge pas.</div>` : ''}`;
      break;
    }
    case 'point_lumineux':
      z.innerHTML = `<h3>Point lumineux</h3><label>Implanté sur<select name="a.sur"><option value="SUPPORT" ${a.sur === 'SUPPORT' ? 'selected' : ''}>Support réseau</option><option value="MAT" ${a.sur === 'MAT' ? 'selected' : ''}>Mât EP</option></select></label>`;
      break;
    case 'armoire_ep':
      z.innerHTML = `<h3>Armoire EP</h3><label>Sigle<input name="a.sigle" value="${echapper(a.sigle)}"></label>`;
      break;
    case 'lanterne_ep':
      z.innerHTML = `<h3>Lanterne EP</h3>
        <label>Article (nomenclature ÉCLAIRAGE PUBLIC${N.statutPourEtat(o.etat) ? ', marché' : ''})<select name="article_ep">${optionsArticleEp(o)}</select></label>
        <label>Implantée sur<select name="a.sur"><option value="SUPPORT" ${a.sur === 'SUPPORT' ? 'selected' : ''}>Support réseau</option><option value="MAT" ${a.sur === 'MAT' ? 'selected' : ''}>Mât EP</option><option value="FACADE" ${a.sur === 'FACADE' ? 'selected' : ''}>Façade</option></select></label>
        <div class="aide">Ouvrage du réseau EP (rose à poser, violet existant) : compté au métré du lot 3 par son article, présent en légende. Orientation par la poignée ronde, taille par la poignée carrée.</div>`;
      break;
    case 'boucle_ep':
      z.innerHTML = `<h3>Boucle EP</h3>
        <label>Article (nomenclature ÉCLAIRAGE PUBLIC${N.statutPourEtat(o.etat) ? ', marché' : ''})<select name="article_ep">${optionsArticleEp(o)}</select></label>
        <div class="aide">Boucle de câble figurée sur le tracé ou sur le support ; ouvrage EP compté au métré du lot 3 par son article.</div>`;
      break;
    case 'fourreau': {
      const liste = N.fourreaux().filter((f) => !N.statutPourEtat(o.etat) || f.article.statut === N.statutPourEtat(o.etat) || f.article.id === o.ref_article);
      const parent = o.troncon_id ? objets().find((x) => x.id === o.troncon_id) : null;
      const chev = fourreauChevauche(o, objets());
      z.innerHTML = `
        <h3>Fourreau</h3>
        <label>Article (nomenclature FOURREAU)<select name="fourreau_article"><option value="">—</option>${liste.map((f) => `<option value="${f.article.id}" ${o.ref_article === f.article.id ? 'selected' : ''}>${echapper(f.article.libelle)}</option>`).join('')}<option value="__libre__">Autre (notation libre)…</option></select></label>
        <div class="ligne2">
          <label>Nombre de fourreaux<input type="number" name="a.nombre" value="${a.nombre ?? 1}" min="1" step="1"></label>
          <label>Longueur (m)<input type="number" name="a.longueur_m" value="${a.longueur_m ?? ''}" min="0" step="0.5" placeholder="Saisie ; calcul au lot 3"></label>
        </div>
        <label class="case"><input type="checkbox" name="a.afficher_longueur" ${a.afficher_longueur !== false ? 'checked' : ''}> Longueur sur l'étiquette</label>
        <div class="aide">${a.notation ? 'Notation : ' + echapper(a.notation) + ' · ' : ''}${parent ? 'accroché au tronçon ' + echapper(parent.repere) + ' de ' + Math.round(Math.min(o.s_debut, o.s_fin) * 100) + ' % à ' + Math.round(Math.max(o.s_debut, o.s_fin) * 100) + ' % du développé (suit le tracé)' : 'fourreau seul (' + o.points.length + ' sommets)'}${chev ? ' · <strong>chevauche un autre fourreau</strong>' : ''}.</div>
        ${parent ? '<button class="btn" data-action="detacher">Détacher du tronçon (géométrie figée)</button>' : ''}`;
      break;
    }
    case 'troncon': {
      const listeSections = N.sectionsCables(o.domaine, o.pose, o.etat);   // v1.4.9 §6 : « Nu < / ≥ 22 mm² » selon réseau, pose et état
      const sections = listeSections.map((s) => s.section);
      const nu = SECTIONS_BT_NUS.find((x) => x.section === a.section);
      const fourreaux = N.fourreaux().map((f) => f.notation);
      const souterrain = o.pose === 'souterrain';
      const idDerive = articleSectionsDerivees(o);
      const choix = idDerive ? SECTIONS_DERIVEES[idDerive] : null;
      z.innerHTML = `
        <h3>Tronçon</h3>
        <label>Section / câble<select name="a.section">${opt(['', ...sections], a.section)}</select></label>
        ${choix ? `<div class="aide">Cet article du marché regroupe deux sections (même prix, même ligne de BPU). Choisissez la section réellement posée : l'étiquette n'affiche que celle-ci, l'article de métré reste ${idDerive}.</div>
        <div class="chips" data-champ="section_retenue">${choix.map((c) => `<button class="chip ${a.section_retenue === c ? 'actif' : ''}" data-valeur="${echapper(c)}">${echapper(c)}</button>`).join('')}</div>
        ${!sectionAffichee(o) ? '<div class="aide"><strong>Section à retenir</strong> : l’objet reste « à compléter » tant qu’aucune n’est choisie.</div>' : ''}` : ''}
        ${o.domaine === 'BTS' && a.section && !nu ? aideNeutreSection(a.section) : ''}
        ${nu ? `<div class="aide">Conducteurs nus : section sans article de câble.${o.etat === 'a_deposer' ? ' Dépose au marché : ' + nu.article_depose + ' (à ajouter par la bibliothèque, rien n’est ajouté automatiquement).' : ''}${sectionNuHorsDomaine(o) ? ' <strong>Réservée à la BT aérienne existante, à déposer ou à remplacer</strong> : objet « à compléter ».' : ''}</div>` : ''}
        ${o.domaine === 'EP' && souterrain && !sectionAffichee(o) ? `<div class="aide">Section non renseignée : désignation « ${echapper(o.etat === 'a_poser' ? CHARTE.DESIGNATIONS_DEFAUT.ep_souterrain_a_poser : CHARTE.DESIGNATIONS_DEFAUT.ep_souterrain)} » (valable, pas un manque). Choisir une section la remplace.</div>` : ''}
        <div class="ligne2">
          <label>Nature<input name="a.nature" value="${echapper(a.nature)}" placeholder="Ex. torsadé, HN 33-S-33"></label>
          <label>Norme<input name="a.norme" value="${echapper(a.norme)}"></label>
        </div>
        <div class="ligne2">
          <label>Longueur (m)<input type="number" name="a.longueur_m" value="${a.longueur_m ?? ''}" min="0" step="0.5" placeholder="Saisie ; calcul au lot 3"></label>
          <label class="case"><input type="checkbox" name="a.afficher_longueur" ${a.afficher_longueur !== false ? 'checked' : ''}> Longueur sur l'étiquette</label>
        </div>
        ${souterrain ? `
        <label>Fourreau<select name="a.fourreau">${opt(['', ...fourreaux], a.fourreau)}</select></label>
        ${revetementsHtml(o)}
        <label>Profondeur (m)<input type="number" name="a.profondeur_m" value="${a.profondeur_m ?? ''}" step="0.1" min="0"></label>
        <div class="ligne2">
          <label class="case"><input type="checkbox" name="a.grillage_avertisseur" ${a.grillage_avertisseur ? 'checked' : ''}> Grillage avertisseur</label>
          <label class="case"><input type="checkbox" name="a.tranchee_commune" ${a.tranchee_commune ? 'checked' : ''}> Tranchée commune</label>
        </div>` : `<div class="aide">Fourreau, nature du terrain, profondeur et grillage avertisseur ne s'affichent qu'en pose souterraine${a.fourreau ? ' (fourreau saisi conservé : ' + echapper(a.fourreau) + ')' : ''}.</div>`}
        <div class="aide">${o.points.length} sommets. Le repère du tronçon (en tête de fiche) n'est jamais affiché sur le plan.</div>`;
      z.querySelectorAll('[data-champ="section_retenue"] .chip').forEach((b) => b.addEventListener('click', () => { o.attributs.section_retenue = b.dataset.valeur; valider('Section retenue'); }));
      brancherRevetements(o, z);
      break;
    }
    default:
      z.innerHTML = '';
  }
}

/* ---------- v1.5.1 : revêtements d'un tronçon souterrain ----------
 * Plusieurs revêtements, chacun avec son linéaire (ml). Un seul revêtement sans linéaire = toute la longueur.
 * `nature_terrain` reste égal à la nature du premier revêtement (compatibilité). Champs sans attribut `name` :
 * ils échappent à la liaison générique de la fiche et sont validés ici. */
function revetementsHtml(o) {
  const a = o.attributs;
  const liste = Array.isArray(a.revetements) ? a.revetements : [];
  const opts = (v) => NATURES_TERRAIN.filter(Boolean).map((n) => `<option value="${n}" ${v === n ? 'selected' : ''}>${CHARTE.descriptif.natures_terrain[n] || n}</option>`).join('');
  const lignes = liste.map((r, i) => `
    <div class="ligne-revetement" data-rev="${i}">
      <select data-rev-champ="nature" aria-label="Revêtement ${i + 1}"><option value="">—</option>${opts(r.nature)}</select>
      <input type="number" data-rev-champ="longueur_m" value="${r.longueur_m ?? ''}" min="0" step="0.5" inputmode="decimal" placeholder="${liste.length === 1 ? 'tout le tronçon' : 'ml'}" aria-label="Linéaire du revêtement ${i + 1} (ml)">
      <button type="button" class="btn-icone" data-rev-action="retirer" title="Retirer ce revêtement" tabindex="-1">✕</button>
    </div>`).join('');
  const lt = a.longueur_m === null || a.longueur_m === undefined || a.longueur_m === '' ? null : Number(a.longueur_m);
  const avecL = liste.filter((r) => r.longueur_m !== null && r.longueur_m !== undefined && r.longueur_m !== '');
  const somme = Math.round(avecL.reduce((x, r) => x + Number(r.longueur_m), 0) * 100) / 100;
  let aide = '';
  if (liste.length > 1 && avecL.length < liste.length) aide = '<div class="aide alerte-desc">Linéaire manquant : chaque revêtement doit avoir son linéaire.</div>';
  else if (avecL.length && lt !== null && Math.abs(somme - lt) > 0.05) aide = `<div class="aide alerte-desc">Somme des revêtements ${String(somme).replace('.', ',')} ml ≠ longueur du tronçon ${String(lt).replace('.', ',')} ml.</div>`;
  else if (avecL.length) aide = `<div class="aide">Somme des revêtements : ${String(somme).replace('.', ',')} ml.</div>`;
  return `<div class="bloc-revetements">
    <div class="titre-revetements">Revêtements</div>
    ${lignes || '<p class="vide">Aucun revêtement.</p>'}
    <button type="button" class="chip petit" data-rev-action="ajouter">+ Revêtement</button>
    ${aide}
  </div>`;
}

function brancherRevetements(o, z) {
  const a = o.attributs;
  const liste = () => { if (!Array.isArray(a.revetements)) a.revetements = []; return a.revetements; };
  const synchroniser = () => { a.nature_terrain = (liste().find((r) => r.nature) || {}).nature || ''; };
  z.querySelectorAll('.ligne-revetement').forEach((ligne) => {
    const i = Number(ligne.dataset.rev);
    ligne.querySelectorAll('[data-rev-champ]').forEach((el) => el.addEventListener('change', () => {
      const r = liste()[i];
      if (!r) return;
      if (el.dataset.revChamp === 'nature') r.nature = el.value;
      else r.longueur_m = el.value === '' ? null : Math.max(0, Number(String(el.value).replace(',', '.')));
      synchroniser();
      valider('Revêtement');
    }));
    const b = ligne.querySelector('[data-rev-action="retirer"]');
    if (b) b.addEventListener('click', () => { liste().splice(i, 1); synchroniser(); valider('Revêtement retiré'); });
  });
  const ajout = z.querySelector('[data-rev-action="ajouter"]');
  if (ajout) ajout.addEventListener('click', () => {
    const l = liste();
    // le revêtement « tout le tronçon » devient chiffré dès qu'un second est ajouté
    if (l.length === 1 && (l[0].longueur_m === null || l[0].longueur_m === undefined) && a.longueur_m !== null && a.longueur_m !== undefined) l[0].longueur_m = Number(a.longueur_m);
    l.push({ nature: '', longueur_m: null });
    synchroniser();
    valider('Revêtement ajouté');
    setTimeout(() => { const s = fiche.querySelector(`.ligne-revetement[data-rev="${l.length - 1}"] select`); if (s) s.focus(); }, 0);
  });
}

function aideNeutreSection(section) {
  const s = N.neutrePorteurConseille(section);
  return s ? `<div class="aide">Faisceau ${echapper(section)} : armement neutre porteur ${s} conseillé.</div>` : '';
}

/* ---------- Matériel associé (mise à jour ciblée, v13 §4) ----------
 * La liste, les commandes MALT et l'option de détail sont redessinées seules ; les boutons ▲ ▼ ✕ sont hors du
 * parcours Tab (tabindex -1) : depuis une quantité, Tab passe à la quantité de la ligne suivante. */
function rendreMateriel(o) {
  const z = fiche.querySelector('.liste-materiel');
  if (!z) return;
  const n = o.materiel_associe.length;
  z.innerHTML = !n ? '<p class="vide">Aucun matériel associé.</p>' : o.materiel_associe.map((m, i) => `
    <div class="ligne-materiel" data-i="${i}">
      <input type="number" class="qte" value="${m.quantite ?? 1}" min="0" step="1" title="Quantité (Tab : ligne suivante)">
      <span class="lib" title="${echapper(m.libelle)}">${echapper(m.libelle)}${m.unite ? ' <small>' + echapper(m.unite) + '</small>' : ''}${m.source === 'LIBRE' ? ' <small>(libre)</small>' : ''}${m.package ? ' <small>[' + echapper(m.package) + ']</small>' : ''}</span>
      <span class="ordre">
        <button class="btn-icone" data-action="monter" title="Monter" tabindex="-1" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn-icone" data-action="descendre" title="Descendre" tabindex="-1" ${i === n - 1 ? 'disabled' : ''}>▼</button>
      </span>
      <button class="btn-icone" data-action="retirer" title="Retirer" tabindex="-1">✕</button>
    </div>`).join('');
  const index = (el) => parseInt(el.closest('.ligne-materiel').dataset.i, 10);
  z.querySelectorAll('.qte').forEach((inp) => {
    inp.addEventListener('change', () => {
      const i = index(inp);
      o.materiel_associe[i].quantite = inp.value === '' ? null : Number(inp.value);
      o.materiel_associe[i].quantite_saisie = inp.value !== '';   // quantité explicite : affichée même si 1
      validerListe(o, 'Quantité', 'm:' + i + ':qte');
    });
    // Entrée sur une quantité : valide et passe à la ligne suivante, comme Tab
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const i = index(inp); const suivant = z.querySelector(`.ligne-materiel[data-i="${i + 1}"] .qte`); if (suivant) suivant.focus(); else inp.blur(); } });
  });
  z.querySelectorAll('[data-action="retirer"]').forEach((b) => b.addEventListener('click', () => { const i = index(b); o.materiel_associe.splice(i, 1); validerListe(o, 'Matériel retiré', 'm:' + Math.min(i, o.materiel_associe.length - 1) + ':qte'); }));
  z.querySelectorAll('[data-action="monter"]').forEach((b) => b.addEventListener('click', () => { const i = index(b); if (i > 0) { [o.materiel_associe[i - 1], o.materiel_associe[i]] = [o.materiel_associe[i], o.materiel_associe[i - 1]]; validerListe(o, 'Ordre du matériel', 'm:' + (i - 1) + ':qte'); } }));
  z.querySelectorAll('[data-action="descendre"]').forEach((b) => b.addEventListener('click', () => { const i = index(b); if (i < n - 1) { [o.materiel_associe[i + 1], o.materiel_associe[i]] = [o.materiel_associe[i], o.materiel_associe[i + 1]]; validerListe(o, 'Ordre du matériel', 'm:' + (i + 1) + ':qte'); } }));
  // Commandes MALT (bascules) et option de détail : dépendent de la liste
  const ponctuel = o.type !== 'troncon' && o.type !== 'fourreau';
  const zm = fiche.querySelector('.commandes-malt');
  if (zm) {
    zm.innerHTML = ponctuel && o.type !== 'malt' ? commandesMaltHtml(o) : '';
    zm.querySelectorAll('[data-malt]').forEach((b) => b.addEventListener('click', () => import('../outils.js').then((m) => {
      majCiblee = { focus: 'k:' + b.dataset.malt };
      if (b.dataset.malt === 'ex') m.basculerMaltExistante([o.id]);
      else if (o.materiel_associe.some((x) => x.package === 'MALT')) m.retirerConfectionMalt([o.id]);
      else m.ajouterConfectionMalt([o.id]);
      majCiblee = null;
    })));
    const cs = zm.querySelector('[data-malt-symbole]');
    if (cs) cs.addEventListener('change', () => {
      if (cs.checked) assurerSymboleMalt(o);
      else if (o.malt_symbole) o.malt_symbole.visible = false;
      validerListe(o, cs.checked ? 'Symbole MALT affiché' : 'Symbole MALT masqué', null);
    });
    // v1.5.2 : orientation et longueur au clavier (la longueur est bornée au rendu : jamais sous le symbole de l'ouvrage)
    zm.querySelectorAll('[data-malt-champ]').forEach((inp) => inp.addEventListener('change', () => {
      if (!o.malt_symbole) return;
      const v = inp.value === '' ? null : Number(String(inp.value).replace(',', '.'));
      if (inp.dataset.maltChamp === 'angle') o.malt_symbole.angle = v === null || !Number.isFinite(v) ? 0 : ((Math.round(v) % 360) + 360) % 360;
      else o.malt_symbole.longueur_tige = v === null || !Number.isFinite(v) ? null : Math.min(CHARTE.malt.tige_max, Math.max(0, v));
      validerListe(o, 'MALT orientée', null);
    }));
  }
  const zd = fiche.querySelector('.option-detail-malt');
  if (zd) {
    zd.innerHTML = (o.materiel_associe || []).some((m) => m.package === 'MALT') ? `<label class="case"><input type="checkbox" name="detail_malt" ${o.etiquette.detail_malt ? 'checked' : ''}> Détailler le matériel MALT sur le plan (sinon : une seule ligne « ${MALT_CONDENSE.confection} »)</label>` : '';
    const c = zd.querySelector('[name="detail_malt"]');
    if (c) c.addEventListener('change', () => { o.etiquette.detail_malt = c.checked; validerListe(o, 'Détail MALT', 'n:detail_malt'); });
  }
}

/* ---------- Liaison des champs ---------- */
function brancher(o) {
  fiche.querySelector('.fermer').addEventListener('click', fermerFiche);
  fiche.querySelectorAll('[data-champ="etat"] .chip').forEach((b) => b.addEventListener('click', () => {
    o.etat = b.dataset.valeur;
    o.calque = calquePourEtat(o.etat, o.type);
    if (!o.remplacement_par) o.remplacement_par = remplacementParDefaut();   // « à remplacer » : cible vide → à compléter (v13 §2.2)
    valider('État');
  }));
  fiche.querySelectorAll('select, input, textarea').forEach((el) => {
    if (!el.name || el.name === 'rech_materiel' || el.name === 'materiel_libre' || el.name === 'detail_malt' || el.classList.contains('qte')) return;
    el.addEventListener('change', () => appliquerChamp(o, el));
  });
  // Repère en tête : validé à Entrée ou à la perte de focus
  const rep = fiche.querySelector('.repere-saisie');
  rep.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); rep.blur(); } });
  // Recherche de matériel
  const rech = fiche.querySelector('[name="rech_materiel"]');
  const res = fiche.querySelector('.resultats');
  rech.addEventListener('input', () => {
    const t = rech.value.trim();
    if (t.length < 2) { res.hidden = true; return; }
    const articles = N.rechercher(t, { statut: N.statutPourEtat(o.etat) }, 12);
    res.innerHTML = articles.length ? articles.map((a) => `<button type="button" data-id="${a.id}"><span>${echapper(a.libelle)}</span><small>${echapper(N.libelleCategorie(a.categorie))}${a.unite ? ' · ' + echapper(a.unite) : ''}</small></button>`).join('') : '<div class="vide">Aucun article</div>';
    res.hidden = false;
    res.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      rech.value = ''; res.hidden = true;
      ajouterArticle(o, b.dataset.id, 'n:rech_materiel');   // le focus revient dans la recherche pour enchaîner
    }));
  });
  fiche.querySelector('[data-action="ajouter-libre"]').addEventListener('click', () => {
    const inp = fiche.querySelector('[name="materiel_libre"]');
    const l = inp.value.trim();
    if (!l) return;
    o.materiel_associe.push({ source: 'LIBRE', ref_article: null, libelle: N.corrigerOrthographe(l), quantite: 1, quantite_saisie: false, unite: '', package: null });
    inp.value = '';
    validerListe(o, 'Matériel libre', 'n:materiel_libre');
  });
  fiche.querySelector('[name="materiel_libre"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fiche.querySelector('[data-action="ajouter-libre"]').click(); } });
  fiche.querySelectorAll('[data-package]').forEach((b) => b.addEventListener('click', () => {
    const lignes = N.lignesPackage(b.dataset.package);
    if (!lignes.length) { notifier('Package vide'); return; }
    o.materiel_associe.push(...lignes);
    if (lignes.some((l) => l.package === 'MALT')) assurerSymboleMalt(o);   // v1.5.1 : package contenant la MALT
    validerListe(o, 'Package ' + b.dataset.package, 'p:' + b.dataset.package);
  }));
  fiche.querySelectorAll('[data-raccordements] [data-article]').forEach((b) => b.addEventListener('click', () => ajouterArticle(o, b.dataset.article, 'r:' + b.dataset.article)));
  fiche.querySelector('[data-action="dupliquer"]').addEventListener('click', () => { selectionner([o.id]); import('../outils.js').then((m) => m.dupliquerSelection()); });
  fiche.querySelector('[data-action="supprimer"]').addEventListener('click', () => { selectionner([o.id]); import('../outils.js').then((m) => { m.supprimerSelection(); fermerFiche(); }); });
  fiche.querySelector('[data-action="valider"]').addEventListener('click', () => { fermerFiche(); notifier('Fiche validée'); });
  const det = fiche.querySelector('[data-action="detacher"]');
  if (det) det.addEventListener('click', () => import('../outils.js').then((m) => { m.detacherFourreau(o); valider('Fourreau détaché'); }));
}

function ajouterArticle(o, id, focus = null) {
  const a = N.articleParId(id);
  if (!a) return;
  o.materiel_associe.push({ source: 'NOMENCLATURE', ref_article: a.id, libelle: a.libelle, quantite: 1, quantite_saisie: false, unite: a.unite || '', package: null });
  validerListe(o, 'Matériel associé', focus || ('m:' + (o.materiel_associe.length - 1) + ':qte'));
  emettre('objet-pose', { ref_article: a.id });
}

async function appliquerChamp(o, el) {
  let valeur = el.type === 'checkbox' ? el.checked : el.value;
  if (valeur === '__courant__') return;   // armement libre conservé tel quel
  if (valeur === '__libre__') {
    const r = await demander('Valeur libre', [{ nom: 'v', libelle: el.closest('label') ? el.closest('label').firstChild.textContent : 'Valeur', valeur: '' }]);
    if (!r || !r.v.trim()) { ouvrirFiche(o.id, { conserver: true }); return; }
    valeur = N.corrigerOrthographe(r.v.trim());
    if (el.name === 'a.armement_ref') { o.attributs.armement = valeur; o.attributs.armement_ref = null; valider('Armement'); return; }
    if (el.name === 'fourreau_article') { o.ref_article = null; o.attributs.notation = valeur; o.attributs.matiere = /acier/i.test(valeur) ? 'ACIER' : 'TPC'; valider('Fourreau'); return; }
  }
  if (el.type === 'number') valeur = valeur === '' ? null : Number(valeur);
  if (typeof valeur === 'string' && el.name !== 'commentaire') valeur = N.corrigerOrthographe(valeur);

  if (el.name === 'fourreau_article') {
    if (!valeur) { o.ref_article = null; o.attributs.notation = ''; }
    else { const f = N.fourreaux().find((x) => x.article.id === valeur); if (f) { o.ref_article = f.article.id; o.attributs.notation = f.notation; o.attributs.matiere = f.matiere; o.attributs.diametre_mm = f.diametre_mm; } }
    valider('Fourreau');
    return;
  }
  if (el.name === 'article_ep') {
    o.ref_article = valeur || null;
    valider('Article EP');
    return;
  }
  if (el.name === 'a.type_ancrage') {
    // v1.4.8 : type d'ancrage en façade, rangé dans armement_ref / armement (désignation « Ancrage EAF »)
    if (!valeur) { o.attributs.armement = ''; o.attributs.armement_ref = null; }
    else { const art = N.articleParId(valeur); o.attributs.armement_ref = valeur; o.attributs.armement = art ? libelleFicheArticle(art) : valeur; }
    valider('Type d\'ancrage');
    return;
  }
  if (el.name === 'a.armement_ref') {
    if (!valeur) { o.attributs.armement = ''; o.attributs.armement_ref = null; }
    else { const art = N.articleParId(valeur); o.attributs.armement_ref = valeur; o.attributs.armement = art ? libelleFicheArticle(art) : valeur; }
    valider('Armement');
    return;
  }
  if (el.name.startsWith('r.')) {
    // Champ « remplacé par » (v13 §2.2)
    appliquerRemplacement(o, el.name.slice(2), valeur);
    valider('Remplacé par');
    return;
  }
  if (el.name === 'domaine') {
    // Réseau depuis la fiche : même règle que le bandeau du bas (v13 §1.2, §1.4)
    const avecMalt = o.type === 'eras' && !!o.attributs.avec_malt;
    appliquerDomaine(o, valeur);
    valider('Réseau');
    if (articleIncompatible(o)) notifier('Article conservé mais incompatible avec le réseau ' + (LIBELLES_DOMAINE[valeur] || valeur) + ' : objet « à compléter »', 3200);
    else if (avecMalt && !o.attributs.avec_malt) notifier('MALT retirée : pas de MALT sur une remontée BRT / EP', 2400);
    return;
  }
  if (el.name === 'a.angle_gr') {
    // Angle en grades : 0 à 400, une décimale, virgule française ; hors bornes → refus, valeur précédente conservée (v12 §6)
    const v = analyserAngle(valeur);
    if (Number.isNaN(v)) { notifier('Angle refusé : valeur entre ' + CHARTE.texte.format_angle.min + ' et ' + CHARTE.texte.format_angle.max + ' grades (ex. 45 ou 12,5)', 3200); ouvrirFiche(o.id, { conserver: true }); return; }
    o.attributs.angle_gr = v;
    valider('Angle');
    return;
  }
  if (el.name.startsWith('a.')) {
    const champ = el.name.slice(2);
    if (['hauteur_m', 'effort_daN', 'nb_plages', 'puissance_kva'].includes(champ) && valeur !== null && valeur !== '' && !isNaN(Number(valeur))) valeur = Number(valeur);
    if (champ === 'longueur_tige' && valeur !== null) { const B = o.type === 'eras' ? CHARTE.eras : CHARTE.malt; valeur = Math.min(B.tige_max, Math.max(B.tige_min, valeur)); }
    if (el.type === 'range') valeur = Number(el.value);
    if (champ === 'couleur_texte' && !/^#[0-9A-Fa-f]{6}$/.test(String(valeur))) { ouvrirFiche(o.id, { conserver: true }); return; }
    if (champ === 'nombre' && valeur !== null) valeur = Math.max(1, Math.round(Number(valeur)));
    if (champ === 'diametre') { const P = CHARTE.masque.pinceau; valeur = valeur === null ? P.diametre_defaut : Math.min(P.diametre_max, Math.max(P.diametre_min, Number(valeur))); }
    if (champ === 'rayon' && o.type === 'masque') { const K = CHARTE.masque; valeur = valeur === null ? K.rayon_arrondi : Math.min(K.rayon_arrondi_max, Math.max(K.rayon_arrondi_min, Number(valeur))); }
    if (champ === 'sections') valeur = String(valeur || '').trim();
    const ancienMateriau = o.attributs.materiau;   // v1.4.8 : utile à la cascade console / ancrage
    o.attributs[champ] = valeur;
    // Cascade : un changement en amont réinitialise l'aval s'il n'est plus proposé
    if (o.type === 'support') {
      if (champ === 'materiau') {
        // v1.4.8 : entrée ou sortie du type console / ancrage — l'armement (ou le type d'ancrage) ne se transpose pas
        const avant = ancienMateriau;
        if (supportSansCaracteristiques(valeur) || supportSansCaracteristiques(avant)) {
          if (avant !== valeur) { o.attributs.armement = ''; o.attributs.armement_ref = null; }
        }
        if (supportSansCaracteristiques(valeur)) {
          o.attributs.hauteur_m = null; o.attributs.classe = ''; o.attributs.effort_daN = null;
          o.attributs.renforcement = 'AUCUN'; o.attributs.angle_renforcement = 0;
          o.ref_article = null;   // pas d'article de fourniture support
        }
      }
      if (champ === 'materiau' && !supportSansCaracteristiques(valeur)) {
        const h = N.hauteursSupports(valeur);
        if (h.length && !h.includes(Number(o.attributs.hauteur_m))) o.attributs.hauteur_m = null;
        if (valeur !== 'BETON' && valeur !== 'BOIS') o.attributs.classe = '';
        if (valeur === 'BOIS') o.attributs.effort_daN = null;
      }
      if (champ === 'hauteur_m' || champ === 'classe') {
        const c = N.classesSupports(o.attributs.materiau, o.attributs.hauteur_m);
        if (c.length && o.attributs.classe && !c.includes(o.attributs.classe) && champ === 'hauteur_m') o.attributs.classe = '';
        const e = N.effortsSupports(o.attributs.materiau, o.attributs.hauteur_m, o.attributs.classe, { etat: o.etat });   // v1.5.0 : efforts anciens conservés en existant
        if (e.length && o.attributs.effort_daN && !e.includes(Number(o.attributs.effort_daN))) o.attributs.effort_daN = null;
      }
      if (['materiau', 'hauteur_m', 'classe', 'effort_daN'].includes(champ) && !supportSansCaracteristiques(o.attributs.materiau)) {
        const art = N.articleSupport(o.attributs);
        // sortie d'un type console / ancrage : pas d'ancien article à conserver
        o.ref_article = art ? art.id : (supportSansCaracteristiques(ancienMateriau) ? null : o.ref_article);
        if (effortHorsMarche(o.attributs)) o.ref_article = null;   // v1.5.0 §1 : support ancien, aucune fourniture
      }
      if (champ === 'renforcement' && (valeur === 'AUCUN' || valeur === 'JUMELE')) o.attributs.angle_renforcement = 0;
    }
    if (o.type === 'eras' && champ === 'sous_type') {
      // Règle MALT par type (v12 §5.4.3) : le réseau suit le type, puis la règle unique est réévaluée (v13 §1.2)
      appliquerSousTypeEras(o, valeur);
    }
    if (o.type === 'eras' && champ === 'avec_malt') {
      // MALT cochée hors règle = manuelle : conservée, objet « à compléter » ; décochée : l'automatisme reprend (v13 §1.3)
      o.attributs.avec_malt = !!valeur;
      o.attributs.malt_origine = valeur ? (o.attributs.malt_regle === 'oui' ? 'AUTO' : 'MANUELLE') : 'AUTO';
    }
    if (o.type === 'troncon' && champ === 'section') {
      o.attributs.section_retenue = '';
      const id = articleSectionsDerivees(o); if (id) o.ref_article = id;
      if (estSectionNu(valeur)) o.ref_article = null;   // v1.4.9 §6 : conducteurs nus, jamais d'article de câble
    }
    if (o.type === 'coffret' && champ === 'sigle') { const p = N.plagesRembt(valeur); if (p && !o.attributs.nb_plages) o.attributs.nb_plages = p; }
    if (o.type === 'masque' && champ === 'surligneur') {
      // Opacité par défaut du surlignage, sauf si elle a été réglée à la main sur cet objet (v13.3 §4.1 bis)
      const M = CHARTE.masque;
      if (valeur && (o.opacite === null || o.opacite === undefined || o.opacite === M.opacite_defaut)) o.opacite = M.opacite_surligneur;
      else if (!valeur && o.opacite === M.opacite_surligneur) o.opacite = M.opacite_defaut;
      valider('Surligneur');
      ouvrirFiche(o.id, { conserver: true });
      return;
    }
  } else if (el.name === 'etiquette_visible') {
    o.etiquette.visible = !!valeur;
  } else if (el.name === 'materiel_visible') {
    o.materiel.visible = !!valeur;
  } else if (el.name === 'cartouche_visible') {
    o.cartouche.visible = !!valeur;
  } else if (/^(etiquette|materiel)\.retour_ligne$/.test(el.name)) {
    // v1.4.9 §2.4 : 'defaut' n'est pas stocké (propriété absente = défaut du type)
    const bloc = el.name.split('.')[0];
    if (valeur === 'auto' || valeur === 'jamais') o[bloc].retour_ligne = valeur; else delete o[bloc].retour_ligne;
    valider('Retour à la ligne');
    return;
  } else if (el.name === 'couleur_manuelle') {
    // v1.4.9 §4 : couleur du tracé d'un tronçon / fourreau
    const c = couleurManuelleValide(valeur);
    if (!c || (o.type !== 'troncon' && o.type !== 'fourreau')) { ouvrirFiche(o.id, { conserver: true }); return; }
    o.couleur_manuelle = c;
    valider('Couleur du tracé');
    ouvrirFiche(o.id, { conserver: true });
    return;
  } else if (/^(etiquette|materiel|cartouche)\.(echelle|rotation|retourner|couleur_contour|couleur_texte|couleur_cadre|fond|cadre)$/.test(el.name)) {
    const [bloc, champ] = el.name.split('.');
    const K = CHARTE.bloc_etiquette;
    if (champ === 'echelle') o[bloc].echelle = valeur === null ? 1 : Math.min(K.echelle_max, Math.max(K.echelle_min, Number(valeur)));
    else if (champ === 'rotation') o[bloc].rotation = ((Math.round(Number(valeur) || 0) % 360) + 360) % 360;
    else if (champ === 'retourner') o[bloc].retourner = !!valeur;
    else if (champ === 'couleur_contour' || champ === 'couleur_texte' || champ === 'couleur_cadre') { if (/^#[0-9A-Fa-f]{6}$/.test(String(valeur))) o[bloc][champ] = String(valeur).toUpperCase(); else { ouvrirFiche(o.id, { conserver: true }); return; } }
    else o[bloc][champ] = valeur;
  } else if (el.name === 'mention' || el.name === 'texte') {
    o[el.name] = String(valeur || '').trim();
  } else if (el.name === 'couleur') {
    if (!/^#[0-9A-Fa-f]{6}$/.test(String(valeur))) { ouvrirFiche(o.id, { conserver: true }); return; }
    o.couleur = String(valeur).toUpperCase();
  } else if (el.name === 'epaisseur') {
    const A = CHARTE.annotations;
    o.epaisseur = valeur === null ? A.epaisseur_defaut : Math.min(A.epaisseur_max, Math.max(A.epaisseur_min, Number(valeur)));
  } else if (el.name === 'taille_texte') {
    const A = CHARTE.annotations;
    o.taille_texte = valeur === null ? null : Math.min(A.taille_texte_max, Math.max(A.taille_texte_min, Number(valeur)));
  } else if (el.name === 'sit.diametre_mm' && o.situation) {
    // v1.5.4 : diamètre du rond rouge du plan de situation (mm papier)
    const S = CHARTE.situation.rond;
    const v = Number(String(el.value).replace(',', '.'));
    o.situation.diametre_mm = Number.isFinite(v) ? Math.min(S.diametre_max_mm, Math.max(S.diametre_min_mm, Math.round(v * 2) / 2)) : S.diametre_mm;
  } else if (el.name === 'sit.zoom' && o.situation) {
    regenererSituation(o, Number(el.value));   // asynchrone : valide à l'arrivée de la carte, rétablit la fiche sinon
    return;
  } else if (el.name === 'opacite') {
    o.opacite = Math.min(1, Math.max(o.type === 'image' ? CHARTE.image.opacite_min : CHARTE.masque.opacite_min, Number(el.value)));
  } else if (el.name === 'img.largeur_mm') {
    // Largeur de l'image en mm papier, virgule acceptée ; proportions conservées (v1.4.6 §2)
    // v1.4.7 : largeur VISIBLE (celle du papier) ; l'image est agrandie ou réduite autour du centre de la partie
    // visible (même calcul que la poignée et le menu). Sans rognage : identique à la v1.4.6.
    const K = CHARTE.image;
    const v = Number(String(valeur || '').trim().replace(',', '.'));
    const lv = v * MM;
    const rc = lireRecadrage(o.recadrage);
    const fraction = Math.max(K.recadrage.visible_min, 1 - rc.g - rc.d);
    const l = recadrageNul(o.recadrage) ? lv : lv / fraction;
    if (!isFinite(v) || v <= 0 || lv < K.largeur_min || l > K.largeur_max) { notifier('Largeur refusée', 2400); ouvrirFiche(o.id, { conserver: true }); return; }
    const r = o.hauteur / (o.largeur || 1);
    const largeur = Math.round(l * 100) / 100;
    const e = echelleAutourDuVisible(o, largeur / (o.largeur || 1));
    o.x = e.x; o.y = e.y;
    o.largeur = largeur; o.hauteur = Math.round(l * r * 100) / 100;
  } else if (el.name === 'detail_malt') {
    o.etiquette.detail_malt = !!valeur;
  } else if (el.name === 'deport.dx' || el.name === 'deport.dy') {
    o.deport[el.name.slice(7)] = valeur === null ? 0 : Number(valeur);
  } else if (el.name === 'cartouche.dx' || el.name === 'cartouche.dy') {
    o.cartouche[el.name.slice(10)] = valeur === null ? CHARTE.cartouche.decalage[el.name.slice(10)] : Number(valeur);
  } else if (el.name === 'rotation' && o.type === 'image') {
    // v1.4.7 : rotation autour du centre de la partie visible (sans rognage : autour du centre, comme en v1.4.6)
    const deg = ((Math.round(valeur === null ? 0 : (Number(valeur) || 0)) % 360) + 360) % 360;
    const t = tournerAutourDuVisible(o, deg);
    o.x = t.x; o.y = t.y; o.rotation = deg;
  } else if (el.name === 'rotation' || el.name === 'echelle_symbole') {
    o[el.name] = valeur === null ? (el.name === 'rotation' ? 0 : 1) : Number(valeur);
    if (el.name === 'rotation' && (o.type === 'masque' || o.type === 'image')) o.rotation = ((Math.round(Number(o.rotation) || 0) % 360) + 360) % 360;
    if (el.name === 'echelle_symbole') {
      const K = (o.type === 'troncon' || o.type === 'fourreau') ? CHARTE.echelle_lineaire : CHARTE.echelle_symbole;
      o.echelle_symbole = Math.min(K.max, Math.max(K.min, o.echelle_symbole));
    }
  } else if (el.name === 'repere') {
    const v = String(valeur || '').trim();
    if (v === o.repere) return;
    o.repere = v; o.repere_manuel = !!v;
  } else if (el.name === 'pose' || el.name === 'calque' || el.name === 'designation_manuelle' || el.name === 'commentaire') {
    o[el.name] = valeur;
  }
  valider('Fiche ' + (o.repere || ''));
}

export { designationAffichee };
