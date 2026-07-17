const C='travelplan-v1';
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(C).then(c=>c.addAll(['./']).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',e=>{
  e.respondWith(
    fetch(e.request).then(res=>{
      const cl=res.clone();caches.open(C).then(c=>c.put(e.request,cl));
      return res;
    }).catch(()=>caches.match(e.request,{ignoreSearch:true}))
  );
});
