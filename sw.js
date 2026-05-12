// ═══════════════════════════════════════════════════
// BRIEFEED SERVICE WORKER
// Cache-first pour l'app shell, network pour les flux
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'briefeed-v1';

// Ressources à mettre en cache au premier lancement
const SHELL_ASSETS = [
    './',
    './index.html',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:ital,wght@0,400;0,700;0,900;1,400&display=swap',
    'https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.min.js',
    'https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js',
];

// ── Installation : mise en cache du shell ─────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ── Activation : nettoyage des vieux caches ───────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch : stratégie intelligente ───────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Flux RSS et proxies → toujours réseau (pas de cache)
    const networkOnly = [
        'allorigins.win',
        'corsproxy.io',
        'api.codetabs.com',
        'thingproxy.freeboard.io',
        'corsproxy.org',
        'rss2json.com',
        'rssbridge.com',
        'news.google.com',
        'reddit.com',
        'youtube.com',
        'feedburner.com',
    ];
    if (networkOnly.some(d => url.hostname.includes(d))) {
        return; // Laisser passer sans interception
    }

    // Favicons Google → cache 7 jours
    if (url.hostname === 'www.google.com' && url.pathname.includes('s2/favicons')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache =>
                cache.match(event.request).then(cached => {
                    if (cached) return cached;
                    return fetch(event.request).then(response => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                })
            )
        );
        return;
    }

    // Polices Google Fonts → cache long terme
    if (url.hostname.includes('fonts.g') || url.hostname.includes('fonts.googleapis')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache =>
                cache.match(event.request).then(cached => cached || fetch(event.request).then(r => {
                    cache.put(event.request, r.clone());
                    return r;
                }))
            )
        );
        return;
    }

    // CDN (Readability, DOMPurify, jsDelivr) → cache long terme
    if (url.hostname.includes('cdn.jsdelivr') || url.hostname.includes('cdnjs')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache =>
                cache.match(event.request).then(cached => cached || fetch(event.request).then(r => {
                    cache.put(event.request, r.clone());
                    return r;
                }))
            )
        );
        return;
    }

    // App shell (index.html) → cache-first avec fallback réseau
    if (url.origin === self.location.origin || event.request.mode === 'navigate') {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache =>
                cache.match(event.request).then(cached => {
                    const networkFetch = fetch(event.request).then(response => {
                        if (response.ok) cache.put(event.request, response.clone());
                        return response;
                    }).catch(() => cached);
                    // Retourne le cache instantanément, met à jour en arrière-plan
                    return cached || networkFetch;
                })
            )
        );
        return;
    }
});

// ── Periodic Background Sync (fetch en arrière-plan) ─────────────
self.addEventListener('periodicsync', event => {
    if(event.tag === 'briefeed-refresh'){
        event.waitUntil(
            // Notifier le client de rafraîchir
            self.clients.matchAll({type:'window'}).then(clients => {
                clients.forEach(client => {
                    client.postMessage({type:'BACKGROUND_REFRESH'});
                });
            })
        );
    }
});

// ── Background Sync fallback ──────────────────────────────────────
self.addEventListener('sync', event => {
    if(event.tag === 'briefeed-sync'){
        event.waitUntil(
            self.clients.matchAll({type:'window'}).then(clients => {
                clients.forEach(c => c.postMessage({type:'BACKGROUND_REFRESH'}));
            })
        );
    }
});
