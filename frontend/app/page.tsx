'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// ─── env ────────────────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '';

// ─── data ───────────────────────────────────────────────────────────────────
const PORTALS = [
  {
    idx: '01', href: '/university', role: 'University',
    title: 'University Portal',
    desc:  'Issue cryptographic credential commitments on-chain. Student data never leaves your institution\'s infrastructure.',
    stat:  'Private issuance',
    cls:   'p0',
  },
  {
    idx: '02', href: '/student', role: 'Student',
    title: 'Student Portal',
    desc:  'Generate a single-use ZK proof from your credential. Prove your degree to anyone — share nothing else.',
    stat:  'Selective disclosure',
    cls:   'p1',
  },
  {
    idx: '03', href: '/employer', role: 'Employer',
    title: 'Employer Portal',
    desc:  'Verify proof submissions in seconds. No names, transcripts, or personal records are ever exposed to you.',
    stat:  'Instant verification',
    cls:   'p2',
  },
  {
    idx: '04', href: '/admin', role: 'Admin',
    title: 'Admin Panel',
    desc:  'Manage issuer allowlists, revoke credentials, and audit all on-chain activity with full transparency.',
    stat:  'Role-gated controls',
    cls:   'p3',
  },
] as const;

const STATS = [
  { value: '0ms',  label: 'Data exposed on-chain',   sub: 'Zero personal data'      },
  { value: '~20s', label: 'Proof generation time',    sub: 'Local ZK computation'    },
  { value: '1×',   label: 'Nullifier enforcement',    sub: 'Anti-replay built-in'    },
];

const STEPS = [
  {
    n: '01', role: 'University', title: 'Issues a commitment',
    desc: 'Degree data is packed and committed on-chain as a hash. No personal information is stored on the blockchain — only a cryptographic fingerprint.',
  },
  {
    n: '02', role: 'Student', title: 'Generates a ZK proof',
    desc: 'Proof runs locally via the Midnight proof server. A one-time nullifier is burned on-chain to prevent the same proof being reused by anyone.',
  },
  {
    n: '03', role: 'Employer', title: 'Verifies the proof',
    desc: 'A transaction hash confirms the proof succeeded. No name, grade, or institution is ever revealed — only that the credential is valid.',
  },
];

const TILES = [
  { icon: '🔐', title: 'Fraud Prevention',     body: 'Cryptographic commitments replace fragile PDF trust. Proofs are mathematically unforgeable.' },
  { icon: '⚡', title: 'Fast Hiring Decisions', body: 'Employers verify proof transactions in seconds — no back-and-forth with registrar offices.' },
  { icon: '🛡', title: 'Data Minimisation',     body: 'No names, grades, or transcripts are exposed during checks. GDPR-aligned by design.' },
];

// ─── intersection-triggered stat ────────────────────────────────────────────
function StatTile({ value, label, sub }: { value: string; label: string; sub: string }) {
  const [vis, setVis] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.4 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`stat ${vis ? 'stat-vis' : ''}`}>
      <span className="sv">{value}</span>
      <span className="sl">{label}</span>
      <span className="ss">{sub}</span>
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <style>{CSS}</style>

      <div className={`wrap ${mounted ? 'mounted' : ''}`}>

        {/* NAV */}
        <nav>
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden>
              <svg viewBox="0 0 16 16"><path d="M8 2L2 6v8h4v-4h4v4h4V6L8 2z"/></svg>
            </span>
            CredZK
          </Link>
          <div className="nav-r">
            <a href="#how"      className="nl">How it works</a>
            <a href="#portals"  className="nl">Portals</a>
            <a href="https://docs.midnight.network" className="nl" target="_blank" rel="noreferrer">Docs</a>
            <Link href="/university" className="ncta">Launch app</Link>
          </div>
        </nav>

        {/* HERO */}
        <header className="hero">
          <div className="pill-badge">
            <span className="live-dot" aria-hidden />
            Live on Midnight Preprod
          </div>

          <h1>
            Verify qualifications,<br />
            <em>not personal data</em>
          </h1>

          <p className="hero-sub">
            CredZK lets students prove their degrees to employers using zero-knowledge proofs —
            without ever sharing names, grades, or institution details.
          </p>

          <div className="tags">
            {['Private issuance','Selective disclosure','Nullifier anti-replay','Role-gated admin']
              .map(t => <span key={t} className="tag">{t}</span>)}
          </div>

          <div className="acts">
            <Link href="/student"    className="btn-p">Get started →</Link>
            <a    href="#how"        className="btn-g">See how it works</a>
          </div>

          <div className="cc">
            <div className="cc-h">
              <span className="cdot" aria-hidden />
              <span>Deployed contract</span>
              <span className="cnet">preprod</span>
            </div>
            {CONTRACT_ADDRESS
              ? <code className="caddr">{CONTRACT_ADDRESS}</code>
              : <span className="cmiss">Set <code>NEXT_PUBLIC_CONTRACT_ADDRESS</code> in <code>frontend/.env.local</code></span>
            }
          </div>
        </header>

        {/* STATS */}
        <section className="stats-row" aria-label="Key metrics">
          {STATS.map(s => <StatTile key={s.label} {...s} />)}
        </section>

        {/* HOW IT WORKS */}
        <section className="sec" id="how">
          <div className="sec-eyebrow">Protocol</div>
          <h2>How it works</h2>
          <div className="steps">
            {STEPS.map((step, i) => (
              <div key={step.n} className="step">
                <div className="step-track">
                  <div className="step-num">{step.n}</div>
                  {i < STEPS.length - 1 && <div className="step-line" aria-hidden />}
                </div>
                <div className="step-body">
                  <span className="step-role">{step.role}</span>
                  <div className="step-title">{step.title}</div>
                  <p className="step-desc">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* PORTALS */}
        <section className="sec" id="portals">
          <div className="sec-eyebrow">Access</div>
          <h2>Choose your portal</h2>
          <div className="portals-grid">
            {PORTALS.map((p, i) => (
              <Link
                key={p.href} href={p.href}
                className={`pcard ${p.cls}`}
                style={{ animationDelay: `${i * 0.07}s` }}
              >
                <div className="p-top">
                  <span className="p-idx">{p.idx}</span>
                  <span className={`p-role r${i}`}>{p.role}</span>
                </div>
                <div className="p-title">{p.title}</div>
                <p className="p-desc">{p.desc}</p>
                <div className="p-foot">
                  <span className="p-stat">{p.stat}</span>
                  <span className="p-arr" aria-hidden>→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* INFO TILES */}
        <div className="info-grid">
          {TILES.map(t => (
            <article key={t.title} className="itile">
              <div className="it-icon" aria-hidden>{t.icon}</div>
              <div className="it-title">{t.title}</div>
              <p className="it-body">{t.body}</p>
            </article>
          ))}
        </div>

        {/* FOOTER */}
        <footer>
          <div className="fb">
            <span className="brand-mark sm" aria-hidden>
              <svg viewBox="0 0 16 16"><path d="M8 2L2 6v8h4v-4h4v4h4V6L8 2z"/></svg>
            </span>
            CredZK
          </div>
          <p className="fc">Built on Midnight · Powered by zero-knowledge proofs</p>
          <a href="https://midnight.network"      className="fl" target="_blank" rel="noreferrer">Midnight</a>
          <a href="https://docs.midnight.network" className="fl" target="_blank" rel="noreferrer">Docs</a>
        </footer>

      </div>
    </>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}

:root{
  --cream:#FDFAF5; --cream2:#F6F1E8; --cream3:#EDE6D9;
  --ink:#12100E;   --ink2:#2E2B27;   --ink3:#6B6560;
  --teal:#0D6E56;  --teal2:#0F8569;  --teal-lt:#E8F5F1; --teal-bd:#B3DDD4;
  --blue:#0369A1;  --blue-lt:#E0F2FE; --blue-bd:#BAE6FD;
  --violet:#7C3AED; --violet-lt:#EDE9FE; --violet-bd:#DDD6FE;
  --amber:#C2680E;  --amber-lt:#FEF3E2; --amber-bd:#FCD34D;
  --border:#E0D9CE; --border2:#C8BFB0;
  --sh:0 1px 3px rgba(18,16,14,.06),0 4px 16px rgba(18,16,14,.06);
  --sh-md:0 2px 8px rgba(18,16,14,.08),0 8px 32px rgba(18,16,14,.08);
}

body{background:var(--cream);color:var(--ink);font-family:'Outfit',sans-serif;font-size:16px;line-height:1.6;overflow-x:hidden}

body::before{
  content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
  background-image:radial-gradient(circle,rgba(13,110,86,.11) 1px,transparent 1px);
  background-size:28px 28px;
  mask-image:radial-gradient(ellipse 100% 65% at 50% 0%,black 10%,transparent 80%);
  -webkit-mask-image:radial-gradient(ellipse 100% 65% at 50% 0%,black 10%,transparent 80%);
}
body::after{
  content:'';position:fixed;top:-100px;left:-180px;width:700px;height:640px;z-index:0;pointer-events:none;
  background:radial-gradient(ellipse at 40% 40%,rgba(13,110,86,.065) 0%,transparent 65%);
}

.wrap{
  position:relative;z-index:1;max-width:1080px;margin:0 auto;padding:0 24px 80px;
  opacity:0;transform:translateY(18px);transition:opacity .55s ease,transform .55s ease;
}
.wrap.mounted{opacity:1;transform:translateY(0)}

/* NAV */
nav{display:flex;align-items:center;justify-content:space-between;padding:20px 0;border-bottom:1px solid var(--border);margin-bottom:72px}
.brand{display:flex;align-items:center;gap:10px;font-family:'Outfit',sans-serif;font-weight:700;font-size:17px;color:var(--ink);text-decoration:none;letter-spacing:-.01em}
.brand-mark{width:30px;height:30px;border-radius:8px;background:var(--teal);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.brand-mark.sm{width:24px;height:24px;border-radius:6px}
.brand-mark svg{width:15px;height:15px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.brand-mark.sm svg{width:11px;height:11px}
.nav-r{display:flex;align-items:center;gap:4px}
.nl{color:var(--ink3);text-decoration:none;font-size:14px;font-weight:500;padding:7px 14px;border-radius:8px;transition:background .18s,color .18s}
.nl:hover{background:var(--cream2);color:var(--ink)}
.ncta{background:var(--teal);color:#fff;font-size:13px;font-weight:600;padding:8px 20px;border-radius:8px;text-decoration:none;box-shadow:0 2px 8px rgba(13,110,86,.25);margin-left:6px;transition:background .18s,transform .15s,box-shadow .18s}
.ncta:hover{background:var(--teal2);transform:translateY(-1px);box-shadow:0 4px 14px rgba(13,110,86,.3)}

/* HERO */
.hero{padding-bottom:72px}
.pill-badge{display:inline-flex;align-items:center;gap:7px;background:var(--teal-lt);border:1px solid var(--teal-bd);color:var(--teal);font-family:'JetBrains Mono',monospace;font-size:11px;padding:5px 13px;border-radius:99px;letter-spacing:.03em;margin-bottom:28px}
.live-dot{width:6px;height:6px;border-radius:50%;background:var(--teal);animation:live 2s ease-in-out infinite}
@keyframes live{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.75)}}

h1{font-family:'DM Serif Display',serif;font-size:clamp(40px,6.5vw,76px);line-height:1.06;letter-spacing:-.03em;color:var(--ink);margin-bottom:22px;max-width:760px}
h1 em{font-style:italic;color:var(--teal)}
.hero-sub{font-size:17px;line-height:1.72;color:var(--ink3);max-width:530px;margin-bottom:30px;font-weight:400}

.tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:36px}
.tag{font-family:'JetBrains Mono',monospace;font-size:11px;border:1px solid var(--border2);color:var(--ink3);padding:5px 13px;border-radius:6px;letter-spacing:.04em;background:var(--cream2);transition:border-color .2s,color .2s,background .2s;cursor:default}
.tag:hover{border-color:var(--teal);color:var(--teal);background:var(--teal-lt)}

.acts{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:44px}
.btn-p{background:var(--teal);color:#fff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none;box-shadow:0 2px 8px rgba(13,110,86,.28);transition:background .18s,transform .15s,box-shadow .18s}
.btn-p:hover{background:var(--teal2);transform:translateY(-2px);box-shadow:0 6px 20px rgba(13,110,86,.3)}
.btn-g{border:1.5px solid var(--border2);color:var(--ink);font-size:15px;font-weight:500;padding:13px 28px;border-radius:8px;text-decoration:none;transition:border-color .2s,background .2s,color .2s}
.btn-g:hover{border-color:var(--teal);background:var(--teal-lt);color:var(--teal)}

.cc{background:#fff;border:1px solid var(--border);border-radius:12px;padding:18px 22px;max-width:620px;box-shadow:var(--sh)}
.cc-h{display:flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink3);margin-bottom:10px}
.cdot{width:7px;height:7px;border-radius:50%;background:var(--teal)}
.cnet{margin-left:auto;font-size:10px;background:var(--teal-lt);color:var(--teal);padding:2px 9px;border-radius:4px;border:1px solid var(--teal-bd);letter-spacing:.04em}
.caddr{display:block;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--teal);word-break:break-all;line-height:1.6}
.cmiss{font-family:'JetBrains Mono',monospace;font-size:12px;color:#b45309;background:var(--amber-lt);padding:8px 12px;border-radius:6px;display:block;border:1px solid var(--amber-bd)}
.cmiss code{color:#92400e}

/* STATS */
.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:88px}
.stat{background:#fff;border:1px solid var(--border);border-radius:12px;padding:24px 20px;box-shadow:var(--sh);opacity:0;transform:translateY(12px);transition:opacity .5s ease,transform .5s ease}
.stat.stat-vis{opacity:1;transform:translateY(0)}
.sv{display:block;font-family:'DM Serif Display',serif;font-size:40px;color:var(--teal);margin-bottom:6px;line-height:1}
.sl{display:block;font-size:14px;font-weight:600;color:var(--ink);margin-bottom:3px}
.ss{display:block;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink3)}

/* SECTION */
.sec{margin-bottom:88px}
.sec-eyebrow{display:inline-flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--teal);letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px}
.sec-eyebrow::before{content:'';display:block;width:20px;height:1.5px;background:var(--teal);border-radius:1px}
h2{font-family:'DM Serif Display',serif;font-size:clamp(26px,4vw,40px);letter-spacing:-.025em;color:var(--ink);margin-bottom:38px;line-height:1.1}

/* STEPS */
.steps{display:flex;flex-direction:column}
.step{display:flex;gap:0}
.step-track{display:flex;flex-direction:column;align-items:center;width:52px;flex-shrink:0;padding-top:3px}
.step-num{width:36px;height:36px;border-radius:50%;background:#fff;border:1.5px solid var(--border2);display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ink3);font-weight:500;flex-shrink:0;transition:border-color .2s,color .2s,background .2s;box-shadow:var(--sh)}
.step:hover .step-num{border-color:var(--teal);color:var(--teal);background:var(--teal-lt)}
.step-line{width:1.5px;flex:1;min-height:48px;background:linear-gradient(to bottom,var(--border2),transparent);margin:8px 0}
.step-body{padding:4px 0 48px 22px;flex:1}
.step-role{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--teal);letter-spacing:.06em;text-transform:uppercase;display:block;margin-bottom:7px}
.step-title{font-family:'DM Serif Display',serif;font-size:22px;color:var(--ink);margin-bottom:9px;letter-spacing:-.015em}
.step-desc{font-size:15px;color:var(--ink3);line-height:1.68;max-width:520px}

/* PORTALS */
.portals-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.pcard{background:#fff;border:1px solid var(--border);border-radius:12px;padding:28px 26px;text-decoration:none;display:flex;flex-direction:column;box-shadow:var(--sh);position:relative;overflow:hidden;transition:border-color .22s,transform .2s,box-shadow .22s;animation:cin .5s cubic-bezier(.22,.68,0,1.2) both}
@keyframes cin{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.pcard:hover{transform:translateY(-4px);box-shadow:var(--sh-md)}
.pcard::before{content:'';position:absolute;top:0;left:24px;right:24px;height:2.5px;border-radius:0 0 3px 3px;opacity:0;transition:opacity .22s}
.pcard:hover::before{opacity:1}
.p0::before{background:var(--teal)}.p0:hover{border-color:var(--teal)}
.p1::before{background:var(--blue)}.p1:hover{border-color:var(--blue)}
.p2::before{background:var(--violet)}.p2:hover{border-color:var(--violet)}
.p3::before{background:var(--amber)}.p3:hover{border-color:var(--amber)}
.p-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
.p-idx{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink3);letter-spacing:.06em}
.p-role{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;padding:4px 11px;border-radius:6px}
.r0{background:var(--teal-lt);color:var(--teal);border:1px solid var(--teal-bd)}
.r1{background:var(--blue-lt);color:var(--blue);border:1px solid var(--blue-bd)}
.r2{background:var(--violet-lt);color:var(--violet);border:1px solid var(--violet-bd)}
.r3{background:var(--amber-lt);color:var(--amber);border:1px solid var(--amber-bd)}
.p-title{font-family:'DM Serif Display',serif;font-size:22px;color:var(--ink);margin-bottom:9px;letter-spacing:-.015em}
.p-desc{font-size:14px;color:var(--ink3);line-height:1.68;flex:1;margin-bottom:22px}
.p-foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding-top:14px}
.p-stat{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink3);letter-spacing:.04em}
.p-arr{width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--ink3);transition:border-color .2s,background .2s,color .2s,transform .2s}
.pcard:hover .p-arr{transform:translateX(3px)}
.p0:hover .p-arr{border-color:var(--teal);background:var(--teal-lt);color:var(--teal)}
.p1:hover .p-arr{border-color:var(--blue);background:var(--blue-lt);color:var(--blue)}
.p2:hover .p-arr{border-color:var(--violet);background:var(--violet-lt);color:var(--violet)}
.p3:hover .p-arr{border-color:var(--amber);background:var(--amber-lt);color:var(--amber)}

/* INFO TILES */
.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:-14px}
.itile{background:var(--cream2);border:1px solid var(--border);border-radius:12px;padding:22px 20px}
.it-icon{width:36px;height:36px;border-radius:9px;background:var(--cream3);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;margin-bottom:14px;font-size:17px}
.it-title{font-size:14px;font-weight:700;color:var(--ink);margin-bottom:6px;letter-spacing:-.01em}
.it-body{font-size:13px;color:var(--ink3);line-height:1.6}

/* FOOTER */
footer{border-top:1px solid var(--border);padding-top:40px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-top:80px}
.fb{display:flex;align-items:center;gap:9px;font-weight:700;font-size:15px;color:var(--ink)}
.fc{font-size:13px;color:var(--ink3);margin-right:auto}
.fl{font-size:13px;color:var(--ink3);text-decoration:none;transition:color .2s}
.fl:hover{color:var(--teal)}

/* RESPONSIVE */
@media(max-width:760px){
  .nav-r .nl{display:none}
  .stats-row{grid-template-columns:1fr 1fr}
  .portals-grid{grid-template-columns:1fr}
  .info-grid{grid-template-columns:1fr}
  h1{font-size:38px}
  nav{margin-bottom:48px}
  .hero{padding-bottom:56px}
  .sec{margin-bottom:64px}
  .stats-row{margin-bottom:64px}
}
@media(max-width:480px){
  .wrap{padding:0 16px 60px}
  .stats-row{grid-template-columns:1fr}
  h1{font-size:32px}
  .acts{flex-direction:column}
  .btn-p,.btn-g{text-align:center;justify-content:center;display:block}
  .hero-sub{font-size:15px}
}
`;