/* Admin data belongs to client's Cloudflare account. Never browser-local media storage. */
(()=>{'use strict';
const login=document.getElementById('adminLogin'),dashboard=document.getElementById('adminDashboard');
const message=document.getElementById('adminMessage'),loginMessage=document.getElementById('loginMessage');
const adminGrid=document.getElementById('adminGrid'),queue=document.getElementById('uploadQueue');
let adminOffset=0,activeHomeHero=null,activeGalleryHero=null;
const setStatus=(str,bad=false)=>{message.textContent=str;message.classList.toggle('error',bad)};
function api(path,options={}){
  const headers={'X-Vahini-Admin':'1',...(options.body&&!(options.body instanceof Blob)?{'Content-Type':'application/json'}:{}),...options.headers};
  return fetch(path,{credentials:'same-origin',...options,headers}).then(async res=>{
    const data=await res.json().catch(()=>({error:'Unexpected server response'}));
    if(!res.ok)throw new Error(data.error||'Request failed ('+res.status+')');return data;
  });
}
async function session(){
  try{const r=await api('/api/session');login.hidden=r.authenticated;dashboard.hidden=!r.authenticated;if(r.authenticated)await refresh()}
  catch(e){login.hidden=false;dashboard.hidden=true;loginMessage.textContent='Could not contact admin service. Check backend configuration.'}
}
document.getElementById('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();loginMessage.textContent='Signing in…';
  const id=document.getElementById('loginId').value.trim();
  const password=document.getElementById('loginPassword').value;
  try{await api('/api/login',{method:'POST',body:JSON.stringify({id,password})});
    document.getElementById('loginPassword').value='';loginMessage.textContent='';await session();
  }catch(err){loginMessage.textContent=err.message}
});
document.getElementById('logout').addEventListener('click',async()=>{
  await api('/api/logout',{method:'POST'}).catch(()=>{});dashboard.hidden=true;login.hidden=false;
});
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node}
function bytes(n){return n>=1e12?(n/1e12).toFixed(2)+' TB':n>=1e9?(n/1e9).toFixed(2)+' GB':n>=1e6?(n/1e6).toFixed(1)+' MB':(n/1000).toFixed(0)+' KB'}
async function refresh(append=false){
  try{
    const offset=append?adminOffset:0;
    const [data,stats,heroImages]=await Promise.all([api('/api/admin/media?offset='+offset),api('/api/admin/stats'),api('/api/hero-images')]);
    activeHomeHero=heroImages.home?.id||null;activeGalleryHero=heroImages.gallery?.id||null;
    document.getElementById('mediaTotal').textContent=`${stats.count} published item${stats.count===1?'':'s'} · ${bytes(stats.totalBytes)} used`;
    if(!append){adminGrid.replaceChildren();adminOffset=0}
    adminGrid.append(...data.items.map(mediaCard));adminOffset+=data.items.length;
    document.getElementById('adminMore').hidden=!data.hasMore;
    if(!adminOffset)adminGrid.append(el('p','empty-admin','No work published. Add original studio photography and films above.'));
  }catch(err){setStatus('Cannot load media: '+err.message,true)}
}
function mediaCard(item){
  const card=el('article','admin-card');const preview=el('div','admin-preview');
  if(item.poster||(item.kind==='image'&&item.src)){
    const pic=document.createElement('img');pic.src=item.poster||item.src;pic.alt=item.title;pic.loading='lazy';pic.decoding='async';pic.addEventListener('error',()=>pic.remove(),{once:true});preview.append(pic);
  }else preview.textContent=item.kind==='video'?'VIDEO':'IMAGE';
  if(item.kind==='video')preview.append(el('span','video-tag',item.youtubeId?'YOUTUBE FILM':'VIDEO'));
  const body=el('div','admin-card-body');
  const label=el('label','','Title');const name=document.createElement('input');name.value=item.title;name.maxLength=120;label.append(name);
  const catLabel=el('label','','Gallery category');const cat=document.createElement('select');
  for(const [value,text] of [['general','All (main gallery)'],['film','Film'],['indoor','Indoor photography']]){
    const opt=document.createElement('option');opt.value=value;opt.textContent=text;cat.append(opt);
  }cat.value=item.category;catLabel.append(cat);
  const actions=el('div','admin-actions');
  function button(text,callback){const b=el('button','',text);b.type='button';b.addEventListener('click',callback);return b}
  const save=button('Save changes',async()=>{
    try{save.disabled=true;await api('/api/admin/media/'+item.id,{method:'PATCH',body:JSON.stringify({title:name.value.trim(),category:cat.value})});setStatus('Changes saved. Visible to all visitors.');await refresh()}
    catch(err){setStatus(err.message,true)}finally{save.disabled=false}
  });
  // Each banner can use any photograph already uploaded to the studio's media library.
  const heroButtons=[];
  if(item.kind==='image'){
    for(const [page,label,active] of [
      ['home','Home hero',item.id===activeHomeHero],
      ['gallery','Gallery hero',item.id===activeGalleryHero]
    ]){
      const select=button(active?'✓ '+label:'Set '+label,async()=>{
        select.disabled=true;
        try{
          await api('/api/admin/hero-images',{method:'PUT',body:JSON.stringify({page,mediaId:item.id})});
          setStatus((page==='home'?'Homepage':'Gallery')+' hero image updated.');await refresh();
        }catch(err){setStatus(err.message,true);select.disabled=false}
      });
      if(active){select.classList.add('hero-selected');select.setAttribute('aria-pressed','true')}
      heroButtons.push(select);
    }
  }
  // Owner-controlled thumbnail: uploading an image here updates the film cover immediately.
  const customCover=button('Change thumbnail',()=>coverInput.click());
  const coverInput=document.createElement('input');coverInput.type='file';coverInput.accept='image/jpeg,image/png,image/webp,image/avif';coverInput.hidden=true;
  coverInput.addEventListener('change',async()=>{
    const file=coverInput.files?.[0];coverInput.value='';if(!file)return;
    if(file.size>40*1024*1024){setStatus('Cover image must be under 40 MB.',true);return}
    customCover.disabled=true;
    try{
      const thumb=await posterFor(file);
      if(!thumb)throw Error('Could not process the selected cover photo.');
      await api(`/api/admin/media/${item.id}/poster`,{method:'PUT',body:thumb,headers:{'Content-Type':thumb.type}});
      setStatus('Thumbnail updated.');await refresh();
    }catch(err){setStatus('Thumbnail failed: '+err.message,true)}finally{customCover.disabled=false}
  });
  const move=button('Move to top',async()=>{
    try{await api('/api/admin/media/'+item.id,{method:'PATCH',body:JSON.stringify({sortOrder:Date.now()})});await refresh()}catch(err){setStatus(err.message,true)}
  });
  const remove=button('Delete',async()=>{
    if(!confirm(`Permanently delete "${item.title}" from the website and storage? This cannot be undone.`))return;
    try{await api('/api/admin/media/'+item.id,{method:'DELETE'});setStatus('Media deleted.');await refresh()}catch(err){setStatus(err.message,true)}
  });remove.classList.add('danger');
  actions.append(save,...heroButtons,customCover,move,remove,coverInput);body.append(label,catLabel,actions);
  card.append(preview,body);return card;
}
async function posterFor(file){
  const maximum=1200;
  let image=null,clean=()=>{};
  if(file.type.startsWith('image/')){
    const url=URL.createObjectURL(file);clean=()=>URL.revokeObjectURL(url);
    image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Cannot preview image'));i.src=url});
  }else throw Error('Choose a supported photo.');
  try{
    const w=image.naturalWidth,h=image.naturalHeight;
    if(!w||!h)return null;
    const ratio=Math.min(1,maximum/w,maximum/h);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
    canvas.getContext('2d',{alpha:false}).drawImage(image,0,0,canvas.width,canvas.height);
    return await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.78));
  }finally{clean()}
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function retry(fn,count=3){let err;for(let a=0;a<count;a++)try{return await fn()}catch(e){err=e;if(a<count-1)await pause(350*(2**a))}throw err}
async function uploadOne(file,category){
  const line=el('div','queue-row');const name=el('strong','',file.name);const progress=document.createElement('progress');progress.max=file.size;progress.value=0;
  const state=el('span','','Preparing…');line.append(name,progress,state);queue.prepend(line);
  let uploadId=null;
  try{
    if(!/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type)||file.size>200*1024*1024)throw Error('Choose a supported photo under 200 MiB.');
    const title=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').slice(0,120)||'Untitled';
    const info=await api('/api/uploads/start',{method:'POST',body:JSON.stringify({title,category,mime:file.type,size:file.size})});
    uploadId=info.id;
    const parts=new Array(info.parts);let next=0,completed=0;
    state.textContent='Uploading…';
    async function worker(){
      while(next<info.parts){
        const i=next++,start=i*info.partSize,end=Math.min(file.size,start+info.partSize),slice=file.slice(start,end);
        const part=await retry(()=>api(`/api/uploads/${uploadId}/part?n=${i+1}`,{method:'PUT',body:slice,headers:{'Content-Type':'application/octet-stream'}}));
        parts[i]=part;completed+=end-start;progress.value=completed;
        state.textContent=`${Math.floor(100*completed/file.size)}% · ${bytes(completed)} / ${bytes(file.size)}`;
      }
    }
    await Promise.all(Array.from({length:Math.min(3,info.parts)},()=>worker()));
    state.textContent='Publishing…';
    await api(`/api/uploads/${uploadId}/finish`,{method:'POST',body:JSON.stringify({parts})});
    try{state.textContent='Generating preview…';const preview=await posterFor(file);
      if(preview&&preview.size<=2*1024*1024)await api(`/api/admin/media/${uploadId}/poster`,{method:'PUT',body:preview,headers:{'Content-Type':preview.type}});
    }catch(err){console.warn('Preview generation skipped',err)}
    state.textContent='Published';line.classList.add('uploaded');return true;
  }catch(err){
    state.textContent='Failed: '+err.message;line.classList.add('upload-failed');
    if(uploadId)api(`/api/uploads/${uploadId}/abort`,{method:'POST'}).catch(()=>{});
    // Retry a failed file by selecting it again; credentials are never saved in the browser.
    return false;
  }
}
document.getElementById('upload').addEventListener('change',async e=>{
  const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;
  const category=document.getElementById('uploadCategory').value;
  const input=document.getElementById('upload');input.disabled=true;
  let ok=0;
  for(let i=0;i<files.length;i++){
    setStatus(`Uploading ${i+1} of ${files.length}: ${files[i].name}`);
    if(await uploadOne(files[i],category))ok++;
  }
  input.disabled=false;setStatus(`${ok} of ${files.length} file(s) uploaded and published.${ok!==files.length?' Check failed uploads below.':''}`,ok!==files.length);
  await refresh();
});
document.getElementById('youtubeForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=document.getElementById('youtubeSubmit');
  const title=document.getElementById('youtubeTitle').value.trim();
  const url=document.getElementById('youtubeUrl').value.trim();
  const category=document.getElementById('youtubeCategory').value;
  if(!title||!url){setStatus('Enter a title and YouTube link.',true);return}
  button.disabled=true;button.textContent='Adding film…';
  try{
    await api('/api/admin/youtube',{method:'POST',body:JSON.stringify({title,url,category})});
    document.getElementById('youtubeUrl').value='';document.getElementById('youtubeTitle').value='';
    setStatus('YouTube film published to the gallery.');await refresh();
  }catch(err){setStatus(err.message,true)}finally{button.disabled=false;button.textContent='Add film to gallery'}
});
document.getElementById('adminMore').addEventListener('click',()=>refresh(true));
session();
})();
