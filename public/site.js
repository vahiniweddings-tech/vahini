/* Shared public UI: accessible mobile nav, device theme, PWA install, booking & media. */
(()=>{'use strict';
  const root=document.documentElement;
  document.getElementById('year')?.replaceChildren(String(new Date().getFullYear()));
  const preference=matchMedia('(prefers-color-scheme: dark)');
  const themeBtn=document.getElementById('themeToggle');
  const sun='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
  const moon='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/></svg>';
  function isDark(){return root.dataset.theme?root.dataset.theme==='dark':preference.matches}
  function updateTheme(){if(!themeBtn)return;themeBtn.innerHTML=isDark()?sun:moon;themeBtn.setAttribute('aria-label',isDark()?'Switch to light theme':'Switch to dark theme')}
  root.removeAttribute('data-theme');updateTheme();
  themeBtn?.addEventListener('click',()=>{root.dataset.theme=isDark()?'light':'dark';updateTheme()});
  preference.addEventListener?.('change',()=>{root.removeAttribute('data-theme');updateTheme()});

  const menu=document.getElementById('menuToggle'),nav=document.getElementById('primaryNav'),header=document.getElementById('siteHeader');
  if(menu&&nav&&header){
    const small=matchMedia('(max-width:767px)');
    const setMenu=open=>{const expanded=small.matches&&open;nav.hidden=!expanded;menu.setAttribute('aria-expanded',String(expanded));header.classList.toggle('menu-is-open',expanded)};
    setMenu(false);
    small.addEventListener?.('change',()=>setMenu(false));
    menu.addEventListener('click',e=>{e.stopPropagation();if(small.matches)setMenu(nav.hidden)});
    nav.addEventListener('click',e=>{if(e.target.closest('a')&&small.matches)setMenu(false)});
    document.addEventListener('pointerdown',e=>{if(small.matches&&!nav.hidden&&!header.contains(e.target))setMenu(false)});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&small.matches&&!nav.hidden){setMenu(false);menu.focus()}});
  }
  const current=location.pathname.split('/').pop()||'index.html';
  document.querySelectorAll('.site-nav [data-page]').forEach(a=>{if(a.dataset.page===current)a.setAttribute('aria-current','page')});

  const install=document.getElementById('installApp');
  let installPrompt=null,installationCompleted=false;
  const installed=()=>{
    if(installationCompleted)return true;
    if(matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)return true;
    try{return localStorage.getItem('vahini-app-installed')==='yes'}catch{return false}
  };
  const checkInstall=()=>{if(install)install.hidden=installed()};
  checkInstall();
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;checkInstall()});
  window.addEventListener('appinstalled',()=>{installPrompt=null;installationCompleted=true;try{localStorage.setItem('vahini-app-installed','yes')}catch{}checkInstall()});
  matchMedia('(display-mode: standalone)').addEventListener?.('change',checkInstall);
  install?.addEventListener('click',async()=>{
    if(installed()){checkInstall();return}
    if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice?.outcome==='accepted'){installationCompleted=true;try{localStorage.setItem('vahini-app-installed','yes')}catch{}}
      checkInstall();return}
    const isIOS=/iPhone|iPad|iPod/.test(navigator.userAgent);
    alert(isIOS?'In Safari, tap Share, then Add to Home Screen.':'Use your browser menu (⋮ or …) and choose Install app or Add to Home Screen. This option depends on browser support.');
  });
  if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(console.warn));

  const form=document.getElementById('enquiryForm');
  form?.addEventListener('submit',e=>{
    e.preventDefault();if(!form.reportValidity())return;
    const d=new FormData(form);
    const lines=['Hello Vahini Studio, I would like to enquire about an event.','Name: '+d.get('name'),
      'Phone: '+(d.get('phone')||'Not provided'),'Event: '+d.get('event'),
      'Date: '+(d.get('date')||'To be confirmed'),'Location: '+(d.get('venue')||'To be confirmed'),
      'Details: '+(d.get('message')||'Please share availability and packages.')];
    const uri='https://wa.me/919895066015?text='+encodeURIComponent(lines.join('\n'));
    const tab=window.open(uri,'_blank','noopener,noreferrer');if(!tab)location.href=uri;
  });

  // No third-party illustrative gallery photos. Public art slots pull ONLY from the live, owner-controlled uploads.
  const slots=[...document.querySelectorAll('[data-media-slot]')];
  if(slots.length){
    Promise.all([fetch('/api/media?limit=36').then(r=>r.ok?r.json():Promise.reject()),fetch('/api/hero-images').then(r=>r.ok?r.json():{home:null})])
      .then(([result,heroImages])=>{
        const photos=result.items.filter(x=>x.kind==='image');
        let idx=0;
        for(const slot of slots){
          let item;
          if(slot.dataset.mediaSlot==='hero')item=heroImages.home||photos[idx++];
          else item=photos[idx++];
          if(!item)continue;
          const src=item.poster||item.src;
          if(!src)continue;
          const img=new Image();img.alt=slot.getAttribute('aria-label')||item.title;
          img.decoding='async';img.loading=slot.dataset.mediaSlot==='hero'?'eager':'lazy';
          if(slot.dataset.mediaSlot==='hero')img.fetchPriority='high';
          img.addEventListener('error',()=>{img.remove();slot.classList.remove('has-photo')},{once:true});
          img.src=src;slot.append(img);slot.classList.add('has-photo');
          if(slot.dataset.mediaSlot==='hero'&&item.kind==='video'&&!item.youtubeId&&item.src&&!navigator.connection?.saveData&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
            const video=document.createElement('video');
            video.src=item.src;video.muted=true;video.autoplay=true;video.loop=true;video.playsInline=true;video.preload='none';
            video.poster=src;video.setAttribute('aria-label',item.title);
            video.addEventListener('playing',()=>{img.hidden=true},{once:true});
            slot.append(video);
            video.play().catch(()=>video.remove());
          }
        }
      }).catch(()=>{});
  }
})();
