'use strict';
/* Visual-only login overlay: Cloudflare/GitHub still controls actual publishing access.
 * Local password changes apply only to this browser and website origin.
 * Do not treat a client-side overlay as server-side access control. */
(()=>{
  const form=document.getElementById('admin-login-form');
  const layer=document.getElementById('admin-login-overlay');
  const feedback=document.getElementById('admin-login-feedback');
  const usernameInput=document.getElementById('admin-login-username');
  const passwordInput=document.getElementById('admin-login-password');
  const changeButton=document.getElementById('admin-change-password');
  const changeDialog=document.getElementById('admin-change-dialog');
  const changeForm=document.getElementById('admin-change-form');
  const changeMessage=document.getElementById('admin-change-message');
  const closeButton=document.getElementById('admin-change-close');
  const STORAGE_KEY='dharashivtoday.admin.overlay.password.v2';
  const DEFAULT_SHA256='a02419ca43d426af1e8ef574fc9f2d7749fa40010eb33a5aa79ac25e7444b81d';
  const encoder=new TextEncoder();
  const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  if(!form||!layer||!usernameInput||!passwordInput)return;

  function storedCredential(){
    let raw=null;
    try{raw=localStorage.getItem(STORAGE_KEY)}catch{return null}
    if(!raw)return null;
    try{
      const saved=JSON.parse(raw);
      if(saved.version===1 && /^[0-9a-f]{32}$/.test(saved.salt) &&
         /^[0-9a-f]{64}$/.test(saved.hash) && saved.iterations===180000)return saved;
    }catch{}
    return {invalid:true};
  }
  async function pbkdf2(password,saltHex){
    const salt=new Uint8Array(saltHex.match(/../g).map(x=>parseInt(x,16)));
    const key=await crypto.subtle.importKey('raw',encoder.encode('dharashivtoday-admin-v2|admin|'+password),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:180000},key,256);
    return hex(new Uint8Array(bits));
  }
  async function passwordIsValid(username,password){
    if(username.trim().toLowerCase()!=='admin'||!password)return false;
    const saved=storedCredential();
    if(saved?.invalid)return false;
    if(saved)return (await pbkdf2(password,saved.salt))===saved.hash;
    const data=encoder.encode('dalalnama-overlay-v1|admin|'+password);
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',data)))===DEFAULT_SHA256;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const submit=form.querySelector('[type=submit]');
    submit.disabled=true;feedback.textContent='';
    try{
      if(!await passwordIsValid(usernameInput.value,passwordInput.value)){
        feedback.textContent='Username किंवा Password चुकीचा आहे.';
        passwordInput.value='';passwordInput.focus();return;
      }
      document.body.classList.remove('admin-locked');
      layer.hidden=true;
      form.reset();
    }catch{
      feedback.textContent='Login तपासता आले नाही. पुन्हा प्रयत्न करा.';
    }finally{submit.disabled=false}
  });

  if(changeButton&&changeDialog&&changeForm&&changeMessage){
    changeButton.addEventListener('click',()=>{
      changeForm.reset();changeMessage.textContent='';
      if(typeof changeDialog.showModal==='function')changeDialog.showModal();
    });
    closeButton?.addEventListener('click',()=>changeDialog.close());
    changeForm.addEventListener('submit',async event=>{
      event.preventDefault();
      const submit=changeForm.querySelector('[type=submit]');
      const current=document.getElementById('admin-current-password').value;
      const next=document.getElementById('admin-new-password').value;
      const confirm=document.getElementById('admin-confirm-password').value;
      submit.disabled=true;changeMessage.textContent='';
      try{
        if(!await passwordIsValid('admin',current)){
          changeMessage.textContent='सध्याचा पासवर्ड चुकीचा आहे.';return;
        }
        if(next.length<8||next.length>128){
          changeMessage.textContent='नवीन पासवर्ड 8 ते 128 अक्षरांचा असावा.';return;
        }
        if(next!==confirm){
          changeMessage.textContent='नवीन पासवर्ड आणि Confirm Password जुळत नाहीत.';return;
        }
        if(next===current){
          changeMessage.textContent='नवीन पासवर्ड जुन्यापेक्षा वेगळा ठेवा.';return;
        }
        const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
        const hash=await pbkdf2(next,salt);
        localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,salt,hash,iterations:180000}));
        changeForm.reset();changeDialog.close();
        const status=document.getElementById('status');
        if(status){status.textContent='✅ या ब्राउझरचा Login पासवर्ड बदलला.';status.className='notice success'}
      }catch{
        changeMessage.textContent='पासवर्ड जतन झाला नाही. ब्राउझर Storage तपासा.';
      }finally{submit.disabled=false}
    });
  }
  usernameInput.focus();
})();