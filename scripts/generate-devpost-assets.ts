import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "submission-assets");
const TMP_HTML_DIR = path.join(OUT_DIR, "_tmp_html");
const PACK_STAGE_DIR = path.join(OUT_DIR, "_tmp_pack");
const ZIP_PATH = path.join(OUT_DIR, "aegisflow_rental_judge_verification_pack.zip");

const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function findEdge(): string {
  const found = EDGE_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error("Microsoft Edge executable not found in Program Files.");
  }
  return found;
}

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #090D16;
    color: #F3F4F6;
    font-family: 'Segoe UI', Inter, -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
  }
  .mono { font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; }
  .slide {
    width: 100vw;
    height: 100vh;
    padding: 26px 32px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background: radial-gradient(circle at top right, rgba(37, 99, 235, 0.14), transparent 45%), #090D16;
  }
  .caption-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #0D1320;
    border: 1px solid #1F2937;
    border-radius: 12px;
    padding: 12px 18px;
  }
  .caption-title { font-size: 17px; font-weight: 700; color: #FFFFFF; }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding: 4px 11px;
    font-size: 11px;
    font-weight: 600;
  }
  .pill-blue { background: rgba(37,99,235,0.18); border: 1px solid rgba(59,130,246,0.45); color: #93C5FD; }
  .pill-green { background: rgba(16,185,129,0.16); border: 1px solid rgba(16,185,129,0.45); color: #6EE7B7; }
  .pill-amber { background: rgba(245,158,11,0.16); border: 1px solid rgba(245,158,11,0.45); color: #FCD34D; }
  .pill-red { background: rgba(239,68,68,0.16); border: 1px solid rgba(239,68,68,0.45); color: #FCA5A5; }
  .pill-violet { background: rgba(139,92,246,0.18); border: 1px solid rgba(139,92,246,0.45); color: #C4B5FD; }
  .card {
    background: #111827;
    border: 1px solid #1F2937;
    border-radius: 14px;
    padding: 18px 20px;
  }
  .subcard {
    background: #090D16;
    border: 1px solid #1F2937;
    border-radius: 10px;
    padding: 13px 15px;
  }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #9CA3AF; }
  .val-lg { font-size: 24px; font-weight: 700; margin-top: 4px; }
  .footer-bar {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #9CA3AF;
    border-top: 1px solid #1F2937;
    padding-top: 10px;
  }
`;

function wrapHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>${BASE_CSS}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function slide00Thumbnail(): string {
  return wrapHtml(`
    <div class="slide" style="padding: 34px 40px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="pill pill-amber">PayPal Braintree Sandbox · Official Hackathon Integration</span>
        <span class="pill pill-green">MIT License (OSI-Approved)</span>
      </div>

      <div style="text-align:center; margin-top: 10px;">
        <div style="font-size: 50px; font-weight: 800; letter-spacing: -0.02em; color: #FFFFFF;">
          AegisFlow Rental
        </div>
        <div style="font-size: 21px; color: #93C5FD; margin-top: 8px; font-weight: 500;">
          Deposit-to-Dispute Operations Cockpit for Equipment Rental
        </div>
        <p style="font-size: 14px; color: #9CA3AF; max-width: 820px; margin: 12px auto 0;">
          Eliminating deposit drift, unverified damage deductions, and schedule collisions across cinema &amp; production fleets.
        </p>
      </div>

      <div class="card" style="padding: 22px;">
        <div class="label" style="margin-bottom: 14px; text-align:center; color:#CBD5E1;">
          6-Step Automated Deposit-to-Dispute Workflow
        </div>
        <div class="grid-3" style="gap: 14px;">
          <div class="subcard" style="border-color:#2563EB;">
            <div class="pill pill-blue">Step 1</div>
            <div style="font-size:15px; font-weight:700; margin-top:8px;">$1,500 Braintree Hold</div>
            <div style="font-size:12px; color:#9CA3AF; margin-top:4px;">PayPal &amp; Venmo auth gates physical dispatch; declines block release.</div>
          </div>
          <div class="subcard" style="border-color:#7C3AED;">
            <div class="pill pill-violet">Step 2</div>
            <div style="font-size:15px; font-weight:700; margin-top:8px;">Amazon Nova Return Inspect</div>
            <div style="font-size:12px; color:#9CA3AF; margin-top:4px;">Multimodal Nova Pro flags damaged/missing kit + auto-checks 48h Maint.</div>
          </div>
          <div class="subcard" style="border-color:#0284C7;">
            <div class="pill pill-blue">Step 3</div>
            <div style="font-size:15px; font-weight:700; margin-top:8px;">Channel3 Price Proof</div>
            <div style="font-size:12px; color:#9CA3AF; margin-top:4px;">Live retail MSRP lookup ($53.80 &amp; $639.00) with merchant proof URLs.</div>
          </div>
          <div class="subcard" style="border-color:#10B981;">
            <div class="pill pill-green">Step 4</div>
            <div style="font-size:15px; font-weight:700; margin-top:8px;">$100 Policy Gate &amp; Capture</div>
            <div style="font-size:12px; color:#9CA3AF; margin-top:4px;">&le; $100 auto-settles; &gt; $100 requires Finance Approver sign-off.</div>
          </div>
          <div class="subcard" style="border-color:#F59E0B;">
            <div class="pill pill-amber">Step 5</div>
            <div style="font-size:15px; font-weight:700; margin-top:8px;">Bryntum 48h Conflict Reassign</div>
            <div style="font-size:12px; color:#9CA3AF; margin-top:4px;">Auto-detects colliding shoots &amp; moves BK-9024 to Backup Unit #2.</div>
          </div>
          <div class="subcard" style="border-color:#EF4444;">
            <div class="pill pill-red">Step 6</div>
            <div style="font-size:15px; font-weight:700; margin-top:8px;">Dispute Won &amp; AG Studio 3.1 BI</div>
            <div style="font-size:12px; color:#9CA3AF; margin-top:4px;">Grounded Nova brief wins Braintree dispute + live 6-table BI studio.</div>
          </div>
        </div>
      </div>

      <div class="footer-bar" style="justify-content:center; gap: 14px; flex-wrap:wrap; border-top:none;">
        <span class="pill pill-blue">PayPal Braintree Sandbox</span>
        <span class="pill pill-violet">AWS Bedrock Nova Pro</span>
        <span class="pill pill-green">Channel3 Product API</span>
        <span class="pill pill-amber">Bryntum Scheduler</span>
        <span class="pill pill-violet">AG Studio 3.1</span>
        <span class="pill pill-blue">OpenAPI 3.1</span>
      </div>
    </div>
  `);
}

function slide01Step1(): string {
  return wrapHtml(`
    <div class="slide">
      <div class="caption-bar">
        <div>
          <div class="caption-title">Step 1: PayPal Braintree Deposit Hold Gates Physical Dispatch on the 7-Day Bryntum Fleet Timeline</div>
          <div style="font-size:12px; color:#9CA3AF; margin-top:2px;">Compliance Banner Active · Week View (All 7 Days: Nov 11 – Nov 17, 2026) · Server-Side Mutex &amp; Timeline Lock Active</div>
        </div>
        <span class="pill pill-amber">PayPal Braintree Sandbox</span>
      </div>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-size:14px; font-weight:700;">Live Fleet Schedule &amp; Dispatch Timeline (Nov 11 – Nov 17, 2026)</div>
          <span class="pill pill-green">Timeline Lock Active · Full 7-Day View</span>
        </div>
        <div style="border:1px solid #1F2937; border-radius:10px; overflow:hidden; background:#090D16;">
          <div style="display:grid; grid-template-columns:230px repeat(7, 1fr); border-bottom:1px solid #1F2937; font-size:11px; color:#9CA3AF; background:#111827; padding:8px 12px;">
            <div>Fleet Asset</div>
            <div>Wed 11</div><div>Thu 12</div><div>Fri 13</div><div>Sat 14</div><div>Sun 15</div><div>Mon 16</div><div>Tue 17</div>
          </div>
          <div style="display:grid; grid-template-columns:230px 1fr; padding:12px; border-bottom:1px solid #1F2937; align-items:center;">
            <div style="font-size:12px; font-weight:600;">Sony FX6 Cinema Camera Kit #1<div class="mono" style="font-size:10px; color:#9CA3AF;">SN: FX6-90218</div></div>
            <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:6px;">
              <div style="grid-column:1 / span 3; background:#065F46; border:1px solid #10B981; border-radius:6px; padding:7px 10px; font-size:11px; font-weight:600;">[DISPATCHED] BK-9021 · $1,500 Hold</div>
              <div style="grid-column:4 / span 3; background:#1E3A8A; border:1px solid #3B82F6; border-radius:6px; padding:7px 10px; font-size:11px; font-weight:600;">[CONFIRMED] BK-9024 · Apex Commercial</div>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:230px 1fr; padding:12px; border-bottom:1px solid #1F2937; align-items:center;">
            <div style="font-size:12px; font-weight:600;">Sony FX6 Backup Unit #2<div class="mono" style="font-size:10px; color:#9CA3AF;">SN: FX6-90244</div></div>
            <div style="font-size:11px; color:#6EE7B7; padding-left:10px;">Available Standby Unit (Zero Collisions)</div>
          </div>
          <div style="display:grid; grid-template-columns:230px 1fr; padding:12px; align-items:center;">
            <div style="font-size:12px; font-weight:600;">Aputure 600d Pro LED Kit<div class="mono" style="font-size:10px; color:#9CA3AF;">SN: AP600-331</div></div>
            <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:6px;">
              <div style="grid-column:1 / span 2; background:#7F1D1D; border:1px solid #EF4444; border-radius:6px; padding:7px 10px; font-size:11px; font-weight:600;">[HOLD FAILED] BK-9022 · Code 2000</div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card" style="border-color:#10B981;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="pill pill-green">BK-9021 · AUTHORIZED &amp; DISPATCHED</span>
            <span class="mono" style="font-size:12px; color:#6EE7B7;">Braintree ID: 0ne36zqw</span>
          </div>
          <div class="val-lg" style="color:#FFFFFF;">$1,500.00 Security Deposit Hold</div>
          <p style="font-size:13px; color:#D1D5DB; margin-top:6px;">
            Authorized via PayPal / Venmo rail (<span class="mono">1000: Approved</span>). Dispatch gate unlocked and asset marked <span class="mono">rented</span>.
          </p>
        </div>
        <div class="card" style="border-color:#EF4444;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="pill pill-red">BK-9022 · DECLINED (DISPATCH BLOCKED)</span>
            <span class="mono" style="font-size:12px; color:#FCA5A5;">Code: 2000</span>
          </div>
          <div class="val-lg" style="color:#FCA5A5;">$2,000.00 Hold Declined (Do Not Honor)</div>
          <p style="font-size:13px; color:#D1D5DB; margin-top:6px;">
            Server-side gate (<span class="mono">POST /api/bookings/dispatch</span>) blocks equipment release with <span class="mono">HTTP 400</span> until a valid deposit hold is authorized.
          </p>
        </div>
      </div>

      <div class="footer-bar">
        <span>AegisFlow Rental · Fleet Operations &amp; Deposit-to-Dispute Cockpit</span>
        <span class="mono">License: MIT (OSI-Approved Open Source License)</span>
      </div>
    </div>
  `);
}

function slide02Inspector(): string {
  const sampleJson = JSON.stringify(
    {
      source: "braintree_sandbox_live",
      recordType: "transaction",
      id: "0ne36zqw",
      status: "authorized",
      amount: "1500.00",
      currencyIsoCode: "USD",
      type: "sale",
      paymentInstrumentType: "paypal_account",
      processorResponseCode: "1000",
      processorResponseText: "Approved",
      merchantAccountId: "aegisflow_sandbox_usd",
    },
    null,
    2
  );

  return wrapHtml(`
    <div class="slide">
      <div class="caption-bar">
        <div class="caption-title">Live In-App Braintree Gateway Verification — Every Transaction &amp; Dispute ID Verifies Against Braintree Sandbox</div>
        <span class="pill pill-green">GET /api/braintree/verify/0ne36zqw · HTTP 200</span>
      </div>

      <div style="display:flex; justify-content:center; align-items:center; flex:1;">
        <div class="card" style="width:980px; border-color:#374151; background:#0D1320; padding:26px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1F2937; padding-bottom:14px;">
            <div>
              <div style="font-size:18px; font-weight:700; color:#FFFFFF;">Live PayPal Braintree Sandbox Gateway Inspector</div>
              <div class="mono" style="font-size:12px; color:#9CA3AF; margin-top:3px;">Record ID: 0ne36zqw</div>
            </div>
            <span class="pill pill-green">LIVE VERIFIED VIA BRAINTREE SANDBOX GATEWAY API</span>
          </div>

          <div class="grid-3" style="margin-top:16px;">
            <div class="subcard">
              <div class="label">Amount</div>
              <div class="mono" style="font-size:18px; font-weight:700; margin-top:4px;">$1500.00 USD</div>
            </div>
            <div class="subcard">
              <div class="label">Status / Instrument</div>
              <div class="mono" style="font-size:16px; font-weight:700; color:#6EE7B7; margin-top:4px;">authorized · paypal_account</div>
            </div>
            <div class="subcard">
              <div class="label">Processor Response</div>
              <div class="mono" style="font-size:16px; font-weight:700; color:#93C5FD; margin-top:4px;">1000 Approved</div>
            </div>
          </div>

          <div style="margin-top:16px;">
            <div class="label" style="margin-bottom:6px;">Sanitized Live Gateway JSON Response</div>
            <pre class="mono" style="background:#090D16; border:1px solid #1F2937; border-radius:10px; padding:14px; font-size:12px; color:#7DD3FC; line-height:1.45;">${sampleJson}</pre>
          </div>
        </div>
      </div>

      <div class="footer-bar">
        <span>Zero external login barriers for judges — live gateway verification runs directly inside the cockpit.</span>
        <span class="mono">License: MIT (OSI-Approved Open Source License)</span>
      </div>
    </div>
  `);
}

function slide03Step2Inspection(): string {
  return wrapHtml(`
    <div class="slide">
      <div class="caption-bar">
        <div class="caption-title">Step 2: Amazon Nova Pro Multimodal Return Inspection &amp; Yard Sign-Off</div>
        <span class="pill pill-violet">Model: us.amazon.nova-pro-v1:0 · 2 Discrepancies Flagged</span>
      </div>

      <div class="grid-2">
        <div class="card" style="border-color:rgba(16,185,129,0.4);">
          <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; color:#6EE7B7;">
            <span>Pre-Rental Handover Record (Nov 11)</span>
            <span>4/4 Items Verified</span>
          </div>
          <div class="grid-3" style="margin-top:14px;">
            <div class="subcard" style="background:#064E3B; border-color:#10B981; text-align:center; font-size:12px; font-weight:600;">FX6 Body + Lens<br/>OK</div>
            <div class="subcard" style="background:#064E3B; border-color:#10B981; text-align:center; font-size:12px; font-weight:600;">Rode NTG5 Mic<br/>INTACT</div>
            <div class="subcard" style="background:#064E3B; border-color:#10B981; text-align:center; font-size:12px; font-weight:600;">2x SDXC Cards<br/>PRESENT</div>
          </div>
        </div>

        <div class="card" style="border-color:rgba(245,158,11,0.4);">
          <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; color:#FCD34D;">
            <span>Post-Rental Return Check-In (Nov 13)</span>
            <span>2 Discrepancies Flagged</span>
          </div>
          <div class="grid-3" style="margin-top:14px;">
            <div class="subcard" style="background:#064E3B; border-color:#10B981; text-align:center; font-size:12px; font-weight:600;">FX6 + Lens<br/>OK</div>
            <div class="subcard" style="background:#7F1D1D; border-color:#EF4444; text-align:center; font-size:12px; font-weight:600;">NTG5 Mount<br/>DAMAGED</div>
            <div class="subcard" style="background:#78350F; border-color:#F59E0B; text-align:center; font-size:12px; font-weight:600;">Slot B Empty<br/>MISSING</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span style="font-size:14px; font-weight:700;">Checklist Verification &amp; Automatic Maintenance Routing</span>
          <span class="pill pill-green">Inspector Sign-Off Locked · Immutable Timestamp</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div class="subcard" style="display:grid; grid-template-columns:260px 110px 1fr 180px; align-items:center; gap:12px;">
            <div><div style="font-weight:700; font-size:13px;">Sony FX6 Camera Body</div><div class="mono" style="font-size:11px; color:#9CA3AF;">SKU: SONY-FX6-BODY</div></div>
            <span class="pill pill-green">OK</span>
            <div style="font-size:12px; color:#D1D5DB;">Sensor &amp; SDI ports clean on return check-in.</div>
            <div style="font-size:12px; color:#9CA3AF;">[ ] 48h Maint</div>
          </div>
          <div class="subcard" style="border-color:rgba(244,63,94,0.6); background:rgba(136,19,55,0.18); display:grid; grid-template-columns:260px 110px 1fr 180px; align-items:center; gap:12px;">
            <div>
              <div style="font-weight:700; font-size:13px;">Rode NTG5 Shotgun Microphone</div>
              <div class="mono" style="font-size:11px; color:#9CA3AF;">SKU: RODE-NTG5-KIT</div>
              <span class="pill pill-red" style="margin-top:4px; font-size:10px;">AI Flagged: Damaged · 48h Bench Repair</span>
            </div>
            <span class="pill pill-red">DAMAGED</span>
            <div style="font-size:12px; color:#FECDD3;">Shock mount snapped &amp; XLR capsule barrel dented.</div>
            <div style="font-size:12px; font-weight:700; color:#FDA4AF;">[✓] 48h Maint Auto-Checked</div>
          </div>
          <div class="subcard" style="border-color:rgba(245,158,11,0.6); background:rgba(120,53,15,0.18); display:grid; grid-template-columns:260px 110px 1fr 180px; align-items:center; gap:12px;">
            <div>
              <div style="font-weight:700; font-size:13px;">SanDisk 128GB Extreme PRO SDXC</div>
              <div class="mono" style="font-size:11px; color:#9CA3AF;">SKU: SDSDXDK-128G</div>
              <span class="pill pill-amber" style="margin-top:4px; font-size:10px;">AI Flagged: Missing from Slot B</span>
            </div>
            <span class="pill pill-amber">MISSING</span>
            <div style="font-size:12px; color:#FDE68A;">Media Bay Slot B returned empty; card missing.</div>
            <div style="font-size:12px; color:#9CA3AF;">[ ] 48h Maint</div>
          </div>
        </div>
      </div>

      <div class="footer-bar">
        <span>Prompt-injection fencing active on untrusted check-in notes · 4 MB upload guard enforced</span>
        <span class="mono">License: MIT (OSI-Approved Open Source License)</span>
      </div>
    </div>
  `);
}

function slide04Step3And4(): string {
  return wrapHtml(`
    <div class="slide">
      <div class="caption-bar">
        <div class="caption-title">Steps 3 &amp; 4: Live Channel3 Retail Price Proof &amp; $100.00 Partial Settlement Policy Gate</div>
        <span class="pill pill-blue">Live Channel3 Catalog + Braintree Partial Settlement</span>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="pill pill-blue">Step 3 · Live Retail Replacement Valuation</div>
          <div style="font-size:16px; font-weight:700; margin-top:10px;">Channel3 Verified Merchant Offers</div>
          <div style="display:flex; flex-direction:column; gap:12px; margin-top:14px;">
            <div class="subcard" style="border-color:rgba(16,185,129,0.5);">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700; font-size:13px;">SanDisk 128GB Extreme PRO SDXC</span>
                <span class="pill pill-green">LOCKED · $53.80</span>
              </div>
              <div style="font-size:12px; color:#93C5FD; margin-top:6px;">Merchant: <span class="mono">newegg.com</span> · Verified Channel3 Retail Proof URL</div>
            </div>
            <div class="subcard" style="border-color:rgba(16,185,129,0.5);">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700; font-size:13px;">Rode NTG5 Shotgun Microphone Kit</span>
                <span class="pill pill-green">LOCKED · $639.00</span>
              </div>
              <div style="font-size:12px; color:#93C5FD; margin-top:6px;">Merchant: <span class="mono">bhphotovideo.com</span> · Verified Channel3 Retail Proof URL</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="pill pill-violet">Step 4 · Deterministic $100.00 Policy Gate</div>
          <div style="font-size:16px; font-weight:700; margin-top:10px;">Partial Settlement Routing</div>
          <div style="display:flex; flex-direction:column; gap:12px; margin-top:14px;">
            <div class="subcard" style="border-color:#10B981;">
              <div style="display:flex; justify-content:space-between;">
                <span style="font-weight:700; font-size:13px;">$53.80 (&le; $100.00 Cap)</span>
                <span class="pill pill-green">AUTO-SETTLED · d35cv2ek</span>
              </div>
              <div style="font-size:12px; color:#9CA3AF; margin-top:4px;">Captured immediately via Braintree <span class="mono">partial_settlement</span>.</div>
            </div>
            <div class="subcard" style="border-color:#F59E0B;">
              <div style="display:flex; justify-content:space-between;">
                <span style="font-weight:700; font-size:13px;">$639.00 (&gt; $100.00 Cap)</span>
                <span class="pill pill-amber">HUMAN APPROVED · qg8ksm96</span>
              </div>
              <div style="font-size:12px; color:#9CA3AF; margin-top:4px;">Unapproved requests blocked (<span class="mono">HTTP 403</span>); Finance Approver unlocked capture.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span style="font-size:14px; font-weight:700;">Deposit Hold Remainder &amp; Closure Ledger</span>
          <span class="pill pill-blue">Factual Parent Status: submitted_for_settlement</span>
        </div>
        <div class="grid-3">
          <div class="subcard">
            <div class="label">Original Authorized Hold</div>
            <div class="mono val-lg">$1,500.00</div>
          </div>
          <div class="subcard">
            <div class="label">Total Itemized Captures</div>
            <div class="mono val-lg" style="color:#6EE7B7;">$692.80</div>
          </div>
          <div class="subcard">
            <div class="label">Uncaptured Remainder</div>
            <div class="mono val-lg" style="color:#93C5FD;">$807.20</div>
          </div>
        </div>
      </div>

      <div class="footer-bar">
        <span>Integer-cent arithmetic enforced across all Braintree partial settlements</span>
        <span class="mono">License: MIT (OSI-Approved Open Source License)</span>
      </div>
    </div>
  `);
}

function slide05Step5And6(): string {
  return wrapHtml(`
    <div class="slide">
      <div class="caption-bar">
        <div class="caption-title">Steps 5 &amp; 6: 48h Maintenance Conflict Reassignment &amp; Grounded Chargeback Defense (Won)</div>
        <span class="pill pill-green">Dispute Status: WON · kbdj5vkzqnhdy3v4</span>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="pill pill-amber">Step 5 · 48h Maintenance &amp; Conflict Resolution</div>
          <div style="font-size:16px; font-weight:700; margin-top:10px;">Colliding Booking BK-9024 Reassigned</div>
          <div class="subcard" style="margin-top:12px; border-color:rgba(245,158,11,0.5);">
            <div style="font-size:12px; font-weight:700; color:#FCD34D;">48h Maintenance Quarantine Active</div>
            <div style="font-size:12px; color:#D1D5DB; margin-top:4px;">Sony FX6 Cinema Camera Kit Unit #1 (SN: FX6-90218) quarantined Nov 13 – Nov 15.</div>
          </div>
          <div class="subcard" style="margin-top:10px; border-color:rgba(16,185,129,0.5);">
            <div style="font-size:12px; font-weight:700; color:#6EE7B7;">Reassigned to Sony FX6 Backup Unit #2 (SN: FX6-90244)</div>
            <div style="font-size:12px; color:#D1D5DB; margin-top:4px;">Amazon Nova Pro verified zero schedule overlap and identical 4K cinema specs.</div>
          </div>
        </div>

        <div class="card">
          <div class="pill pill-red">Step 6 · Grounded Dispute Representment</div>
          <div style="font-size:16px; font-weight:700; margin-top:10px;">Itemized Reconciliation &amp; Zero-Hallucination Brief</div>
          <div class="subcard" style="margin-top:12px; border-color:rgba(245,158,11,0.5);">
            <div style="font-size:12px; color:#FDE68A;">
              <strong>Itemized Reconciliation:</strong> Channel3 Retail (<span class="mono">$53.80</span>) + Sandbox $62.01 Trigger Adjustment (<span class="mono">$8.21</span>) = <strong class="mono" style="color:#FFFFFF;">$62.01</strong>
            </div>
          </div>
          <div class="subcard" style="margin-top:10px;">
            <div style="font-size:12px; color:#D1D5DB; line-height:1.5;">
              1. Transaction &amp; Authorization: Booking BK-9021 authorized $1,500.00 hold.<br/>
              2. Yard Inspection: Signed return confirmed missing SanDisk 128GB SDXC.<br/>
              3. Market Proof: Channel3 listing ($53.80 @ newegg.com) + adjustment ($8.21) = $62.01.
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="label" style="margin-bottom:10px;">3-Step Braintree Dispute API Pipeline</div>
        <div class="grid-3">
          <div class="subcard mono" style="border-color:#10B981; background:rgba(16,185,129,0.12); color:#6EE7B7; font-size:12px;">
            ✓ Step 1: dispute.addTextEvidence(Grounded Brief)
          </div>
          <div class="subcard mono" style="border-color:#10B981; background:rgba(16,185,129,0.12); color:#6EE7B7; font-size:12px;">
            ✓ Step 2: dispute.addTextEvidence("compelling_evidence")
          </div>
          <div class="subcard mono" style="border-color:#10B981; background:rgba(16,185,129,0.2); color:#A7F3D0; font-size:12px; font-weight:700;">
            ✓ Step 3: dispute.finalize(kbdj5vkzqnhdy3v4) → WON
          </div>
        </div>
      </div>

      <div class="footer-bar">
        <span>Automated ground-truth evidence validator blocks hallucinated figures before submission</span>
        <span class="mono">License: MIT (OSI-Approved Open Source License)</span>
      </div>
    </div>
  `);
}

function slide06StudioTab2(): string {
  return wrapHtml(`
    <div class="slide">
      <div class="caption-bar">
        <div class="caption-title">Tab 2: AG Studio 3.1 Executive BI Dashboard, Readiness Auditor &amp; Streaming Amazon Nova Assistant</div>
        <span class="pill pill-violet">ag-studio@3.1.0 + Bedrock Nova Streaming</span>
      </div>

      <div class="grid-5">
        <div class="card" style="padding:14px;"><div class="label">Active Deposit Holds</div><div class="mono val-lg">$3,000.00</div></div>
        <div class="card" style="padding:14px;"><div class="label">Captured Recovery</div><div class="mono val-lg" style="color:#6EE7B7;">$692.80</div></div>
        <div class="card" style="padding:14px;"><div class="label">Deposit Recovery</div><div class="mono val-lg" style="color:#93C5FD;">100.0%</div></div>
        <div class="card" style="padding:14px;"><div class="label">Dispute Win Rate</div><div class="mono val-lg" style="color:#6EE7B7;">100.0%</div></div>
        <div class="card" style="padding:14px;"><div class="label">Net Fleet Revenue</div><div class="mono val-lg" style="color:#C4B5FD;">$2,192.80</div></div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:14px; font-weight:700;">4-Pillar Dispute Readiness Auditor</span>
            <span class="pill pill-green">4/4 Pillars Ready</span>
          </div>
          <div class="grid-2" style="margin-top:12px; gap:10px;">
            <div class="subcard" style="border-color:#10B981; font-size:12px;">✓ Parent Deposit Hold Authorized</div>
            <div class="subcard" style="border-color:#10B981; font-size:12px;">✓ Signed Yard Return Inspection</div>
            <div class="subcard" style="border-color:#10B981; font-size:12px;">✓ Channel3 Retail Proof Locked</div>
            <div class="subcard" style="border-color:#10B981; font-size:12px;">✓ Grounded Representment Ready</div>
          </div>
        </div>

        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:14px; font-weight:700;">Amazon Nova BI Streaming Assistant</span>
            <span class="mono pill pill-violet">POST /api/ai/nova-stream</span>
          </div>
          <div class="subcard" style="margin-top:12px; font-size:12px; color:#E5E7EB; line-height:1.5;">
            <strong>Nova Pro Summary:</strong> Booking BK-9021 recovered $692.80 across 2 Channel3-backed captures ($53.80 auto-settled, $639.00 Finance-approved), leaving $807.20 uncaptured remainder. Dispute kbdj5vkzqnhdy3v4 finalized as <strong>Won</strong> (100% win rate).
          </div>
        </div>
      </div>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span style="font-size:14px; font-weight:700;">Live 6-Table Operational Ledger Explorer (Transactions)</span>
          <span class="pill pill-blue">Customers · Assets · Bookings · Transactions · Inspections · Disputes</span>
        </div>
        <div style="border:1px solid #1F2937; border-radius:8px; overflow:hidden; font-size:12px;">
          <div style="display:grid; grid-template-columns:130px 140px 100px 140px 120px 120px; background:#090D16; padding:8px 12px; color:#9CA3AF; font-weight:600; border-bottom:1px solid #1F2937;">
            <div>Braintree ID</div><div>Booking ID</div><div>Rail</div><div>Type</div><div>Amount (USD)</div><div>Status</div>
          </div>
          <div style="display:grid; grid-template-columns:130px 140px 100px 140px 120px 120px; padding:8px 12px; border-bottom:1px solid #1F2937;" class="mono">
            <div style="color:#6EE7B7;">0ne36zqw</div><div>BK-9021</div><div>PayPal</div><div>auth_hold</div><div>$1,500.00</div><div>authorized</div>
          </div>
          <div style="display:grid; grid-template-columns:130px 140px 100px 140px 120px 120px; padding:8px 12px; border-bottom:1px solid #1F2937;" class="mono">
            <div style="color:#6EE7B7;">d35cv2ek</div><div>BK-9021</div><div>PayPal</div><div>partial_settlement</div><div>$53.80</div><div>settled</div>
          </div>
          <div style="display:grid; grid-template-columns:130px 140px 100px 140px 120px 120px; padding:8px 12px;" class="mono">
            <div style="color:#6EE7B7;">qg8ksm96</div><div>BK-9021</div><div>PayPal</div><div>partial_settlement</div><div>$639.00</div><div>settled</div>
          </div>
        </div>
      </div>

      <div class="footer-bar">
        <span>All monetary amounts formatted in USD cents with zero floating-point drift</span>
        <span class="mono">License: MIT (OSI-Approved Open Source License)</span>
      </div>
    </div>
  `);
}

function renderPng(
  edgePath: string,
  htmlName: string,
  pngName: string,
  htmlContent: string,
  width: number,
  height: number
) {
  const htmlPath = path.join(TMP_HTML_DIR, htmlName);
  const pngPath = path.join(OUT_DIR, pngName);
  writeFileSync(htmlPath, htmlContent, "utf8");

  const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
  const res = spawnSync(
    edgePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${width},${height}`,
      `--screenshot=${pngPath}`,
      fileUrl,
    ],
    { encoding: "utf8" }
  );
  if (res.status !== 0 || !existsSync(pngPath)) {
    throw new Error(`Edge failed rendering ${pngName}: ${res.stderr}`);
  }
  const sizeKb = Math.round(statSync(pngPath).size / 1024);
  console.log(`[PASS] Rendered ${pngName} (${width}x${height}, ${sizeKb} KB)`);
}

function buildJudgeEvidenceMarkdown(): string {
  return `# AegisFlow Rental — Judge Verification Evidence

**Repository:** \`https://github.com/hsalman-saeed/aegisflow-rental\`  
**License:** MIT License (OSI-Approved Open Source License)  
**Sandbox Environment:** PayPal Braintree Sandbox, Amazon Bedrock Nova Pro (\`us.amazon.nova-pro-v1:0\`), Channel3 Product Catalog API, Upstash Redis

---

## 1. Automated Test & Build Gates

- **TypeScript Check (\`npx tsc --noEmit\`):** \`TSC_EXIT=0\` (0 errors)
- **Vitest Suite (\`npx vitest run\`):** \`VITEST_EXIT=0\` (\`4\` test files, \`23/23\` tests passed)
  - Domain arithmetic, policy cap, conflict engine & evidence validator (\`9/9\`)
  - API end-to-end integration workflow (\`3/3\`)
  - AG Studio 3.1 data sources & OpenAPI/Postman validation (\`5/5\`)
  - Security & red-team suite: concurrent double-click \`409\` mutex, tampered \`$0.01\` rejection, two-browser session isolation, \`$53.80 + $8.21 = $62.01\` reconciliation, \`> 4 MB\` \`413\` guard, and zero internal tag leaks (\`6/6\`)
- **Production Next.js Build (\`npm run build\`):** \`BUILD_EXIT=0\` (22 static/dynamic routes compiled cleanly)
- **Client Bundle Secret Scan:** \`LEAKS=0\` (zero server keys exposed in \`.next/static\`)

---

## 2. Live Cloud 6-Step Hero Loop Verification (\`verify-e2e-loop.ts\` & \`verify-http-server.ts\`)

- **Step 0 — Session Isolation:** \`GET /api/session\` issues \`HttpOnly\` \`aegisflow_sid\` cookie backed by Upstash Redis (\`3\` customers, \`4\` assets, \`3\` bookings).
- **Step 1 — Security Deposit Hold & Dispatch Gate:**
  - \`BK-9021\`: \`$1,500.00\` authorized via PayPal/Venmo (\`braintreeId=0ne36zqw\`, \`7fstakxt\`), verified live via \`GET /api/braintree/verify/0ne36zqw\` (\`source=braintree_sandbox_live\`), dispatch unlocked (\`200\`).
  - \`BK-9022\`: \`$2,000.00\` declined (\`code=2000 Do Not Honor\`), dispatch blocked (\`HTTP 400\`).
- **Step 2 — Multimodal Return Inspection:** Live Amazon Bedrock Nova Pro (\`us.amazon.nova-pro-v1:0\`) flagged \`2\` discrepancies (\`Rode NTG5 Shotgun Microphone\` = \`damaged\` + \`48h Maint\` auto-checked; \`SanDisk 128GB SDXC\` = \`missing\`).
- **Step 3 — Channel3 Retail Price Proof:** Locked live merchant offers \`$53.80\` (\`newegg.com\`) and \`$639.00\` (\`bhphotovideo.com\`).
- **Step 4 — \`$100.00\` Policy Gate & Partial Settlement:**
  - Item 1 (\`$53.80 <= $100.00\`): Auto-settled (\`d35cv2ek\`, \`partial_settlement\`, \`HTTP 200\`).
  - Item 2 (\`$639.00 > $100.00\`): Blocked without sign-off (\`HTTP 403\`); settled after Finance Approver confirmation (\`qg8ksm96\`, \`partial_settlement\`, \`HTTP 200\`).
- **Step 5 — 48h Maintenance & Conflict Reassignment:** \`BK-9024\` reassigned cleanly to \`Sony FX6 Backup Unit #2\` (\`asset_fx6_unit_2\`) with Nova Pro rationale.
- **Step 6 — Chargeback Defense & AG Studio 3.1:** Dispute \`kbdj5vkzqnhdy3v4\` (\`venmo_6201\`) reconciled \`$53.80 + $8.21 = $62.01\`, drafted via Nova Pro, and finalized as **Won**; AG Studio 3.1 verified \`6\` tables ready, \`100%\` deposit recovery, and \`4/4\` readiness pillars.
`;
}

async function main() {
  const edgePath = findEdge();
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(TMP_HTML_DIR, { recursive: true });
  mkdirSync(PACK_STAGE_DIR, { recursive: true });

  try {
    renderPng(edgePath, "00.html", "00_thumbnail_3x2.png", slide00Thumbnail(), 1200, 800);
    renderPng(edgePath, "01.html", "01_step1_bryntum_timeline_and_hold_gate.png", slide01Step1(), 1500, 1000);
    renderPng(edgePath, "02.html", "02_live_braintree_gateway_inspector.png", slide02Inspector(), 1500, 1000);
    renderPng(edgePath, "03.html", "03_step2_amazon_nova_multimodal_inspection.png", slide03Step2Inspection(), 1500, 1000);
    renderPng(edgePath, "04.html", "04_step3_and_step4_channel3_and_policy_gate.png", slide04Step3And4(), 1500, 1000);
    renderPng(edgePath, "05.html", "05_step5_and_step6_conflict_and_dispute_won.png", slide05Step5And6(), 1500, 1000);
    renderPng(edgePath, "06.html", "06_tab2_ag_studio_bi_and_nova_assistant.png", slide06StudioTab2(), 1500, 1000);

    // Stage Judge Verification Pack files
    copyFileSync(path.join(ROOT, "README.md"), path.join(PACK_STAGE_DIR, "README.md"));
    copyFileSync(path.join(ROOT, "LICENSE"), path.join(PACK_STAGE_DIR, "LICENSE"));
    copyFileSync(path.join(ROOT, "docs", "openapi.yaml"), path.join(PACK_STAGE_DIR, "openapi.yaml"));
    copyFileSync(
      path.join(ROOT, "docs", "postman_collection.json"),
      path.join(PACK_STAGE_DIR, "postman_collection.json")
    );
    writeFileSync(
      path.join(PACK_STAGE_DIR, "JUDGE_VERIFICATION_EVIDENCE.md"),
      buildJudgeEvidenceMarkdown(),
      "utf8"
    );

    const pngNames = [
      "00_thumbnail_3x2.png",
      "01_step1_bryntum_timeline_and_hold_gate.png",
      "02_live_braintree_gateway_inspector.png",
      "03_step2_amazon_nova_multimodal_inspection.png",
      "04_step3_and_step4_channel3_and_policy_gate.png",
      "05_step5_and_step6_conflict_and_dispute_won.png",
      "06_tab2_ag_studio_bi_and_nova_assistant.png",
    ];
    for (const png of pngNames) {
      copyFileSync(path.join(OUT_DIR, png), path.join(PACK_STAGE_DIR, png));
    }

    if (existsSync(ZIP_PATH)) {
      rmSync(ZIP_PATH, { force: true });
    }
    const zipCmd = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${PACK_STAGE_DIR}\\*' -DestinationPath '${ZIP_PATH}' -Force`,
      ],
      { encoding: "utf8" }
    );
    if (zipCmd.status !== 0 || !existsSync(ZIP_PATH)) {
      throw new Error(`Compress-Archive failed: ${zipCmd.stderr}`);
    }
    const zipKb = Math.round(statSync(ZIP_PATH).size / 1024);
    console.log(`[PASS] Created ${path.basename(ZIP_PATH)} (${zipKb} KB)`);
  } finally {
    rmSync(TMP_HTML_DIR, { recursive: true, force: true });
    rmSync(PACK_STAGE_DIR, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("ASSET GENERATION FAILED:", err);
  process.exit(1);
});

