'use strict';
(async()=>{
 const ROOT='/dharashivtoday/';
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
 const categories=['मुख्यपृष्ठ','ताज्या बातम्या','विशेष बातम्या','जिल्हा','क्राईम','राजकारण','शेती','विकास','शिक्षण','नोकरी','पर्यटन','क्रीडा','मनोरंजन','विशेष लेख','संपादकीय'];
 const district=['धाराशिव','तुळजापूर','कळंब','भूम','परंडा','वाशी','उमरगा','लोहारा'];
 const CHANNEL='UCgXmATfMB5qHTrwDBlcZNpA';
 const PLAYLIST='UU'+CHANNEL.slice(2);
 let stories=[],settings={},layout={},query='';
 const storyUrl=p=>ROOT+'batmi/'+encodeURIComponent(p.slug)+'/';
 const dateFmt=s=>{try{return new Intl.DateTimeFormat('mr-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(String(s).slice(0,10)+'T12:00:00+05:30'))}catch{return String(s||'')}};
 $('todayDate').textContent=new Intl.DateTimeFormat('mr-IN',{day:'numeric',month:'long',year:'numeric',weekday:'long',timeZone:'Asia/Kolkata'}).format(new Date());
 $('footerYear').textContent=new Date().getFullYear();
 const visible=()=>stories.filter(p=>p&&p.slug&&p.title&&p.published!==false&&p.status!=='draft').sort((a,b)=>String(b.date||b.updated||'').localeCompare(String(a.date||a.updated||'')));
 const image=(p,full=false)=>{const raw=String((!full&&p.thumbImage)||p.image||'');if(/^assets\/(?:uploads|branding)\/[a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/i.test(raw))return ROOT+raw;try{const u=new URL(raw);if(u.protocol==='https:'&&u.hostname==='dharashivlive.com'&&u.pathname.startsWith('/wp-content/uploads/')&&/\.(png|jpg|jpeg|webp)$/i.test(u.pathname))return u.href}catch{}return ''};
 const cover=p=>{const src=image(p,true);return '<span class="thumb">'+(src?'<img loading="lazy" decoding="async" src="'+esc(src)+'" alt="'+esc(p.title)+'">':'<span class="placeholder">धाराशिव टुडे</span>')+'</span>'};
 const info=p=>'<div class="post-mini-meta">'+esc(dateFmt(p.date))+'</div>';
 const card=p=>'<a class="news-card" href="'+storyUrl(p)+'">'+cover(p)+'<div class="category">'+esc(p.category||'बातमी')+'</div><h3>'+esc(p.title)+'</h3>'+(p.summary?'<p>'+esc(p.summary).slice(0,100)+'</p>':'')+info(p)+'</a>';
 const filter=(p,cat)=>!cat||cat==='मुख्यपृष्ठ'||cat==='ताज्या बातम्या'||p.category===cat||(cat==='विशेष बातम्या'&&(p.featured||p.category==='विशेष लेख'))||(cat==='जिल्हा'&&(p.category==='जिल्हा'||(p.tags||[]).some(t=>district.includes(t))));
 const inSearch=p=>!query||[p.title,p.summary,p.category,p.author,...(p.tags||[])].join(' ').toLocaleLowerCase('mr-IN').includes(query.toLocaleLowerCase('mr-IN'));
 function nav(){
  const menu=Array.isArray(layout.menu)&&layout.menu.length?layout.menu:categories;
  $('navLinks').innerHTML=menu.map((cat,i)=>'<a data-category="'+esc(cat)+'" href="'+(i===0?ROOT:ROOT+'?category='+encodeURIComponent(cat))+'">'+(i===0?'<svg class="nav-home-icon" xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#d60012" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M10 21v-7h4v7"/></svg>':esc(cat))+'</a>').join('');
  $('listingLinks').innerHTML=menu.slice(1).map(t=>'<a href="'+ROOT+'?category='+encodeURIComponent(t)+'">'+esc(t)+'</a>').join('');
 }
 function breaking(list){
  const latest=Array.isArray(list)?list:visible();
  const requested=Array.isArray(layout.breaking)?layout.breaking.filter(x=>String(x||'').trim()):[];
  const headlines=requested.length?requested:latest.slice(0,7).map(p=>p.title);
  const news=headlines.length?headlines:[settings.breakingText||'जिल्ह्याचा आवाज... जनतेची बातमी!'];
  const items=news.map((headline)=>{
   const clean=String(headline).replace(/\s+/g,' ').trim();
   const match=latest.find(p=>p.title.trim()===clean)||latest.find(p=>p.title.includes(clean)||clean.includes(p.title));
   const destination=match?storyUrl(match):ROOT+'?category='+encodeURIComponent('ताज्या बातम्या');
   const label=match?'संपूर्ण बातमी वाचा':'ताज्या बातम्या पाहा';
   return '<a class="ticker-item" href="'+destination+'" title="'+esc(clean)+'" aria-label="'+esc(clean+' — '+label)+'">'+esc(clean)+'</a>';
  }).join('');
  const track=$('tickerNews');
  track.classList.remove('ticker-running');
  track.innerHTML='<span class="ticker-group">'+items+'</span><span class="ticker-group" aria-hidden="true">'+items+'</span>';
  const first=track.firstElementChild, second=track.lastElementChild;
  const measure=()=>{
   const width=track.parentElement.clientWidth;
   const base=first.getBoundingClientRect().width/(Number(first.dataset.copies)||1);
   if(!width||!base)return;
   const copies=Math.max(1,Math.ceil((width+100)/base));
   if(first.dataset.copies!==String(copies)){
    first.innerHTML=items.repeat(copies);second.innerHTML=items.repeat(copies);
    first.dataset.copies=String(copies);
    second.querySelectorAll('a').forEach(a=>a.tabIndex=-1);
   }
   track.style.setProperty('--ticker-duration',Math.max(4,first.getBoundingClientRect().width/80)+'s');
   track.classList.add('ticker-running');
  };
  measure();
  if(document.fonts?.ready)document.fonts.ready.then(measure);
  if(typeof ResizeObserver!=='undefined'){
   if(track._tickerObserver)track._tickerObserver.disconnect();
   track._tickerObserver=new ResizeObserver(measure);
   track._tickerObserver.observe(track.parentElement);
  }
 }
 function homepage(list){
  const featured=[...list.filter(x=>x.featured),...list.filter(x=>!x.featured)].filter((p,i,a)=>a.findIndex(q=>q.slug===p.slug)===i);
  const p=featured[0];
  $('heroGrid').innerHTML=p?'<a class="lead-card" href="'+storyUrl(p)+'">'+cover(p)+'<h2>'+esc(p.title)+'</h2>'+info(p)+'</a>':'<div class="front-empty"><span>धाराशिव टुडे</span><h2>जिल्ह्याच्या ताज्या बातम्या</h2><p>पहिली बातमी प्रकाशित झाल्यावर मुख्य बातमी येथे दिसेल.</p><a href="'+ROOT+'admin/">बातमी प्रसिद्ध करा →</a></div>';
  $('headlineBrief').innerHTML=featured.slice(1,5).map(x=>'<a class="brief-card" href="'+storyUrl(x)+'"><h3>'+esc(x.title)+'</h3>'+cover(x)+'</a>').join('')||'<div class="brief-empty">जिल्ह्यातील महत्त्वाच्या बातम्या येथे दिसतील.</div>';
  const special=list.filter(x=>x.featured||x.category==='विशेष बातम्या'||x.category==='विशेष लेख');
  const specialStories=[...special,...list.filter(x=>!special.includes(x))].slice(0,3);
  $('specialList').innerHTML=specialStories.map(x=>'<a class="special-card" href="'+storyUrl(x)+'"><div class="special-story-copy"><span class="tag">'+esc(x.category||'विशेष')+'</span><h3>'+esc(x.title)+'</h3></div>'+cover(x)+'</a>').join('')||'<div class="brief-empty">विशेष बातम्या येथे प्रसिद्ध होतील.</div>';
  $('latestGrid').innerHTML=list.slice(0,6).map(card).join('')||'<div class="empty-results">Admin मधून बातम्या प्रकाशित झाल्यावर येथे दिसतील.</div>';
  $('districtGrid').innerHTML=(settings.districts||district).map(x=>'<a href="'+ROOT+'?q='+encodeURIComponent(x)+'">'+esc(x)+' →</a>').join('');
  const sectionCats=['क्राईम','राजकारण','शेती','विकास','शिक्षण','नोकरी','पर्यटन'].filter(cat=>list.some(p=>p.category===cat));
  // Use unique real stories to demonstrate the three-card layout while a section is short.
  // Supplementary stories are explicitly labeled with their actual category.
  const reserved=new Set(sectionCats.flatMap(cat=>list.filter(p=>p.category===cat).slice(0,3).map(p=>p.slug)));
  const supplemental=list.filter(p=>!reserved.has(p.slug));
  const used=new Set();
  const compactRow=(p,fallback)=>'<a class="topic-row" href="'+storyUrl(p)+'" title="'+esc(p.title)+'">'+cover(p)+'<span><strong>'+esc(p.title)+'</strong>'+(fallback?'<small class="topic-demo-label">इतर बातमी · '+esc(p.category||'बातमी')+'</small>':'')+'</span></a>';
  const placeholder=()=>'<div class="topic-row topic-demo-empty"><span class="thumb" aria-hidden="true"><span class="placeholder">+</span></span><span><strong>नवीन बातमीसाठी जागा</strong><small>Demo · लवकरच</small></span></div>';
  const sectionHTML=cat=>{
   const relevant=list.filter(p=>p.category===cat);
   const chosen=relevant.slice(0,3);
   for(const p of supplemental){if(chosen.length>=3)break;if(used.has(p.slug)||chosen.some(x=>x.slug===p.slug))continue;chosen.push(p);used.add(p.slug);}
   const more=ROOT+'?category='+encodeURIComponent(cat);
   const rows=chosen.map((p,i)=>i===0?'<a class="topic-main" href="'+storyUrl(p)+'" title="'+esc(p.title)+'">'+cover(p)+'<strong>'+esc(p.title)+'</strong>'+'</a>':compactRow(p,p.category!==cat)).join('')+Array.from({length:Math.max(0,3-chosen.length)},placeholder).join('');
   return '<section class="topic-panel"><div class="topic-heading"><h3>'+esc(cat)+'</h3><span class="heading-line"></span><a class="view-more" href="'+more+'">View More →</a></div><div class="topic-stories">'+rows+'</div></section>';
  };
  const band=$('categoryBand');
  band.dataset.count=String(sectionCats.length);
  band.dataset.odd=String(sectionCats.length%2===1);
  const cols=sectionCats.length<=4?Math.max(1,sectionCats.length):sectionCats.length===5?3:3;
  band.style.setProperty('--dt-category-cols',String(cols));
  band.innerHTML=sectionCats.map(sectionHTML).join('');
  band.closest('.category-section').hidden=sectionCats.length===0;
  if(sectionCats.length===5){band.dataset.five='true';}else{delete band.dataset.five;}
 }
 function listing(cat,list){
  $('homeSections').hidden=true;$('listingSections').hidden=false;$('articleSection').hidden=true;
  const title=query?'शोध : '+query:cat||'ताज्या बातम्या';$('listingHeading').textContent=title;
  const exact=list.filter(p=>filter(p,cat)&&inSearch(p));
  const fallback=!!cat&&cat!=='ताज्या बातम्या'&&!query&&exact.length===0;
  const rows=fallback?list.slice(0,9):exact;
  $('listingGrid').innerHTML=(fallback?'<p class="section-fallback-note">या विभागातील स्वतंत्र बातम्या उपलब्ध नसल्यामुळे इतर महत्त्वाच्या बातम्या दाखवत आहोत.</p>':'')+(rows.map(card).join('')||'<div class="empty-results">या विभागात अजून प्रकाशित बातम्या नाहीत.</div>');
  document.title=title+' | धाराशिव टुडे';
 }
 function cleanHtml(raw){
  const doc=new DOMParser().parseFromString(String(raw||''),'text/html');
  const allowed=new Set(['P','BR','B','STRONG','H2','H3','I','EM','U','S','OL','UL','LI','BLOCKQUOTE','A','IMG']);
  const refuse=new Set(['SCRIPT','STYLE','IFRAME','SVG','FORM','INPUT','OBJECT','BUTTON','LINK','META','EMBED']);
  const dst=document.createElement('div');
  function copy(root,out){for(const n of [...root.childNodes]){
   if(n.nodeType===3){out.appendChild(document.createTextNode(n.textContent));continue}if(n.nodeType!==1||refuse.has(n.tagName))continue;
   if(!allowed.has(n.tagName)){copy(n,out);continue}
   const el=document.createElement(n.tagName.toLowerCase());
   if(n.tagName==='A'){let u;try{u=new URL(n.getAttribute('href')||'')}catch{continue}if(!['https:','http:'].includes(u.protocol))continue;el.href=u.href;el.rel='noopener noreferrer nofollow';el.target='_blank'}
   if(n.tagName==='IMG'){const src=n.getAttribute('src')||'';let url;try{url=new URL(src,location.origin)}catch{continue}
    if(url.origin!==location.origin||!url.pathname.startsWith(ROOT+'assets/uploads/'))continue;el.src=url.href;el.alt=(n.getAttribute('alt')||'').slice(0,150);el.loading='lazy';out.appendChild(el);continue}
   copy(n,el);out.appendChild(el)
  }}copy(doc.body,dst);return dst.innerHTML;
 }
 const socialIcon={
  whatsapp:'<path d="M20.5 3.5a11.1 11.1 0 0 0-17 13.3L2 22l5.4-1.5a11.1 11.1 0 0 0 13.1-17Z"/><path d="M9 7.5c.4-.4.8-.4 1.1.2l.9 2c.1.3 0 .6-.3.9l-.6.7c1 1.8 2 2.6 3.6 3.5l.9-.7c.3-.2.6-.3.9-.1l1.8.9c.5.3.6.7.2 1.1-.6.8-1.4 1.1-2.4.9-3.5-.8-6.9-4.2-7.7-7.5-.2-1 .2-1.8 1.6-2.9Z"/>',
  facebook:'<path d="M15 3h-2a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h3l.5-4H13V7c0-.7.4-1 1-1h1V3Z"/>',
  x:'<path d="M4 4l16 16M20 4 4 20M4 4h4l12 16h-4M20 4h-4L4 20h4"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  share:'<path d="M12 16V3m0 0L7 8m5-5 5 5"/><path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
  home:'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M10 21v-7h4v7"/>'
 };
 const iconSvg=(name)=>'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+socialIcon[name]+'</svg>';
 function article(slug,list){
  $('homeSections').hidden=true;$('listingSections').hidden=true;$('articleSection').hidden=false;
  const p=list.find(x=>x.slug===slug);
  if(!p){$('articleMount').innerHTML='<div class="empty-results">ही बातमी उपलब्ध नाही. <a href="'+ROOT+'">मुख्यपृष्ठावर जा</a></div>';return}
  document.title=(p.seoTitle||p.title)+' | धाराशिव टुडे';
  const body=Array.isArray(p.body)?p.body.join('\n\n'):String(p.body||'');
  const html=p.bodyHtml?cleanHtml(p.bodyHtml):body.split(/\n\s*\n/).filter(Boolean).map(par=>'<p>'+esc(par).replace(/\n/g,'<br>')+'</p>').join('');
  const shareUrl=new URL(storyUrl(p),location.origin).href;
  const shareTitle=p.title+' | धाराशिव टुडे';
  const shareStrip='<div class="social-share" aria-label="बातमी शेअर करा">'
   +'<div class="share-label">'+iconSvg('share')+' <span>ही बातमी शेअर करा</span></div>'
   +'<div class="share-options">'
   +'<a class="share-option share-wa" href="https://wa.me/?text='+encodeURIComponent(shareTitle+'\n'+shareUrl)+'" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp वर बातमी शेअर करा">'+iconSvg('whatsapp')+'<span>WhatsApp</span></a>'
   +'<a class="share-option share-fb" href="https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(shareUrl)+'" target="_blank" rel="noopener noreferrer" aria-label="Facebook वर बातमी शेअर करा">'+iconSvg('facebook')+'<span>Facebook</span></a>'
   +'<a class="share-option share-x" href="https://twitter.com/intent/tweet?text='+encodeURIComponent(shareTitle)+'&url='+encodeURIComponent(shareUrl)+'" target="_blank" rel="noopener noreferrer" aria-label="X वर बातमी शेअर करा">'+iconSvg('x')+'<span>Post</span></a>'
   +'<button class="share-option share-copy copy-news-link" type="button" aria-label="बातमीची लिंक कॉपी करा">'+iconSvg('copy')+'<span>लिंक कॉपी</span></button>'
   +(typeof navigator.share==='function'?'<button class="share-option share-native" type="button" aria-label="इतर ॲपवर शेअर करा">'+iconSvg('share')+'<span>Share</span></button>':'')
   +'</div><span class="share-status" aria-live="polite"></span></div>';
  const related=list.filter(x=>x.slug!==slug).slice(0,6);
  const relatedHtml=related.map(x=>'<a class="related-story" href="'+storyUrl(x)+'">'+cover(x)+'<span>'+esc(x.title)+'</span></a>').join('');
  const main='<article class="article-main"><div class="article-kicker"><span class="article-category">'+esc(p.category||'बातमी')+'</span><span class="article-source-brand">DHARASHIV TODAY</span></div>'
   +'<h1>'+esc(p.title)+'</h1>'
   +'<div class="article-meta">'+iconSvg('share')+' <span>'+esc(dateFmt(p.date))+'</span> <span class="article-meta-dot">•</span> <span>'+esc(p.author||'धाराशिव टुडे न्यूज डेस्क')+'</span></div>'
   +(p.summary?'<p class="article-intro">'+esc(p.summary)+'</p>':'')
   +(image(p,true)?'<figure class="article-figure"><img src="'+esc(image(p,true))+'" alt="'+esc(p.title)+'" decoding="async"><figcaption>छायाचित्र : '+esc(p.imageCredit||p.source||'धाराशिव टुडे')+'</figcaption></figure>':'')
   +'<div class="article-body">'+html+'</div>'
   +(p.sourceUrl&&/^https:\/\/dharashivlive\.com\//.test(p.sourceUrl)?'<div class="source-credit">स्रोत : <a href="'+esc(p.sourceUrl)+'" target="_blank" rel="noopener noreferrer">धाराशिव लाईव्ह — मूळ बातमी</a> · '+esc(dateFmt(p.date))+'</div>':'')
   +'<div class="article-after"><span>ही बातमी उपयोगी वाटली? आपल्या मित्रांपर्यंत पोहोचवा.</span>'+shareStrip+'</div>'
   +'<a class="back-to-home" href="'+ROOT+'">'+iconSvg('home')+' मुख्यपृष्ठावर परत जा</a></article>';
  $('articleMount').innerHTML='<div class="article-layout">'+main+'<aside class="article-sidebar"><div class="article-sidebar-heading"><span>आणखी बातम्या</span></div>'+relatedHtml+'</aside></div>';
  $('articleMount').querySelectorAll('.copy-news-link').forEach(btn=>btn.addEventListener('click',async()=>{
   try{await navigator.clipboard.writeText(shareUrl);
    const status=btn.closest('.social-share')?.querySelector('.share-status');if(status)status.textContent='✓ लिंक कॉपी झाली';
    btn.querySelector('span').textContent='कॉपी झाली';
   }catch(e){const status=btn.closest('.social-share')?.querySelector('.share-status');if(status)status.textContent='लिंक कॉपी झाली नाही. ब्राउझरची परवानगी तपासा.'}
  }));
  $('articleMount').querySelectorAll('.share-native').forEach(btn=>btn.addEventListener('click',async()=>{
   try{await navigator.share({title:shareTitle,text:p.title,url:shareUrl})}catch(e){if(e.name!=='AbortError'){const status=btn.closest('.social-share')?.querySelector('.share-status');if(status)status.textContent='शेअर करता आले नाही.'}}
  }));
 }
 function render(){
  const list=visible(),params=new URLSearchParams(location.search);
  let slug=document.documentElement.dataset.story||params.get('article')||'';
  if(!slug){const m=location.pathname.match(/\/batmi\/([a-z0-9_-]+)\/?/i);if(m)slug=m[1]}
  query=params.get('q')||'';
  $('searchInput').value=query;const cat=params.get('category')||'';
  $('breadcrumb').hidden=!slug&&!cat&&!query;$('breadcrumb').innerHTML='<a href="'+ROOT+'">मुख्यपृष्ठ</a> / '+esc(cat|| (slug?'बातमी':'शोध'));
  if(slug)article(slug,list);else if(cat||query)listing(cat,list);else{
   $('homeSections').hidden=false;$('listingSections').hidden=true;$('articleSection').hidden=true;homepage(list);document.title='धाराशिव टुडे | जिल्ह्याचा आवाज... जनतेची बातमी!';
  }
  $('navLinks').querySelectorAll('a').forEach(a=>a.classList.toggle('active',a.dataset.category===(cat||(!slug&&!query?'मुख्यपृष्ठ':''))));
 }
 $('searchToggle').addEventListener('click',()=>{$('searchPanel').hidden=!$('searchPanel').hidden;if(!$('searchPanel').hidden)$('searchInput').focus()});
 $('searchInput').addEventListener('input',e=>{const v=e.target.value.trim();const next=v?ROOT+'?q='+encodeURIComponent(v):ROOT;history.replaceState({},'',next);render()});
 $('searchClear').addEventListener('click',()=>{history.replaceState({},'',ROOT);render()});
 $('menuToggle').addEventListener('click',()=>{const next=!$('navLinks').classList.contains('expanded');$('navLinks').classList.toggle('expanded',next);$('menuToggle').setAttribute('aria-expanded',String(next))});
 const playlistSrc='https://www.youtube-nocookie.com/embed/videoseries?list='+PLAYLIST+'&autoplay=1&mute=1&playsinline=1&rel=0';
 const liveSrc='https://www.youtube-nocookie.com/embed/live_stream?channel='+CHANNEL+'&autoplay=1&mute=1&playsinline=1';
 function player(mode){$('videoPlayer').src=mode==='live'?liveSrc:playlistSrc;$('liveBtn').classList.toggle('is-active',mode==='live');$('playlistBtn').classList.toggle('is-active',mode!=='live');}
 $('liveBtn').addEventListener('click',()=>player('live'));$('playlistBtn').addEventListener('click',()=>player('playlist'));
 player('playlist');
 try{
  const [newsRes,settingsRes,layoutRes]=await Promise.all([fetch(ROOT+'data/news.json?t='+Date.now(),{cache:'no-store'}),fetch(ROOT+'data/settings.json?t='+Date.now(),{cache:'no-store'}),fetch(ROOT+'data/layout.json?t='+Date.now(),{cache:'no-store'})]);
  if(newsRes.ok)stories=await newsRes.json();if(settingsRes.ok)settings=await settingsRes.json();if(layoutRes.ok)layout=await layoutRes.json();if(!Array.isArray(stories))stories=[];
 }catch(e){console.warn('DharashivToday initial load:',e)}
 nav();breaking(visible());render();window.addEventListener('popstate',render);
})();
