'use strict';
// Minimal SMTP client (TLS, port 465, AUTH LOGIN) – works with Gmail App Passwords. No dependencies.
const tls=require('node:tls');
function sendMail({to,subject,text}){
 const {SMTP_HOST='smtp.gmail.com',SMTP_PORT='465',SMTP_USER,SMTP_PASS,MAIL_FROM}=process.env;
 if(!SMTP_USER||!SMTP_PASS){console.log('[email not configured]',to,subject);return Promise.resolve(false)}
 const from=MAIL_FROM||SMTP_USER,b64=s=>Buffer.from(String(s)).toString('base64'),one=s=>String(s).replace(/[\r\n]+/g,' ');
 const msg=[`From: DonorHub <${one(from)}>`,`To: ${one(to)}`,`Subject: =?UTF-8?B?${b64(one(subject))}?=`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',b64(text).replace(/(.{76})/g,'$1\r\n')].join('\r\n');
 const cmds=[['EHLO donorhub',250],['AUTH LOGIN',334],[b64(SMTP_USER),334],[b64(SMTP_PASS),235],[`MAIL FROM:<${one(from)}>`,250],[`RCPT TO:<${one(to)}>`,250],['DATA',354],[msg+'\r\n.',250]];
 return new Promise(res=>{
  const sock=tls.connect({host:SMTP_HOST,port:+SMTP_PORT,servername:SMTP_HOST});
  let i=-1,buf='',done=false;
  const end=ok=>{if(done)return;done=true;try{sock.end('QUIT\r\n')}catch{}res(ok)};
  sock.setTimeout(15000,()=>end(false));sock.on('error',()=>end(false));
  sock.on('data',d=>{if(done)return;buf+=d;let m;
   while((m=buf.match(/^(\d{3})([ -])[^\r\n]*\r\n/))){buf=buf.slice(m[0].length);if(m[2]==='-')continue;
    const want=i<0?220:cmds[i][1];if(+m[1]!==want){console.error('[email] SMTP error',m[1]);return end(false)}
    i++;if(i===cmds.length)return end(true);sock.write(cmds[i][0]+'\r\n')}});
 });
}
module.exports={sendMail};
