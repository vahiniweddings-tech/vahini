/* The public gallery loads from D1/R2. No browser-local upload or sample media. */
(()=>{'use strict';
  const grid=document.getElementById('galleryGrid'),empty=document.getElementById('emptyState');
  const lightbox=document.getElementById('lightbox');const more=document.getElementById('loadMore');
  const tabs=[...document.querySelectorAll('.filter[data-category]')];
  let items=[],category='all',hasMore=true,busy=false,current=0,activeController=null,requestSeq=0;
  const title=document.getElementById('lbCount');
  function makeCard(item,index){
    const button=document.createElement('button');button.className='media-card';button.type='button';
    button.setAttribute('aria-label','View '+item.title);
    const thumb=item.poster||(item.kind==='image'?item.src:null);
    if(thumb){const image=document.createElement('img');image.src=thumb;image.alt=item.title;image.loading=index<3?'eager':'lazy';image.decoding='async';image.addEventListener('error',()=>{image.remove();if(item.kind==='video')button.classList.add('video-no-poster')},{once:true});button.append(image)}
    else if(item.kind==='video')button.classList.add('video-no-poster');
    if(item.kind==='video'){const play=document.createElement('span');play.className='play-indicator';play.textContent='▶';button.append(play)}
    const caption=document.createElement('span');caption.className='media-caption';caption.textContent=item.title;button.append(caption);
    button.addEventListener('click',()=>openViewer(index));return button;
  }
  async function load(append=false){
    if(append&&busy)return;
    const seq=++requestSeq;const controller=new AbortController();activeController?.abort();activeController=controller;
    busy=true;more.disabled=true;
    if(!append){items=[];grid.replaceChildren();empty.hidden=true}
    try{
      const r=await fetch('/api/media?category='+category+'&limit=24&offset='+items.length,{signal:controller.signal});
      if(!r.ok)throw new Error('Media service not available');
      const data=await r.json();if(seq!==requestSeq)return;const old=items.length;items.push(...data.items);hasMore=data.hasMore;
      grid.append(...data.items.map((item,i)=>makeCard(item,old+i)));
      empty.textContent='New work will appear here soon.';empty.hidden=items.length>0;
      more.hidden=!hasMore;
    }catch(err){if(seq===requestSeq&&err.name!=='AbortError'){
      empty.textContent='The gallery could not load. Please check your connection and try again.';
      empty.hidden=items.length>0;more.hidden=true;
    }}finally{if(seq===requestSeq){busy=false;more.disabled=false}}
  }
  function changeCategory(next,updateHash=true){
    if(!['all','film','indoor'].includes(next))next='all';
    category=next;
    for(const btn of tabs){const selected=btn.dataset.category===category;btn.classList.toggle('active',selected);btn.setAttribute('aria-pressed',String(selected))}
    if(updateHash)history.replaceState(null,'','#'+(category==='all'?'gallery':category==='film'?'films':'indoor'));
    load(false);
  }
  tabs.forEach(button=>button.addEventListener('click',()=>changeCategory(button.dataset.category)));
  more?.addEventListener('click',()=>{if(hasMore&&!busy)load(true)});
  const filmNav=document.getElementById('filmNav');
  filmNav?.addEventListener('click',e=>{e.preventDefault();changeCategory('film');document.getElementById('gallery').scrollIntoView({behavior:'smooth'})});
  const hashCategory=()=>location.hash==='#films'?'film':location.hash==='#indoor'?'indoor':'all';
  window.addEventListener('hashchange',()=>changeCategory(hashCategory(),false));
  function show(){
    const item=items[current],host=document.getElementById('lbContent');host.replaceChildren();
    if(item.youtubeId){
      const frame=document.createElement('iframe');
      frame.className='youtube-frame';frame.title=item.title+' — YouTube player';
      frame.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(item.youtubeId)+'?autoplay=1&playsinline=1&rel=0';
      frame.allow='autoplay; encrypted-media; accelerometer; gyroscope; picture-in-picture; web-share';
      frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');frame.allowFullscreen=true;
      const holder=document.createElement('div');holder.className='youtube-holder';holder.append(frame);
      const link=document.createElement('a');link.className='youtube-backup';
      link.href='https://www.youtube.com/watch?v='+encodeURIComponent(item.youtubeId);
      link.target='_blank';link.rel='noopener noreferrer';link.textContent='Watch on YouTube ↗';
      holder.append(link);host.append(holder);
    }else if(item.kind==='video'){
      const vid=document.createElement('video');vid.src=item.src;vid.controls=true;vid.autoplay=true;vid.playsInline=true;vid.preload='metadata';if(item.poster)vid.poster=item.poster;
      vid.onerror=()=>{host.replaceChildren();const a=document.createElement('a');a.href=item.src;a.textContent='Open video file';a.target='_blank';a.rel='noopener noreferrer';host.append(a)};
      host.append(vid);vid.play().catch(()=>{});
    }else{
      const img=document.createElement('img');img.src=item.src;img.alt=item.title;
      img.onerror=()=>{host.replaceChildren();const p=document.createElement('p');p.textContent='Photo could not be opened.';host.append(p)};
      host.append(img);
    }
    title.textContent=`${current+1} / ${items.length} — ${item.title}`;
  }
  function openViewer(i){current=i;lightbox.hidden=false;document.body.classList.add('locked');show()}
  function closeViewer(){lightbox.hidden=true;document.body.classList.remove('locked');document.getElementById('lbContent').replaceChildren()}
  function navigate(n){if(!items.length)return;current=(current+n+items.length)%items.length;show()}
  document.getElementById('lbClose').addEventListener('click',closeViewer);
  document.getElementById('lbPrev').addEventListener('click',()=>navigate(-1));
  document.getElementById('lbNext').addEventListener('click',()=>navigate(1));
  lightbox.addEventListener('click',e=>{if(e.target===lightbox)closeViewer()});
  document.addEventListener('keydown',e=>{if(lightbox.hidden)return;if(e.key==='Escape')closeViewer();if(e.key==='ArrowLeft')navigate(-1);if(e.key==='ArrowRight')navigate(1)});
  let startX=0;lightbox.addEventListener('touchstart',e=>{startX=e.changedTouches[0].screenX},{passive:true});
  lightbox.addEventListener('touchend',e=>{const dx=e.changedTouches[0].screenX-startX;if(Math.abs(dx)>65)navigate(dx<0?1:-1)},{passive:true});
  async function hero(){
    const host=document.getElementById('heroMedia');
    if(!host)return;
    try{
      const r=await fetch('/api/hero-images');if(!r.ok)return;
      const {gallery:item}=await r.json();if(!item||item.kind!=='image')return;
      const img=new Image();img.alt=item.title;img.decoding='async';img.fetchPriority='high';
      img.addEventListener('load',()=>host.replaceChildren(img),{once:true});
      img.addEventListener('error',()=>{}, {once:true});
      img.src=item.poster||item.src;
    }catch{}
  }
  changeCategory(hashCategory(),false);hero();
})();
