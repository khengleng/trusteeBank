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
  <div class="row" style="margin-top:12px"><button class="btn" onclick="login()">Sign in</button><button class="ghost" onclick="forgot()">Forgot password?</button></div>
  <div class="err" id="loginErr"></div>
</div>
<div id="reset" class="card hide" style="max-width:420px;margin:8vh auto">
  <div class="row" style="margin-bottom:6px"><div class="logo">${MARK_SVG}</div><h1>Reset password</h1></div>
  <p class="muted" style="margin-top:0">Choose a new password for your account.</p>
  <label class="muted">New password (min 10 chars)</label><input id="rpw" type="password" autocomplete="new-password">
  <label class="muted" style="margin-top:8px;display:block">Confirm password</label><input id="rpw2" type="password" autocomplete="new-password">
  <div class="row" style="margin-top:12px"><button class="btn" onclick="doReset()">Set new password</button></div>
  <div class="err" id="resetErr"></div>
</div>

<div id="app" class="hide">
<header><div class="logo">${MARK_SVG}</div><h1>Trustee Admin Console</h1><div class="spacer"></div><span class="who" id="who"></span><button class="ghost" onclick="logout()">Sign out</button></header>
<div class="layout">
<nav id="nav"></nav>
<main id="view"></main>
</div></div>

<script>
const API=(window.__API_BASE__||'');
const S={token:'',tab:'dashboard',email:'',mfaEnabled:false,userId:'',prog:''};
const TABS=[['dashboard','Dashboard'],['users','Users (RBAC)'],['roles','Roles'],['policies','ABAC Policies'],['flags','Feature Flags'],['controls','Emergency Controls'],['ops','Operations'],['treasury','Treasury'],['ledger','Ledger'],['recon','Reconciliation'],['banking','Banking &amp; Reserve'],['audit','Audit'],['compliance','Compliance'],['security','Security (2FA)'],['apimgmt','API & Rate Limits'],['provision','Program Setup'],['webhooks','Webhooks']];
function h(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function val(id){var e=document.getElementById(id);return e?String(e.value).trim():''}
async function api(path,opts={}){
  const r=await fetch(API+path,{...opts,headers:{'content-type':'application/json',...(S.token?{'authorization':'Bearer '+S.token}:{}),...(opts.headers||{})}});
  const t=await r.text();let b;try{b=t?JSON.parse(t):{}}catch{b={raw:t}}
  if(r.status===401&&S.token&&path.indexOf('/auth/login')<0){sessionExpired();throw Object.assign(new Error('Session expired'),{body:b,status:401})}
  if(!r.ok)throw Object.assign(new Error(b.message||('HTTP '+r.status)),{body:b,status:r.status});
  return b;
}
function show(el){document.getElementById('login').classList.toggle('hide',el!=='login');document.getElementById('app').classList.toggle('hide',el!=='app');var r=document.getElementById('reset');if(r)r.classList.toggle('hide',el!=='reset')}
async function login(){
  const email=document.getElementById('email').value.trim();const password=document.getElementById('pw').value;
  const code=document.getElementById('code')?document.getElementById('code').value.trim():'';
  document.getElementById('loginErr').textContent='';
  try{
    const r=await api('/api/v1/auth/login',{method:'POST',body:JSON.stringify({email,password,code:code||undefined})});
    if(r.mfaRequired){document.getElementById('mfaRow').classList.remove('hide');document.getElementById('loginErr').textContent='Enter your MFA code.';return}
    S.token=r.token;S.email=r.user.email;S.mfaEnabled=!!r.user.mfaEnabled;S.userId=r.user.userId;
    sessionStorage.setItem('tc',JSON.stringify({token:S.token,email:S.email,userId:S.userId}));
    show('app');document.getElementById('who').textContent=S.email+' · '+(r.user.roles||[]).join(', ');renderNav();scheduleExpiry();
    if(!S.mfaEnabled){go('security')}else{go('dashboard')}
  }catch(e){document.getElementById('loginErr').textContent=e.status===401?'Invalid credentials or MFA code.':(e.message||'Login failed')}
}
var _expTimer=null;
function tokenExp(tok){try{var p=(tok||'').split('.')[1];if(!p)return 0;var j=JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')));return typeof j.exp==='number'?j.exp*1000:0}catch(e){return 0}}
function scheduleExpiry(){if(_expTimer){clearTimeout(_expTimer);_expTimer=null}var exp=tokenExp(S.token);if(!exp)return;var ms=exp-Date.now();if(ms<=0){sessionExpired();return}_expTimer=setTimeout(sessionExpired,ms)}
function sessionExpired(){if(_expTimer){clearTimeout(_expTimer);_expTimer=null}sessionStorage.removeItem('tc');S.token='';S.email='';S.userId='';show('login');var e=document.getElementById('loginErr');if(e)e.textContent='Your session has expired. Please sign in again.'}
function logout(){if(_expTimer){clearTimeout(_expTimer);_expTimer=null}sessionStorage.removeItem('tc');S.token='';S.email='';S.userId='';show('login')}
function renderNav(){document.getElementById('nav').innerHTML=TABS.map(([k,l])=>'<button class="'+(S.tab===k?'active':'')+'" onclick="go(\\''+k+'\\')">'+l+'</button>').join('')}
function go(t){S.tab=t;renderNav();({dashboard:vDash,users:vUsers,roles:vRoles,policies:vPolicies,flags:vFlags,controls:vControls,security:vSecurity,apimgmt:vApiMgmt,provision:vProvision,ops:vOps,treasury:vTreasury,ledger:vLedger,recon:vRecon,banking:vBanking,audit:vAudit,compliance:vCompliance,webhooks:vWebhooks}[t])()}
const V=document.getElementById('view');const set=x=>V.innerHTML=x;
function actor(){return S.email||'admin'}

async function vDash(){
  set('<h2>Operations dashboard</h2><div id="ih" class="card">Checking integrations…</div><div id="d">Loading…</div>');
  ihStart();
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
  set('<h2>Users & roles (RBAC)</h2><div id="u">Loading…</div>');
  const [u,r]=await Promise.all([api('/api/v1/admin/users'),api('/api/v1/admin/roles')]);
  const roleSel=r.roles.filter(x=>x.institution==='TRUSTEE_BANK').map(x=>'<option value="'+x.slug+'">'+h(x.name)+'</option>').join('');
  document.getElementById('u').innerHTML=
    '<div class="card"><h3>Create operator</h3><div class="row"><input id="opName" placeholder="Full name" style="max-width:180px"><input id="opEmail" placeholder="email" style="max-width:220px"><select id="opRole" style="max-width:240px">'+roleSel+'</select><button class="btn" data-act="createOperator">Create</button></div><p class="muted" style="margin-top:6px">New operators get a one-time password (shown once) and enroll 2FA on first login. Assign <b>trustee_operations_maker</b> and <b>trustee_operations_checker</b> to two different people so the queues flow.</p><div id="opOut"></div></div>'
    +'<div class="card"><table><tr><th>Name</th><th>Email</th><th>Institution</th><th>Roles</th><th>Actions</th></tr>'
    +u.users.map(us=>'<tr><td>'+h(us.displayName)+(us.disabled?' <span class="danger">disabled</span>':'')+'</td><td class="muted">'+h(us.email)+'</td><td>'+h(us.institution)+'</td><td>'+us.roles.map(x=>'<span class="tag">'+h(x)+'</span>').join('')+'</td>'
      +'<td><button class="ghost" data-act="editRoles" data-id="'+us.id+'|'+encodeURIComponent(JSON.stringify(us.roles))+'">Roles</button> <button class="ghost" data-act="resetUserPw" data-id="'+us.id+'">Reset pw</button> <button class="ghost" data-act="toggleUser" data-id="'+us.id+'|'+(us.disabled?'0':'1')+'">'+(us.disabled?'Enable':'Disable')+'</button></td></tr>').join('')
    +'</table></div>';
}
async function editRoles(v){var parts=v.split('|');var cur=JSON.parse(decodeURIComponent(parts[1]));var val=prompt('Comma-separated role slugs for this user:',cur.join(','));if(val==null)return;try{await api('/api/v1/admin/users/'+parts[0]+'/roles',{method:'PUT',body:JSON.stringify({roles:val.split(',').map(s=>s.trim()).filter(Boolean),actor:actor()})});vUsers()}catch(e){alert(e.message)}}
async function createOperator(){var name=document.getElementById('opName').value.trim();var email=document.getElementById('opEmail').value.trim();var role=document.getElementById('opRole').value;if(!name||!email){alert('Name and email required');return}try{var res=await api('/api/v1/admin/users',{method:'POST',body:JSON.stringify({displayName:name,email:email,institution:'TRUSTEE_BANK',roles:[role],actor:actor()})});document.getElementById('opOut').innerHTML='<p class="on">Created '+h(email)+(res.tempPassword?(' — temporary password: <code>'+h(res.tempPassword)+'</code> — share securely; they change it on first login.'):'')+'</p>';}catch(e){alert(e.message)}}
async function resetUserPw(id){var np=prompt('New password (min 10 chars; blank to auto-generate):');if(np===null)return;if(!np){np='Tmp!'+Math.random().toString(36).slice(2,12)+'A1'}try{await api('/api/v1/admin/users/'+id+'/password',{method:'PUT',body:JSON.stringify({newPassword:np})});alert('Password set to: '+np+'  (share securely)')}catch(e){alert(e.message)}}
async function toggleUser(v){var parts=v.split('|');var dis=parts[1]==='1';if(!confirm((dis?'Disable':'Enable')+' this user?'))return;try{await api('/api/v1/admin/users/'+parts[0]+'/disabled',{method:'PUT',body:JSON.stringify({disabled:dis,actor:actor()})});vUsers()}catch(e){alert(e.message)}}

async function vRoles(){
  set('<h2>Roles</h2><div id="r">Loading…</div>');
  const r=await api('/api/v1/admin/roles');
  document.getElementById('r').innerHTML='<div class="card"><table><tr><th>Slug</th><th>Name</th><th>Institution</th><th>Permissions</th></tr>'
  +r.roles.map(x=>'<tr><td><code>'+h(x.slug)+'</code>'+(x.builtin?' <span class="tag">built-in</span>':'')+'</td><td>'+h(x.name)+'</td><td>'+h(x.institution)+'</td><td class="muted">'+x.permissions.length+' perms</td></tr>').join('')
  +'</table></div>';
}

async function vPolicies(){
  set('<h2>ABAC approval policies (§9)</h2><p class="muted">Attribute-based rules that decide how many approvals a transaction needs, and from which roles — or deny it outright. Rules match on transaction type, amount band, currency and risk level; the highest-priority match wins.</p><div id="p">Loading…</div>');
  const p=await api('/api/v1/admin/policies');
  document.getElementById('p').innerHTML='<div class="card"><h3>Evaluate a transaction</h3>'
  +'<div class="row"><select id="etype"><option>MINT_AUTHORIZATION</option><option>PAYOUT</option><option>SETTLEMENT</option><option>RESERVE_ADJUSTMENT</option></select>'
  +'<input id="eamt" placeholder="amount minor units" style="max-width:200px"><input id="ecur" placeholder="USD" style="max-width:100px">'
  +'<button class="btn" onclick="evalPolicy()">Evaluate</button></div>'
  +'<small class="hint" style="display:block;font-size:11px;line-height:1.35;margin-top:6px">Dry-run to preview how many approvals a transaction would need — nothing is executed. Amount is in <b>minor units</b> (e.g. cents: 100000 = $1,000.00).</small><div id="eres" class="muted" style="margin-top:8px"></div></div>'
  +'<div class="card"><p class="muted" style="margin-top:0;font-size:12px">Active rules. <b>Match</b> = the amount/currency/risk band a rule applies to (“any” = always). <b>Effect</b> = REQUIRE approvals or DENY. <b>Prio</b> = priority; higher numbers are evaluated first.</p><table><tr><th>Type</th><th>Match</th><th>Effect</th><th>Approvals</th><th>Roles</th><th>Prio</th></tr>'
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
  const desc={'platform.read-only':'Read-only mode: block ALL state-changing actions platform-wide. The big red switch.','mint.global-suspend':'Halt all new mint authorizations across every program.','redemption.global-suspend':'Halt all new redemptions (token burns / payouts to holders).','payout.global-suspend':'Halt all outgoing fiat payouts (bank disbursements).','paychain.api-suspend':'Cut off PayChain’s API access entirely (kill switch for that client).','paykh.api-suspend':'Cut off PayKH’s API access entirely (kill switch for that client).'};
  const c=await api('/api/v1/admin/controls');
  const map=Object.fromEntries((c.controls||[]).map(x=>[x.key,x]));
  document.getElementById('c').innerHTML='<div class="card"><p class="muted">Break-glass switches to freeze activity during an incident. Toggling one requires a reason and is fully audited. Turn back off once resolved.</p><table><tr><th>Control</th><th>State</th><th>Reason</th></tr>'
  +known.map(k=>{const cur=map[k];const on=cur&&cur.value;return '<tr><td><code>'+h(k)+'</code><div class="muted" style="font-size:11px;line-height:1.35;margin-top:2px;max-width:360px">'+h(desc[k]||'')+'</div></td><td><div class="switch '+(on?'active':'')+'" onclick="toggleCtl(\\''+k+'\\','+(!on)+')"><div class="knob"></div></div></td><td class="muted">'+h(cur&&cur.reason||'')+'</td></tr>'}).join('')
  +'</table></div>';
}
async function toggleCtl(key,to){
  const reason=prompt('Reason for '+(to?'ACTIVATING':'clearing')+' '+key+':');if(!reason)return;
  try{await api('/api/v1/admin/controls/'+key,{method:'PUT',body:JSON.stringify({value:to,reason,actor:actor()})});vControls()}catch(e){alert(e.message)}
}

async function vSecurity(){
  set('<h2>Security</h2>'
    +'<div class="card"><h3>Change password</h3><div class="row"><input id="curpw" type="password" placeholder="current password" style="max-width:200px"><input id="newpw" type="password" placeholder="new password (min 10)" style="max-width:200px"><button class="btn" onclick="changePw()">Change</button></div><div class="err" id="cpwErr"></div></div>'
    +'<h3 style="margin-top:18px">Two-factor authentication</h3><div id="sec">Loading…</div>');
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
  try{await api('/api/v1/auth/mfa/enable',{method:'POST',body:JSON.stringify({code})});alert('2FA activated. Please sign in again with your authenticator code.');logout();}
  catch(e){document.getElementById('mfaErr').textContent=e.message||'Could not activate 2FA'}
}

async function vApiMgmt(){
  set('<h2>API usage &amp; rate limits</h2><p class="muted">Per-client API controls for PayChain and PayKH. <b>Signing</b> = whether inbound requests must be signature-verified. <b>Rate limit</b> = max requests per minute before HTTP 429. <b>Usage</b> = requests in the last 24h. <b>Enabled</b> = master on/off for that client’s API access.</p><div id="am">Loading…</div>');
  try{
    const [c,u]=await Promise.all([api('/api/v1/admin/clients'),api('/api/v1/admin/usage')]);
    const usageBy={};(u.usage||[]).forEach(x=>usageBy[x.platform]=x);
    const rows=(c.clients||[]).filter(x=>x.platform==='PAYCHAIN'||x.platform==='PAYKH').map(cl=>{
      const us=usageBy[cl.platform]||{total:0,hourly:[]};
      const spark=(us.hourly||[]).map(h=>'<span title="'+h.hour+': '+h.count+'" style="display:inline-block;width:5px;margin-right:1px;background:var(--acc);height:'+Math.max(2,Math.min(28,h.count))+'px;vertical-align:bottom"></span>').join('');
      return '<tr><td><b>'+h(cl.platform)+'</b><br><span class="muted">'+h(cl.clientId)+'</span></td>'
        +'<td>'+(cl.requireSignature?'<span class="on">required</span>':'<span class="muted">off</span>')+(cl.hasPublicKey?' <span class="tag">key</span>':'')+'</td>'
        +'<td><div class="row"><input id="rl_'+cl.platform+'" type="number" value="'+cl.rateLimitPerMin+'" style="max-width:110px"><button class="ghost" onclick="saveRl(\\''+cl.platform+'\\')">Save</button></div><span class="muted">req/min</span></td>'
        +'<td><b>'+us.total+'</b> <span class="muted">req/24h</span><div style="height:30px;margin-top:4px">'+spark+'</div></td>'
        +'<td><div class="switch '+(cl.disabled?'':'active')+'" onclick="toggleClient(\\''+cl.platform+'\\','+(!cl.disabled)+')"><div class="knob"></div></div></td></tr>';
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

// --- Guided program setup (replaces DEMO-PUSD) ---------------------------
function pf(id,label,ph,val,type,hint){
  return '<label style="display:block;margin:8px 0"><span class="muted" style="display:block;font-size:12px">'+label+'</span>'
    +'<input id="'+id+'" type="'+(type||'text')+'" placeholder="'+(ph||'')+'" value="'+(val==null?'':val)+'" style="width:100%;max-width:340px">'
    +(hint?'<small class="hint" style="display:block;font-size:11px;line-height:1.35;margin-top:3px;max-width:340px">'+hint+'</small>':'')
    +'</label>';
}
function vProvision(){
  var pid=S.newProgramId||'';
  var grid='style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0 18px"';
  var step1='<div class="card"><h3>1 · Program</h3>'
    +'<p class="muted" style="margin-top:0;font-size:12px">A “program” ties one issued token to its reserve, legal and regulatory setup. All fields are required except Safety buffer and Agreement refs.</p><div '+grid+'>'
    +pf('pg_code','Program code','e.g. PUSD-01',null,null,'Your unique code for this program. Any label you choose, e.g. PUSD-01 or KHQR-KHR-01.')
    +pf('pg_assetId','Asset ID','e.g. PUSD',null,null,'The token / stablecoin symbol PayChain issues for this program, e.g. PUSD or mKHR.')
    +pf('pg_ccy','Reference currency','USD',null,null,'ISO-4217 fiat the token is pegged to and reserves are held in — USD, KHR, etc.')
    +pf('pg_issuer','Issuer ID','PayChain issuer id',null,null,'PayChain’s issuer identifier for this asset (get it from PayChain).')
    +pf('pg_legalEntity','Legal entity ID','',null,null,'Your reference for the legal entity that owns / operates this program.')
    +pf('pg_trusteeBank','Trustee bank ID','',null,null,'Identifier of the trustee bank entity safeguarding the reserve.')
    +pf('pg_legalModel','Legal model','e.g. SAFEGUARDED_CUSTOMER_FUNDS',null,null,'Legal basis for safeguarding — e.g. DECLARATION_OF_TRUST, SAFEGUARDED_CUSTOMER_FUNDS, ESCROW.')
    +pf('pg_regStatus','Regulatory status','e.g. PILOT',null,null,'Regulatory standing — e.g. LICENSED, PILOT, EXEMPT, PENDING.')
    +pf('pg_reservePolicy','Reserve policy','e.g. FULL_100',null,null,'One of: FULL_100, OVERCOLLATERALIZED, ASSET_BUFFER, INTRADAY_BUFFER, REDEMPTION_LIQUIDITY_BUFFER, REGULATORY_BUFFER. FULL_100 = backed 1:1.')
    +pf('pg_ratio','Required reserve ratio (bps)','10000','','number','Backing required, in basis points. 10000 = 100% (full reserve); 12000 = 120%.')
    +pf('pg_buffer','Safety buffer (bps)','0','0','number','Optional extra reserve held above the required ratio, in bps. 0 = none, 500 = +5%.')
    +pf('pg_agreements','Agreement refs (comma-sep)','',null,null,'Optional. Trust/agreement document references, comma-separated.')
    +pf('pg_effective','Effective date','','','date','Date this trustee arrangement takes effect. Defaults to today if left blank.')
    +'</div><button class="btn" onclick="createProgramSubmit()">Create program (DRAFT)</button> <span class="err" id="provErr"></span>'
    +(pid?'<p class="on" style="margin-top:8px">✓ Program created: <code>'+h(pid)+'</code> (DRAFT)</p>':'')+'</div>';
  var rest='';
  if(pid){
    rest='<div class="card"><h3>2 · Trustee bank account</h3>'
      +'<p class="muted" style="margin-top:0;font-size:12px">The reserve bank account backing this program. You can add more than one (reserves may span several banks).</p><div '+grid+'>'
      +pf('ac_masked','Masked account number','**** **** 1234',null,null,'Bank account number, masked — only the shown digits are stored (never the full number).')
      +pf('ac_name','Account name','Reserve Trust Account',null,null,'The account name as held at the bank.')
      +pf('ac_bank','Bank legal entity','e.g. Cambobia Bank Plc',null,null,'Legal name of the bank holding this reserve account.')
      +pf('ac_core','Core banking ref','',null,null,'The bank’s account/reference id used to look up the balance (for API/statement reconciliation).')
      +pf('ac_branch','Branch (optional)','',null,null,'Optional. Bank branch name or code.')
      +pf('ac_ccy','Currency','USD',null,null,'Account currency — should match the program’s reference currency.')
      +pf('ac_class','Classification','e.g. RESERVE_ACCOUNT',null,null,'Account type — e.g. RESERVE_ACCOUNT, TRUST_ACCOUNT, ESCROW_ACCOUNT, CLIENT_MONEY_ACCOUNT.')
      +'<label style="display:block;margin:8px 0"><span class="muted" style="display:block;font-size:12px">Balance source</span><select id="ac_src" style="width:100%;max-width:340px"><option>MANUAL</option><option>API</option><option>STATEMENT</option></select><small class="hint" style="display:block;font-size:11px;line-height:1.35;margin-top:3px;max-width:340px">How cleared balances are obtained: MANUAL (operator-entered), API (live core-banking), or STATEMENT (bank file).</small></label>'
      +pf('ac_intmode','Integration mode','e.g. MANUAL',null,null,'Free label for the integration used, e.g. MANUAL, MOCK, or the bank connector name.')
      +'</div><button class="btn" onclick="addAccountSubmit()">Add account</button> <span class="err" id="acErr"></span><span id="acOk"></span></div>'
      +'<div class="card"><h3>3 · Partner webhook URLs &amp; secrets</h3>'
      +'<div class="row"><span style="width:90px"><b>PayChain</b></span><input id="wh_PAYCHAIN" placeholder="https://api.paychain.cambobia.com/api/v1/trustee/events" style="flex:1"><button class="ghost" onclick="saveWebhook(\\'PAYCHAIN\\')">Save</button><button class="ghost" onclick="rotateSecret(\\'PAYCHAIN\\')">Rotate secret</button></div>'
      +'<div class="row" style="margin-top:8px"><span style="width:90px"><b>PayKH</b></span><input id="wh_PAYKH" placeholder="https://api.paykh.cambobia.com/api/v1/trustee/events" style="flex:1"><button class="ghost" onclick="saveWebhook(\\'PAYKH\\')">Save</button><button class="ghost" onclick="rotateSecret(\\'PAYKH\\')">Rotate secret</button></div>'
      +'<div id="secOut" style="margin-top:10px"></div></div>'
      +'<div class="card"><h3>4 · Activate</h3><p class="muted">Activation should be performed by a second operator (segregation of duties). This flips the program from DRAFT to ACTIVE — scheduled proof-of-reserve and reconciliation begin.</p>'
      +'<button class="btn" onclick="activateProgram()">Activate program</button> <span class="err" id="actErr"></span><span id="actOk"></span></div>';
  }
  set('<h2>Program setup</h2><p class="muted">Provision a real trustee program to replace the demo. Created in <b>DRAFT</b>; goes live only on activation.</p>'+step1+rest);
}
async function createProgramSubmit(){
  document.getElementById('provErr').textContent='';
  var body={
    code:val('pg_code'),assetId:val('pg_assetId'),referenceCurrency:val('pg_ccy'),issuerId:val('pg_issuer'),
    legalEntityId:val('pg_legalEntity'),trusteeBankId:val('pg_trusteeBank'),legalModel:val('pg_legalModel'),
    regulatoryStatus:val('pg_regStatus'),reservePolicy:val('pg_reservePolicy'),
    requiredRatioBps:Number(val('pg_ratio')||'10000'),safetyBufferBps:Number(val('pg_buffer')||'0'),
    agreementReferences:(val('pg_agreements')||'').split(',').map(function(s){return s.trim()}).filter(Boolean),
    effectiveDate:val('pg_effective')||new Date().toISOString(),actor:actor()};
  try{var r=await api('/api/v1/admin/programs',{method:'POST',body:JSON.stringify(body)});S.newProgramId=r.id;vProvision();}
  catch(e){document.getElementById('provErr').textContent=e.message||'Create failed'}
}
async function addAccountSubmit(){
  document.getElementById('acErr').textContent='';
  var body={maskedAccountNumber:val('ac_masked'),accountName:val('ac_name'),bankLegalEntity:val('ac_bank'),
    coreBankingRef:val('ac_core'),branch:val('ac_branch'),currency:val('ac_ccy'),classification:val('ac_class'),
    balanceSource:val('ac_src'),integrationMode:val('ac_intmode'),actor:actor()};
  try{await api('/api/v1/admin/programs/'+S.newProgramId+'/accounts',{method:'POST',body:JSON.stringify(body)});document.getElementById('acOk').innerHTML=' <span class="on">✓ account added</span>'}
  catch(e){document.getElementById('acErr').textContent=e.message||'Failed'}
}
async function saveWebhook(platform){
  var url=val('wh_'+platform);
  try{await api('/api/v1/admin/clients/'+platform+'/webhook',{method:'PUT',body:JSON.stringify({webhookUrl:url,actor:actor()})});alert(platform+' webhook URL saved')}
  catch(e){alert(e.message||'Failed')}
}
async function rotateSecret(platform){
  if(!confirm('Rotate the '+platform+' client secret? The previous secret stops working immediately — you must give the new one to '+platform+'.'))return;
  try{var r=await api('/api/v1/admin/clients/'+platform+'/rotate-secret',{method:'POST',body:JSON.stringify({actor:actor()})});
    document.getElementById('secOut').innerHTML='<div class="card" style="border-color:var(--acc)"><b>'+h(platform)+' new secret (shown once):</b><br><code>'+h(r.clientSecret)+'</code><p class="muted">Client id: <code>'+h(r.clientId)+'</code>. Hand these to '+h(platform)+' now.</p></div>'}
  catch(e){alert(e.message||'Failed')}
}
async function activateProgram(){
  document.getElementById('actErr').textContent='';
  if(!confirm('Activate this program? Scheduled proof-of-reserve and reconciliation will begin.'))return;
  try{await api('/api/v1/admin/programs/'+S.newProgramId+'/status',{method:'PUT',body:JSON.stringify({status:'ACTIVE',actor:actor()})});document.getElementById('actOk').innerHTML=' <span class="on">✓ ACTIVE</span>'}
  catch(e){document.getElementById('actErr').textContent=e.message||'Failed (activation may require a different operator role)'}
}

async function forgot(){
  const email=(document.getElementById('email').value||'').trim()||prompt('Enter your account email:');
  if(!email)return;
  try{await api('/api/v1/auth/forgot-password',{method:'POST',body:JSON.stringify({email:email})});
    document.getElementById('loginErr').textContent='If that email exists, a reset link has been sent.';
  }catch(e){document.getElementById('loginErr').textContent=e.message||'Could not send reset email'}
}
async function doReset(){
  const p=document.getElementById('rpw').value,p2=document.getElementById('rpw2').value,err=document.getElementById('resetErr');err.textContent='';
  if(p!==p2){err.textContent='Passwords do not match';return}
  const token=new URLSearchParams(location.search).get('reset_token');
  try{await api('/api/v1/auth/reset-password',{method:'POST',body:JSON.stringify({token:token,newPassword:p})});
    alert('Password reset. Please sign in.');location.href=location.pathname;
  }catch(e){err.textContent=e.message||'Reset failed'}
}
async function changePw(){
  const c=document.getElementById('curpw').value,n=document.getElementById('newpw').value,e=document.getElementById('cpwErr');e.textContent='';
  try{await api('/api/v1/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:c,newPassword:n})});alert('Password changed.');document.getElementById('curpw').value='';document.getElementById('newpw').value='';}
  catch(err){e.textContent=err.message||'Could not change password'}
}
// ---- operational workbench ----
const money2=m=>m?((Number(m)/100).toLocaleString()+''):'0';
function csv(rows,name){var nl=String.fromCharCode(10);var c=rows.map(r=>r.map(x=>'"'+String(x==null?'':x).replace(/"/g,'""')+'"').join(',')).join(nl);var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(c);a.download=name;a.click();}
async function progPicker(cb){
  const p=await api('/api/v1/admin/ops/programs');
  if(!S.prog&&p.programs[0])S.prog=p.programs[0].id;
  const opts=p.programs.map(x=>'<option value="'+x.id+'"'+(x.id===S.prog?' selected':'')+'>'+h(x.code)+'</option>').join('');
  return '<div class="row" style="margin-bottom:12px"><span class="muted">Program</span><select id="progSel" data-act="pickProg" style="max-width:220px">'+opts+'</select></div>';
}

async function vOps(){
  set('<h2>Operations queues</h2><div id="q">Loading…</div>');
  try{
    const q=await api('/api/v1/admin/ops/queues');
    const sec=(title,items,cols,acts)=>'<div class="card"><h3>'+title+' <span class="tag">'+items.length+'</span></h3>'+(items.length?'<table><tr>'+cols.map(c=>'<th>'+c[0]+'</th>').join('')+'<th>Action</th></tr>'+items.map(it=>'<tr>'+cols.map(c=>'<td>'+h(c[1](it))+'</td>').join('')+'<td>'+acts(it)+'</td></tr>').join('')+'</table>':'<p class="muted">Nothing pending.</p>')+'</div>';
    const b=(act,id,label,cls)=>'<button class="'+(cls||'ghost')+'" data-act="'+act+'" data-id="'+id+'">'+label+'</button> ';
    document.getElementById('q').innerHTML=
      sec('Mint authorizations',q.mint,[['Amount',x=>money2(x.amountMinor)+' '+x.currency],['Status',x=>x.status]],x=>x.status==='PENDING_MAKER'?b('reviewMint',x.id,'Review','btn'):b('approveMint',x.id,'Approve','btn')+b('rejectMint',x.id,'Reject'))
     +sec('Redemptions',q.redemptions,[['Amount',x=>money2(x.amountMinor)+' '+x.currency],['Beneficiary',x=>x.beneficiaryName],['Status',x=>x.status]],x=>x.status==='AWAITING_APPROVAL'?b('approveRedemption',x.id,'Approve','btn'):x.status==='BURN_CONFIRMED'?b('submitPayout',x.id,'Submit payout','btn'):x.status==='PAYOUT_SUBMITTED'?b('confirmPayout',x.id,'Confirm payout','btn'):'<span class="muted">awaiting burn</span>')
     +sec('Deposits',q.deposits,[['Amount',x=>money2(x.amountMinor)+' '+x.currency],['Bank txn',x=>x.bankTransactionId],['Status',x=>x.status]],x=>x.status==='MATCHED'?b('clearDeposit',x.id,'Clear','btn'):b('matchDeposit',x.id,'Match','btn'))
     +sec('Merchant settlements',q.settlements,[['Merchant',x=>x.merchantId],['Amount',x=>money2(x.amountMinor)+' '+x.currency],['Status',x=>x.status]],x=>x.status==='REQUESTED'?b('approveSettlement',x.id,'Approve','btn'):b('confirmSettlement',x.id,'Confirm','btn'));
  }catch(e){document.getElementById('q').innerHTML='<div class="danger">'+h(e.message)+'</div>'}
}
async function reviewMint(id){await act('/api/v1/bank/mint-authorizations/'+id+'/review',{makerId:S.userId})}
async function approveMint(id){await act('/api/v1/bank/mint-authorizations/'+id+'/approve',{checkerId:S.userId,reason:'approved via console'})}
async function rejectMint(id){const r=prompt('Reason for rejection:');if(!r)return;await act('/api/v1/bank/mint-authorizations/'+id+'/reject',{checkerId:S.userId,reason:r})}
async function approveRedemption(id){await act('/api/v1/bank/redemptions/'+id+'/approve',{approverId:S.userId,reason:'approved via console'})}
async function submitPayout(id){await act('/api/v1/bank/redemptions/'+id+'/submit-payout',{actor:actor()})}
async function confirmPayout(id){await act('/api/v1/bank/redemptions/'+id+'/confirm-payout',{actor:actor()})}
async function matchDeposit(id){const fi=prompt('Funding instruction id to match:');if(!fi)return;await act('/api/v1/bank/deposits/'+id+'/match',{fundingInstructionId:fi,actor:actor()})}
async function clearDeposit(id){await act('/api/v1/bank/deposits/'+id+'/clear',{actor:actor()})}
async function approveSettlement(id){await act('/api/v1/admin/settlements/'+id+'/approve',{checkerId:S.userId})}
async function confirmSettlement(id){await act('/api/v1/admin/settlements/'+id+'/confirm',{actor:actor()})}
async function act(path,body){try{await api(path,{method:'POST',body:JSON.stringify(body)});vOps();}catch(e){alert((e.body&&e.body.reasons?('Blocked: '+e.body.reasons.join(', ')):e.message))}}

async function vTreasury(){
  const picker=await progPicker();
  set('<h2>Treasury</h2>'+picker+'<div id="tr">Loading…</div>');
  try{
    const [r,l]=await Promise.all([api('/api/v1/admin/reports/reserve/'+S.prog),api('/api/v1/admin/reports/liability/'+S.prog)]);
    document.getElementById('tr').innerHTML='<div class="grid">'
      +kpi('Eligible reserve',money2(r.eligibleReserveMinor)+' '+r.currency)
      +kpi('Obligation',money2(r.reserveObligationMinor)+' '+r.currency)
      +kpi('Mint capacity',money2(r.mintCapacityMinor)+' '+r.currency)
      +kpi('Reserve ratio',r.reserveRatioBps!=null?(r.reserveRatioBps/100)+'%':'—')
      +kpi('Surplus/shortfall',money2(r.surplusMinor)+' '+r.currency)
      +'</div>'
      +'<div class="card"><h3>Circulating liability (PayChain feed)</h3>'+(l.liability?('<div class="row"><span class="tag">'+h(l.liability.assetCode)+'</span> circulating <b>'+money2(l.liability.circulatingMinor)+' '+l.liability.currency+'</b> · seq '+l.liability.sequence+'</div>'):'<span class="muted">no verified feed</span>')+'</div>'
      +'<div class="card"><h3>Proof of reserve</h3><button class="btn" data-act="genPor">Generate signed snapshot</button> <span class="muted">latest: '+(r.latestSnapshotAt||'none')+'</span><div id="porOut"></div></div>';
  }catch(e){document.getElementById('tr').innerHTML='<div class="danger">'+h(e.message)+'</div>'}
}
async function genPor(){try{const s=await api('/api/v1/admin/proof-of-reserve/'+S.prog+'/snapshots',{method:'POST'});document.getElementById('porOut').innerHTML='<p class="on">Snapshot '+h(s.id)+' created (ratio '+(s.ratioBps!=null?s.ratioBps/100+'%':'n/a')+').</p>';}catch(e){alert(e.message)}}

async function vLedger(){
  const picker=await progPicker();
  set('<h2>Ledger &amp; trial balance</h2>'+picker+'<div id="lg">Loading…</div>');
  try{
    const [tb,en]=await Promise.all([api('/api/v1/admin/ledger/'+S.prog+'/trial-balance'),api('/api/v1/admin/ledger/'+S.prog+'/entries?limit=40')]);
    document.getElementById('lg').innerHTML='<div class="card"><div class="row" style="justify-content:space-between"><h3>Trial balance '+(tb.totals.balanced?'<span class="on">balanced</span>':'<span class="danger">UNBALANCED</span>')+'</h3><button class="ghost" data-act="csvTb">Export CSV</button></div>'
      +'<table><tr><th>Account</th><th>Type</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr>'
      +tb.accounts.map(a=>'<tr><td><code>'+h(a.account)+'</code></td><td>'+h(a.type)+'</td><td style="text-align:right">'+money2(a.debitMinor)+'</td><td style="text-align:right">'+money2(a.creditMinor)+'</td><td style="text-align:right"><b>'+money2(a.balanceMinor)+'</b></td></tr>').join('')
      +'</table></div>'
      +'<div class="card"><h3>Recent journal entries</h3>'+en.entries.map(e=>'<div style="border-bottom:1px solid var(--line);padding:8px 0"><div class="row" style="justify-content:space-between"><b>'+h(e.description)+'</b><span class="muted">'+h(e.postedAt.slice(0,19).replace("T"," "))+'</span></div><div class="muted" style="font-size:13px">'+e.postings.map(p=>h(p.account)+' '+(Number(p.debitMinor)?('Dr '+money2(p.debitMinor)):('Cr '+money2(p.creditMinor)))).join(' · ')+'</div></div>').join('')+'</div>';
    window.__tb=tb;
  }catch(e){document.getElementById('lg').innerHTML='<div class="danger">'+h(e.message)+'</div>'}
}
function csvTb(){const tb=window.__tb;csv([['account','type','debit','credit','balance']].concat(tb.accounts.map(a=>[a.account,a.type,a.debitMinor,a.creditMinor,a.balanceMinor])),'trial-balance.csv')}

async function vRecon(){
  set('<h2>Reconciliation</h2><div class="card"><div class="row"><button class="btn" data-act="reconReserve">Run reserve reconciliation</button><span class="muted">for selected treasury program</span></div></div><div id="rc">Loading…</div>');
  try{
    const r=await api('/api/v1/admin/reconciliations');
    document.getElementById('rc').innerHTML='<div class="card"><h3>Recent runs</h3><table><tr><th>Scope</th><th>Status</th><th>Exceptions</th><th>When</th></tr>'
      +r.runs.map(x=>'<tr><td>'+h(x.scope)+'</td><td>'+(x.status==='EXCEPTIONS'?'<span class="danger">EXCEPTIONS</span>':'<span class="on">OK</span>')+'</td><td>'+x.exceptionCount+'</td><td class="muted">'+h(x.createdAt.slice(0,19).replace("T"," "))+'</td></tr>').join('')+'</table></div>';
  }catch(e){document.getElementById('rc').innerHTML='<div class="danger">'+h(e.message)+'</div>'}
}
async function reconReserve(){if(!S.prog){alert('Pick a program in Treasury first');return}try{await api('/api/v1/admin/reconciliations/reserve',{method:'POST',body:JSON.stringify({programId:S.prog,actor:actor()})});vRecon();}catch(e){alert(e.message)}}

// --- Banking & Reserve (trustee-banking: multi-bank, holds, reconciliation, PoR) ---
async function vBanking(){
  var picker=await progPicker();
  set('<h2>Banking &amp; Reserve</h2><p class="muted">Trustee-banking controls: the banks holding the reserve, per-account balances, eligible-reserve holds, and multi-bank reconciliation against the ledger. Blockchain issuance is handled by PayChain; merchant onboarding by PayKH.</p>'+picker+'<div id="bk">Loading…</div>');
  bkLoad();
}
async function bkLoad(){
  var box=document.getElementById('bk');if(!box)return;
  try{
    var banks=await api('/api/v1/bank/bank-connections');
    var bopts=(banks.banks||[]);
    var bankRows=bopts.map(function(b){return '<tr><td><code>'+h(b.bankId)+'</code></td><td>'+h(b.bankLegalName)+'</td><td>'+h(b.country||'')+'</td><td>'+h(b.integrationMode)+'</td><td class="muted">'+h(b.baseUrl||(b.integrationMode==='MOCK'?'(operator-set balances)':''))+'</td><td>'+h(b.status)+'</td></tr>';}).join('');
    var reg='<div class="card"><h3>Bank connections</h3><p class="muted" style="margin-top:0;font-size:12px">Each bank holding reserve. MOCK uses operator-set balances (no real bank); API reads live core-banking via baseUrl + a token named by an env var; MANUAL/STATEMENT are offline.</p>'
      +'<table><tr><th>Bank ID</th><th>Legal name</th><th>Country</th><th>Mode</th><th>Endpoint</th><th>Status</th></tr>'+(bankRows||'<tr><td colspan="6" class="muted">No banks registered yet.</td></tr>')+'</table>'
      +'<div class="row" style="margin-top:10px;flex-wrap:wrap"><input id="bk_id" placeholder="Bank ID e.g. WING" style="max-width:150px"><input id="bk_name" placeholder="Legal name" style="max-width:190px"><input id="bk_country" placeholder="KH" style="max-width:70px"><select id="bk_mode"><option>MOCK</option><option>API</option><option>MANUAL</option><option>STATEMENT</option></select><input id="bk_url" placeholder="baseUrl (API only)" style="max-width:200px"><input id="bk_env" placeholder="authTokenEnv (API only)" style="max-width:170px"><button class="btn" data-act="bkRegister">Register / update</button></div>'
      +'<small class="hint" style="display:block;font-size:11px;margin-top:6px">Real bank: mode API, baseUrl = core-banking URL, authTokenEnv = the env-var name holding its token (set that variable on the service). Leave URL/env blank for MOCK.</small><span class="err" id="bkErr"></span></div>';
    var accHtml='';
    if(S.prog){
      var accs=await api('/api/v1/bank/reserves/'+S.prog+'/accounts');
      var accRows=(accs.accounts||[]).map(function(a){var sel='<select id="ab_'+a.id+'"><option value="">— unassigned —</option>'+bopts.map(function(b){return '<option value="'+h(b.bankId)+'"'+(a.bankId===b.bankId?' selected':'')+'>'+h(b.bankId)+'</option>';}).join('')+'</select>';
        return '<tr><td>'+h(a.maskedAccountNumber)+'<div class="muted" style="font-size:11px">'+h(a.accountName)+' · '+h(a.currency)+'</div></td><td>'+h(a.bankLegalEntity)+'</td><td>'+sel+'</td><td><input id="am_'+a.id+'" type="number" value="'+h(a.mockClearedMinor)+'" style="max-width:130px"><div class="muted" style="font-size:11px">mock cleared (minor)</div></td><td><button class="ghost" data-act="bkSaveAcc" data-id="'+a.id+'">Save</button></td></tr>';}).join('');
      accHtml='<div class="card"><h3>Reserve accounts &amp; bank links</h3><p class="muted" style="margin-top:0;font-size:12px">Link each reserve account to a bank. In MOCK mode set the cleared balance here; in API mode balances are read live.</p><table><tr><th>Account</th><th>Bank entity</th><th>Bank</th><th>Mock cleared balance</th><th></th></tr>'+(accRows||'<tr><td colspan="5" class="muted">No accounts for this program. Add one under Program Setup.</td></tr>')+'</table><span class="err" id="abErr"></span></div>'
        +'<div class="card"><h3>Eligible-reserve holds &amp; adjustments</h3><p class="muted" style="margin-top:0;font-size:12px">Amounts carved out of the eligible reserve without moving cash — regulatory holds, restricted funds, operational carve-outs, bank charges.</p><div id="adjBox">Loading…</div><div class="row" style="margin-top:10px"><select id="adj_kind"><option>REGULATORY_HOLD</option><option>RESTRICTED</option><option>OPERATIONAL</option><option>BANK_CHARGE</option></select><input id="adj_amt" type="number" placeholder="amount minor" style="max-width:150px"><input id="adj_reason" placeholder="reason" style="max-width:210px"><button class="btn" data-act="adjAdd">Place hold</button><span class="err" id="adjErr"></span></div></div>'
        +'<div class="card"><h3>Multi-bank reconciliation</h3><p class="muted" style="margin-top:0;font-size:12px">Compare the reserve ledger cash against the sum of bank balances across all accounts for this program.</p><button class="btn" data-act="bkReconcile">Reconcile now</button><div id="recOut" style="margin-top:10px"></div></div>';
    } else {
      accHtml='<div class="card"><span class="muted">Select a program above to manage its reserve accounts, holds and reconciliation.</span></div>';
    }
    var loy=await api('/api/v1/bank/loyalty-liabilities');
    var loyRows=(loy.liabilities||[]).map(function(l){return '<tr><td><code>'+h(l.paykhProgramId)+'</code><div class="muted" style="font-size:11px">'+h(l.tenantId)+'</div></td><td>'+h(l.pegCurrency)+'</td><td>'+money2(l.outstandingMinor)+'</td><td>'+money2(l.onChainSupplyMinor)+'</td><td>'+(l.reconciliationStatus==='DRIFT'?'<span class="danger">DRIFT</span>':l.reconciliationStatus==='OK'?'<span class="on">OK</span>':'<span class="muted">'+h(l.reconciliationStatus)+'</span>')+'</td><td><button class="ghost" data-act="loyRecon" data-id="'+l.id+'">Reconcile</button></td></tr>';}).join('');
    var loyHtml='<div class="card"><h3>Loyalty stablecoin — proof of reserve</h3><p class="muted" style="margin-top:0;font-size:12px">Read-only. Backed loyalty stablecoins are issued via PayKH and executed on-chain by PayChain; the trustee independently verifies outstanding liability vs on-chain supply. Issuing and redeeming are not done here.</p><table><tr><th>Program</th><th>Ccy</th><th>Outstanding</th><th>On-chain</th><th>Status</th><th></th></tr>'+(loyRows||'<tr><td colspan="6" class="muted">No loyalty stablecoins yet.</td></tr>')+'</table></div>';
    box.innerHTML=reg+accHtml+loyHtml;
    if(S.prog)adjLoad();
  }catch(e){box.innerHTML='<div class="danger">'+h(e.message)+'</div>'}
}
async function bkRegister(){
  var el=document.getElementById('bkErr');if(el)el.textContent='';
  var body={bankId:val('bk_id'),bankLegalName:val('bk_name'),country:val('bk_country')||undefined,integrationMode:document.getElementById('bk_mode').value,baseUrl:val('bk_url')||undefined,authTokenEnv:val('bk_env')||undefined,actor:actor()};
  try{await api('/api/v1/bank/bank-connections',{method:'POST',body:JSON.stringify(body)});bkLoad();}
  catch(e){if(el)el.textContent=e.message||'Failed'}
}
async function bkSaveAcc(id){
  var bankId=(document.getElementById('ab_'+id)||{}).value||'';
  var mock=(document.getElementById('am_'+id)||{}).value||'0';
  try{await api('/api/v1/bank/reserve-accounts/'+id+'/bank',{method:'POST',body:JSON.stringify({bankId:bankId||undefined,mockClearedMinor:mock})});bkLoad();}
  catch(e){var el=document.getElementById('abErr');if(el)el.textContent=e.message||'Failed'}
}
async function adjLoad(){
  var box=document.getElementById('adjBox');if(!box||!S.prog)return;
  try{var r=await api('/api/v1/bank/reserves/'+S.prog+'/adjustments');
    box.innerHTML=(r.adjustments&&r.adjustments.length)?('<table><tr><th>Kind</th><th>Amount</th><th>Reason</th><th></th></tr>'+r.adjustments.map(function(a){return '<tr><td>'+h(a.kind)+'</td><td>'+money2(a.amountMinor)+'</td><td class="muted">'+h(a.reason||'')+'</td><td><button class="ghost" data-act="adjLift" data-id="'+a.id+'">Lift</button></td></tr>';}).join('')+'</table>'):'<span class="muted">No active holds.</span>';
  }catch(e){box.innerHTML='<span class="danger">'+h(e.message)+'</span>'}
}
async function adjAdd(){
  var el=document.getElementById('adjErr');if(el)el.textContent='';
  try{await api('/api/v1/bank/reserves/'+S.prog+'/adjustments',{method:'POST',body:JSON.stringify({kind:document.getElementById('adj_kind').value,amountMinor:val('adj_amt'),reason:val('adj_reason')||undefined,actor:actor()})});adjLoad();}
  catch(e){if(el)el.textContent=e.message||'Failed'}
}
async function adjLift(id){try{await api('/api/v1/bank/reserve-adjustments/'+id+'/lift',{method:'POST',body:JSON.stringify({actor:actor()})});adjLoad();}catch(e){alert(e.message)}}
async function bkReconcile(){
  var out=document.getElementById('recOut');if(!out)return;out.textContent='Reconciling…';
  try{var r=await api('/api/v1/bank/reserves/'+S.prog+'/bank-reconcile',{method:'POST'});
    var badge=r.reconciled===true?'<span class="on">RECONCILED</span>':r.reconciled===false?'<span class="danger">DRIFT '+money2(r.driftMinor)+'</span>':'<span class="muted">PARTIAL</span>';
    out.innerHTML='<div class="row">'+badge+'<span class="muted">ledger '+money2(r.ledgerCashMinor)+' vs banks '+money2(r.bankTotalMinor)+' · '+r.accountsCovered+' covered, '+r.accountsUncovered+' manual</span></div><table style="margin-top:6px"><tr><th>Account</th><th>Bank</th><th>Source</th><th>Balance</th></tr>'+(r.banks||[]).map(function(b){return '<tr><td class="muted">'+h(String(b.accountId).slice(0,10))+'</td><td>'+h(b.bankId||'—')+'</td><td>'+h(b.source)+'</td><td>'+(b.balanceMinor==null?'—':money2(b.balanceMinor))+'</td></tr>';}).join('')+'</table>'+(r.note?'<p class="muted" style="font-size:12px">'+h(r.note)+'</p>':'');
  }catch(e){out.innerHTML='<span class="danger">'+h(e.message)+'</span>'}
}
async function loyRecon(id){try{await api('/api/v1/bank/loyalty-liabilities/'+id+'/reconcile',{method:'POST'});bkLoad();}catch(e){alert(e.message)}}

async function vAudit(){
  set('<h2>Audit log</h2><div class="card"><div class="row"><input id="auf" placeholder="filter action (e.g. mint)" style="max-width:220px"><button class="ghost" data-act="auditGo">Search</button><button class="ghost" data-act="csvAudit">Export CSV</button></div></div><div id="al">Loading…</div>');
  auditGo();
}
async function auditGo(){
  const q=(document.getElementById('auf')&&document.getElementById('auf').value)||'';
  try{const r=await api('/api/v1/admin/audit?limit=200'+(q?'&action='+encodeURIComponent(q):''));window.__audit=r.logs;
    document.getElementById('al').innerHTML='<div class="card"><table><tr><th>When</th><th>Actor</th><th>Action</th><th>Subject</th><th>Reason</th></tr>'
      +r.logs.map(l=>'<tr><td class="muted">'+h(l.createdAt.slice(0,19).replace("T"," "))+'</td><td>'+h(l.actor)+'</td><td><code>'+h(l.action)+'</code></td><td>'+h(l.subjectType)+(l.subjectId?(' '+h(String(l.subjectId).slice(0,8))):'')+'</td><td class="muted">'+h(l.reason||'')+'</td></tr>').join('')+'</table></div>';
  }catch(e){document.getElementById('al').innerHTML='<div class="danger">'+h(e.message)+'</div>'}
}
function csvAudit(){const a=window.__audit||[];csv([['when','actor','action','subjectType','subjectId','reason']].concat(a.map(l=>[l.createdAt,l.actor,l.action,l.subjectType,l.subjectId,l.reason])),'audit-log.csv')}

async function vCompliance(){
  const picker=await progPicker();
  set('<h2>Compliance</h2>'+picker+'<div id="cm">Loading…</div>');
  try{
    const [ctl,att]=await Promise.all([api('/api/v1/admin/controls'),api('/api/v1/admin/attestations')]);
    const hold=(ctl.controls||[]).find(c=>c.key==='compliance.hold.program.'+S.prog);
    const on=hold&&hold.value;
    document.getElementById('cm').innerHTML=
      '<div class="card"><h3>Compliance hold</h3><p class="muted">Freezing halts minting for this program (guard blocks with COMPLIANCE_HOLD).</p><div class="row"><span>Program hold</span><div class="switch '+(on?'active':'')+'" data-act="toggleHold" data-id="'+(on?'off':'on')+'"><div class="knob"></div></div>'+(on?'<span class="danger">ON HOLD</span>':'<span class="on">clear</span>')+'</div></div>'
      +'<div class="card"><h3>Attestations</h3><div class="row"><button class="btn" data-act="newAtt">New attestation</button></div><table style="margin-top:8px"><tr><th>Period</th><th>Scope</th><th>Auditor</th><th>Status</th><th>Action</th></tr>'
      +att.attestations.map(a=>'<tr><td>'+h(a.period)+'</td><td>'+h(a.scope)+'</td><td>'+h(a.auditor)+'</td><td>'+h(a.status)+'</td><td>'+(a.status==='DRAFT'?'<button class="ghost" data-act="attStep" data-id="'+a.id+'|submit">Submit</button>':a.status==='UNDER_REVIEW'?'<button class="ghost" data-act="attStep" data-id="'+a.id+'|approve">Approve</button>':a.status==='APPROVED'?'<button class="btn" data-act="attStep" data-id="'+a.id+'|publish">Publish</button>':'<span class="muted">—</span>')+'</td></tr>').join('')+'</table></div>';
  }catch(e){document.getElementById('cm').innerHTML='<div class="danger">'+h(e.message)+'</div>'}
}
async function toggleHold(v){const on=v==='on';const reason=prompt((on?'Reason to PLACE':'Reason to LIFT')+' compliance hold:');if(!reason)return;try{await api('/api/v1/admin/controls/compliance.hold.program.'+S.prog,{method:'PUT',body:JSON.stringify({value:on,reason:reason,actor:actor()})});vCompliance();}catch(e){alert(e.message)}}
async function newAtt(){const period=prompt('Attestation period (e.g. 2026-Q3):');if(!period)return;const auditor=prompt('Auditor name:')||'Internal Audit';try{await api('/api/v1/bank/attestations',{method:'POST',body:JSON.stringify({period:period,scope:'RESERVE',auditor:auditor,actor:actor()})});vCompliance();}catch(e){alert(e.message)}}
async function attStep(v){const parts=v.split('|');try{await api('/api/v1/bank/attestations/'+parts[0]+'/'+parts[1],{method:'POST',body:JSON.stringify({actor:actor()})});vCompliance();}catch(e){alert(e.message)}}

async function vWebhooks(){
  set('<h2>Signed-event webhooks</h2><div class="card"><div class="row"><span class="muted">Status</span><select id="whStatus" data-act="whFilter"><option value="">all</option><option value="pending">pending</option><option value="dead">dead-lettered</option><option value="delivered">delivered</option></select><button class="btn" data-act="replayDead">Replay all dead-lettered</button></div><p class="muted" style="margin-top:6px">Signed events the trustee sends to PayChain / PayKH at their registered webhook URL. <b>PENDING</b> = awaiting delivery/retry, <b>DELIVERED</b> = acknowledged, <b>DEAD</b> = failed after all retries. Use <b>Log</b> to see each delivery attempt, <b>Replay</b> to re-send — e.g. after a client’s receiver comes online.</p></div><div id="wh">Loading…</div>');
  whLoad();
}
async function whLoad(){
  var st=(document.getElementById('whStatus')&&document.getElementById('whStatus').value)||'';
  try{var r=await api('/api/v1/admin/webhooks'+(st?('?status='+st):''));
    document.getElementById('wh').innerHTML='<div class="card"><table><tr><th>Event</th><th>Target</th><th>Status</th><th>Attempts</th><th>When</th><th></th></tr>'
      +r.events.map(e=>'<tr><td><code>'+h(e.eventType)+'</code></td><td>'+h(e.targetPlatform)+'</td><td>'+(e.status==='DELIVERED'?'<span class="on">DELIVERED</span>':e.status==='DEAD_LETTERED'?'<span class="danger">DEAD</span>':'<span class="muted">PENDING</span>')+'</td><td>'+e.attempts+'</td><td class="muted">'+h(e.createdAt.slice(0,19).replace("T"," "))+'</td><td><button class="ghost" data-act="whLog" data-id="'+e.id+'">Log</button> '+(e.status!=='DELIVERED'?'<button class="ghost" data-act="replayWh" data-id="'+e.id+'">Replay</button>':'')+'</td></tr><tr id="log_'+e.id+'" class="hide"><td colspan="6"><div id="logbox_'+e.id+'" class="muted" style="font-size:13px"></div></td></tr>').join('')+'</table></div>';
  }catch(e){document.getElementById('wh').innerHTML='<div class="danger">'+h(e.message)+'</div>'}
}
async function whLog(id){
  var row=document.getElementById('log_'+id);if(!row)return;
  if(!row.classList.contains('hide')){row.classList.add('hide');return}
  row.classList.remove('hide');var box=document.getElementById('logbox_'+id);box.textContent='Loading…';
  try{var r=await api('/api/v1/admin/webhooks/'+id+'/deliveries');
    box.innerHTML=r.deliveries.length?('<table><tr><th>#</th><th>When</th><th>HTTP</th><th>Result</th><th>Error</th></tr>'+r.deliveries.map(d=>'<tr><td>'+d.attempt+'</td><td>'+h(d.at.slice(0,19).replace("T"," "))+'</td><td>'+(d.statusCode==null?'—':d.statusCode)+'</td><td>'+(d.ok?'<span class="on">ok</span>':'<span class="danger">fail</span>')+'</td><td>'+h(d.error||'')+'</td></tr>').join('')+'</table>'):'<span class="muted">No delivery attempts recorded yet.</span>';
  }catch(e){box.innerHTML='<span class="danger">'+h(e.message)+'</span>'}
}
async function replayWh(id){try{await api('/api/v1/admin/webhooks/'+id+'/replay',{method:'POST',body:JSON.stringify({actor:actor()})});whLoad();}catch(e){alert(e.message)}}
async function replayDead(){if(!confirm('Re-queue ALL dead-lettered events for delivery?'))return;try{var r=await api('/api/v1/admin/webhooks/replay-dead-lettered',{method:'POST',body:JSON.stringify({actor:actor()})});alert('Re-queued '+r.requeued+' events.');whLoad();}catch(e){alert(e.message)}}

function ihBadge(st){var m={CONFIGURED:['🟢','var(--ok)','configured'],ACCEPTING:['🟢','var(--ok)','accepting'],DEPLOYED_UNCONFIGURED:['🟡','var(--warn)','deployed · not configured'],MISSING:['🔴','var(--bad)','not implemented'],UNREACHABLE:['🔴','var(--bad)','unreachable'],NO_URL:['⚪','var(--mut)','no webhook URL']};return m[st]||['⚪','var(--mut)',st];}
async function ihLoad(){
  var box=document.getElementById('ih');if(!box)return;
  try{var r=await api('/api/v1/admin/integration-health');
    var anyGreen=r.clients.some(c=>c.state==='CONFIGURED'||c.state==='ACCEPTING');
    box.innerHTML='<div class="row" style="justify-content:space-between"><h3 style="margin:0">Outbound integration health</h3><span class="muted">auto-refresh · '+h(r.checkedAt.slice(11,19))+'Z</span></div>'
      +'<table style="margin-top:8px"><tr><th>Client</th><th>Receiver</th><th>Status</th><th>HTTP</th></tr>'
      +r.clients.map(function(c){var b=ihBadge(c.state);return '<tr><td><b>'+h(c.platform)+'</b></td><td class="muted" style="font-size:12px">'+h(c.webhookUrl||'')+'</td><td style="color:'+b[1]+'">'+b[0]+' '+b[2]+'<div class="muted" style="font-size:12px">'+h(c.detail)+'</div></td><td>'+(c.httpStatus==null?'—':c.httpStatus)+'</td></tr>';}).join('')
      +'</table>'
      +'<div class="row" style="margin-top:10px"><span class="muted">Outbox:</span> <span>delivered '+r.outbox.delivered+'</span> · <span>pending '+r.outbox.pending+'</span> · <span'+(r.outbox.deadLettered?' class="danger"':'')+'>dead-lettered '+r.outbox.deadLettered+'</span>'
      +(r.outbox.deadLettered&&anyGreen?' <button class="btn" data-act="replayDead">Replay dead-lettered</button>':'')+'</div>';
  }catch(e){box.innerHTML='<span class="danger">integration health: '+h(e.message)+'</span>'}
}
function ihStart(){ihLoad();if(window.__ihTimer)clearInterval(window.__ihTimer);window.__ihTimer=setInterval(function(){if(S.tab==='dashboard'){ihLoad()}else{clearInterval(window.__ihTimer);window.__ihTimer=null}},30000);}

// delegated click handler for all data-act controls (avoids inline quote escaping)
document.addEventListener('click',function(ev){
  var el=ev.target.closest&&ev.target.closest('[data-act]');if(!el)return;
  var a=el.getAttribute('data-act'),id=el.getAttribute('data-id');
  var map={reviewMint:reviewMint,approveMint:approveMint,rejectMint:rejectMint,approveRedemption:approveRedemption,submitPayout:submitPayout,confirmPayout:confirmPayout,matchDeposit:matchDeposit,clearDeposit:clearDeposit,approveSettlement:approveSettlement,confirmSettlement:confirmSettlement,genPor:genPor,csvTb:csvTb,reconReserve:reconReserve,auditGo:auditGo,csvAudit:csvAudit,toggleHold:toggleHold,newAtt:newAtt,attStep:attStep,editRoles:editRoles,createOperator:createOperator,resetUserPw:resetUserPw,toggleUser:toggleUser,replayWh:replayWh,replayDead:replayDead,whLog:whLog,bkRegister:bkRegister,bkSaveAcc:bkSaveAcc,adjAdd:adjAdd,adjLift:adjLift,bkReconcile:bkReconcile,loyRecon:loyRecon};
  if(a==='pickProg'){S.prog=el.value;go(S.tab);return}
  if(a==='whFilter'){whLoad();return}
  if(map[a]){map[a](id);}
});

(function init(){if(new URLSearchParams(location.search).get('reset_token')){show('reset');return}const s=sessionStorage.getItem('tc');if(s){try{const o=JSON.parse(s);var exp=o.token?tokenExp(o.token):0;if(!o.token||(exp&&exp<=Date.now())){sessionStorage.removeItem('tc');show('login');return}S.token=o.token;S.email=o.email;S.userId=o.userId;show('app');document.getElementById('who').textContent=S.email;renderNav();scheduleExpiry();go('dashboard');return}catch{}}show('login')})();
</script></body></html>`;
