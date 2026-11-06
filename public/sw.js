// Cache only lightweight shell files. API, private admin and video/images MUST stay network-first.
const CACHE='vahini-youtube-edition-3';
const SHELL=['/','/index.html','/site.js','/app.css','/manifest.webmanifest','/assets/icon-192.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/media/')||url.pathname.includes('admin'))return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).catch(()=>caches.match(req).then(x=>x||caches.match('/index.html'))));return;
  }
  if(SHELL.includes(url.pathname))event.respondWith(fetch(req).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)))}
    return response;
  }).catch(()=>caches.match(req)));
});
