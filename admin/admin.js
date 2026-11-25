
'use strict';
(()=>{
  const REPO='catonpe-droid/dharashivtoday';
  const API='https://api.github.com/repos/'+REPO+'/contents/';
  const SITE='https://catonpe-droid.github.io/dharashivtoday/';
  // Same private-link flow as Lokhit: #key is never sent in the page request.
  const rawSecret=location.hash.startsWith('#key=')?location.hash.slice(5):'';
  let publishKey='';
  try{publishKey=decodeURIComponent(rawSecret).trim()}catch{publishKey=rawSecret.trim()}
  let workerURL='',workerMode=false,lastLoadError='';
  const connected=()=>workerMode||!!state.token;
  const $=id=>document.getElementById(id);
  const state={token:'',news:[],newsSha:'',layout:{},layoutSha:'',activeSlug:'',filter:'all',selected:new Set(),busy:false,ready:false,photoUrl:''};
  const allowedSlug=/^[a-z0-9][a-z0-9_-]{2,95}$/;
  const defaultCategories=["ताज्या बातम्या","विशेष बातम्या","जिल्हा","क्राईम","राजकारण","शेती","विकास","शिक्षण","नोकरी","पर्यटन","क्रीडा","मनोरंजन","विशेष लेख","संपादकीय","धाराशिव","तुळजापूर","कळंब","भूम","परंडा","वाशी","उमरगा","लोहारा"];
  const busyButtons=['publish','draft','delete','bulk-delete','save-layout'];
  const dateNow=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
  function message(text,type=''){
    const el=$('status');el.textContent=text;el.className='notice'+(type?' '+type:'');
  }
  function setBusy(flag){
    state.busy=flag;
    for(const id of busyButtons){const node=$(id);if(node)node.disabled=flag||(id==='bulk-delete'&&!state.selected.size)}
    for(const id of ['refresh','connect','disconnect','new','new-top']){const node=$(id);if(node)node.disabled=flag}
  }
  function decodeBase64(s){
    const bytes=Uint8Array.from(atob(String(s||'').replace(/\s/g,'')),x=>x.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function encodeBase64(s){
    const bytes=new TextEncoder().encode(s);let result='';
    for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(result);
  }
  async function github(path,method='GET',payload=null){
    if(method!=='GET'&&!connected())throw Error('प्रकाशनासाठी Server Access Token किंवा सुरक्षित Key Link आवश्यक आहे.');
    const headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if(state.token)headers.Authorization='Bearer '+state.token;
    if(payload)headers['Content-Type']='application/json';
    // Cloudflare Worker holds the repository-scoped GitHub token in a Worker Secret.
    // The user's short publication key is a bearer credential, never a GitHub token.
    if(workerMode){
      // Browser CORS: the Worker preflight does not allow GitHub-only version header.
      // Worker itself supplies X-GitHub-Api-Version when contacting GitHub.
      delete headers['X-GitHub-Api-Version'];
      headers.Authorization='Bearer '+publishKey;
      headers['Cache-Control']='no-store';
    }
    const url=workerMode?workerURL+'/github?path='+encodeURIComponent(path):
      API+path+(method==='GET'?'?ref=main':'');
    const response=await fetch(url,{
      method,headers,cache:'no-store',referrerPolicy:'no-referrer',
      ...(payload?{body:JSON.stringify(payload)}:{})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===401){
        if(workerMode&&data.error==='Invalid publishing key')
          throw Error('Cloudflare PUBLISH_KEY जुळत नाही. गुप्त Bookmark मधील Key तपासा.');
        if(workerMode)throw Error('Server ने प्रकाशन जोडणी नाकारली. प्रकाशन Token ची परवानगी तपासा.');
        throw Error('Server Access Token चुकीचा किंवा कालबाह्य झाला आहे.');
      }
      if(response.status===403)throw Error(workerMode?'Server Secret ची परवानगी तपासा.':'Server Publishing Token साठी Contents: Read and write परवानगी तपासा.');
      if(response.status===404)throw Error('Server वर फाइल किंवा Repository सापडली नाही.');
      if(response.status===409||response.status===422)throw Error('Server वर एकाच वेळी बदल झाला किंवा Slug/फाइल आधीच अस्तित्वात आहे. Refresh करा.');
      // Worker responses describe the cause in "error", not GitHub's "message".
      // Using the HTTP status alone previously hid the real cause as "GitHub: 502".
      const detail=String(data.error||data.message||response.status).slice(0,240);
      throw Error((workerMode?'Cloudflare Worker: ':'Server: ')+detail);
    }
    return data;
  }
  async function readJSON(path){
    const file=await github(path);
    return {value:JSON.parse(decodeBase64(file.content)),sha:file.sha};
  }
  async function writeJSON(path,value,sha,label){
    const data={branch:'main',message:label,content:encodeBase64(JSON.stringify(value,null,2)+'\n')};
    if(sha)data.sha=sha;
    return github(path,'PUT',data);
  }
  function publicURL(slug){return SITE+'batmi/'+encodeURIComponent(slug)+'/';}
  function isDraft(p){return p&&((p.published===false)||(p.status==='draft'));}
  function statusOf(p){return isDraft(p)?'draft':'published';}
  function sortedNews(){return [...state.news].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));}
  function categories(selected=''){
    const options=[...new Set([...defaultCategories,...(state.layout.menu||[]),...(state.layout.subcategories||[]),selected].filter(x=>x&&x!=='मुखपृष्ठ'))];
    const input=$('category');input.replaceChildren();
    for(const item of options)input.add(new Option(item,item));
    if(selected)input.value=selected;
  }
  function updateSelectedUI(){
    $('selected-count').textContent=state.selected.size+' selected';
    $('bulk-delete').disabled=state.busy||!connected()||!state.selected.size;
    const visible=filteredNews();
    $('select-all').checked=visible.length>0&&visible.every(p=>state.selected.has(p.slug));
    $('select-all').indeterminate=visible.some(p=>state.selected.has(p.slug))&&!$('select-all').checked;
  }
  function filteredNews(){
    const q=$('search').value.trim().toLocaleLowerCase('mr-IN');
    return sortedNews().filter(p=>{
      if(state.filter!=='all'&&statusOf(p)!==state.filter)return false;
      return !q||[p.title,p.slug,p.category,p.author].join(' ').toLocaleLowerCase('mr-IN').includes(q);
    });
  }
  function renderList(){
    const items=filteredNews();$('total').textContent=String(state.news.length);
    const parent=$('post-list');parent.replaceChildren();
    if(!items.length){const p=document.createElement('p');p.textContent='या विभागात बातमी सापडली नाही.';parent.appendChild(p)}
    for(const post of items){
      const row=document.createElement('div');row.className='post-item'+(post.slug===state.activeSlug?' current':'');
      const check=document.createElement('input');check.type='checkbox';check.checked=state.selected.has(post.slug);
      check.setAttribute('aria-label','Delete साठी '+post.title+' निवडा');
      check.addEventListener('change',()=>{
        if(check.checked)state.selected.add(post.slug);else state.selected.delete(post.slug);
        updateSelectedUI();
      });
      const button=document.createElement('button');button.className='post-open';button.type='button';
      const title=document.createElement('strong');title.textContent=post.title||post.slug;
      const sub=document.createElement('small');sub.textContent=(isDraft(post)?'📝 Draft':'✅ Published')+' · '+(post.category||'')+' · '+String(post.date||'').slice(0,10);
      button.append(title,sub);button.addEventListener('click',()=>openPost(post.slug));
      row.append(check,button);parent.appendChild(row);
    }
    updateSelectedUI();
  }
  function splitBody(text){
    return String(text||'').replace(/\r\n?/g,'\n').split(/\n\s*\n/g).map(x=>x.trim()).filter(Boolean);
  }
  function clearPhoto(){
    $('photo').value='';$('gallery').value='';
    if(state.photoUrl){URL.revokeObjectURL(state.photoUrl);state.photoUrl=''}
    $('cover-preview').classList.add('hidden');$('cover-preview').removeAttribute('src');
  }
  function reset(){
    state.activeSlug='';
    $('post-form').reset();
    $('title').value='';$('slug').value='';$('author').value='धाराशिव टुडे डेस्क';
    $('date').value=dateNow();$('minutes').value='3';$('post-status').value='published';
    $('featured').checked=false;$('source-url').value='';$('source').value='';
    $('subheading').value='';$('summary').value='';$('body').value='';$('tags').value='';
    $('type').value='बातमी';$('video').value='';$('seo-title').value='';$('seo-description').value='';$('seo-keywords').value='';
    window.DalalPro?.loadPost?.(null);
    categories('ताज्या बातम्या');clearPhoto();$('editor-title').textContent='📰 नवीन बातमी';
    $('result').classList.add('hidden');$('current-url').href=SITE;$('current-url').textContent='बातमीची Live Link';
    renderList();
  }
  function openPost(slug){
    const item=state.news.find(x=>x.slug===slug);
    if(!item)return message('बातमी सापडली नाही.','error');
    state.activeSlug=slug;
    $('title').value=item.title||'';
    $('slug').value=item.slug||'';
    categories(item.category||'ताज्या बातम्या');
    $('author').value=item.author||'धाराशिव टुडे डेस्क';
    $('subheading').value=item.subheading||item.subtitle||'';
    $('summary').value=item.summary||item.description||'';
    $('body').value=Array.isArray(item.body)?item.body.join('\n\n'):String(item.body||'');
    $('tags').value=(item.tags||[]).join(', ');
    $('minutes').value=Number(item.readMinutes)||3;
    $('date').value=String(item.date||dateNow()).slice(0,10);
    $('post-status').value=statusOf(item);
    $('source').value=item.source||'';$('source-url').value=item.sourceUrl||'';
    $('featured').checked=!!item.featured||(state.layout.featuredSlugs||[]).includes(slug);
    $('type').value=item.type||'बातमी';$('video').value=item.videoUrl||item.video||'';
    $('seo-title').value=item.seoTitle||'';$('seo-description').value=item.seoDescription||'';$('seo-keywords').value=(item.seoKeywords||[]).join?.(', ')||'';
    window.DalalPro?.loadPost?.(item);
    clearPhoto();const src=String(item.image||'');
    if(/^assets\/uploads\/[a-z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(src)){
      $('cover-preview').src=SITE+src;$('cover-preview').classList.remove('hidden');
    } else if(/^https:\/\/dharashivlive\.com\/wp-content\/uploads\//i.test(src)){
      $('cover-preview').src=src;$('cover-preview').classList.remove('hidden');
    }
    $('editor-title').textContent='✏️ बातमी संपादन';
    $('current-url').href=isDraft(item)?SITE:publicURL(slug);
    $('current-url').textContent=isDraft(item)?'Draft — Publish झाल्यावर '+publicURL(slug)+' सक्रिय होईल':publicURL(slug);
    $('result').classList.add('hidden');renderList();window.scrollTo({top:0,behavior:'smooth'});
  }
  async function load(){
    lastLoadError='';
    message('बातम्या आणि Layout लोड होत आहे…');
    try{
      const [a,b]=await Promise.all([readJSON('data/news.json'),readJSON('data/layout.json')]);
      if(!Array.isArray(a.value))throw Error('News JSON फाइल योग्य नाही.');
      state.news=a.value;state.newsSha=a.sha;state.layout=b.value;state.layoutSha=b.sha;state.ready=true;
      state.selected.clear();renderList();renderLayout();
      if(state.activeSlug&&state.news.some(a=>a.slug===state.activeSlug))openPost(state.activeSlug);
      else reset();
      message(state.news.length+' बातम्या लोड झाल्या. '+(connected()?'✅ सुरक्षित Publishing जोडणी तयार.':'संपादनासाठी Server Access Token किंवा Key Link जोडा.'),connected()?'success':'');
      window.dispatchEvent(new CustomEvent('dalal:news-updated',{detail:{news:state.news,layout:state.layout}}));
    return true;
    }catch(e){state.ready=false;lastLoadError=String(e.message||e);message('लोड करता आले नाही: '+lastLoadError,'error');return false}
  }
  function renderLayout(){
    const o=state.layout||{};
    for(const id of ['menu','subcategories','breaking'])$(id).value=(o[id]||[]).join('\n');
    $('featured-slugs').value=(o.featuredSlugs||[]).join('\n');
    $('home-columns').value=(o.homeColumns||[{title:'प्रशासननामा',category:'प्रशासननामा'},{title:'जनतेचा सवाल',category:'जनतेचा सवाल'},{title:'दलालनामा',category:'दलालनामा'}]).map(x=>(x.title||'')+' | '+(x.category||'')).join('\n');
    $('slider-speed').value=o.sliderSpeedSeconds||7;
    $('tagline').value=o.tagline||'दलाली, भ्रष्टाचार आणि सत्तेच्या काळ्या व्यवहारांचा लेखाजोखा!';
    categories($('category').value||'ताज्या बातम्या');
    window.DalalPro?.renderCustomization?.(o);
  }
  async function saveLayout(){
    if(state.busy)return;
    const lines=id=>[...new Set($(id).value.split(/\n/g).map(s=>s.trim()).filter(Boolean))].slice(0,35);
    const columns=$('home-columns').value.split(/\r?\n/).map(row=>row.split('|').map(x=>x.trim())).filter(a=>a.some(Boolean));
    if(columns.length!==3||columns.some(a=>a.length!==2||!a[0]||!a[1]))return message('तीन कॉलमसाठी नेमक्या ३ ओळी लिहा. स्वरूप: शीर्षक | विभाग','error');
    const requestedMain=lines('menu');
    const requestedOther=lines('subcategories');
    const invalid=[...requestedMain,...requestedOther].filter(name=>name!=='मुखपृष्ठ'&&!defaultCategories.includes(name));
    if(invalid.length)return message('अज्ञात विभाग: '+[...new Set(invalid)].join(', ')+'. आधी विभागांची अधिकृत यादी तपासा.','error');
    const publicMain=['मुखपृष्ठ',...requestedMain.filter(name=>name!=='मुखपृष्ठ'&&name!=='जनतेचा सवाल')];
    const publicOther=[...requestedOther.filter(name=>name!=='जनतेचा सवाल'),'जनतेचा सवाल'];
    const featured=lines('featured-slugs');
    if(featured.some(s=>!state.news.some(x=>x.slug===s)))return message('Featured slug मध्ये नसलेली बातमी आहे. आधी बातमी तयार करा.','error');
    let custom={};try{custom=window.DalalPro?.readCustomization?.()||{}}catch(e){return message('Appearance Settings: '+e.message,'error')}
    const next={...state.layout,...custom,menu:publicMain,subcategories:publicOther,breaking:lines('breaking'),featuredSlugs:featured,homeColumns:columns.map(x=>({title:x[0].slice(0,70),category:x[1].slice(0,70)})),
      sliderSpeedSeconds:Math.max(3,Math.min(30,parseInt($('slider-speed').value,10)||7)),tagline:$('tagline').value.trim().slice(0,250)};
    if(!next.menu.includes('मुखपृष्ठ'))next.menu.unshift('मुखपृष्ठ');
    if(!confirm('वेबसाइटवरील मेनू आणि Breaking News अपडेट करायचे?'))return;
    setBusy(true);try{
      const r=await writeJSON('data/layout.json',next,state.layoutSha,'Update Dharashiv Today menus, breaking news and featured layout');
      state.layout=next;state.layoutSha=r.content.sha;renderLayout();message('✅ वेबसाइटचा Layout Server वर जतन झाला. Server अपडेट झाल्यावर Live दिसेल.','success');
    }catch(e){message(e.message,'error')}finally{setBusy(false)}
  }
  function makeAutoSlug(){
    if($('slug').value.trim())return;
    const d=dateNow().replace(/\D/g,''),random=Math.random().toString(36).slice(2,7);
    $('slug').value='news-'+d+'-'+random;
  }
  async function fileJPEG(file){
    if(!file)return null;
    if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('फोटो PNG, JPG किंवा WebP असावा.');
    if(file.size>15*1024*1024)throw Error('फोटो जास्तीत जास्त 15 MB असावा.');
    // Keep the complete uploaded picture. 1200x630 is ONLY for social previews,
    // never for the saved news photo; center-cropping here irreversibly lost details.
    const bitmap=await createImageBitmap(file);
    const scale=Math.min(1,1600/bitmap.width,1200/bitmap.height);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('फोटो तयार करण्याची सुविधा उपलब्ध नाही.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    bitmap.close?.();
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(Error('फोटो तयार झाला नाही.')),'image/jpeg',.84));
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
  }
  async function uploadPhoto(file,path){
    const base64=await fileJPEG(file);
    const result=await github(path,'PUT',{branch:'main',message:'Add Dharashiv Today news image '+path,content:base64});
    return result.content.path;
  }
  async function savePost(mode){
    if(state.busy)return;
    if(mode==='published'&&!$('post-form').reportValidity())return;
    if(mode==='draft'&&!$('slug').value.trim())makeAutoSlug();
    const slug=$('slug').value.trim().toLowerCase();
    if(!allowedSlug.test(slug))return message('Slug: 3–96 इंग्रजी लहान अक्षरे, अंक, underscore किंवा hyphen वापरा.','error');
    const title=$('title').value.trim(),summary=$('summary').value.trim(),body=splitBody($('body').value.replace(/[\u00a0\u202f\u2007]/g,' '));
    if(mode==='published'&&(title.length<8||body.join(' ').length<30||summary.length<15))return message('प्रकाशनासाठी शीर्षक, ३० अक्षरांची बातमी आणि १५ अक्षरांचा सारांश आवश्यक.','error');
    if(mode==='draft'&&title.length<3)return message('Draft साठी किमान ३ अक्षरांचे शीर्षक लिहा.','error');
    if(state.news.some(p=>p.slug===slug&&p.slug!==state.activeSlug))return message('ही URL आधीच दुसऱ्या बातमीसाठी वापरली आहे. दुसरा Slug द्या.','error');
    const old=state.news.find(p=>p.slug===state.activeSlug)||null;
    const isRename=old&&old.slug!==slug;
    if(isRename&&!confirm('जुन्या बातमीची URL बदलणार आहे. जुनी Share Link बंद होऊ शकते.\n\nनवीन Slug: '+slug+'\n\nबदल करायचा?'))return;
    const date=$('date').value||dateNow();
    let img=old?.image||'assets/uploads/'+slug+'.png';
    if(isRename&&img==='assets/uploads/'+old.slug+'.png')img='assets/uploads/'+slug+'.png';
    const item={
      ...(old||{}),slug,title,summary,subheading:$('subheading').value.trim(),category:$('category').value,author:$('author').value.trim()||'धाराशिव टुडे डेस्क',
      body,description:summary,date,readMinutes:Math.max(1,Math.min(30,Number($('minutes').value)||3)),
      tags:[...new Set($('tags').value.split(',').map(x=>x.trim()).filter(Boolean))].slice(0,15),
      source:$('source').value.trim(),sourceUrl:$('source-url').value.trim(),
      featured:$('featured').checked,published:mode==='published',status:mode,
      image:window.DalalPro?.getCoverPath?.()||img,type:$('type').value||'बातमी',isSample:false,
      bodyHtml:window.DalalPro?.getRichHTML?.()||'',
      seoTitle:$('seo-title').value.trim().slice(0,150),seoDescription:$('seo-description').value.trim().slice(0,350),
      seoKeywords:[...new Set($('seo-keywords').value.split(',').map(x=>x.trim()).filter(Boolean))].slice(0,18),
      videoUrl:$('video').value.trim(),updated:new Date().toISOString()
    };
    const files=[...$('gallery').files];
    if(files.length>4)return message('बातमीतील जास्तीत जास्त ४ फोटो निवडा.','error');
    setBusy(true);message('बातमी जतन करत आहे…');
    try{
      const unique=Date.now().toString(36);
      if($('photo').files[0])item.image=await uploadPhoto($('photo').files[0],'assets/uploads/post-'+slug+'-'+unique+'.jpg');
      if(files.length){
        item.gallery=[];
        for(let i=0;i<files.length;i++)item.gallery.push(await uploadPhoto(files[i],'assets/uploads/gallery-'+slug+'-'+unique+'-'+(i+1)+'.jpg'));
      }
      if(old&&item.image!==old.image)delete item.thumbImage;
      const next=old?state.news.map(p=>p.slug===old.slug?item:p):[item,...state.news];
      const result=await writeJSON('data/news.json',next,state.newsSha,(old?'Update':'Publish')+' Dharashiv Today news '+slug);
      state.news=next;state.newsSha=result.content.sha;state.activeSlug=slug;
      window.dispatchEvent(new CustomEvent('dalal:news-updated',{detail:{news:next,layout:state.layout}}));
      const featured=new Set((state.layout.featuredSlugs||[]).filter(x=>!old||x!==old.slug));
      if(mode==='published'&&item.featured)featured.add(slug);else featured.delete(slug);
      const nextFeatured=[...featured];
      if(JSON.stringify(nextFeatured)!==JSON.stringify(state.layout.featuredSlugs||[])){
        const nextLayout={...state.layout,featuredSlugs:nextFeatured};
        try{
          const r=await writeJSON('data/layout.json',nextLayout,state.layoutSha,'Update featured news for '+slug);
          state.layout=nextLayout;state.layoutSha=r.content.sha;
        }catch(e){message('बातमी जतन झाली, पण Featured मांडणी अपडेट झाली नाही: '+e.message,'error')}
      }
      $('result').classList.remove('hidden');
      $('result').replaceChildren();
      const strong=document.createElement('strong');strong.textContent=mode==='draft'?'📝 Draft जतन झाला':'✅ बातमी Server वर जतन झाली';
      const link=document.createElement('a');link.href=mode==='draft'?SITE:publicURL(slug);link.target='_blank';link.rel='noopener';
      link.textContent=mode==='draft'?'Draft — Live URL प्रकाशनानंतर दिसेल':publicURL(slug);
      $('result').append(strong,document.createElement('br'),link);
      state.selected.clear();openPost(slug);$('result').classList.remove('hidden');
      $('result').append(strong,document.createElement('br'),link);
      message('✅ '+(mode==='draft'?'Draft जतन झाला':'बातमी जतन झाली. Server वर अपडेट पूर्ण झाल्यावर Live दिसेल.'),'success');
    }catch(e){message('जतन अयशस्वी: '+e.message,'error')}finally{setBusy(false)}
  }
  async function deleteSlugs(slugs){
    if(state.busy||!slugs.length)return;
    if(!connected())return message('Delete साठी Publishing Key Link किंवा Server Access Token आवश्यक आहे.','error');
    const chosen=[...new Set(slugs)].filter(slug=>state.news.some(x=>x.slug===slug));
    if(!chosen.length)return;
    if(!confirm(chosen.length+' बातम्या कायमच्या वेबसाइटवरून काढायच्या? ही कृती Server अपडेट झाल्यानंतर वेबसाइटवर लागू होईल.'))return;
    const typed=prompt('चुकून Delete होऊ नये म्हणून DELETE टाइप करा ('+chosen.length+' बातम्या):');
    if(typed!=='DELETE')return message('Delete रद्द केले.');
    setBusy(true);message(chosen.length+' बातम्या हटवत आहे…');
    try{
      const excluded=new Set(chosen);
      const next=state.news.filter(p=>!excluded.has(p.slug));
      const result=await writeJSON('data/news.json',next,state.newsSha,'Bulk delete '+chosen.length+' Dharashiv Today news posts');
      state.news=next;state.newsSha=result.content.sha;
      const oldFeatured=state.layout.featuredSlugs||[],newFeatured=oldFeatured.filter(s=>!excluded.has(s));
      if(newFeatured.length!==oldFeatured.length){
        const o={...state.layout,featuredSlugs:newFeatured};
        try{const b=await writeJSON('data/layout.json',o,state.layoutSha,'Remove deleted posts from featured stories');state.layout=o;state.layoutSha=b.content.sha}catch(e){message('Delete झाले; Featured यादीसाठी पुन्हा Layout Save करा.','error')}
      }
      window.dispatchEvent(new CustomEvent('dalal:news-updated',{detail:{news:next,layout:state.layout}}));
      state.selected.clear();const deletedActive=excluded.has(state.activeSlug);state.activeSlug='';
      if(deletedActive)reset();renderList();
      message('✅ '+chosen.length+' बातम्या Server वरून काढल्या. Server अपडेट झाल्यानंतर त्या सार्वजनिक साइटवर दिसणार नाहीत.','success');
    }catch(e){message('Delete अयशस्वी: '+e.message,'error')}finally{setBusy(false)}
  }
  function preview(){
    const d=$('preview-dialog');$('preview-title').textContent=$('title').value.trim()||'बातमीचे शीर्षक';
    const root=$('preview-content');root.replaceChildren();
    const summary=document.createElement('p');summary.textContent=$('subheading').value;summary.style.fontWeight='700';root.append(summary);
    for(const paragraph of splitBody($('body').value)){
      const node=document.createElement(paragraph.startsWith('## ')?'h2':'p');
      node.textContent=paragraph.startsWith('## ')?paragraph.slice(3):paragraph;
      root.appendChild(node);
    }
    window.DalalPro?.renderPreview?.(root);
    if(typeof d.showModal==='function')d.showModal();
  }
  function bind(){
    $('make-private-link')?.addEventListener('click',async()=>{
      const input=$('private-link-key');
      const secret=input?.value.trim()||'';
      if(secret.startsWith('github_pat_')||secret.startsWith('ghp_'))return message('प्रकाशन Token नव्हे! Cloudflare मधील वेगळी PUBLISH_KEY वापरा.','error');
      if(secret.length<32)return message('Cloudflare PUBLISH_KEY किमान ३२ अक्षरांची असली पाहिजे. Server Access Token येथे टाकू नका.','error');
      const privateURL=location.origin+location.pathname+'#key='+encodeURIComponent(secret);
      try{
        await navigator.clipboard.writeText(privateURL);
        input.value='';
        message('✅ गुप्त Admin Key Link कॉपी झाली. ती तुमच्या खासगी Bookmark मध्ये जतन करा; इतरांना पाठवू नका.','success');
      }catch(e){
        message('कॉपी करणे शक्य नाही. HTTPS मध्ये ब्राउझर Clipboard परवानगी तपासा.','error');
      }
    });
    $('connect').addEventListener('click',async()=>{
      const token=$('token').value.trim();
      if(!/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(token))return message('वैध Server Publishing Token वापरा.','error');
      const previous=state.token;
      state.token=token;
      const verified=await load(); // A bad or expired token must not be accepted.
      if(!verified){state.token=previous;return;}
      $('token').value='';
      message('✅ Server जोडणी पडताळली. बातमी प्रकाशित, मसुदा आणि Delete करता येईल.','success');
    });
    $('disconnect').addEventListener('click',()=>{
      state.token='';workerMode=false;publishKey='';workerURL='';$('token').value='';
      document.body.classList.remove('admin-key-verified');
      if(location.hash.startsWith('#key='))history.replaceState(null,'',location.pathname+location.search);
      message('Publishing जोडणी बंद केली.');updateSelectedUI();
    });
    $('refresh').addEventListener('click',load);
    for(const id of ['new','new-top'])$(id).addEventListener('click',reset);
    $('search').addEventListener('input',renderList);
    for(const button of document.querySelectorAll('.filter'))button.addEventListener('click',()=>{
      state.filter=button.dataset.status;
      document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b===button));renderList();
    });
    $('select-all').addEventListener('change',e=>{
      for(const item of filteredNews())e.target.checked?state.selected.add(item.slug):state.selected.delete(item.slug);
      renderList();
    });
    $('clear-selected').addEventListener('click',()=>{state.selected.clear();renderList()});
    $('bulk-delete').addEventListener('click',()=>deleteSlugs([...state.selected]));
    $('delete').addEventListener('click',()=>state.activeSlug?deleteSlugs([state.activeSlug]):message('Delete करण्यासाठी आधी बातमी निवडा.','error'));
    $('post-form').addEventListener('submit',e=>{e.preventDefault();savePost($('post-status').value==='draft'?'draft':'published')});
    $('draft').addEventListener('click',()=>savePost('draft'));
    $('preview').addEventListener('click',preview);
    $('close-preview').addEventListener('click',()=>$('preview-dialog').close());
    $('photo').addEventListener('change',e=>{
      window.DalalPro?.clearCoverPath?.();
      if(state.photoUrl){URL.revokeObjectURL(state.photoUrl);state.photoUrl=''}
      if(e.target.files[0]){state.photoUrl=URL.createObjectURL(e.target.files[0]);$('cover-preview').src=state.photoUrl;$('cover-preview').classList.remove('hidden')}
    });
    $('title').addEventListener('blur',()=>{if(!state.activeSlug)makeAutoSlug()});
    $('copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('current-url').href);message('✅ Live URL कॉपी झाली.','success')}catch(e){prompt('URL:', $('current-url').href)}});
    $('save-layout').addEventListener('click',saveLayout);
    for(const tab of document.querySelectorAll('.tab'))tab.addEventListener('click',()=>{
      const target=tab.dataset.target;
      document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.target===target));
      for(const id of ['news-panel','layout-panel','dashboard-panel','media-panel'])$(id).classList.toggle('hidden',id!==target);
      window.DalalPro?.onTab?.(target);
    });
  }
  window.DalalCMS={getNews:()=>state.news.slice(),getLayout:()=>structuredClone(state.layout),getSite:()=>SITE,
    hasToken:()=>connected(),uploadMedia:async(file,path)=>uploadPhoto(file,path),
    loadMedia:async()=>readJSON('data/media.json'),saveMedia:async(media,sha)=>writeJSON('data/media.json',media,sha,'Update Dharashiv Today media library'),
    uploadBrand:async(file,path)=>{
      if(!file||!/image\/(png|jpeg|webp)/.test(file.type)||file.size>5*1024*1024)throw Error('लोगो PNG, JPG किंवा WebP असावा (कमाल 5 MB).');
      const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
      for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      return github(path,'PUT',{branch:'main',message:'Upload Dharashiv Today brand logo',content:btoa(binary)});
    },
    openPost:(slug)=>openPost(slug),newPost:()=>reset(),refresh:()=>load(),
    status:(messageText,kind)=>message(messageText,kind),
    goto:(id)=>{const tab=[...document.querySelectorAll('.tab')].find(t=>t.dataset.target===id);tab?.click()}};
  async function startSecureKeyLink(){
    if(!publishKey)return load();
    if(publishKey.length<32){message('गुप्त Key किमान ३२ अक्षरांची असावी.','error');return}
    message('🔒 Cloudflare सुरक्षित Key Link तपासत आहे…');
    try{
      const res=await fetch('./config.json',{cache:'no-store',referrerPolicy:'no-referrer'});
      if(!res.ok)throw Error('Admin Worker config उपलब्ध नाही.');
      const config=await res.json();
      const configured=String(config.worker_url||'').trim();
      if(!configured)throw Error('Cloudflare Worker URL अजून admin/config.json मध्ये जोडलेला नाही.');
      const url=new URL(configured);
      if(url.protocol!=='https:'||url.origin===location.origin||!url.hostname.endsWith('.workers.dev'))
        throw Error('Cloudflare Worker URL अजून सेट केलेला नाही.');
      const health=await fetch(url.href.replace(/\/$/,'')+'/health',{cache:'no-store',referrerPolicy:'no-referrer'});
      const info=await health.json().catch(()=>({}));
      if(!health.ok||info.ready!==true)throw Error('Cloudflare Worker मध्ये PUBLISH_KEY/GITHUB_TOKEN Secrets अजून जोडलेले नाहीत.');
      workerURL=url.href.replace(/\/$/,'');
      workerMode=true;
      const ok=await load(); // Validates the key by reading private authenticated Worker endpoint.
      if(!ok){
        // Read-only fallback: still show existing news if the protected publishing API fails.
        const cause=lastLoadError||'Key Link ची पडताळणी झाली नाही.';
        workerMode=false;
        await load();
        throw Error(cause);
      }
      // Once the protected Worker has authenticated the bookmark key AND the news
      // files load successfully, show the newsroom directly with no setup boxes.
      document.body.classList.add('admin-key-verified');
      message('✅ Admin तयार आहे. बातम्या प्रकाशित करू शकता.','success');
    }catch(e){
      workerMode=false;
      document.body.classList.remove('admin-key-verified');
      const errorText=String(e.message||e);
      // No secrets are ever echoed; make CORS, key mismatch and config faults actionable.
      const detail=/Failed to fetch|NetworkError/i.test(errorText)
        ?'Worker कडे ब्राउझर विनंती पोहोचत नाही (CORS/नेटवर्क).'
        :errorText;
      message('🔒 Key Link जोडता आली नाही: '+detail,'error');
    }
  }
  bind();startSecureKeyLink();
})();
