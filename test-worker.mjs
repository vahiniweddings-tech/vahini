import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from './src/worker.js';
const db = new DatabaseSync(':memory:');db.exec(readFileSync('./schema.sql','utf8'));
const env={
  DB:{prepare(sql){const stmt=db.prepare(sql);let args=[];return {
    bind(...a){args=a;return this},first(){return stmt.get(...args)||null},
    all(){return {results:stmt.all(...args)}},run(){return stmt.run(...args)}
  }}},ADMIN_PASSWORD:'a-real-password-with-32-characters-123',ADMIN_SESSION_SECRET:'a-long-random-session-secret-not-in-the-browser-987654321',
  ASSETS:{fetch(){return new Response('static asset')}}
};
const objects=new Map(),pending=new Map();
const streamBytes=async body=>new Uint8Array(await new Response(body).arrayBuffer());
const uploadAPI=(key,uploadId)=>({
  key,uploadId,
  async uploadPart(number,body){const data=await streamBytes(body);const ref=pending.get(uploadId);ref.parts.set(number,data);return {partNumber:number,etag:'etag-'+number}},
  async complete(parts){const ref=pending.get(uploadId);assert(ref);assert.equal(parts.length,ref.parts.size);
    const payload=new Uint8Array(Array.from(ref.parts.values()).reduce((sum,a)=>sum+a.length,0));let offset=0;
    for(const part of parts){assert.equal(part.etag,'etag-'+part.partNumber);const bytes=ref.parts.get(part.partNumber);payload.set(bytes,offset);offset+=bytes.length}
    objects.set(key,{bytes:payload,type:ref.type});pending.delete(uploadId);return {size:payload.length,httpEtag:'"mock-etag"'}},
  async abort(){pending.delete(uploadId)}
});
env.MEDIA={
 async createMultipartUpload(key,opts){const uploadId='upload-'+pending.size;pending.set(uploadId,{parts:new Map(),type:opts?.httpMetadata?.contentType||'application/octet-stream'});return uploadAPI(key,uploadId)},
 resumeMultipartUpload(key,uploadId){return uploadAPI(key,uploadId)},
 async put(key,body,opts){objects.set(key,{bytes:await streamBytes(body),type:opts.httpMetadata.contentType})},
 async delete(keys){for(const key of (Array.isArray(keys)?keys:[keys]))objects.delete(key)},
 async get(key,opts){const item=objects.get(key);if(!item)return null;
   const range=opts?.range?.get?.('range');let bytes=item.bytes,details;
   if(range){const m=range.match(/^bytes=(\d+)-(\d+)?$/);const start=Number(m[1]),end=m[2]?Number(m[2]):bytes.length-1;bytes=bytes.slice(start,end+1);details={offset:start,length:bytes.length}}
   return {body:new Response(bytes).body,async text(){return new TextDecoder().decode(bytes)},size:item.bytes.length,range:details,httpEtag:'"mock-etag"',writeHttpMetadata(h){h.set('content-type',item.type)}}
 }
};
let token='';
async function send(path,method='GET',body,logged=false,extra={}){
 const headers={'X-Vahini-Admin':'1',...extra};
 if(body&&!(body instanceof Uint8Array)){body=JSON.stringify(body);headers['content-type']='application/json'}
 if(logged)headers.Cookie=token;
 if(method!=='GET')headers.Origin='https://vahini.example';
 const res=await worker.fetch(new Request('https://vahini.example'+path,{method,body,headers}),env,{});
 let val=null;try{val=await res.clone().json()}catch{}
 return {res,val};
}
let out=await send('/api/session');assert.equal(out.val.authenticated,false);
out=await send('/api/uploads/start','POST',{title:'test',category:'general',mime:'image/jpeg',size:100});assert.equal(out.res.status,401);
out=await send('/api/login','POST',{id:'9027',password:'wrong'});assert.equal(out.res.status,401);
out=await send('/api/login','POST',{id:'9027',password:env.ADMIN_PASSWORD});assert.equal(out.res.status,200,out.val?.error);token=out.res.headers.get('set-cookie').split(';')[0];
out=await send('/api/session','GET',null,true);assert.equal(out.val.authenticated,true);
out=await send('/api/uploads/start','POST',{title:'Studio image',category:'indoor',mime:'image/jpeg',size:100},true);assert.equal(out.res.status,200);const {id,partSize,parts}=out.val;assert.equal(parts,1);
out=await send('/api/uploads/'+id+'/part?n=1','PUT',new Uint8Array(100).fill(42),true,{'content-length':'100','content-type':'application/octet-stream'});assert.equal(out.res.status,200,out.val?.error);
out=await send('/api/uploads/'+id+'/finish','POST',{parts:[out.val]},true);assert.equal(out.res.status,200,out.val?.error);
out=await send('/api/media?category=indoor');assert.equal(out.val.items.length,1);assert.equal(out.val.items[0].title,'Studio image');
out=await send('/api/media?category=film');assert.equal(out.val.items.length,0);
out=await send('/api/admin/media?offset=0','GET',null,true);assert.equal(out.val.items.length,1);
out=await send('/api/admin/media/'+id,'PATCH',{hero:true,category:'film'},true);assert.equal(out.res.status,200);
out=await send('/api/featured');assert.equal(out.val.item.id,id);
// Separate, image-only homepage/gallery hero selections; persisted in the existing R2 bucket.
out=await send('/api/hero-images');assert.equal(out.res.status,200);assert.equal(out.val.home.id,id);assert.equal(out.val.gallery.id,id);
out=await send('/api/admin/hero-images','PUT',{page:'home',mediaId:id});assert.equal(out.res.status,401);
out=await send('/api/admin/hero-images','PUT',{page:'wrong',mediaId:id},true);assert.equal(out.res.status,400);
out=await send('/api/admin/hero-images','PUT',{page:'home',mediaId:id},true);assert.equal(out.res.status,200,out.val?.error);
out=await send('/api/admin/hero-images','PUT',{page:'gallery',mediaId:id},true);assert.equal(out.res.status,200,out.val?.error);
out=await send('/api/hero-images');assert.equal(out.val.selections.home,id);assert.equal(out.val.selections.gallery,id);

out=await send('/api/admin/media/'+id+'/poster','PUT',new Uint8Array(12).fill(12),true,{'content-length':'12','content-type':'image/webp'});assert.equal(out.res.status,200,out.val?.error);
out=await send('/api/media?category=film');assert.match(out.val.items[0].poster,/^\/media\/posters\/[a-f0-9-]{36}\.webp$/);
out=await send('/media/images/'+id+'.jpg','GET',undefined,false,{'Range':'bytes=5-20'});assert.equal(out.res.status,206);assert.equal(out.res.headers.get('Content-Range'),'bytes 5-20/100');assert.equal((await out.res.arrayBuffer()).byteLength,16);
// YouTube is just a database pointer. It must not consume R2 media bytes.
out=await send('/api/admin/youtube','POST',{title:'Short',category:'film',url:'https://evil.youtube.com/watch?v=dQw4w9WgXcQ'},true);assert.equal(out.res.status,400);
out=await send('/api/admin/youtube','POST',{title:'Wedding movie',category:'film',url:'https://youtu.be/dQw4w9WgXcQ?t=10'},true);assert.equal(out.res.status,201,out.val?.error);
const ytId=out.val.media.id;
assert.equal(out.val.media.youtubeId,'dQw4w9WgXcQ');
assert.equal(out.val.media.src,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
assert.equal(out.val.media.poster,'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
out=await send('/api/admin/hero-images','PUT',{page:'gallery',mediaId:ytId},true);assert.equal(out.res.status,404);

out=await send('/api/admin/youtube','POST',{title:'Repeat',category:'film',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'},true);assert.equal(out.res.status,409);
out=await send('/api/media?category=film');assert.equal(out.val.items.length,2);
out=await send('/api/admin/media/'+ytId,'PATCH',{category:'indoor',title:'Indoor film'},true);assert.equal(out.res.status,200);
out=await send('/api/media?category=indoor');assert.equal(out.val.items[0].title,'Indoor film');
out=await send('/api/admin/media/'+ytId+'/poster','PUT',new Uint8Array(12).fill(42),true,{'content-length':'12','content-type':'image/webp'});assert.equal(out.res.status,200);
out=await send('/api/media?category=indoor');assert.match(out.val.items[0].poster,/^\/media\/posters\/[a-f0-9-]{36}\.webp$/);
out=await send('/api/admin/stats','GET',null,true);assert.equal(out.val.count,2);assert.equal(out.val.totalBytes,100);
out=await send('/api/admin/media/'+ytId,'DELETE',undefined,true);assert.equal(out.res.status,200);
out=await send('/api/admin/stats','GET',null,true);assert.equal(out.val.totalBytes,100);
out=await send('/api/admin/media/'+id,'DELETE',undefined,true);assert.equal(out.res.status,200);
out=await send('/api/media?category=all');assert.equal(out.val.items.length,0);
out=await send('/api/hero-images');assert.equal(out.val.home,null);assert.equal(out.val.gallery,null);

console.log('PASS: separate R2 hero selections; login; protected photo upload; poster; filters; YouTube URL validation, add, duplicate, edit, custom thumbnail, delete; stats exclude YouTube; range; cleanup');
