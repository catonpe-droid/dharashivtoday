'use strict';
(()=>{
const CMS=window.DalalCMS;
const $=id=>document.getElementById(id);
if(!CMS)return;
const SITE=CMS.getSite();
let quill=null,plain=false,active=null,coverPath='',mediaMode='cover',extraMedia=[],mediaSha='',uploaded=[],initDone=false,brandLogoPath='';
const text=(value)=>String(value??'');
const imagePattern=/^assets\/uploads\/[a-z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/i;
function cleanHtml(html){
 const doc=new DOMParser().parseFromString(text(html),'text/html');
 const allow=new Set(['P','BR','B','STRONG','EM','I','U','S','H2','H3','BLOCKQUOTE','OL','UL','LI','A','IMG','PRE','CODE']);
 const refuse=new Set(['SCRIPT','STYLE','IFRAME','SVG','FORM','INPUT','BUTTON','OBJECT','EMBED','LINK','META']);
 const output=document.createElement('div');
 function build(source,parent){
  for(const node of [...source.childNodes]){
   if(node.nodeType===Node.TEXT_NODE){parent.append(document.createTextNode((node.textContent||'').replace(/[\u00a0\u202f\u2007]/g,' ')));continue}
   if(node.nodeType!==Node.ELEMENT_NODE)continue;
   if(refuse.has(node.tagName))continue;
   if(!allow.has(node.tagName)){build(node,parent);continue}
   if(node.tagName==='IMG'){
    const src=node.getAttribute('src')||'';
    let u;try{u=new URL(src,SITE)}catch{continue}
    if(!u.href.startsWith(SITE+'assets/uploads/'))continue;
    if(!/\.(png|jpg|jpeg|webp)$/i.test(u.pathname))continue;
    const img=document.createElement('img');img.src=u.href;img.alt=text(node.getAttribute('alt')).slice(0,150);img.loading='lazy';parent.append(img);continue;
   }
   const element=document.createElement(node.tagName.toLowerCase());
   if(node.tagName==='A'){
    let url;try{url=new URL(node.getAttribute('href')||'')}catch{continue}
    if(!['https:','http:'].includes(url.protocol))continue;
    element.href=url.href;element.rel='noopener noreferrer nofollow';element.target='_blank';
   }
   build(node,element);parent.append(element);
  }
 }
 build(doc.body,output);
 return output.innerHTML.slice(0,75000);
}
function plainText(){
 if(quill&&!plain){
  const body=quill.getText().trim().replace(/[\u00a0\u202f\u2007]/g,' ').replace(/\n{3,}/g,'\n\n');
  $('body').value=body.replace(/\n(?!\n)/g,'\n\n');
 }
 const count=$('body').value.trim().split(/\s+/).filter(Boolean).length;
 $('word-count').textContent=count+' शब्द · '+$('body').value.trim().length+' अक्षरे';
}
function loadPost(item){
 active=item||null;coverPath='';
 if(quill&&!plain){
  if(item?.bodyHtml)quill.clipboard.dangerouslyPasteHTML(cleanHtml(item.bodyHtml),'silent');
  else quill.setText(Array.isArray(item?.body)?item.body.join('\n\n'):text(item?.body||''),'silent');
 }
 updateSEO();renderMedia();
}
function getRichHTML(){
 if(!quill||plain)return '';
 const raw=quill.getSemanticHTML?quill.getSemanticHTML():quill.root.innerHTML;
 const safe=cleanHtml(raw);
 return safe==='<p><br></p>'?'':safe;
}
function initEditor(){
 if(typeof window.Quill!=='function'){
  $('rich-toolbar').classList.add('hidden');$('rich-editor').classList.add('hidden');$('body').classList.remove('hidden');
  $('editor-mode').textContent='Text Editor (fallback)';return;
 }
 try{
 quill=new Quill('#rich-editor',{theme:'snow',modules:{toolbar:'#rich-toolbar'},formats:['header','bold','italic','underline','strike','list','blockquote','link','image']});
 $('body').required=false;
 $('body').classList.add('hidden');
 quill.on('text-change',()=>{plainText();updateSEO()});
 $('editor-mode').textContent='Rich Text Editor • Auto Count';
 plainText();
 }catch(e){
  quill=null;
  $('rich-toolbar').classList.add('hidden');$('rich-editor').classList.add('hidden');$('body').classList.remove('hidden');
  $('editor-mode').textContent='Text Editor';
 }
}
function toggleEditor(){
 if(!quill)return;
 plainText();
 plain=!plain;
 $('body').classList.toggle('hidden',!plain);
 $('rich-toolbar').classList.toggle('hidden',plain);
 $('rich-editor').classList.toggle('hidden',plain);
 $('editor-mode').textContent=plain?'Text/Markdown Editor':'Rich Text Editor';
 if(!plain)quill.setText($('body').value);
 $('body').required=plain;
}
function updateSEO(){
 const title=text($('seo-title').value||$('title').value).slice(0,155);
 const summary=text($('seo-description').value||$('summary').value).slice(0,350);
 $('seo-preview-title').textContent=title||'धाराशिव टुडे';
 $('seo-preview-desc').textContent=summary||'बातमीचा सारांश येथे दिसेल.';
 $('seo-preview-url').textContent=SITE+'batmi/'+encodeURIComponent(text($('slug').value||'your-news-url'))+'/';
 const sum=$('summary');if(sum){let status=$('summary-count');if(!status){status=document.createElement('small');status.id='summary-count';sum.insertAdjacentElement('afterend',status)}status.textContent=sum.value.length+' / 500 अक्षरे'}
}
let pageViewsSequence=0;
async function showPageViews(posts){
 const request=++pageViewsSequence;
 const total=$('metric-pageviews'),status=$('pageviews-status'),list=$('pageviews-list'),search=$('pageviews-search');
 total.textContent='—';list.replaceChildren();
 search.oninput=null;
 if(!CMS.hasToken()){status.textContent='आकडे पाहण्यासाठी Admin Login आवश्यक.';return}
 status.textContent='Page Views लोड होत आहेत…';
 try{
  const response=await CMS.getPageViews();if(request!==pageViewsSequence)return;
  if(!Array.isArray(response.counts))throw Error('Invalid response');
  const map=new Map(response.counts.map(x=>[String(x.slug),Number(x.views)||0]));
  total.textContent=[...map.values()].reduce((a,b)=>a+b,0).toLocaleString('en-IN');
  const rows=posts.filter(p=>p.published!==false&&p.status!=='draft').map(p=>({p,n:map.get(String(p.slug))||0})).sort((a,b)=>b.n-a.n||String(b.p.date).localeCompare(String(a.p.date)));
  status.textContent='';
  function draw(){
   list.replaceChildren();
   const q=search.value.trim().toLowerCase();
   for(const {p,n} of rows.filter(x=>String(x.p.title||'').toLowerCase().includes(q))){
    const row=document.createElement('button');row.type='button';row.className='dashboard-post';
    const name=document.createElement('strong');name.textContent=p.title;
    const value=document.createElement('span');value.textContent=n.toLocaleString('en-IN')+' Page Views';
    row.append(name,value);row.addEventListener('click',()=>{CMS.goto('news-panel');CMS.openPost(p.slug)});list.append(row);
   }
   if(!list.childNodes.length)list.textContent='बातमी उपलब्ध नाही.';
  }
  search.oninput=draw;draw();
 }catch(e){if(request===pageViewsSequence)status.textContent=e.message+' • Refresh करून पुन्हा तपासा.';}
}
function dashboard(posts){
 const all=Array.isArray(posts)?posts:[];
 showPageViews(all);
 $('metric-total').textContent=all.length;
 $('metric-published').textContent=all.filter(p=>p.published!==false&&p.status!=='draft').length;
 $('metric-draft').textContent=all.filter(p=>p.published===false||p.status==='draft').length;
 const selected=new Set(CMS.getLayout().featuredSlugs||[]);
 $('metric-featured').textContent=all.filter(p=>p.featured||selected.has(p.slug)).length;
 const list=$('dashboard-recent');list.replaceChildren();
 for(const item of all.slice(0).sort((a,b)=>text(b.date).localeCompare(text(a.date))).slice(0,8)){
  const row=document.createElement('button');row.type='button';row.className='dashboard-post';
  const label=document.createElement('strong');label.textContent=item.title;
  const sub=document.createElement('span');sub.textContent=(item.published===false?'Draft':'Published')+' · '+(item.category||'')+' · '+(item.date||'');
  row.append(label,sub);row.addEventListener('click',()=>{CMS.goto('news-panel');CMS.openPost(item.slug)});
  list.append(row);
 }
}
function mediaPaths(){
 const entries=[];
 for(const p of CMS.getNews()){
  const paths=[p.image,...(p.gallery||[])].filter(v=>imagePattern.test(text(v)));
  for(const path of paths)entries.push({path,alt:p.title||p.slug});
 }
 for(const item of extraMedia)if(imagePattern.test(item.path))entries.push({path:item.path,alt:item.alt||item.path});
 for(const path of uploaded)if(imagePattern.test(path))entries.push({path,alt:'Uploaded image'});
 const seen=new Set();
 return entries.filter(x=>{if(seen.has(x.path))return false;seen.add(x.path);return true});
}
async function loadMediaIndex(){
 try{
  const {value,sha}=await CMS.loadMedia();
  if(Array.isArray(value)){extraMedia=value;mediaSha=sha}
 }catch(e){CMS.status('Media Library list: '+e.message,'error')}
 renderMedia();
}
function setCoverPath(path){
 if(!imagePattern.test(path))return;
 coverPath=path;
 $('photo').value='';$('cover-preview').src=SITE+path;$('cover-preview').classList.remove('hidden');
 CMS.status('✅ मुख्य फोटो निवडला. Publish/Update केल्यावर बातमीच्या शेअरिंगमध्ये हाच फोटो वापरला जाईल.','success');
}
function insertPhoto(path){
 if(!imagePattern.test(path))return;
 if(quill&&!plain){
  const sel=quill.getSelection(true);
  const at=sel?.index??quill.getLength();
  quill.insertEmbed(at,'image',SITE+path,'user');quill.setSelection(at+1,0);
  plainText();
  CMS.status('फोटो लेखात जोडला. Publish/Update करा.','success');
 }else{
  $('body').value+=' \n\n[चित्र: '+SITE+path+']\n\n';
  CMS.status('फोटो लिंक लेखात जोडली. Rich Editor चालू असल्यास प्रत्यक्ष फोटो दिसेल.');
 }
}
function openMedia(mode='cover'){
 mediaMode=mode;
 CMS.goto('media-panel');renderMedia();
}
function renderMedia(){
 const grid=$('media-grid');if(!grid)return;
 const query=$('media-search').value.trim().toLowerCase();
 const list=mediaPaths().filter(x=>!query||(x.alt+' '+x.path).toLowerCase().includes(query));
 $('media-count').textContent=String(list.length);
 grid.replaceChildren();
 if(!list.length){const empty=document.createElement('p');empty.textContent='फोटो उपलब्ध नाहीत.';grid.append(empty);return}
 for(const item of list.slice(0,180)){
  const card=document.createElement('div');card.className='media-card';
  const img=document.createElement('img');img.src=SITE+item.path;img.alt=item.alt;img.loading='lazy';
  const caption=document.createElement('span');caption.textContent=item.alt;
  const buttons=document.createElement('div');buttons.className='media-card-actions';
  const cover=document.createElement('button');cover.className='btn mini';cover.type='button';cover.textContent='कव्हर';
  cover.addEventListener('click',()=>{setCoverPath(item.path);CMS.goto('news-panel')});
  const insert=document.createElement('button');insert.type='button';insert.className='btn mini';insert.textContent='लेखात घाला';
  insert.addEventListener('click',()=>{insertPhoto(item.path);CMS.goto('news-panel')});
  const copy=document.createElement('button');copy.type='button';copy.className='btn mini';copy.textContent='लिंक';
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(SITE+item.path);CMS.status('फोटो URL कॉपी झाली.','success')}catch{prompt('Media URL:',SITE+item.path)}});
  buttons.append(cover,insert,copy);card.append(img,caption,buttons);grid.append(card);
 }
}
async function uploadMedia(){
 const file=$('media-file').files[0];
 if(!file)return CMS.status('Media Library मध्ये JPG, PNG किंवा WebP फोटो निवडा.','error');
 if(!CMS.hasToken())return CMS.status('फोटो Upload करण्यासाठी Server Access Token जोडणे आवश्यक आहे.','error');
 const button=$('media-upload');button.disabled=true;
 CMS.status('Media Library: फोटो अपलोड होत आहे…');
 try{
  const path='assets/uploads/media-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6)+'.jpg';
  await CMS.uploadMedia(file,path);
  uploaded.push(path);
  const {value,sha}=await CMS.loadMedia();
  const updated=Array.isArray(value)?value:[];
  updated.unshift({path,alt:file.name.slice(0,110),created:new Date().toISOString()});
  await CMS.saveMedia(updated,sha);
  extraMedia=updated;$('media-file').value='';renderMedia();
  CMS.status('✅ फोटो Media Library मध्ये जतन झाला. Server वर अपडेट पूर्ण झाल्यावर लिंक Live होईल.','success');
 }catch(e){CMS.status('Media Upload: '+e.message,'error')}
 finally{button.disabled=false}
}
function renderCustomization(o){
 const a=o.appearance||{},s=o.site||{},social=s.social||{};
 const set=(id,value,defaultValue='')=>{const el=$(id);if(el)el.value=value??defaultValue};
 brandLogoPath=/^assets\/branding\/[a-z0-9_.-]+\.(png|jpg|jpeg|webp)$/i.test(a.logoPath||'')?a.logoPath:'';
 $('brand-logo-preview').src=brandLogoPath?SITE+brandLogoPath:SITE+'assets/logo-original-hd.png';
 set('theme-preset',a.themePreset,'classic');set('news-density',a.density,'normal');
 set('font-scale',String(a.fontScale??1));set('logo-width',String(a.logoWidth??340));
 $('logo-width-label').textContent=$('logo-width').value;
 set('column-items',a.columnItems,5);set('ticker-seconds',a.tickerSeconds,7);
 set('columns-title',a.columnsTitle,'विभागवार बातम्या');
 const checks={'show-breaking':'showBreaking','show-weather':'showWeather','show-columns':'showColumns','show-related':'showRelated','show-category-sections':'showCategorySections'};
 for(const [id,key] of Object.entries(checks))$(id).checked=a[key]!==false;
 set('site-title',s.title,'दलालनामा | जनतेचा आवाज');
 set('site-description',s.description,'धाराशिव टुडे मराठी डिजिटल न्यूज पोर्टल — महाराष्ट्रातील बातम्या, विश्लेषण व जनतेचे प्रश्न.');
 set('footer-statement',s.footerStatement,'सत्तेच्या प्रत्येक निर्णयाला प्रश्न, सार्वजनिक पैशाच्या प्रत्येक व्यवहाराला हिशेब! ठोस पुरावे, निर्भीड प्रश्न आणि जनतेच्या हक्कांसाठी सातत्यपूर्ण पाठपुरावा हीच दलालनामाची भूमिका.');
 set('footer-label',s.footerLabel,'स्वतंत्र मराठी डिजिटल न्यूज पोर्टल');
 for(const item of ['facebook','instagram','youtube','x'])set('social-'+item,social[item],'');
}
function readCustomization(){
 const val=id=>$(id).value.trim();
 const pos=(id,defaultValue,min,max)=>Math.min(max,Math.max(min,Number($(id).value)||defaultValue));
 const checks=['showBreaking','showWeather','showColumns','showRelated','showCategorySections'];
 const appearance={
  themePreset:val('theme-preset'),density:val('news-density'),fontScale:pos('font-scale',1,1,1.12),
  logoWidth:pos('logo-width',340,210,450),logoPath:brandLogoPath,columnItems:pos('column-items',5,2,8),
  tickerSeconds:pos('ticker-seconds',7,3,15),columnsTitle:val('columns-title').slice(0,90)
 };
 for(const key of checks){
  const id='show-'+key.slice(4).replace(/[A-Z]/g,ch=>'-'+ch.toLowerCase()).replace(/^-/, '');
  // Explicit mapping avoids guesswork for category sections
 }
 appearance.showBreaking=$('show-breaking').checked;appearance.showWeather=$('show-weather').checked;
 appearance.showColumns=$('show-columns').checked;appearance.showRelated=$('show-related').checked;
 appearance.showCategorySections=$('show-category-sections').checked;
 const social={};for(const x of ['facebook','instagram','youtube','x']){
  const v=val('social-'+x);
  if(v){
   let u;try{u=new URL(v)}catch{CMS.status(x+' URL योग्य नाही.','error');throw Error(x+' URL योग्य नाही.')}
   if(u.protocol!=='https:')throw Error('Social URL https:// असणे आवश्यक आहे.');
  }
  social[x]=v;
 }
 return {appearance,site:{title:val('site-title').slice(0,110),description:val('site-description').slice(0,350),
 footerStatement:val('footer-statement').slice(0,500),footerLabel:val('footer-label').slice(0,180),social}};
}
function renderPreview(root){
 if(!quill||plain)return;
 const html=getRichHTML();if(!html)return;
 for(const child of [...root.children].slice(1))child.remove();
 const rich=document.createElement('div');rich.className='dn-admin-preview-rich';
 rich.innerHTML=html;root.append(rich);
}
function init(){
 if(initDone)return;initDone=true;
 initEditor();
 $('toggle-editor').addEventListener('click',toggleEditor);
 $('body').addEventListener('input',()=>{plainText();updateSEO()});
 for(const id of ['title','slug','summary','seo-title','seo-description'])$(id).addEventListener('input',updateSEO);
 $('media-search').addEventListener('input',renderMedia);
 $('media-upload').addEventListener('click',uploadMedia);
 $('choose-cover').addEventListener('click',()=>openMedia('cover'));
 $('insert-photo').addEventListener('click',()=>openMedia('insert'));
 $('dashboard-refresh').addEventListener('click',()=>dashboard(CMS.getNews()));
 $('logo-width').addEventListener('input',()=>$('logo-width-label').textContent=$('logo-width').value);
 $('upload-brand-logo').addEventListener('click',async()=>{
  const file=$('brand-logo-file').files[0];
  if(!file)return CMS.status('अपलोड करण्यासाठी HD Logo निवडा.','error');
  if(!CMS.hasToken())return CMS.status('लोगो बदलण्यासाठी Server Access Token जोडणे आवश्यक आहे.','error');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':file.type==='image/jpeg'?'jpg':'';
  if(!ext)return CMS.status('PNG, JPG किंवा WebP लोगो निवडा.','error');
  const button=$('upload-brand-logo');button.disabled=true;
  try{
   const path='assets/branding/logo-'+Date.now().toString(36)+'.'+ext;
   await CMS.uploadBrand(file,path);brandLogoPath=path;
   $('brand-logo-preview').src=URL.createObjectURL(file);
   CMS.status('✅ HD लोगो Upload झाला. आता “Save & Publish Appearance” दाबा.','success');
  }catch(e){CMS.status('Logo Upload अयशस्वी: '+e.message,'error')}
  finally{button.disabled=false}
 });
 for(const button of document.querySelectorAll('[data-jump]'))button.addEventListener('click',()=>{
   if(button.dataset.jump==='news-panel')CMS.newPost();
   CMS.goto(button.dataset.jump);
 });
 window.addEventListener('dalal:news-updated',e=>{
  dashboard(e.detail?.news||CMS.getNews());
  renderMedia();
  if(e.detail?.layout)renderCustomization(e.detail.layout);
 });
 dashboard(CMS.getNews());renderCustomization(CMS.getLayout());loadMediaIndex();updateSEO();
}
window.DalalPro={
 loadPost,clearCoverPath:()=>{coverPath=''},getCoverPath:()=>coverPath,getRichHTML,renderPreview,
 renderCustomization,readCustomization,
 onTab:id=>{if(id==='media-panel')renderMedia();if(id==='dashboard-panel')dashboard(CMS.getNews())}
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();