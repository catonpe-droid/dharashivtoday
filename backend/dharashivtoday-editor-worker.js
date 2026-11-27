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

export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('Origin');
    const permitted=origin&&ALLOWED_ORIGINS.has(origin);
    const cors=permitted?{
      'Access-Control-Allow-Origin':origin,
      'Access-Control-Allow-Methods':'GET,PUT,OPTIONS',
      'Access-Control-Allow-Headers':'authorization,content-type,cache-control',
      'Access-Control-Max-Age':'600',
      'Vary':'Origin'
    }:{'Vary':'Origin'};
    if(request.method==='OPTIONS')
      return permitted?new Response(null,{status:204,headers:cors}):reply({error:'Origin not allowed'},403,cors);
    if(url.pathname==='/health'&&request.method==='GET')
      return reply({ready:!!env.GITHUB_TOKEN&&!!env.PUBLISH_KEY&&env.PUBLISH_KEY.length>=32,
                    service:'dharashivtoday-editor',features:['news','media','layout']},200,cors);
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
