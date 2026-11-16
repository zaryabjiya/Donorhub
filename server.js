'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {sendMail}=require('./mail');
const ADMIN_EMAIL=process.env.ADMIN_EMAIL||process.env.SMTP_USER||'';
const notify=(to,subject,text)=>{if(to)sendMail({to,subject,text}).catch(()=>{})};
const PORT=+process.env.PORT||3000,ADMIN=process.env.ADMIN_TOKEN||'',PUB=path.join(__dirname,'public');
const DB_PATH=process.env.DB_PATH||path.join(__dirname,'data','donorhub.db');
const GROUPS=['A+','A-','B+','B-','O+','O-','AB+','AB-'];
const CAN={'A+':['A+','A-','O+','O-'],'A-':['A-','O-'],'B+':['B+','B-','O+','O-'],'B-':['B-','O-'],'O+':['O+','O-'],'O-':['O-'],'AB+':GROUPS,'AB-':['AB-','A-','B-','O-']};
fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
const db=new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS donors(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT UNIQUE NOT NULL,grp TEXT NOT NULL,area TEXT NOT NULL,last_donation TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS otps(phone TEXT PRIMARY KEY,hash TEXT NOT NULL,expires INTEGER NOT NULL,tries INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY,patient TEXT,grp TEXT,units INTEGER,urgency TEXT,hospital TEXT,phone TEXT,notified INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS contacts(id INTEGER PRIMARY KEY,donor_id INTEGER,name TEXT,phone TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS partner_leads(id INTEGER PRIMARY KEY,org TEXT,name TEXT,phone TEXT,email TEXT,note TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS banks(id INTEGER PRIMARY KEY,name TEXT NOT NULL,area TEXT NOT NULL,stock TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
{const cols=db.prepare('PRAGMA table_info(requests)').all().map(c=>c.name);
 if(!cols.includes('key'))db.exec('ALTER TABLE requests ADD COLUMN key TEXT');
 if(!cols.includes('status'))db.exec("ALTER TABLE requests ADD COLUMN status TEXT DEFAULT 'open'");}
if(!db.prepare('SELECT COUNT(*) c FROM banks').get().c){
 const ins=db.prepare('INSERT INTO banks(name,area,stock) VALUES(?,?,?)');
 [['Sample Blood Bank – Gulshan','Gulshan-e-Iqbal',[12,3,18,2,25,4,6,1]],['Sample Blood Bank – Clifton','Clifton',[20,6,9,1,14,2,3,0]],['Sample Blood Bank – Saddar','Saddar',[4,1,7,0,11,3,2,1]]].forEach(b=>ins.run(b[0],b[1],JSON.stringify(b[2])));}
if(process.env.SEED_DEMO==='1'&&!db.prepare('SELECT COUNT(*) c FROM donors').get().c){
 const ins=db.prepare('INSERT INTO donors(name,phone,grp,area,last_donation) VALUES(?,?,?,?,?)'),ago=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10);
 [['Hamza Raza','O+','DHA',140],['Sana Khan','A+','Gulshan-e-Iqbal',95],['Bilal Ahmed','B+','Clifton',30],['Mariam Shah','O-','North Nazimabad',200],['Usman Tariq','AB+','Saddar',110],['Zainab Farooq','A-','Korangi',60],['Hira Naz','O+','Gulshan-e-Iqbal',75],['Danish Qureshi','A+','DHA',130]].forEach((d,i)=>ins.run(d[0],'+92300000000'+i,d[1],d[2],ago(d[3])));}

const days=d=>d?Math.max(0,Math.floor((Date.now()-Date.parse(d))/864e5)):999;
const pub=r=>{const p=r.name.trim().split(/\s+/);return{id:r.id,n:p[0]+(p[1]?' '+p[1][0]+'.':''),g:r.grp,a:r.area,d:days(r.last_donation)}};
const normPhone=p=>{p=String(p||'').replace(/[\s-]/g,'');if(/^03\d{9}$/.test(p))return'+92'+p.slice(1);if(/^\+?923\d{9}$/.test(p))return'+'+p.replace('+','');return null};
const clean=(s,n)=>String(s||'').replace(/[<>]/g,'').trim().slice(0,n);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const safeEq=(a,b)=>{const x=Buffer.from(hash(a)),y=Buffer.from(hash(b));return crypto.timingSafeEqual(x,y)};
const hits=new Map();
function limited(k,max,ms){const n=Date.now(),h=hits.get(k);if(!h||h.r<n){hits.set(k,{c:1,r:n+ms});return false}return ++h.c>max}
setInterval(()=>{const n=Date.now();for(const[k,v]of hits)if(v.r<n)hits.delete(k)},6e4).unref();

async function sendSms(to,text){
 if(to.startsWith('+92300000'))return false;
 if(process.env.SMS_PROVIDER==='twilio'){const{TWILIO_SID:s,TWILIO_TOKEN:t,TWILIO_FROM:f}=process.env;
  try{const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${s}/Messages.json`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(s+':'+t).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:to,From:f,Body:text})});return r.ok}catch{return false}}
 console.log('[SMS not configured]',to,text);return false}

const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
const fail=(res,code,msg)=>send(res,code,{error:msg});
const body=req=>new Promise((ok,no)=>{let b='';req.on('data',c=>{b+=c;if(b.length>10000){no(Object.assign(new Error('Too large'),{code:413}));req.destroy()}});req.on('end',()=>{try{ok(JSON.parse(b||'{}'))}catch{no(Object.assign(new Error('Invalid JSON'),{code:400}))}})});
const isAdmin=req=>ADMIN&&safeEq(String(req.headers['x-admin-token']||''),ADMIN);
const stockOf=r=>({id:r.id,name:r.name,area:r.area,stock:JSON.parse(r.stock),hours:Math.max(0,Math.floor((Date.now()-Date.parse(r.updated_at+'Z'))/36e5))});

async function api(req,res,u,ip){
 const route=req.method+' '+u.pathname;
 if(route==='GET /api/health')return send(res,200,{ok:true});
 if(route==='GET /api/donors'){
  const g=u.searchParams.get('group'),a=u.searchParams.get('area');
  let rows=db.prepare('SELECT * FROM donors ORDER BY id DESC LIMIT 300').all();
  if(g)rows=rows.filter(r=>r.grp===g);if(a)rows=rows.filter(r=>r.area===a);
  return send(res,200,{donors:rows.map(pub)})}
 if(route==='GET /api/banks')return send(res,200,{banks:db.prepare('SELECT * FROM banks ORDER BY id').all().map(stockOf)});
 if(route==='POST /api/otp/send'){
  const b=await body(req),ph=normPhone(b.phone);if(!ph)return fail(res,400,'Enter a valid Pakistani mobile number, e.g. 0300 1234567.');
  if(limited('o'+ph,3,6e5)||limited('oi'+ip,10,6e5))return fail(res,429,'Too many codes requested. Try again in 10 minutes.');
  const code=String(crypto.randomInt(1000,10000));
  db.prepare('INSERT OR REPLACE INTO otps(phone,hash,expires,tries) VALUES(?,?,?,0)').run(ph,hash(ph+code),Date.now()+3e5);
  if(process.env.SMS_PROVIDER){if(!await sendSms(ph,`DonorHub verification code: ${code}. It expires in 5 minutes.`))return fail(res,502,'Could not send the SMS. Please try again.');return send(res,200,{ok:true})}
  if(process.env.OTP_DEMO==='1')return send(res,200,{ok:true,demoCode:code});
  return fail(res,503,'Phone verification is not available right now. Please try again later.')}
 if(route==='POST /api/donors'){
  const b=await body(req),ph=normPhone(b.phone),name=clean(b.name,60),area=clean(b.area,60);
  if(!ph||name.length<2||!GROUPS.includes(b.group)||!area)return fail(res,400,'Please fill in all fields correctly.');
  if(b.consent!==true)return fail(res,400,'Consent is required.');
  if(b.lastDonation&&(isNaN(Date.parse(b.lastDonation))||Date.parse(b.lastDonation)>Date.now()))return fail(res,400,'Last donation date is not valid.');
  const o=db.prepare('SELECT * FROM otps WHERE phone=?').get(ph);
  if(!o||o.expires<Date.now()||o.tries>=5)return fail(res,400,'Code expired. Request a new code.');
  if(!safeEq(o.hash,hash(ph+String(b.otp||'')))){db.prepare('UPDATE otps SET tries=tries+1 WHERE phone=?').run(ph);return fail(res,400,'That code is not correct. Check the 4 digits and try again.')}
  db.prepare('DELETE FROM otps WHERE phone=?').run(ph);
  try{const r=db.prepare('INSERT INTO donors(name,phone,grp,area,last_donation) VALUES(?,?,?,?,?)').run(name,ph,b.group,area,b.lastDonation||null);
   return send(res,201,{donor:pub(db.prepare('SELECT * FROM donors WHERE id=?').get(r.lastInsertRowid))})}
  catch(e){if(/UNIQUE/.test(e.message))return fail(res,409,'This number is already registered.');throw e}}
 if(route==='POST /api/contact'){
  if(limited('c'+ip,5,36e5))return fail(res,429,'Too many requests. Try again later.');
  const b=await body(req),ph=normPhone(b.phone),name=clean(b.name,60),d=db.prepare('SELECT * FROM donors WHERE id=?').get(+b.donorId);
  if(!d||!ph||name.length<2)return fail(res,400,'Please enter your name and a valid mobile number.');
  db.prepare('INSERT INTO contacts(donor_id,name,phone) VALUES(?,?,?)').run(d.id,name,ph);
  await sendSms(d.phone,`DonorHub: ${name} needs ${d.grp} blood and asked to contact you. If you can help, call ${ph}. You can ignore this message.`);
  return send(res,201,{ok:true})}
 if(route==='POST /api/requests'){
  if(limited('r'+ip,5,36e5))return fail(res,429,'Too many requests. Try again later.');
  const b=await body(req),ph=normPhone(b.phone),units=+b.units;
  const patient=clean(b.patient,60),hospital=clean(b.hospital,100);
  if(!ph||patient.length<2||hospital.length<2||!GROUPS.includes(b.group)||!(units>=1&&units<=10))return fail(res,400,'Please fill in all fields correctly.');
  const urg=['6h','today','week'].includes(b.urgency)?b.urgency:'today';
  const ok=CAN[b.group],m=db.prepare('SELECT * FROM donors ORDER BY id DESC').all().filter(r=>ok.includes(r.grp)&&days(r.last_donation)>=90);
  const key=crypto.randomBytes(8).toString('hex'),id=Number(db.prepare('INSERT INTO requests(patient,grp,units,urgency,hospital,phone,notified,key) VALUES(?,?,?,?,?,?,?,?)').run(patient,b.group,units,urg,hospital,ph,m.length,key).lastInsertRowid);
  const link=(req.headers['x-forwarded-proto']||'http')+'://'+req.headers.host+'/r/'+id;
  await Promise.all(m.slice(0,25).map(r=>sendSms(r.phone,`DonorHub URGENT: ${units} unit(s) of ${b.group} needed at ${hospital}. If you can donate: ${link}`)));
  notify(ADMIN_EMAIL,`New blood request: ${units} unit(s) ${b.group} at ${hospital}`,`Patient: ${patient}\nGroup: ${b.group}\nUnits: ${units}\nUrgency: ${urg}\nHospital: ${hospital}\nRequester phone: ${ph}\nEligible compatible donors alerted: ${m.length}\nPage: ${link}`);
  return send(res,201,{matched:m.length,id,key})}
 if(route==='GET /api/stats'){const c=t=>db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  return send(res,200,{donors:c('donors'),requests:c('requests'),fulfilled:db.prepare("SELECT COUNT(*) c FROM requests WHERE status='fulfilled'").get().c})}
 const rq=u.pathname.match(/^\/api\/requests\/(\d+)(\/status)?$/);
 if(rq){const r=db.prepare('SELECT * FROM requests WHERE id=?').get(+rq[1]);if(!r)return fail(res,404,'Request not found.');
  if(req.method==='GET'&&!rq[2]){const p=r.patient.trim().split(/\s+/);return send(res,200,{request:{id:r.id,g:r.grp,units:r.units,urgency:r.urgency,hospital:r.hospital,status:r.status||'open',patient:p[0]+(p[1]?' '+p[1][0]+'.':''),phone:r.phone,created:r.created_at}})}
  if(req.method==='POST'&&rq[2]){const b=await body(req);if(!r.key||!safeEq(String(b.key||''),r.key))return fail(res,403,'Only the person who made this request can change its status.');
   const st=b.status==='open'?'open':'fulfilled';db.prepare('UPDATE requests SET status=? WHERE id=?').run(st,r.id);return send(res,200,{ok:true,status:st})}}
 if(route==='POST /api/partners'){
  if(limited('p'+ip,3,36e5))return fail(res,429,'Too many requests. Try again later.');
  const b=await body(req),org=clean(b.org,100),name=clean(b.name,60),ph=normPhone(b.phone),em=clean(b.email,100);
  if(org.length<2||name.length<2||!ph)return fail(res,400,'Please enter the organisation, contact person and a valid mobile number.');
  if(em&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return fail(res,400,'Email address is not valid.');
  db.prepare('INSERT INTO partner_leads(org,name,phone,email,note) VALUES(?,?,?,?,?)').run(org,name,ph,em,clean(b.note,500));
  notify(ADMIN_EMAIL,`New DonorHub partner enquiry: ${org}`,`Organisation: ${org}\nContact: ${name}\nPhone: ${ph}\nEmail: ${em||'-'}\nMessage: ${clean(b.note,500)||'-'}`);
  if(em)notify(em,'Thank you for contacting DonorHub',`Dear ${name},\n\nThank you for your interest in partnering with DonorHub. We have received the enquiry from ${org} and will contact you soon.\n\nDonorHub team`);
  return send(res,201,{ok:true})}
 if(u.pathname.startsWith('/api/admin/')){
  if(!isAdmin(req)){if(limited('af'+ip,10,6e5))return fail(res,429,'Too many attempts. Try again in 10 minutes.');return fail(res,401,'Admin token is missing or wrong.')}
  if(route==='GET /api/admin/summary'){const c=t=>db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
   return send(res,200,{donors:c('donors'),requests:c('requests'),contacts:c('contacts'),partners:db.prepare('SELECT * FROM partner_leads ORDER BY id DESC LIMIT 50').all(),donorList:db.prepare('SELECT id,name,phone,grp,area,last_donation,created_at FROM donors ORDER BY id DESC LIMIT 100').all(),recent:db.prepare('SELECT id,patient,grp,units,urgency,hospital,phone,notified,status,created_at FROM requests ORDER BY id DESC LIMIT 30').all(),banks:db.prepare('SELECT * FROM banks ORDER BY id').all().map(stockOf)})}
  const dm=u.pathname.match(/^\/api\/admin\/(donors|requests)\/(\d+)$/);
  if(req.method==='DELETE'&&dm){db.prepare(`DELETE FROM ${dm[1]} WHERE id=?`).run(+dm[2]);return send(res,200,{ok:true})}
  const m=u.pathname.match(/^\/api\/admin\/banks\/(\d+)$/);
  if(req.method==='PUT'&&m){const b=await body(req);
   if(!Array.isArray(b.stock)||b.stock.length!==8||b.stock.some(n=>!Number.isInteger(n)||n<0||n>999))return fail(res,400,'Stock must be 8 whole numbers (0–999).');
   db.prepare("UPDATE banks SET stock=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(b.stock),+m[1]);return send(res,200,{ok:true})}
  if(route==='POST /api/admin/banks'){const b=await body(req),n=clean(b.name,80),a=clean(b.area,60);
   if(!n||!a)return fail(res,400,'Name and area are required.');
   db.prepare('INSERT INTO banks(name,area,stock) VALUES(?,?,?)').run(n,a,JSON.stringify([0,0,0,0,0,0,0,0]));return send(res,201,{ok:true})}}
 return fail(res,404,'Not found.')}

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'};
function serve(res,p){
 p=({'/':'/index.html','/admin':'/admin.html','/privacy':'/privacy.html','/terms':'/terms.html'})[p]||p;if(/^\/r\/\d+$/.test(p))p='/request.html';
 const f=path.normalize(path.join(PUB,p));
 if(!f.startsWith(PUB+path.sep)||path.basename(f).startsWith('.'))return fail(res,404,'Not found.');
 fs.readFile(f,(e,d)=>{if(e)return fail(res,404,'Not found.');
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(d)})}

http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'none'");
 try{const u=new URL(req.url,'http://x'),ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
  if(u.pathname.startsWith('/api/')){if(limited('g'+ip,120,6e4))return fail(res,429,'Too many requests. Please wait a minute.');return await api(req,res,u,ip)}
  return serve(res,u.pathname)}
 catch(e){if(e.code===400||e.code===413)return fail(res,e.code,e.message);console.error(e);fail(res,500,'Server error. Please try again.')}
}).listen(PORT,()=>console.log('DonorHub running on port '+PORT+(ADMIN?'':' (set ADMIN_TOKEN to enable /admin)')));
