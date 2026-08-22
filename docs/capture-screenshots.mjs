/**
 * Regenerates docs/screenshots/ from a locally running instance.
 *
 * Run `npm run dev` first, then `node docs/capture-screenshots.mjs` from the repo root.
 * Drives headless Chrome over CDP so each shot can scroll to its section before the shutter —
 * Chrome's own --screenshot flag captures the top of the page before a hash scroll applies.
 *
 * Shots are taken signed-out on purpose: nothing from a real account ends up in the repo.
 */
import { spawn } from "child_process";
import fs from "fs";
import sharp from "sharp";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const OUT = "docs/screenshots";
const W = 1440, H = 900;

// Each shot: where to go, what to scroll to, and the file it becomes.
const SHOTS = JSON.parse(fs.readFileSync("docs/screenshots.json", "utf8"));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--disable-gpu", "--hide-scrollbars",
  `--window-size=${W},${H}`, "--no-first-run", "--no-default-browser-check",
  "--user-data-dir=/tmp/ws-shots-profile", "about:blank",
], { stdio: "ignore" });

async function cdpTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find(t => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome did not expose a CDP target");
}

const ws = new WebSocket(await cdpTarget());
await new Promise(r => ws.addEventListener("open", r, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => {
  const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
});

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });

fs.mkdirSync(OUT, { recursive: true });

for (const s of SHOTS) {
  await send("Page.navigate", { url: s.url });
  await sleep(s.wait ?? 5000);
  if (s.scrollTo) {
    await send("Runtime.evaluate", { expression:
      `(()=>{const el=document.querySelector(${JSON.stringify(s.scrollTo)});
         if(el) window.scrollTo({top: el.getBoundingClientRect().top + window.scrollY - ${s.offset ?? 0}, behavior:'instant'});
         return !!el;})()` });
    await sleep(1800);
  }
  // Let lazy media that just entered the viewport settle before the shutter.
  await sleep(1200);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  // Captured at 2x for sharpness, then halved and recompressed: the raw set is ~10MB, which is a
  // lot of repo weight for images a README renders about 400px wide.
  const shot = await sharp(Buffer.from(data, "base64"))
    .resize(1600).png({ compressionLevel: 9, effort: 10, palette: true, quality: 90 }).toBuffer();
  fs.writeFileSync(`${OUT}/${s.file}`, shot);
  console.log(`  ${s.file.padEnd(28)} ${(fs.statSync(`${OUT}/${s.file}`).size/1024).toFixed(0)}KB  ${s.url}`);
}

ws.close(); chrome.kill();
process.exit(0);
