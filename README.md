# DonorHub – Verified Blood Donor Finder

Node.js + SQLite wali full-stack website. **Koi npm package install nahi karna** (zero dependencies), sirf Node 22.13 ya naya chahiye.

## Kya kya hai (v2)
- **Landing sections:** live stats (database se), "kaise kaam karta hai", WhatsApp groups se comparison, FAQ, partner call-to-action
- **Compatible matching:** O- sab ko de sakta hai, AB+ sab se le sakta hai; exact match pehle dikhta hai
- **WhatsApp share + request page:** har request ka apna link (`/r/ID`), ek tap mein share
- **Request status:** requester "Mark as fulfilled" kar sakta hai; "fulfilled" ginti landing par dikhti hai
- **Can I donate? quiz:** 6 sawal, aakhri faisla blood bank doctor ka
- **Privacy aur Terms pages** (`/privacy`, `/terms`) – template hain, asal launch se pehle review karwayein
- **Donor registration:** phone OTP verification, consent, 90 din ka donation gap (eligibility)
- **Donor search:** blood group + area; donor ka phone number kabhi public nahi hota
- **Contact request:** donor ko SMS jata hai, call karna ya na karna donor ka faisla
- **Emergency request:** same blood group ke eligible donors ko alert
- **Blood bank stock:** public table + admin page (`/admin`) se update
- **Urdu / English**, mobile + dark mode, rate limiting, input validation, security headers

## Apne computer par chalana
```
cd donorhub
ADMIN_TOKEN=koi-lamba-secret SEED_DEMO=1 OTP_DEMO=1 npm start
```
Phir browser mein `http://localhost:3000` kholein. Admin page: `http://localhost:3000/admin`.
(Windows PowerShell: `$env:ADMIN_TOKEN="secret"; $env:SEED_DEMO="1"; $env:OTP_DEMO="1"; npm start`)

## Live karna (Render.com – free)
1. Is folder ko GitHub repository mein upload karein.
2. Render.com par **New → Web Service** → apni repo chunein.
3. Runtime **Node**, Build Command **khali**, Start Command **`npm start`**.
4. Environment variables: `ADMIN_TOKEN` (lamba random secret), `NODE_VERSION=22`, aur demo ke liye `SEED_DEMO=1`.
5. Deploy ke baad Render ka link (`https://...onrender.com`) teacher ko dein.

Railway.app par bhi yehi steps chalte hain.

## Email notifications (Gmail)
1. Google Account → Security → **2-Step Verification** on karein.
2. Wahin "App passwords" mein ek password banayein (16 harf).
3. Hosting dashboard (ya local terminal) mein ye variables set karein: `SMTP_USER` (aap ka Gmail), `SMTP_PASS` (wo 16 harf wala App Password), `ADMIN_EMAIL` (jahan alerts chahiye).
4. Ab har **partner enquiry** aur har **blood request** par aap ko email aati hai, aur partner ko shukriya ki confirmation email jati hai.
Local par Command Prompt mein: `set SMTP_USER=...`, `set SMTP_PASS=...`, `set ADMIN_EMAIL=...` phir `npm start`.

## Asal public launch se pehle (zaroori checklist)
- [ ] **Asal SMS OTP:** `OTP_DEMO=1` sirf demo ke liye hai (code screen par dikhta hai, yani verification ka koi faida nahi). Public site par ye **band** rakhein aur SMS provider lagayein (`SMS_PROVIDER` ke variables). Bina provider ke OTP bhejna band ho jata hai.
- [ ] **Permanent database:** Render free par data ud jata hai. Paid disk / Railway Volume lagayein, aur `DB_PATH` us disk ke path par set karein.
- [ ] **Apna domain + HTTPS:** hosting dashboard mein custom domain jodein (HTTPS khud lag jata hai).
- [ ] **Legal review:** Privacy aur Terms kisi qanooni mashwere se check karwayein (health + phone data hai).
- [ ] **Medical partner:** kam az kam ek blood bank / doctor ke saath rabta, taake eligibility aur safety ka rehnuma sahi rahe.
- [ ] **Moderation:** `/admin` par donors aur requests delete ki ja sakti hain (jhooti request ya data hatane ki guzarish par).
- [ ] **Backup:** database file ka regular backup lein.

## Zaroori baatein
- **Data persistence:** Render free plan par disk reset ho jati hai (redeploy / restart par donors ka data ud sakta hai). Teacher demo ke liye `SEED_DEMO=1` kaafi hai. Permanent data chahiye to Railway ka Volume ya Render ka paid Disk lagayein aur `DB_PATH=/data/donorhub.db` set karein.
- **OTP / SMS:** jab tak SMS provider set nahi, OTP code screen par "Demo mode" mein dikhta hai. Asal SMS ke liye `.env.example` dekhein (Twilio ya koi local Pakistani SMS gateway `sendSms()` mein lag sakta hai).
- **Asal use se pehle:** privacy policy, Pakistan ke data aur health rules, aur blood banks ke saath partnership check karna zaroori hai. Ye student project hai, medical service nahi.

## Apni details badalna
- **Partner form:** "Become a partner" ab asal form hai; enquiries database mein save hoti hain aur `/admin` page par "Partner enquiries" mein dikhti hain. Email ki zaroorat nahi.
- Landing ke stats sirf asal database se aate hain; koi jhoota number nahi.

## Files
- `server.js` – poora backend (API, database, OTP, admin, security)
- `public/index.html`, `app.js`, `style.css` – website; `request.html/js` – shareable request page; `privacy.html`, `terms.html`
- `public/admin.html`, `admin.js` – blood bank admin panel
- `.env.example` – environment variables ki list

## Teacher ko batane ke liye (Tech stack)
Frontend: HTML/CSS/JavaScript. Backend: Node.js (built-in HTTP server). Database: SQLite. Hosting: Render. Security: OTP verification, rate limiting, input validation, donor numbers hamesha private.
