/* Service worker — Réseaux HC
 * Met en cache la totalité des ressources dès la première ouverture,
 * puis répond depuis le cache (cache-first). Incrémenter VERSION à chaque
 * livraison pour forcer le renouvellement du cache sur les tablettes.
 */
const VERSION = 'reseaux-hc-v1.5.4';

const RESSOURCES = [
  './',
  './index.html',
  './manifest.json',
  './nomenclature.json',
  './css/app.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/main.js',
  './js/etat.js',
  './js/charte.js',
  './js/modele.js',
  './js/designation.js',
  './js/nomenclature.js',
  './js/bd.js',
  './js/projet.js',
  './js/historique.js',
  './js/vue.js',
  './js/fond.js',
  './js/primitives.js',
  './js/symboles.js',
  './js/rendu-svg.js',
  './js/accrochage.js',
  './js/pointeur.js',
  './js/outils.js',
  './js/clavier.js',
  './js/legende.js',
  './js/export-pdf.js',
  './js/export-png.js',
  './js/contexte-export.js',
  './js/mesure.js',
  './js/mesure-calcul.js',
  './js/plans.js',
  './js/plans-calcul.js',
  './js/forme-calcul.js',
  './js/descriptif.js',
  './js/descriptif-rendu.js',
  './js/images.js',
  './js/situation.js',
  './js/ui/barre-outils.js',
  './js/ui/palette.js',
  './js/ui/fiche-objet.js',
  './js/ui/notes.js',
  './js/ui/selecteur-couleur.js',
  './js/ui/calques.js',
  './js/ui/projets.js',
  './js/ui/a-completer.js',
  './js/ui/menu-contextuel.js',
  './js/ui/dialogues.js',
  './js/ui/outils-annotation.js',
  './js/ui/gestionnaire.js',
  './js/ui/lecture-seule.js',
  './js/ui/plans.js',
  './js/ui/rognage.js',
  './js/ui/descriptif.js',
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
  './vendor/pdfjs/wasm/jbig2.wasm',
  './vendor/pdfjs/wasm/jbig2_nowasm_fallback.js',
  './vendor/pdfjs/wasm/openjpeg.wasm',
  './vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js',
  './vendor/pdfjs/wasm/qcms_bg.wasm',
  './vendor/pdfjs/standard_fonts/FoxitDingbats.pfb',
  './vendor/pdfjs/standard_fonts/FoxitFixed.pfb',
  './vendor/pdfjs/standard_fonts/FoxitFixedBold.pfb',
  './vendor/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb',
  './vendor/pdfjs/standard_fonts/FoxitFixedItalic.pfb',
  './vendor/pdfjs/standard_fonts/FoxitSerif.pfb',
  './vendor/pdfjs/standard_fonts/FoxitSerifBold.pfb',
  './vendor/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb',
  './vendor/pdfjs/standard_fonts/FoxitSerifItalic.pfb',
  './vendor/pdfjs/standard_fonts/FoxitSymbol.pfb',
  './vendor/pdfjs/standard_fonts/LiberationSans-Bold.ttf',
  './vendor/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf',
  './vendor/pdfjs/standard_fonts/LiberationSans-Italic.ttf',
  './vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
  './vendor/pdf-lib/pdf-lib.min.js',
  './vendor/fontkit/fontkit.umd.min.js',
  './vendor/fonts/DejaVuSans.ttf',
  './vendor/fonts/DejaVuSans-Bold.ttf',
  './vendor/fonts/DejaVuSans-Oblique.ttf',
  './vendor/fonts/DejaVuSans-BoldOblique.ttf'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(RESSOURCES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;
  // v1.5.4 : requêtes vers d'autres domaines (tuiles IGN du plan de situation) laissées au navigateur, jamais servies
  // depuis le cache de l'application ni remplacées par index.html en cas d'échec
  if (new URL(evt.request.url).origin !== self.location.origin) return;
  evt.respondWith(
    caches.match(evt.request, { ignoreSearch: true }).then((reponse) => {
      if (reponse) return reponse;
      // Ressource non précachée : on tente le réseau et on la mémorise.
      return fetch(evt.request).then((rep) => {
        if (rep && rep.ok && new URL(evt.request.url).origin === self.location.origin) {
          const copie = rep.clone();
          caches.open(VERSION).then((cache) => cache.put(evt.request, copie));
        }
        return rep;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
