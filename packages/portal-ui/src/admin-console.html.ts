import { MARK_SVG, FAVICON_LINK } from './logo';
/* Trustee Admin Console served at `/admin`. Self-contained SPA; authenticates
   API calls with TRUSTEE_BANK client credentials entered by the operator. */
export const ADMIN_CONSOLE_TEMPLATE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trustee Admin Console</title>
${FAVICON_LINK}
<style>
:root{--bg:#0b1020;--card:#141a2e;--fg:#e8ecf5;--mut:#93a0bd;--acc:#5b8cff;--ok:#35c98b;--warn:#f5b34a;--bad:#ff6b6b;--line:#243050}
@media(prefers-color-scheme:light){:root{--bg:#f4f6fb;--card:#fff;--fg:#111827;--mut:#5b6579;--acc:#2f5fe0;--ok:#0a8f5b;--line:#e3e8f2}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:5}
.logo{width:40px;height:40px;display:grid;place-items:center;flex-shrink:0}
h1{font-size:16px;margin:0}.spacer{flex:1}.who{color:var(--mut);font-size:13px}
.layout{display:flex;min-height:calc(100vh - 61px)}
nav{width:210px;border-right:1px solid var(--line);padding:14px 10px;flex-shrink:0}
nav button{display:block;width:100%;text-align:left;background:none;border:0;color:var(--mut);padding:9px 12px;border-radius:8px;cursor:pointer;font-size:14px}
nav button.active{background:color-mix(in srgb,var(--acc) 18%,transparent);color:var(--fg);font-weight:600}
main{flex:1;padding:22px;overflow:auto}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.kpi .l{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.04em}.kpi .v{font-size:22px;font-weight:700;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase}
input,select,textarea{background:var(--bg);border:1px solid var(--line);color:var(--fg);border-radius:8px;padding:9px 11px;font:inherit;width:100%}
button.btn{background:var(--acc);color:#fff;border:0;border-radius:8px;padding:9px 14px;font-weight:600;cursor:pointer}
button.ghost{background:none;border:1px solid var(--line);color:var(--fg);border-radius:8px;padding:7px 12px;cursor:pointer}
.tag{display:inline-block;background:color-mix(in srgb,var(--acc) 16%,transparent);color:var(--acc);border-radius:6px;padding:2px 8px;font-size:12px;margin:2px}
.on{color:var(--ok);font-weight:600}.off{color:var(--mut)}
.switch{cursor:pointer;border:1px solid var(--line);border-radius:999px;width:44px;height:24px;position:relative;background:var(--bg)}
.switch.active{background:var(--ok)}.knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.15s}.switch.active .knob{left:24px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.muted{color:var(--mut)}.danger{color:var(--bad)}
#login{max-width:420px;margin:8vh auto}.err{color:var(--bad);font-size:13px;margin-top:8px;min-height:18px}
.hide{display:none}small.hint{color:var(--mut)}
</style></head><body>
<div id="login" class="card hide">
  <div class="row" style="margin-bottom:6px"><div class="logo">${MARK_SVG}</div><h1>Trustee Admin Console</h1></div>
  <p class="muted" style="margin-top:0">Sign in with your trustee-bank administrator account.</p>
  <label class="muted">Email</label><input id="email" placeholder="contact@cambobia.com" autocomplete="username">
  <label class="muted" style="margin-top:8px;display:block">Password</label><input id="pw" type="password" autocomplete="current-password">
  <div id="mfaRow" class="hide"><label class="muted" style="margin-top:8px;display:block">MFA code (6 digits)</label><input id="code" inputmode="numeric" placeholder="123456" autocomplete="one-time-code"></div>
  <div class="row" style="margin-top:12px"><button class="btn" onclick="login()">Sign in</button></div>
  <div class="err" id="loginErr"></div>
</div>

<div id="app" class="hide">
<header><div class="logo">${MARK_SVG}</div><h1>Trustee Admin Console</h1><div class="spacer"></div><span class="who" id="who"></span><button class="ghost" onclick="logout()">Sign out</button></header>
<div class="layout">
<nav id="nav"></nav>
<main id="view"></main>
</div></div>

<script>
const API=(window.__API_BASE__||'');
const S={token:'',tab:'dashboard',email:'',mfaEnabled:false};
const TABS=[['dashboard','Dashboard'],['users','Users (RBAC)'],['roles','Roles'],['policies','ABAC Policies'],['flags','Feature Flags'],['controls','Emergency Controls'],['security','Security (2FA)'],['apimgmt','API & Rate Limits']];
function h(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function api(path,opts={}){
  const r=await fetch(API+path,{...opts,headers:{'content-type':'application/json',...(S.token?{'authorization':'Bearer '+S.token}:{}),...(opts.headers||{})}});
  const t=await r.text();let b;try{b=t?JSON.parse(t):{}}catch{b={raw:t}}
  if(!r.ok)throw Object.assign(new Error(b.message||('HTTP '+r.status)),{body:b,status:r.status});
  return b;
}
function show(el){document.getElementById('login').classList.toggle('hide',el!=='login');document.getElementById('app').classList.toggle('hide',el==='login')}
async function login(){
  const email=document.getElementById('email').value.trim();const password=document.getElementById('pw').value;
  const code=document.getElementById('code')?document.getElementById('code').value.trim():'';
  document.getElementById('loginErr').textContent='';
  try{
    const r=await api('/api/v1/auth/login',{method:'POST',body:JSON.stringify({email,password,code:code||undefined})});
    if(r.mfaRequired){document.getElementById('mfaRow').classList.remove('hide');document.getElementById('loginErr').textContent='Enter your MFA code.';return}
    S.token=r.token;S.email=r.user.email;S.mfaEnabled=!!r.user.mfaEnabled;
    sessionStorage.setItem('tc',JSON.stringify({token:S.token,email:S.email}));
    show('app');document.getElementById('who').textContent=S.email+' · '+(r.user.roles||[]).join(', ');renderNav();
    if(!S.mfaEnabled){go('security')}else{go('dashboard')}
  }catch(e){document.getElementById('loginErr').textContent=e.status===401?'Invalid credentials or MFA code.':(e.message||'Login failed')}
}
function logout(){sessionStorage.removeItem('tc');S.token='';S.email='';show('login')}
function renderNav(){document.getElementById('nav').innerHTML=TABS.map(([k,l])=>'<button class="'+(S.tab===k?'active':'')+'" onclick="go(\\''+k+'\\')">'+l+'</button>').join('')}
function go(t){S.tab=t;renderNav();({dashboard:vDash,users:vUsers,roles:vRoles,policies:vPolicies,flags:vFlags,controls:vControls,security:vSecurity,apimgmt:vApiMgmt}[t])()}
const V=document.getElementById('view');const set=x=>V.innerHTML=x;
function actor(){return S.email||'admin'}

async function vDash(){
  set('<h2>Operations dashboard</h2><div id="d">Loading…</div>');
  try{
    const [progs,flags,controls]=await Promise.all([api('/api/v1/trustee/programs'),api('/api/v1/admin/feature-flags'),api('/api/v1/admin/controls')]);
    let reserve=null;const p=(progs.programs||[])[0];
    if(p){try{reserve=await api('/api/v1/admin/reserve/'+p.id)}catch{}}
    const realFunds=(flags.flags||[]).find(f=>f.key==='production.real-funds.enabled');
    const autoApp=(flags.flags||[]).find(f=>f.key==='production.automatic-approval.enabled');
    const money=m=>m?('${'+'}'+(Number(m.minor)/100).toLocaleString()+' '+m.currency):'—';
    document.getElementById('d').innerHTML=
    '<div class="grid">'
    +kpi('Programs',(progs.programs||[]).length)
    +kpi('Eligible reserve',reserve?money(reserve.eligibleReserve):'n/a')
    +kpi('Mint capacity',reserve?money(reserve.mintCapacity):'n/a')
    +kpi('Reserve ratio',reserve&&reserve.reserveRatioBps!=null?(reserve.reserveRatioBps/100)+'%':'—')
    +'</div>'
    +'<div class="card"><h3>Safety posture</h3>'
    +'<div class="row"><span>Real-money production</span> '+(realFunds&&realFunds.enabled?'<span class="danger">ENABLED</span>':'<span class="on">disabled ✓</span>')+'</div>'
    +'<div class="row" style="margin-top:6px"><span>Automatic approval</span> '+(autoApp&&autoApp.enabled?'<span class="danger">ENABLED</span>':'<span class="on">disabled ✓</span>')+'</div>'
    +'<div class="row" style="margin-top:6px"><span>Active emergency controls</span> <b>'+((controls.controls||[]).filter(c=>c.value).length)+'</b></div></div>'
    +'<div class="card"><h3>Program</h3>'+(p?('<div class="row"><b>'+h(p.code)+'</b> <span class="tag">'+h(p.legalModel)+'</span> <span class="tag">'+h(p.reservePolicy)+'</span> <span class="tag">ratio '+(p.requiredRatioBps/100)+'%</span></div>'):'<span class="muted">No programs</span>')+'</div>';
  }catch(e){document.getElementById('d').innerHTML='<div class="danger">'+h(e.message)+'</div>'}
}
function kpi(l,v){return '<div class="kpi"><div class="l">'+h(l)+'</div><div class="v">'+h(v)+'</div></div>'}

async function vUsers(){
  set('<h2>Users &amp; roles (RBAC)</h2><div id="u">Loading…</div>');
  const [u,r]=await Promise.all([api('/api/v1/admin/users'),api('/api/v1/admin/roles')]);
  const roleOpts=r.roles.map(x=>x.slug);
  document.getElementById('u').innerHTML='<div class="card"><table><tr><th>Name</th><th>Email</th><th>Institution</th><th>Roles</th><th></th></tr>'
  +u.users.map(us=>'<tr><td>'+h(us.displayName)+'</td><td class="muted">'+h(us.email)+'</td><td>'+h(us.institution)+'</td><td>'+us.roles.map(x=>'<span class="tag">'+h(x)+'</span>').join('')+'</td>'
    +'<td><button class="ghost" onclick="editRoles(\\''+us.id+'\\',\\''+encodeURIComponent(JSON.stringify(us.roles))+'\\')">Edit roles</button></td></tr>').join('')
  +'</table></div><p class="muted">Available roles: '+roleOpts.map(x=>'<span class="tag">'+h(x)+'</span>').join('')+'</p>';
}
async function editRoles(id,enc){
  const cur=JSON.parse(decodeURIComponent(enc));
  const v=prompt('Comma-separated role slugs for this user:',cur.join(','));
  if(v==null)return;
  try{await api('/api/v1/admin/users/'+id+'/roles',{method:'PUT',body:JSON.stringify({roles:v.split(',').map(s=>s.trim()).filter(Boolean),actor:actor()})});vUsers()}catch(e){alert(e.message)}
}

async function vRoles(){
  set('<h2>Roles</h2><div id="r">Loading…</div>');
  const r=await api('/api/v1/admin/roles');
  document.getElementById('r').innerHTML='<div class="card"><table><tr><th>Slug</th><th>Name</th><th>Institution</th><th>Permissions</th></tr>'
  +r.roles.map(x=>'<tr><td><code>'+h(x.slug)+'</code>'+(x.builtin?' <span class="tag">built-in</span>':'')+'</td><td>'+h(x.name)+'</td><td>'+h(x.institution)+'</td><td class="muted">'+x.permissions.length+' perms</td></tr>').join('')
  +'</table></div>';
}

async function vPolicies(){
  set('<h2>ABAC approval policies (§9)</h2><div id="p">Loading…</div>');
  const p=await api('/api/v1/admin/policies');
  document.getElementById('p').innerHTML='<div class="card"><h3>Evaluate a transaction</h3>'
  +'<div class="row"><select id="etype"><option>MINT_AUTHORIZATION</option><option>PAYOUT</option><option>SETTLEMENT</option><option>RESERVE_ADJUSTMENT</option></select>'
  +'<input id="eamt" placeholder="amount minor units" style="max-width:200px"><input id="ecur" placeholder="USD" style="max-width:100px">'
  +'<button class="btn" onclick="evalPolicy()">Evaluate</button></div><div id="eres" class="muted" style="margin-top:8px"></div></div>'
  +'<div class="card"><table><tr><th>Type</th><th>Match</th><th>Effect</th><th>Approvals</th><th>Roles</th><th>Prio</th></tr>'
  +p.policies.map(x=>'<tr><td>'+h(x.transactionType)+'</td><td class="muted">'+bands(x)+'</td><td>'+(x.effect==='DENY'?'<span class="danger">DENY</span>':'REQUIRE')+'</td><td>'+x.requiredApprovals+'</td><td>'+x.requiredRoles.map(r=>'<span class="tag">'+h(r)+'</span>').join('')+'</td><td>'+x.priority+'</td></tr>').join('')
  +'</table></div>';
}
function bands(x){let s=[];if(x.minAmountMinor)s.push('≥'+x.minAmountMinor);if(x.maxAmountMinor)s.push('≤'+x.maxAmountMinor);if(x.currency)s.push(x.currency);if(x.riskLevel)s.push(x.riskLevel);return s.join(' ')||'any'}
async function evalPolicy(){
  try{const b=await api('/api/v1/admin/policies/evaluate',{method:'POST',body:JSON.stringify({transactionType:document.getElementById('etype').value,amountMinor:document.getElementById('eamt').value||undefined,currency:document.getElementById('ecur').value||undefined})});
  document.getElementById('eres').innerHTML=b.denied?'<span class="danger">DENIED by policy '+h(b.matchedPolicyId)+'</span>':'Requires <b>'+b.requiredApprovals+'</b> approval(s)'+(b.requiredRoles.length?' from '+b.requiredRoles.map(r=>'<span class="tag">'+h(r)+'</span>').join(''):'')+(b.matchedPolicyId?' <span class="muted">(policy '+h(b.matchedPolicyId)+')</span>':' <span class="muted">(default)</span>')}
  catch(e){document.getElementById('eres').innerHTML='<span class="danger">'+h(e.message)+'</span>'}
}

async function vFlags(){
  set('<h2>Feature flags (§40)</h2><div id="f">Loading…</div>');
  const f=await api('/api/v1/admin/feature-flags');
  document.getElementById('f').innerHTML='<div class="card"><table><tr><th>Flag</th><th>Description</th><th>State</th></tr>'
  +f.flags.map(x=>{const risky=x.key.indexOf('real-funds')>=0||x.key.indexOf('automatic-approval')>=0;
    return '<tr><td><code>'+h(x.key)+'</code>'+(risky?' <span class="danger">high-risk</span>':'')+'</td><td class="muted">'+h(x.description||'')+'</td>'
    +'<td><div class="switch '+(x.enabled?'active':'')+'" onclick="toggleFlag(\\''+h(x.key)+'\\','+(!x.enabled)+','+risky+')"><div class="knob"></div></div></td></tr>'}).join('')
  +'</table></div>';
}
async function toggleFlag(key,to,risky){
  if(risky&&to&&!confirm('This is a HIGH-RISK flag ('+key+'). Enabling it may permit real-money or automatic actions. Continue?'))return;
  try{await api('/api/v1/admin/feature-flags/'+key,{method:'PUT',body:JSON.stringify({enabled:to,actor:actor()})});vFlags()}catch(e){alert(e.message)}
}

async function vControls(){
  set('<h2>Emergency controls (§30)</h2><div id="c">Loading…</div>');
  const known=['platform.read-only','mint.global-suspend','redemption.global-suspend','payout.global-suspend','paychain.api-suspend','paykh.api-suspend'];
  const c=await api('/api/v1/admin/controls');
  const map=Object.fromEntries((c.controls||[]).map(x=>[x.key,x]));
  document.getElementById('c').innerHTML='<div class="card"><p class="muted">Toggling a control requires a reason and is fully audited.</p><table><tr><th>Control</th><th>State</th><th>Reason</th></tr>'
  +known.map(k=>{const cur=map[k];const on=cur&&cur.value;return '<tr><td><code>'+h(k)+'</code></td><td><div class="switch '+(on?'active':'')+'" onclick="toggleCtl(\\''+k+'\\','+(!on)+')"><div class="knob"></div></div></td><td class="muted">'+h(cur&&cur.reason||'')+'</td></tr>'}).join('')
  +'</table></div>';
}
async function toggleCtl(key,to){
  const reason=prompt('Reason for '+(to?'ACTIVATING':'clearing')+' '+key+':');if(!reason)return;
  try{await api('/api/v1/admin/controls/'+key,{method:'PUT',body:JSON.stringify({value:to,reason,actor:actor()})});vControls()}catch(e){alert(e.message)}
}

async function vSecurity(){
  set('<h2>Security — Two-factor authentication</h2><div id="sec">Loading…</div>');
  const box=document.getElementById('sec');
  if(S.mfaEnabled){box.innerHTML='<div class="card"><p class="on">✓ Two-factor authentication is active on your account.</p><p class="muted">To re-link a new device, start setup again below.</p><button class="btn" onclick="startMfaSetup()">Re-link authenticator</button></div>';return}
  box.innerHTML='<div class="card"><p class="muted">Protect the super-admin account. Scan the QR with Google Authenticator or Authy, then enter the 6-digit code to activate.</p><button class="btn" onclick="startMfaSetup()">Set up 2FA</button><div id="mfaSetup"></div></div>';
}
async function startMfaSetup(){
  const el=document.getElementById('mfaSetup');el.innerHTML='Generating…';
  try{
    const r=await api('/api/v1/auth/mfa/setup',{method:'POST'});
    el.innerHTML='<div style="margin-top:14px"><img alt="2FA QR" src="'+r.qrDataUri+'" style="background:#fff;padding:8px;border-radius:10px"/>'
      +'<p class="muted" style="margin-top:8px">Or enter this secret manually: <code>'+h(r.secret)+'</code></p>'
      +'<div class="row"><input id="mfaCode" inputmode="numeric" placeholder="6-digit code" style="max-width:160px"><button class="btn" onclick="enableMfa()">Activate 2FA</button></div>'
      +'<div class="err" id="mfaErr"></div></div>';
  }catch(e){el.innerHTML='<span class="danger">'+h(e.message)+'</span>'}
}
async function enableMfa(){
  const code=document.getElementById('mfaCode').value.trim();document.getElementById('mfaErr').textContent='';
  try{await api('/api/v1/auth/mfa/enable',{method:'POST',body:JSON.stringify({code})});S.mfaEnabled=true;alert('2FA activated. It will be required at your next login.');vSecurity();}
  catch(e){document.getElementById('mfaErr').textContent=e.message||'Could not activate 2FA'}
}

async function vApiMgmt(){
  set('<h2>API usage &amp; rate limits</h2><div id="am">Loading…</div>');
  try{
    const [c,u]=await Promise.all([api('/api/v1/admin/clients'),api('/api/v1/admin/usage')]);
    const usageBy={};(u.usage||[]).forEach(x=>usageBy[x.platform]=x);
    const rows=(c.clients||[]).filter(x=>x.platform==='PAYCHAIN'||x.platform==='PAYKH').map(cl=>{
      const us=usageBy[cl.platform]||{total:0,hourly:[]};
      const spark=(us.hourly||[]).map(h=>'<span title="'+h.hour+': '+h.count+'" style="display:inline-block;width:5px;margin-right:1px;background:var(--acc);height:'+Math.max(2,Math.min(28,h.count))+'px;vertical-align:bottom"></span>').join('');
      return '<tr><td><b>'+h(cl.platform)+'</b><br><span class="muted">'+h(cl.clientId)+'</span></td>'
        +'<td>'+(cl.requireSignature?'<span class="on">required</span>':'<span class="muted">off</span>')+(cl.hasPublicKey?' <span class="tag">key</span>':'')+'</td>'
        +'<td><div class="row"><input id="rl_'+cl.platform+'" type="number" value="'+cl.rateLimitPerMin+'" style="max-width:110px"><button class="ghost" onclick="saveRl(\''+cl.platform+'\')">Save</button></div><span class="muted">req/min</span></td>'
        +'<td><b>'+us.total+'</b> <span class="muted">req/24h</span><div style="height:30px;margin-top:4px">'+spark+'</div></td>'
        +'<td><div class="switch '+(cl.disabled?'':'active')+'" onclick="toggleClient(\''+cl.platform+'\','+(!cl.disabled)+')"><div class="knob"></div></div></td></tr>';
    }).join('');
    document.getElementById('am').innerHTML='<div class="card"><table><tr><th>Client</th><th>Signing</th><th>Rate limit</th><th>Usage (24h)</th><th>Enabled</th></tr>'+rows+'</table>'
      +'<p class="muted" style="margin-top:10px">Rate limits are enforced per client per minute on api.trustee.cambobia.com (429 when exceeded). Usage requires Redis; sparkline shows hourly request counts.</p></div>';
  }catch(e){document.getElementById('am').innerHTML='<div class="danger">'+h(e.message)+'</div>'}
}
async function saveRl(platform){
  const v=Number(document.getElementById('rl_'+platform).value);
  try{await api('/api/v1/admin/clients/'+platform+'/rate-limit',{method:'PUT',body:JSON.stringify({rateLimitPerMin:v,actor:actor()})});vApiMgmt()}catch(e){alert(e.message)}
}
async function toggleClient(platform,to){
  if(!confirm((to?'Disable':'Enable')+' API access for '+platform+'?'))return;
  try{await api('/api/v1/admin/clients/'+platform+'/disabled',{method:'PUT',body:JSON.stringify({disabled:to,actor:actor()})});vApiMgmt()}catch(e){alert(e.message)}
}

(function init(){const s=sessionStorage.getItem('tc');if(s){try{const o=JSON.parse(s);S.token=o.token;S.email=o.email;show('app');document.getElementById('who').textContent=S.email;renderNav();go('dashboard');return}catch{}}show('login')})();
</script></body></html>`;
