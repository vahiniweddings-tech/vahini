/* VAHINI WEDDINGS | Cloudflare Workers, R2, D1 | no credentials in client files. */
const ADMIN_ID = '9027';
const SESSION_SECONDS = 8 * 3600;
const CHUNK_SIZE = 16 * 1024 * 1024;
const MAX_IMAGE_SIZE = 200 * 1024 ** 2; // Original photographs: 200 MiB.
const MAX_VIDEO_SIZE = 5 * 1024 ** 3; // R2 multipart videos: up to 5 GiB per video.
const TYPES = new Map([
  ['image/jpeg', 'jpg'], ['image/png','png'], ['image/webp','webp'],
  ['image/avif','avif'],
  ['video/mp4','mp4'], ['video/webm','webm'], ['video/quicktime','mov']
]);
const CATEGORIES = ['general','film','indoor'];
const encoder = new TextEncoder();
function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
}
function error(message,status=400){return json({error:message},status)}
function b64u(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64u(s){const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4));return Uint8Array.from(b,c=>c.charCodeAt(0))}
async function sha256(s){return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s)))}
async function hmacKey(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function sign(secret,payload){return b64u(new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(secret),encoder.encode(payload))))}
async function sessionOK(request,env){
  if(!env.ADMIN_SESSION_SECRET)return false;
  const raw=request.headers.get('Cookie')?.match(/(?:^|;\s*)vahini_session=([^;]+)/)?.[1];
  if(!raw)return false;
  const [body,mac,...extra]=raw.split('.');
  if(!body||!mac||extra.length)return false;
  try{
    const verified=await crypto.subtle.verify('HMAC',await hmacKey(env.ADMIN_SESSION_SECRET),unb64u(mac),encoder.encode(body));
    if(!verified)return false;
    const value=JSON.parse(new TextDecoder().decode(unb64u(body)));
    return value.id===ADMIN_ID&&Number.isInteger(value.exp)&&value.exp>Date.now()/1000;
  }catch{return false}
}
function cookie(token,maxAge){return `vahini_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`}
async function readJSON(req,max=8192){
  if(Number(req.headers.get('content-length')||0)>max)throw new Error('Request too large');
  const text=await req.text();if(text.length>max)throw new Error('Request too large');return JSON.parse(text);
}
function ensureOrigin(req){
  const o=req.headers.get('Origin');
  if(o&&o!==new URL(req.url).origin)throw new Error('Cross-origin request rejected');
  if(req.headers.get('X-Vahini-Admin')!=='1')throw new Error('Admin request header missing');
}
function mediaUrl(key){return key?'/media/'+key:null}
function toMedia(row){
  // YouTube videos are references; uploaded photographs and films are R2 objects.
  const youtubeId = row.object_key?.startsWith('youtube/') ? row.object_key.slice(8) : null;
  return {id:row.id,title:row.title,category:row.category,kind:row.kind,mime:row.mime,
    youtubeId,src:youtubeId?'https://www.youtube.com/watch?v='+youtubeId:mediaUrl(row.object_key),
    poster:mediaUrl(row.poster_key)||(youtubeId?'https://i.ytimg.com/vi/'+youtubeId+'/hqdefault.jpg':null),
    size:row.byte_size,hero:!!row.is_hero,createdAt:row.created_at};
}
// Supports watch links, youtu.be, shorts, live and embed URLs. Rejects look-alike hosts.
function parseYouTubeID(link){
  try{
    const url=new URL(String(link||'').trim());
    if(url.protocol!=='https:' && url.protocol!=='http:')return null;
    const host=url.hostname.toLowerCase();
    let id=null;
    if(host==='youtu.be'||host==='www.youtu.be')id=url.pathname.split('/')[1];
    else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','www.youtube-nocookie.com','youtube-nocookie.com'].includes(host)){
      const path=url.pathname.split('/').filter(Boolean);
      if(path[0]==='watch')id=url.searchParams.get('v');
      else if(['shorts','live','embed'].includes(path[0]))id=path[1];
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null;
  }catch{return null}
}
async function addYouTube(req,env){
  let data;try{data=await readJSON(req,4096)}catch{return error('Enter a valid YouTube link, title and category.')}
  const youtubeId=parseYouTubeID(data.url);
  const title=String(data.title||'').trim().slice(0,120);
  const category=String(data.category||'film');
  if(!youtubeId)return error('Enter a valid YouTube video, Shorts or share link.');
  if(!title||!CATEGORIES.includes(category))return error('Enter a video title and choose a gallery category.');
  const key='youtube/'+youtubeId;
  const duplicate=await env.DB.prepare('SELECT id FROM media WHERE object_key=?').bind(key).first();
  if(duplicate)return error('This YouTube video is already in the gallery. Edit its existing entry instead.',409);
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO media (id,title,category,kind,mime,byte_size,object_key,status,sort_order) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id,title,category,'video','text/youtube',0,key,'published',Date.now()).run();
  const item=await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(id).first();
  return json({ok:true,media:toMedia(item)},201);
}
async function handleMedia(request,env,key){
  if(!/^(images|videos|posters)\/[a-f0-9-]{36}\.(jpg|png|webp|avif|gif|mp4|webm|mov)$/.test(key))return new Response('Not found',{status:404});
  const ranged=!!request.headers.get('Range');
  const object=await env.MEDIA.get(key,ranged?{range:request.headers}:{});
  if(!object)return new Response('Not found',{status:404});
  const headers=new Headers();object.writeHttpMetadata(headers);
  headers.set('ETag',object.httpEtag);
  headers.set('Accept-Ranges','bytes');
  headers.set('Cache-Control','public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Cross-Origin-Resource-Policy','same-origin');
  if(ranged&&object.range){
    const offset=object.range.offset??(object.size-(object.range.suffix||object.size));
    const length=object.range.length??(object.size-offset);
    headers.set('Content-Range',`bytes ${offset}-${offset+length-1}/${object.size}`);
    headers.set('Content-Length',String(length));
    return new Response(request.method==='HEAD'?null:object.body,{status:206,headers});
  }
  headers.set('Content-Length',String(object.size));
  return new Response(request.method==='HEAD'?null:object.body,{status:200,headers});
}
async function publicList(url,env){
  const category=url.searchParams.get('category')||'all';
  if(!['all',...CATEGORIES].includes(category))return error('Invalid filter');
  const offset=Math.max(0,Math.min(100000,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
  const limit=Math.max(1,Math.min(60,Number.parseInt(url.searchParams.get('limit')||'24',10)||24));
  const sql=category==='all'
    ?`SELECT * FROM media WHERE status='published' ORDER BY sort_order DESC, created_at DESC LIMIT ? OFFSET ?`
    :`SELECT * FROM media WHERE status='published' AND category=? ORDER BY sort_order DESC, created_at DESC LIMIT ? OFFSET ?`;
  const stmt=env.DB.prepare(sql);
  const rows=(await (category==='all'?stmt.bind(limit+1,offset):stmt.bind(category,limit+1,offset)).all()).results;
  return json({items:rows.slice(0,limit).map(toMedia),hasMore:rows.length>limit});
}
async function login(req,env){
  if(!env.ADMIN_PASSWORD||!env.ADMIN_SESSION_SECRET)return error('Admin secrets are not configured on the server',503);
  const idHash=b64u((await sha256((req.headers.get('CF-Connecting-IP')||'unknown')+'-'+env.ADMIN_SESSION_SECRET)).slice(0,18));
  const now=Math.floor(Date.now()/1000);
  const entry=await env.DB.prepare('SELECT * FROM login_attempts WHERE ip_hash=?').bind(idHash).first();
  if(entry&&entry.attempts>=7&&now-entry.first_at<900)return error('Too many login attempts. Try again after 15 minutes.',429);
  let body;
  try{body=await readJSON(req,300)}catch{return error('Invalid login request')}
  const a=await sha256(String(body.password??'')),b=await sha256(env.ADMIN_PASSWORD);
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  if(body.id!==ADMIN_ID||diff!==0){
    await env.DB.prepare('INSERT INTO login_attempts(ip_hash,attempts,first_at) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN ? - first_at > 900 THEN 1 ELSE attempts+1 END,first_at=CASE WHEN ? - first_at > 900 THEN ? ELSE first_at END').bind(idHash,now,now,now,now).run();
    return error('Incorrect admin ID or password',401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash=?').bind(idHash).run();
  const body64=b64u(encoder.encode(JSON.stringify({id:ADMIN_ID,exp:now+SESSION_SECONDS})));
  const token=body64+'.'+await sign(env.ADMIN_SESSION_SECRET,body64);
  return json({ok:true,id:ADMIN_ID},200,{'Set-Cookie':cookie(token,SESSION_SECONDS)});
}
async function startUpload(req,env){
  let data;try{data=await readJSON(req)}catch{return error('Invalid upload details')}
  const mime=String(data.mime||'').toLowerCase().split(';')[0];
  const suffix=TYPES.get(mime);
  const size=Number(data.size);
  const category=String(data.category||'');
  const title=String(data.title||'').trim().slice(0,120);
  const kind=mime.startsWith('video/')?'video':'image';
  const maxSize=kind==='video'?MAX_VIDEO_SIZE:MAX_IMAGE_SIZE;
  if(!suffix||!Number.isSafeInteger(size)||size<=0||size>maxSize||!CATEGORIES.includes(category)||!title)
    return error('Unsupported media or invalid file size, title or category. Photos: 200 MiB. Videos: 5 GiB.');
  const id=crypto.randomUUID();
  const key=(kind==='video'?'videos/':'images/')+id+'.'+suffix;
  const upload=await env.MEDIA.createMultipartUpload(key,{httpMetadata:{contentType:mime,cacheControl:'public, max-age=31536000, immutable'}});
  try{
    await env.DB.prepare('INSERT INTO media (id,title,category,kind,mime,byte_size,object_key,upload_id,status,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id,title,category,kind,mime,size,key,upload.uploadId,'pending',Date.now()).run();
  }catch(err){await upload.abort().catch(()=>{});throw err}
  return json({id,partSize:CHUNK_SIZE,parts:Math.ceil(size/CHUNK_SIZE)});
}
async function pendingMedia(id,env){return env.DB.prepare("SELECT * FROM media WHERE id=? AND status='pending'").bind(id).first()}
async function uploadPart(req,env,id,url){
  const row=await pendingMedia(id,env);if(!row)return error('Upload not found',404);
  const n=Number(url.searchParams.get('n'));
  const count=Math.ceil(row.byte_size/CHUNK_SIZE);
  if(!Number.isInteger(n)||n<1||n>count)return error('Invalid part number');
  const expected=Math.min(CHUNK_SIZE,row.byte_size-(n-1)*CHUNK_SIZE);
  const contentLength=req.headers.get('Content-Length');
  if(contentLength!==null&&Number(contentLength)!==expected)return error('Part size mismatch');
  if(!req.body)return error('Missing part data');
  const upload=env.MEDIA.resumeMultipartUpload(row.object_key,row.upload_id);
  const part=await upload.uploadPart(n,req.body);
  return json({partNumber:n,etag:part.etag});
}
async function finishUpload(req,env,id){
  const row=await pendingMedia(id,env);if(!row)return error('Upload not found',404);
  let data;try{data=await readJSON(req,1024*1024)}catch{return error('Invalid parts list')}
  const parts=data.parts;
  const needed=Math.ceil(row.byte_size/CHUNK_SIZE);
  if(!Array.isArray(parts)||parts.length!==needed||parts.length>10000||!parts.every((p,i)=>p&&p.partNumber===i+1&&typeof p.etag==='string'&&p.etag.length<200))return error('Upload parts do not match the file');
  const upload=env.MEDIA.resumeMultipartUpload(row.object_key,row.upload_id);
  const object=await upload.complete(parts);
  if(object.size!==row.byte_size){await env.MEDIA.delete(row.object_key);return error('Uploaded file size mismatch',409)}
  await env.DB.prepare("UPDATE media SET status='published',upload_id=NULL WHERE id=?").bind(id).run();
  return json({ok:true,media:toMedia({...row,status:'published'})});
}
async function abortUpload(env,id){
  const row=await pendingMedia(id,env);if(!row)return json({ok:true});
  await env.MEDIA.resumeMultipartUpload(row.object_key,row.upload_id).abort().catch(()=>{});
  await env.DB.prepare('DELETE FROM media WHERE id=?').bind(id).run();
  return json({ok:true});
}
async function updateMedia(req,env,id){
  const existing=await env.DB.prepare("SELECT * FROM media WHERE id=? AND status='published'").bind(id).first();
  if(!existing)return error('Media not found',404);
  let data;try{data=await readJSON(req)}catch{return error('Invalid change')}
  const title=data.title===undefined?existing.title:String(data.title).trim().slice(0,120);
  const category=data.category===undefined?existing.category:String(data.category);
  const order=data.sortOrder===undefined?existing.sort_order:Number(data.sortOrder);
  if(!title||!CATEGORIES.includes(category)||!Number.isSafeInteger(order))return error('Invalid title, category or order');
  const hero=data.hero===true;
  if(hero)await env.DB.prepare('UPDATE media SET is_hero=0 WHERE is_hero=1').run();
  await env.DB.prepare('UPDATE media SET title=?,category=?,sort_order=?,is_hero=? WHERE id=?').bind(title,category,order,data.hero===undefined?existing.is_hero:(hero?1:0),id).run();
  return json({ok:true});
}
async function uploadPoster(req,env,id){
  const row=await env.DB.prepare("SELECT * FROM media WHERE id=? AND status='published'").bind(id).first();
  if(!row)return error('Media not found',404);
  const mime=req.headers.get('Content-Type');if(!['image/webp','image/jpeg'].includes(mime))return error('Poster must be JPEG or WebP');
  // Some browsers/proxies omit Content-Length. Read the small poster with a strict streamed limit.
  const declared=req.headers.get('Content-Length');
  if(declared!==null&&(Number(declared)<1||Number(declared)>2*1024*1024))return error('Poster must be under 2 MiB');
  if(!req.body)return error('Poster is empty');
  const reader=req.body.getReader(),chunks=[];let length=0;
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;
    if(length>2*1024*1024){await reader.cancel();return error('Poster must be under 2 MiB')}
    chunks.push(value);
  }
  if(length===0)return error('Poster is empty');
  const key='posters/'+crypto.randomUUID()+(mime==='image/webp'?'.webp':'.jpg'); // versioned URL so new covers never display stale cached pixels
  await env.MEDIA.put(key,new Blob(chunks,{type:mime}),{httpMetadata:{contentType:mime,cacheControl:'public, max-age=31536000, immutable'}});
  if(row.poster_key&&row.poster_key!==key)await env.MEDIA.delete(row.poster_key);
  await env.DB.prepare('UPDATE media SET poster_key=? WHERE id=?').bind(key,id).run();
  return json({ok:true,poster:mediaUrl(key)});
}
async function deleteMedia(env,id){
  const row=await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(id).first();
  if(!row)return error('Media not found',404);
  if(row.status==='pending'){await abortUpload(env,id);return json({ok:true})}
  await env.DB.prepare('DELETE FROM media WHERE id=?').bind(id).run();
  const keys=[...(row.object_key.startsWith('youtube/')?[]:[row.object_key]),...(row.poster_key?[row.poster_key]:[])];
  if(keys.length)await env.MEDIA.delete(keys);
  return json({ok:true});
}
// Hero selections are stored in the studio's existing R2 bucket; D1 needs no migration.
const HERO_SELECTIONS_KEY='settings/hero-images.json';
async function readHeroSelections(env){
  const object=await env.MEDIA.get(HERO_SELECTIONS_KEY);
  if(!object)return {home:null,gallery:null};
  try{
    const data=JSON.parse(await object.text());
    return {home:typeof data.home==='string'?data.home:null,gallery:typeof data.gallery==='string'?data.gallery:null};
  }catch{return {home:null,gallery:null}}
}
async function heroImages(env){
  const selections=await readHeroSelections(env);
  const fallback=await env.DB.prepare("SELECT * FROM media WHERE status='published' AND kind='image' ORDER BY is_hero DESC, sort_order DESC, created_at DESC LIMIT 1").first();
  async function resolve(id){
    if(!id)return fallback;
    const item=await env.DB.prepare("SELECT * FROM media WHERE id=? AND status='published' AND kind='image'").bind(id).first();
    return item||fallback;
  }
  const [home,gallery]=await Promise.all([resolve(selections.home),resolve(selections.gallery)]);
  return json({home:home?toMedia(home):null,gallery:gallery?toMedia(gallery):null,selections});
}
async function updateHeroImage(request,env){
  let data;try{data=await readJSON(request,1024)}catch{return error('Invalid hero image selection')}
  if(!['home','gallery'].includes(data.page))return error('Choose home or gallery');
  if(typeof data.mediaId!=='string'||!/^[a-f0-9-]{36}$/.test(data.mediaId))return error('Choose a valid uploaded photograph');
  const media=await env.DB.prepare("SELECT id FROM media WHERE id=? AND kind='image' AND status='published'").bind(data.mediaId).first();
  if(!media)return error('Only uploaded, published photographs can be selected',404);
  const selections=await readHeroSelections(env);
  selections[data.page]=media.id;
  await env.MEDIA.put(HERO_SELECTIONS_KEY,JSON.stringify(selections),{httpMetadata:{contentType:'application/json'}});
  return json({ok:true,selections});
}
async function handleAPI(request,env,url){
  const path=url.pathname,method=request.method;
  if(path==='/api/media'&&method==='GET')return publicList(url,env);
  if(path==='/api/hero-images'&&method==='GET')return heroImages(env);
  if(path==='/api/featured'&&method==='GET'){
    const featured=await env.DB.prepare("SELECT * FROM media WHERE status='published' AND is_hero=1 LIMIT 1").first();
    return json({item:featured?toMedia(featured):null});
  }
  if(path==='/api/login'&&method==='POST'){ensureOrigin(request);return login(request,env)}
  if(path==='/api/session'&&method==='GET')return json({authenticated:await sessionOK(request,env)});
  if(path==='/api/logout'&&method==='POST'){
    ensureOrigin(request);return json({ok:true},200,{'Set-Cookie':cookie('',0)});
  }
  if(!await sessionOK(request,env))return error('Please sign in as administrator',401);
  if(method!=='GET')ensureOrigin(request);
  if(path==='/api/admin/hero-images'&&method==='PUT')return updateHeroImage(request,env);
  if(path==='/api/admin/stats'&&method==='GET'){
    const stats=await env.DB.prepare("SELECT COUNT(*) as count,COALESCE(SUM(byte_size),0) as totalBytes FROM media WHERE status='published'").first();
    return json(stats);
  }
  if(path==='/api/admin/media'&&method==='GET'){
    const offset=Math.max(0,Math.min(100000,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
    const limit=50;
    const rows=await env.DB.prepare("SELECT * FROM media WHERE status='published' ORDER BY sort_order DESC LIMIT ? OFFSET ?").bind(limit+1,offset).all();
    return json({items:rows.results.slice(0,limit).map(toMedia),hasMore:rows.results.length>limit});
  }
  if(path==='/api/admin/youtube'&&method==='POST')return addYouTube(request,env);
  if(path==='/api/uploads/start'&&method==='POST')return startUpload(request,env);
  const upload=path.match(/^\/api\/uploads\/([a-f0-9-]{36})\/(part|finish|abort)$/);
  if(upload){
    if(upload[2]==='part'&&method==='PUT')return uploadPart(request,env,upload[1],url);
    if(upload[2]==='finish'&&method==='POST')return finishUpload(request,env,upload[1]);
    if(upload[2]==='abort'&&method==='POST')return abortUpload(env,upload[1]);
  }
  const item=path.match(/^\/api\/admin\/media\/([a-f0-9-]{36})(\/poster)?$/);
  if(item){
    if(item[2]&&method==='PUT')return uploadPoster(request,env,item[1]);
    if(!item[2]&&method==='PATCH')return updateMedia(request,env,item[1]);
    if(!item[2]&&method==='DELETE')return deleteMedia(env,item[1]);
  }
  return error('API endpoint not found',404);
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/media/')){
      if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
      return handleMedia(request,env,url.pathname.slice(7));
    }
    if(url.pathname.startsWith('/api/')){
      try{return await handleAPI(request,env,url)}catch(err){
        console.error('API error',err);
        const msg=err?.message||'';
        if(msg==='Cross-origin request rejected'||msg==='Admin request header missing')return error(msg,403);
        return error('Server request failed. Check Cloudflare bindings and logs.',500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
