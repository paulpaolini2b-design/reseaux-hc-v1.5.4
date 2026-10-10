/* ui/rognage.js — barre flottante du mode « Rognage » d'une image libre (v1.4.7 §1).
 *
 * Affichée sur la zone de plan tant que le mode est actif (événement 'rognage' émis par outils.js) :
 * consigne, « Annuler » (= Échap) et « Valider le rognage » (= Entrée, ou appui hors de l'image).
 * La zone de plan capture les pointeurs (pointeur.js → setPointerCapture) : la barre arrête leur propagation,
 * comme le bandeau d'archive et le panneau de mesure, sinon ses boutons ne recevraient jamais le clic.
 * Écran seulement : masquée en aperçu papier (le passage en aperçu papier annule d'ailleurs le mode).
 */
import { sur, notifier } from '../etat.js';
import * as outils from '../outils.js';

let barre = null;

export function initialiserBarreRognage() {
  const zone = document.getElementById('zone-plan');
  if (!zone) return;
  barre = document.createElement('div');
  barre.id = 'barre-rognage';
  barre.setAttribute('role', 'toolbar');
  barre.setAttribute('aria-label', 'Rognage de l’image');
  barre.hidden = true;
  barre.innerHTML = `
    <span class="rognage-consigne">Rognage : glissez les barres ou les équerres ; glissez l’image retenue pour la recadrer.</span>
    <div class="rognage-actions">
      <button type="button" class="btn" data-action="annuler" title="Annuler le rognage (Échap)">Annuler</button>
      <button type="button" class="btn btn-primaire" data-action="valider" title="Valider le rognage (Entrée)">Valider le rognage</button>
    </div>`;
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'contextmenu', 'dblclick']) barre.addEventListener(t, (e) => e.stopPropagation());
  barre.querySelector('[data-action="annuler"]').addEventListener('click', () => { if (outils.annulerRognage()) notifier('Rognage annulé'); });
  barre.querySelector('[data-action="valider"]').addEventListener('click', () => outils.validerRognage());
  zone.appendChild(barre);
  sur('rognage', (actif) => { barre.hidden = !actif; });
}
