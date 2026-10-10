/* bd.js — accès IndexedDB (sans bibliothèque).
 *
 * Base « reseaux_hc », trois magasins :
 *   projets : { id, nom, commune, date, modifie_le, … }   (léger, réécrit à chaque sauvegarde)
 *   fonds   : { id, blob, type, nom_fichier }               (lourd, écrit une fois)
 *   prefs   : { cle, valeur }                                (favoris, récents, nomenclature perso, gestionnaire…)
 */
const NOM_BD = 'reseaux_hc';
const VERSION_BD = 1;

let instance = null;

function ouvrir() {
  if (instance) return Promise.resolve(instance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOM_BD, VERSION_BD);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projets')) {
        const s = db.createObjectStore('projets', { keyPath: 'id' });
        s.createIndex('modifie_le', 'modifie_le');
      }
      if (!db.objectStoreNames.contains('fonds')) db.createObjectStore('fonds', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs', { keyPath: 'cle' });
    };
    req.onsuccess = () => { instance = req.result; instance.onversionchange = () => instance.close(); resolve(instance); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Base de données bloquée par un autre onglet.'));
  });
}

function transaction(store, mode, fn) {
  return ouvrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
  }));
}

export const bd = {
  ouvrir,
  get: (store, cle) => transaction(store, 'readonly', (s) => s.get(cle)),
  put: (store, valeur) => transaction(store, 'readwrite', (s) => s.put(valeur)),
  del: (store, cle) => transaction(store, 'readwrite', (s) => s.delete(cle)),
  tout: (store) => transaction(store, 'readonly', (s) => s.getAll()),
  /* Écritures groupées sur plusieurs magasins dans UNE transaction (lot 1.4) : tout ou rien.
   * operations = [{ store, type: 'put', valeur } | { store, type: 'del', cle }]. Les blobs sont préparés AVANT l'appel :
   * une transaction IndexedDB se valide d'elle-même dès qu'on attend autre chose qu'une requête. */
  ecrireGroupe(operations) {
    const stores = [...new Set(operations.map((o) => o.store))];
    if (!stores.length) return Promise.resolve();
    return ouvrir().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      for (const op of operations) {
        const s = tx.objectStore(op.store);
        if (op.type === 'put') s.put(op.valeur); else s.delete(op.cle);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
    }));
  },
  /* Clés d'un magasin, sans charger les valeurs (fonds orphelins). */
  cles: (store) => transaction(store, 'readonly', (s) => s.getAllKeys()),
  /* Estimation de l'espace disponible (informative). */
  async espace() {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      return { utilise: e.usage || 0, quota: e.quota || 0 };
    }
    return null;
  },
  /* Demande au navigateur de ne pas purger les données (stockage persistant). */
  async persister() {
    if (navigator.storage && navigator.storage.persist) {
      try { return await navigator.storage.persist(); } catch (e) { return false; }
    }
    return false;
  }
};
