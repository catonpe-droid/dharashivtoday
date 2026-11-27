/**
 * Dharashiv Today Editorial Publisher — Cloudflare Worker
 * Deploy to a NEW Cloudflare Worker, not Lokhit's Worker.
 *
 * Required encrypted Worker Secrets:
 *   PUBLISH_KEY  = unique random key (minimum 32 characters)
 *   GITHUB_TOKEN = GitHub fine-grained token scoped only to catonpe-droid/Dharashiv Today,
 *                  Repository Contents: Read and write.
 *
 * No secrets are stored here or in the public news portal.
 */
const REPO='catonpe-droid/dharashivtoday';
const BRANCH='main';
const ALLOWED_ORIGINS=new Set([
  'https://catonpe-droid.github.io',
  'https://www.dharashivtoday.com',
  'https://dharashivtoday.com'
]);
const FILES=new Set(['data/news.json','data/layout.json','data/media.json']);
const UPLOAD_PATTERN=/^assets\/(?:uploads|branding)\/[a-z0-9][a-z0-9_.-]{0,150}\.(?:jpg|jpeg|webp|png)$/i;
const encoded=new TextEncoder();
const reply=(data,status=200,headers={})=>new Response(JSON.stringify(data),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',...headers}
});
const isSafePath=p=>FILES.has(p)||UPLOAD_PATTERN.test(p);

async function equalSecrets(actual,expected){
  if(!actual||!expected||actual.length>2048)return false;
  const [left,right]=await Promise.all([
    crypto.subtle.digest('SHA-256',encoded.encode(actual)),
    crypto.subtle.digest('SHA-256',encoded.encode(expected))
  ]);
  const a=new Uint8Array(left),b=new Uint8Array(right);
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}

// Persistent article counts; anonymous per-article random browser keys prevent repeat counts.
export class NewsPageViews {
 constructor(ctx) {
  this.sql=ctx.storage.sql;
  this.sql.exec("CREATE TABLE IF NOT EXISTS counts (slug TEXT PRIMARY KEY, views INTEGER NOT NULL)");
  this.sql.exec("CREATE TABLE IF NOT EXISTS seen (slug TEXT NOT NULL, reader TEXT NOT NULL, PRIMARY KEY(slug,reader))");
 }
 async fetch(req) {
  if(req.method==="POST"){
   const {slug,reader}=await req.json();
   this.sql.exec("INSERT OR IGNORE INTO seen(slug,reader) VALUES (?,?)",slug,reader);
   if(this.sql.exec("SELECT changes() AS n").one().n===1)this.sql.exec("INSERT INTO counts(slug,views) VALUES (?,1) ON CONFLICT(slug) DO UPDATE SET views=views+1",slug);
   return new Response(null,{status:204});
  }
  return Response.json({counts:this.sql.exec("SELECT slug,views FROM counts").toArray()});
 }
}
export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('Origin');
    const permitted=origin&&ALLOWED_ORIGINS.has(origin);
    const cors=permitted?{
      'Access-Control-Allow-Origin':origin,
      'Access-Control-Allow-Methods':'GET,PUT,POST,OPTIONS',
      'Access-Control-Allow-Headers':'authorization,content-type,cache-control',
      'Access-Control-Max-Age':'600',
      'Vary':'Origin'
    }:{'Vary':'Origin'};
    if(request.method==='OPTIONS')
      return permitted?new Response(null,{status:204,headers:cors}):reply({error:'Origin not allowed'},403,cors);
    if(url.pathname==='/health'&&request.method==='GET')
      return reply({ready:!!env.GITHUB_TOKEN&&!!env.PUBLISH_KEY&&env.PUBLISH_KEY.length>=32,
                    service:'dharashivtoday-editor',features:['news','media','layout','page-views'],page_views:!!env.PAGE_VIEWS},200,cors);
    if(url.pathname==='/page-view'&&request.method==='POST'){
      if(!permitted)return reply({error:'Origin not allowed'},403,cors);
      if(!env.PAGE_VIEWS)return reply({error:'Page views unavailable'},503,cors);
      try{
        const raw=await request.text();
        if(raw.length>260)return reply({error:'Invalid page'},400,cors);
        const {slug,reader}=JSON.parse(raw);
        if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9_-]{2,115}$/.test(slug)||typeof reader!=='string'||!/^[a-f0-9-]{36}$/.test(reader))return reply({error:'Invalid page'},400,cors);
        const r=await env.PAGE_VIEWS.get(env.PAGE_VIEWS.idFromName('all-articles')).fetch('https://counter.internal/',{method:'POST',body:JSON.stringify({slug,reader})});
        return r.ok?new Response(null,{status:204,headers:{...cors,'Cache-Control':'no-store'}}):reply({error:'Page views unavailable'},503,cors);
      }catch{return reply({error:'Page views unavailable'},503,cors)}
    }
    if(url.pathname==='/page-view-stats'&&request.method==='POST'){
      if(!permitted)return reply({error:'Origin not allowed'},403,cors);
      const auth=request.headers.get('Authorization')||'';
      if(!env.PUBLISH_KEY||env.PUBLISH_KEY.length<32||!auth.startsWith('Bearer ')||!await equalSecrets(auth.slice(7),env.PUBLISH_KEY))return reply({error:'Invalid publishing key'},401,cors);
      if(!env.PAGE_VIEWS)return reply({error:'Page views unavailable'},503,cors);
      try{
        const r=await env.PAGE_VIEWS.get(env.PAGE_VIEWS.idFromName('all-articles')).fetch('https://counter.internal/');
        return r.ok?reply(await r.json(),200,cors):reply({error:'Page views unavailable'},503,cors);
      }catch{return reply({error:'Page views unavailable'},503,cors)}
    }
    if(url.pathname!=='/github'||!['GET','PUT'].includes(request.method))
      return reply({error:'Not found'},404,cors);
    if(!permitted)return reply({error:'Origin not allowed'},403,cors);
    if(!env.GITHUB_TOKEN||!env.PUBLISH_KEY||env.PUBLISH_KEY.length<32)
      return reply({error:'Publishing Worker is not configured'},503,cors);
    const authorization=request.headers.get('Authorization')||'';
    if(!authorization.startsWith('Bearer ')||
       !await equalSecrets(authorization.slice(7),env.PUBLISH_KEY))
      return reply({error:'Invalid publishing key'},401,cors);
    // A copied GitHub PAT may contain a trailing newline from the password field.
    // Trim it before creating an outbound Authorization header (invalid header characters
    // otherwise cause fetch() to throw, producing a misleading HTTP 502).
    const githubToken=String(env.GITHUB_TOKEN||'').trim();
    if(!/^(?:github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(githubToken))
      return reply({error:'Cloudflare GITHUB_TOKEN Secret has an invalid GitHub PAT format. Recheck the full token value (not just its name).',code:'BAD_GITHUB_TOKEN'},503,cors);
    const p=url.searchParams.get('path')||'';
    if(!isSafePath(p)||p.includes('..')||p.includes('//'))
      return reply({error:'File path not permitted'},400,cors);
    const ghURL='https://api.github.com/repos/'+REPO+'/contents/'+p+
      (request.method==='GET'?'?ref='+BRANCH:'');
    const headers={
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      'Authorization':'Bearer '+githubToken,
      'User-Agent':'dharashivtoday-cloudflare-publisher'
    };
    // Match the working Lokhit publisher: let GitHub resolve any canonical redirects.
    const options={method:request.method,headers};
    if(request.method==='PUT'){
      if(Number(request.headers.get('Content-Length')||0)>1650000)
        return reply({error:'Upload is too large for the GitHub Contents API'},413,cors);
      let payload;
      try{
        const raw=await request.text();
        if(raw.length>1650000)return reply({error:'Upload is too large'},413,cors);
        payload=JSON.parse(raw);
      }catch{return reply({error:'Invalid JSON payload'},400,cors)}
      if(!payload||payload.branch!==BRANCH||typeof payload.message!=='string'||
         typeof payload.content!=='string'||!/^[a-z0-9+\/=\r\n]+$/i.test(payload.content)||
         payload.content.length>1450000||
         (payload.sha!==undefined&&!/^[a-f0-9]{40}$/.test(payload.sha)))
        return reply({error:'Invalid GitHub file update request'},400,cors);
      options.headers['Content-Type']='application/json';
      options.body=JSON.stringify({
        branch:BRANCH,message:payload.message.slice(0,180),
        content:payload.content,
        ...(payload.sha?{sha:payload.sha}:{})
      });
    }
    let response;
    try{
      response=await fetch(ghURL,options);
    }catch(e){
      // Only return a non-sensitive phase/code; never echo headers, credentials, or input.
      console.error('Dharashiv Today GitHub fetch failed:',e?.name||'Error');
      return reply({error:'GitHub API connection failed inside Cloudflare Worker. Check Worker deployment / outgoing GitHub API access.',code:'GITHUB_FETCH_FAILED'},502,cors);
    }
    try{
      const output=await response.text();
      if(response.status===401||response.status===403)
        return reply({error:'GitHub rejected the GITHUB_TOKEN Secret. Confirm it belongs to catonpe-droid/Dharashiv Today and has Contents: Read and write.',code:'GITHUB_TOKEN_REJECTED'},502,cors);
      return new Response(output,{status:response.status,headers:{
        ...cors,'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8',
        'X-Content-Type-Options':'nosniff'
      }});
    }catch(e){
      console.error('Dharashiv Today GitHub response processing failed:',e?.name||'Error');
      return reply({error:'Worker could not read the GitHub API response. Try Deploy again.',code:'GITHUB_RESPONSE_FAILED'},502,cors);
    }
  }
};
