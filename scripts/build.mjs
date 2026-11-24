import fs from 'node:fs';
import path from 'node:path';
const DEMO='https://catonpe-droid.github.io/dharashivtoday/';
const site=(process.env.PAGES_URL||DEMO).replace(/\/+$/,'')+'/';
const root=new URL(site).pathname;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const adapt=s=>s.replaceAll(DEMO,'__DT_ABSOLUTE__').replaceAll('/dharashivtoday/',root).replaceAll('__DT_ABSOLUTE__',site);
const output='site';
fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
for(const item of ['assets','admin','data','about-us','contact-us','privacy-policy','terms-and-conditions','disclaimer','editorial-policy','index.html'])fs.cpSync(item,path.join(output,item),{recursive:true});
function adaptFiles(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())adaptFiles(p);else if(/\.(html|js|css|json)$/.test(p))fs.writeFileSync(p,adapt(fs.readFileSync(p,'utf8')));}}
adaptFiles(output);
const write=(p,s)=>{const f=path.join(output,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s)};
const source=fs.readFileSync(path.join(output,'index.html'),'utf8');
const list=JSON.parse(fs.readFileSync('data/news.json','utf8')).filter(p=>p&&p.published!==false&&p.status!=='draft');
const urls=[site,...['about-us','contact-us','privacy-policy','terms-and-conditions','disclaimer','editorial-policy'].map(s=>site+s+'/')];
const meta=(h,property,val)=>{const re=new RegExp('<meta property="'+property+'" content="[^"]*">');const tag='<meta property="'+property+'" content="'+safe(val)+'">';return re.test(h)?h.replace(re,()=>tag):h.replace('</head>',()=>tag+'</head>');};
write('index.html',meta(source,'og:url',site).replace('</head>','<link rel="canonical" href="'+safe(site)+'"></head>'));
for(const p of list){
 const slug=String(p.slug||'');if(!/^[a-z0-9][a-z0-9_-]{2,115}$/i.test(slug))continue;
 const url=site+'batmi/'+slug+'/';const title=(p.seoTitle||p.title)+' | धाराशिव टुडे',desc=p.seoDescription||p.summary||'धाराशिव टुडे';
 const img=/^https:\/\/dharashivlive\.com\/wp-content\/uploads\/[^"'<>?]+\.(?:jpg|jpeg|webp|png)$/i.test(p.image||'')?p.image:(/^assets\/uploads\/[a-z0-9_.-]+\.(?:jpg|jpeg|webp|png)$/i.test(p.image||'')?site+p.image:site+'assets/logo-original-hd.png');
 let h=source.replace('data-story=""','data-story="'+slug+'"').replace(/<title>[^<]*<\/title>/,()=>'<title>'+safe(title)+'</title>').replace(/<meta name="description" content="[^"]*">/,()=>'<meta name="description" content="'+safe(desc)+'">');
 for(const [key,value] of [['og:title',title],['og:description',desc],['og:image',img],['og:type','article'],['og:url',url],['og:site_name','Dharashiv Today'],['og:locale','mr_IN'],['og:image:secure_url',img],['og:image:alt',p.title]])h=meta(h,key,value);
 for(const [name,value] of [['twitter:title',title],['twitter:description',desc],['twitter:image',img],['twitter:image:alt',p.title]]){const tag='<meta name="'+name+'" content="'+safe(value)+'">';const re=new RegExp('<meta name="'+name+'" content="[^"]*">');h=re.test(h)?h.replace(re,()=>tag):h.replace('</head>',()=>tag+'</head>');}
 const ld={'@context':'https://schema.org','@type':'NewsArticle',headline:p.title,description:desc,image:[img],datePublished:p.date,mainEntityOfPage:url,author:{'@type':'Person',name:p.author||'धाराशिव टुडे न्यूज डेस्क'},publisher:{'@type':'Organization',name:'धाराशिव टुडे',url:site}};
 h=h.replace('</head>',()=>'<link rel="canonical" href="'+safe(url)+'"><script type="application/ld+json">'+JSON.stringify(ld).replace(/</g,'\\u003c')+'</script></head>');
 write('batmi/'+slug+'/index.html',h);urls.push(url);
}
write('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>'<url><loc>'+safe(u)+'</loc></url>').join('')+'</urlset>');
write('robots.txt','User-agent: *\nAllow: /\nSitemap: '+site+'sitemap.xml\n');write('.nojekyll','');console.log('Dharashiv Today built:',list.length,'articles;',site);
