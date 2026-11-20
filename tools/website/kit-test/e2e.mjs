// The site kit (website/kit/) in real headless browsers: its test page (demo.html) at phone,
// tablet and desktop widths, light and dark, left to right and right to left, with reduced
// motion, by mouse, keyboard and touch; and with no script at all.
//
//   PLAYWRIGHT_DIR=<…/node_modules/playwright> node tools/website/kit-test/e2e.mjs [--browsers=chromium,firefox]
//       [--widths=360,1280] [--shots=<dir>] [--verbose]
//
// Playwright isn't a dependency of the repository: point PLAYWRIGHT_DIR at any install of it
// (npm i playwright; npx playwright install chromium-headless-shell firefox). ffmpeg, when it's
// on PATH, makes the short clip the video case opens; without it that case is skipped.
// Checks, per browser: no script errors; the lightbox opens from a thumbnail and says where it is
// ("1 / 5", "1 of 5. …" for screen readers), takes the focus and gives it back; arrows, Home,
// End, Escape, the Back button; touch swipe, double tap, pinch, drag down to close; mouse click
// to zoom, drag to pan, wheel; nothing on the page moves when the scroll locks (header, a fixed
// element and a heading measured before, during and after) and the page never scrolls sideways;
// modals open, stack, close by Escape, backdrop and button (or only the button when told), give
// the focus back and share the lock with the lightbox.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
// The static server runs in a process of its own (`--serve=<clip>`): sharing one with the browsers'
// driver, it was sometimes too slow to take a connection under load and a page timed out.
if (args.serve) {
  const clipFile = String(args.serve);
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".webm": "video/webm", ".svg": "image/svg+xml" };
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = url === "/kit-test-clip.webm" ? clipFile : path.join(ROOT, url);
    if (!file.startsWith(ROOT) && file !== clipFile) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { "content-type": "text/html" }).end("<!doctype html><title>Not here</title><p>404"); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(data);
    });
  });
  srv.listen(0, "127.0.0.1", () => console.log(srv.address().port));
  process.stdin.on("end", () => process.exit(0));
  process.stdin.resume();
} else {
const PW = process.env.PLAYWRIGHT_DIR;
if (!PW) { console.error("Set PLAYWRIGHT_DIR to a playwright package folder (see the top of this file)."); process.exit(2); }
const pw = await import(pathToFileURL(path.join(PW, "index.mjs")).href);
const browsers = (args.browsers || "chromium,firefox").split(",");
const shots = args.shots ? path.resolve(args.shots) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

// ---- A static server over the repository (its own process), and the clip ------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kit-e2e-"));
const clip = path.join(tmp, "clip.webm");
const ff = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25", "-t", "2", "-c:v", "libvpx", "-b:v", "300k", clip]);
const haveClip = ff.status === 0 && fs.existsSync(clip);
const server = spawn(process.execPath, [fileURLToPath(import.meta.url), `--serve=${clip}`], { stdio: ["pipe", "pipe", "inherit"] });
const port = await new Promise((r) => server.stdout.once("data", (d) => r(String(d).trim())));
const BASE = `http://127.0.0.1:${port}/tools/website/kit-test/demo.html`;

// ---- Checks ----------------------------------------------------------------------------------
let failed = 0;
const rows = [];
function check(name, ok, info = "") {
  rows.push([ok ? "ok" : "FAIL", name, info]);
  if (!ok) failed++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function state(page) {
  return page.evaluate(() => {
    const d = document.querySelector("dialog.kit-lb");
    const a = document.activeElement;
    return {
      open: !!(d && d.open),
      count: d ? d.querySelector(".kit-lb-count").textContent : "",
      live: d ? d.querySelector("[role=status]").textContent : "",
      cap: d ? d.querySelector(".kit-lb-cap").textContent : "",
      zoomed: !!(d && d.classList.contains("kit-lb-zoomed")),
      focus: a ? (a.id || a.className || a.tagName) : "",
      locked: document.documentElement.classList.contains("kit-locked"),
      sideways: document.scrollingElement.scrollWidth - document.documentElement.clientWidth,
      modals: [...document.querySelectorAll("dialog.kit-modal[open]")].map((m) => m.id),
      errors: window.KIT_ERRORS.slice(),
      url: location.href,
    };
  });
}
// Where the things that must not move are.
async function marks(page) {
  return page.evaluate(() => ["hdr", "fixed"].map((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10].join(",");
  }).concat([(() => { const r = document.querySelector("h1").getBoundingClientRect(); return r.left + "," + r.width; })()]).join(" | "));
}
async function settled(page) { await wait(450); }

// Touch: real touch events through the DevTools protocol in Chromium; pointer events made in the
// page elsewhere (Playwright has no multi-touch for Firefox).
async function touch(page, cdp, steps) {
  if (cdp) {
    for (const s of steps) {
      await cdp.send("Input.dispatchTouchEvent", { type: s.type, touchPoints: s.points.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
      await wait(16);
    }
    return;
  }
  await page.evaluate((steps) => {
    const dlg = document.querySelector("dialog.kit-lb");
    let prev = [];
    for (const s of steps) {
      const pts = s.points;
      const type = { touchStart: "pointerdown", touchMove: "pointermove", touchEnd: "pointerup" }[s.type];
      const list = s.type === "touchEnd" ? prev : pts;
      list.forEach((p, i) => {
        if (s.type === "touchStart" && prev[i]) return;
        const target = document.elementFromPoint(p[0], p[1]) || dlg;
        target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 10 + i, pointerType: "touch", isPrimary: i === 0, clientX: p[0], clientY: p[1], button: 0, buttons: type === "pointerup" ? 0 : 1 }));
      });
      prev = s.type === "touchEnd" ? [] : pts;
    }
  }, steps);
}
function swipe(x0, y0, x1, y1, n = 8) {
  const s = [{ type: "touchStart", points: [[x0, y0]] }];
  for (let i = 1; i <= n; i++) s.push({ type: "touchMove", points: [[x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]] });
  s.push({ type: "touchEnd", points: [] });
  return s;
}

async function run(name) {
  const type = pw[name];
  const browser = await type.launch();
  const sizes = [[360, 740], [390, 844], [768, 1024], [1280, 800], [1440, 900]].filter(([w]) => !args.widths || args.widths.split(",").includes(String(w)));
  for (const [w, h] of sizes) {
    for (const variant of ["", "?dark", "?rtl", "?rtl&dark"]) {
      const mobile = w < 800;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile && name === "chromium", deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.setDefaultTimeout(5000);
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      await page.goto(BASE + variant, { timeout: 60000 });
      await page.waitForFunction(() => window.SiteKit && SiteKit.lightbox, null, { timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      const tag = `${name} ${w}x${h}${variant || " light"}`;
      try {
      const rtl = variant.includes("rtl");
      const fwd = rtl ? "ArrowLeft" : "ArrowRight";

      // Open by click, counter, live region, focus.
      await page.evaluate(() => window.scrollTo(0, 120));
      const before = await marks(page);
      await page.click("#g1 img");
      await settled(page);
      let s = await state(page);
      const during = await marks(page);
      check(`${tag}: opens`, s.open && s.count === "1 / 5" && s.live.startsWith("1 of 5") && s.locked, `${s.count} | ${s.live}`);
      check(`${tag}: focus in viewer`, s.focus.includes("kit-lb-close"), s.focus);
      check(`${tag}: nothing moved on lock`, before === during, `${before} -> ${during}`);
      check(`${tag}: no sideways scroll`, s.sideways <= 0, String(s.sideways));
      const bg = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector(".kit-lb-bg")); return [cs.backgroundColor, cs.backdropFilter || cs.webkitBackdropFilter || "none"]; });
      const alpha = +(bg[0].match(/[\d.]+(?=\))/) || [1])[0];
      check(`${tag}: calm backdrop`, alpha >= 0.9 && /blur/.test(bg[1]), bg.join(" | "));
      if (shots && (variant === "" || variant === "?rtl&dark")) await page.screenshot({ path: path.join(shots, `${name}-${w}${variant.replace(/[?&]/g, "-") || "-light"}-open.png`) });

      // Keys.
      await page.keyboard.press(fwd);
      await settled(page);
      s = await state(page);
      check(`${tag}: ${fwd} goes on`, s.count === "2 / 5", s.count);
      await page.keyboard.press("End");
      s = await state(page);
      check(`${tag}: End`, s.count === "5 / 5", s.count);
      if (haveClip) {
        const v = await page.evaluate(() => { const m = document.querySelector(".kit-lb-slide[aria-hidden=false] video"); return m ? { controls: m.controls, src: m.getAttribute("src"), paused: m.paused } : null; });
        check(`${tag}: video slide`, !!v && v.controls, JSON.stringify(v));
      }
      await page.keyboard.press("Home");
      s = await state(page);
      check(`${tag}: Home`, s.count === "1 / 5", s.count);
      await page.keyboard.press("+");
      await settled(page);
      s = await state(page);
      check(`${tag}: + zooms`, s.zoomed);
      await page.keyboard.press("0");
      await settled(page);
      await page.keyboard.press("Escape");
      await settled(page);
      s = await state(page);
      const after = await marks(page);
      check(`${tag}: Escape closes, focus back`, !s.open && !s.locked && s.focus === "g1", s.focus);
      check(`${tag}: nothing moved after close`, before === after, `${before} -> ${after}`);

      // The Back button closes it and stays on the page.
      await page.click("#g2 img");
      await settled(page);
      await page.goBack();
      await settled(page);
      s = await state(page);
      check(`${tag}: Back closes`, !s.open && s.url.startsWith(BASE), s.url);

      // Touch.
      if (mobile) {
        const cdp = name === "chromium" ? await ctx.newCDPSession(page) : null;
        await page.click("#g1 img");
        await settled(page);
        await touch(page, cdp, swipe(w * 0.8, h / 2, w * 0.15, h / 2));
        await settled(page);
        s = await state(page);
        const want = rtl ? "5 / 5" : "2 / 5";
        check(`${tag}: swipe left`, s.count === want, `${s.count} (want ${want})`);
        await touch(page, cdp, swipe(w * 0.2, h / 2, w * 0.85, h / 2));
        await settled(page);
        s = await state(page);
        check(`${tag}: swipe right back`, s.count === "1 / 5", s.count);
        // Double tap on the picture zooms; again unzooms.
        const c = await page.evaluate(() => { const r = document.querySelector(".kit-lb-slide[aria-hidden=false] .kit-lb-media").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
        const tapTwice = [{ type: "touchStart", points: [c] }, { type: "touchEnd", points: [] }, { type: "touchStart", points: [c] }, { type: "touchEnd", points: [] }];
        await touch(page, cdp, tapTwice);
        await settled(page);
        s = await state(page);
        check(`${tag}: double tap zooms`, s.zoomed);
        await touch(page, cdp, tapTwice);
        await settled(page);
        s = await state(page);
        check(`${tag}: double tap unzooms`, !s.zoomed);
        // Pinch out.
        const pinch = [{ type: "touchStart", points: [[c[0] - 20, c[1]], [c[0] + 20, c[1]]] }];
        for (let i = 1; i <= 8; i++) pinch.push({ type: "touchMove", points: [[c[0] - 20 - i * 12, c[1]], [c[0] + 20 + i * 12, c[1]]] });
        pinch.push({ type: "touchEnd", points: [] });
        await touch(page, cdp, pinch);
        await settled(page);
        s = await state(page);
        check(`${tag}: pinch zooms`, s.zoomed);
        await page.keyboard.press("0");
        await settled(page);
        // Drag down closes.
        await touch(page, cdp, swipe(w / 2, h / 2, w / 2 + 10, h / 2 + 260));
        await wait(700);
        s = await state(page);
        check(`${tag}: drag down closes`, !s.open && !s.locked);
      } else {
        // Mouse: click the picture zooms, drag pans, a click beside it closes.
        await page.click("#g1 img");
        await settled(page);
        const r = await page.evaluate(() => { const b = document.querySelector(".kit-lb-slide[aria-hidden=false] .kit-lb-media").getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
        await page.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2);
        await settled(page);
        s = await state(page);
        check(`${tag}: click zooms`, s.zoomed);
        const t0 = await page.evaluate(() => document.querySelector(".kit-lb-slide[aria-hidden=false] .kit-lb-media").style.transform);
        await page.mouse.move(w / 2, h / 2);
        await page.mouse.down();
        await page.mouse.move(w / 2 - 120, h / 2 - 60, { steps: 6 });
        await page.mouse.up();
        await settled(page);
        const t1 = await page.evaluate(() => document.querySelector(".kit-lb-slide[aria-hidden=false] .kit-lb-media").style.transform);
        check(`${tag}: drag pans`, t0 !== t1 && (await state(page)).zoomed);
        await page.keyboard.press("0");
        await settled(page);
        await page.mouse.move(w / 2, h / 2);
        await page.mouse.wheel(0, -400);
        await settled(page);
        s = await state(page);
        check(`${tag}: wheel zooms`, s.zoomed);
        await page.keyboard.press("0");
        await settled(page);
        await page.mouse.click(8, h / 2);
        await settled(page);
        s = await state(page);
        check(`${tag}: click beside closes`, !s.open);
      }

      // Article pictures: a group of their own; links to pages and skipped ones stay out.
      await page.click("#p1");
      await settled(page);
      s = await state(page);
      check(`${tag}: article group`, s.count === "1 / 4" && s.cap.startsWith("Progress"), `${s.count} | ${s.cap}`);
      await page.keyboard.press("Escape");
      await settled(page);
      s = await state(page);
      check(`${tag}: focus back on a bare picture`, s.focus === "p1", s.focus);
      await page.keyboard.press("Enter");
      await settled(page);
      check(`${tag}: Enter on a picture opens`, (await state(page)).open);
      await page.keyboard.press("Escape");
      await settled(page);

      // Modals: open, stack, Escape takes the top one, backdrop, the lightbox over a modal.
      await page.click("#open-m1");
      await settled(page);
      s = await state(page);
      check(`${tag}: modal opens`, s.modals.join() === "m1" && s.locked);
      await page.click("#open-m2");
      await settled(page);
      check(`${tag}: modal over modal`, (await state(page)).modals.join() === "m1,m2");
      await page.keyboard.press("Escape");
      await settled(page);
      s = await state(page);
      check(`${tag}: Escape closes the top one`, s.modals.join() === "m1" && s.focus === "open-m2" && s.locked, `${s.modals} ${s.focus}`);
      await page.click("#m1img");
      await settled(page);
      s = await state(page);
      check(`${tag}: lightbox over a modal`, s.open && s.modals.join() === "m1");
      await page.keyboard.press("Escape");
      await settled(page);
      s = await state(page);
      check(`${tag}: lightbox closes, modal stays`, !s.open && s.modals.join() === "m1" && s.locked);
      await page.mouse.click(4, 4);
      await settled(page);
      s = await state(page);
      check(`${tag}: backdrop closes, focus back`, s.modals.length === 0 && !s.locked && s.focus === "open-m1", `${s.modals} ${s.focus}`);
      await page.click("#open-m4");
      await settled(page);
      await page.keyboard.press("Escape");
      await page.mouse.click(4, 4);
      await settled(page);
      check(`${tag}: data-dismiss="" ignores Escape and backdrop`, (await state(page)).modals.join() === "m4");
      await page.click("#close-m4");
      await settled(page);
      check(`${tag}: its button closes it`, (await state(page)).modals.length === 0);
      await page.click("#open-m3");
      await settled(page);
      const sheet = await page.evaluate(() => { const r = document.getElementById("m3").getBoundingClientRect(); return [Math.round(r.bottom), Math.round(r.width)]; });
      if (w <= 640) check(`${tag}: sheet sits on the bottom edge`, Math.abs(sheet[0] - h) <= 1 && sheet[1] === w, sheet.join());
      if (shots && (variant === "" || variant === "?rtl&dark") && (w === 390 || w === 1280)) await page.screenshot({ path: path.join(shots, `${name}-${w}${variant.replace(/[?&]/g, "-") || "-light"}-sheet.png`) });
      await page.keyboard.press("Escape");
      await settled(page);

      s = await state(page);
      check(`${tag}: no script errors`, errs.length === 0 && s.errors.length === 0, errs.concat(s.errors).join(" / "));
      } catch (e) {
        check(`${tag}: ran to the end`, false, e.message.split("\n")[0] + " " + JSON.stringify(await state(page).catch(() => ({}))));
      }
      await ctx.close();
    }
  }

  // Reduced motion: the picture fades, it doesn't fly.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForFunction(() => window.SiteKit && SiteKit.lightbox, null, { timeout: 30000 });
    await page.click("#g1 img");
    const frames = await page.evaluate(() => document.querySelector(".kit-lb-slide[aria-hidden=false] .kit-lb-media").getAnimations().map((a) => Object.keys(a.effect.getKeyframes()[0]).join(",")));
    check(`${name} reduced motion: fades only`, frames.length > 0 && frames.every((k) => !k.includes("transform")), frames.join(" / "));
    const solid = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector(".kit-lb-bg")); return [cs.backgroundColor, cs.backdropFilter || "none"]; });
    check(`${name} reduced motion: solid backdrop, no blur`, solid[1] === "none" && +(solid[0].match(/[\d.]+(?=\))/) || [1])[0] >= 0.98, solid.join(" | "));
    await page.keyboard.press(fwd(false));
    await settled(page);
    const tr = await page.evaluate(() => getComputedStyle(document.querySelector(".kit-lb-track")).transitionDuration);
    check(`${name} reduced motion: no slide`, (await state(page)).count === "2 / 5" && tr === "0s", tr);
    await ctx.close();
  }

  // Keyboard only: Tab to a thumbnail, Enter opens, Tab stays inside, Escape gives the focus back;
  // the same for a modal opened with Enter.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForFunction(() => window.SiteKit && SiteKit.lightbox, null, { timeout: 30000 });
    let id = "";
    for (let i = 0; i < 12 && id !== "g1"; i++) { await page.keyboard.press("Tab"); id = await page.evaluate(() => document.activeElement.id); }
    await page.keyboard.press("Enter");
    await settled(page);
    let s = await state(page);
    const inside = [];
    for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); inside.push(await page.evaluate(() => !!document.activeElement.closest("dialog.kit-lb") || document.activeElement === document.body)); }
    check(`${name} keyboard: Tab, Enter opens, Tab stays inside`, id === "g1" && s.open && inside.every(Boolean), `${id} ${inside}`);
    await page.keyboard.press("Escape");
    await settled(page);
    s = await state(page);
    check(`${name} keyboard: Escape, focus back`, !s.open && s.focus === "g1", s.focus);
    await page.focus("#open-m1");
    await page.keyboard.press("Enter");
    await settled(page);
    s = await state(page);
    check(`${name} keyboard: Enter opens a modal, focus inside`, s.modals.join() === "m1" && (await page.evaluate(() => !!document.activeElement.closest("#m1"))));
    await page.keyboard.press("Escape");
    await settled(page);
    s = await state(page);
    check(`${name} keyboard: Escape closes it, focus back`, s.modals.length === 0 && s.focus === "open-m1", s.focus);
    await ctx.close();
  }

  // The accessibility tree of the open viewer.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForFunction(() => window.SiteKit && SiteKit.lightbox, null, { timeout: 30000 });
    await page.click("#g1 img");
    await settled(page);
    const tree = await page.locator("dialog.kit-lb").ariaSnapshot();
    check(`${name} accessibility tree`, /dialog "Image viewer"/.test(tree) && /button "Close"/.test(tree) && /button "Next image"/.test(tree) && /status: 1 of 5/.test(tree), tree.replace(/\n/g, " ⏎ "));
    const pageTree = await page.evaluate(() => [...document.querySelectorAll("#prose img[role=button]")].map((i) => i.id).join());
    check(`${name} bare pictures are buttons`, pageTree === "p1,p2,p5", pageTree);
    await page.keyboard.press("Escape");
    await settled(page);
    // A javascript: or data: source in the markup is refused: the thumbnail's own picture opens.
    for (const id of ["p5", "p6"]) {
      await page.click("#" + id);
      await settled(page);
      const src = await page.evaluate(() => { const m = document.querySelector(".kit-lb-slide[aria-hidden=false] .kit-lb-media"); return m ? m.currentSrc || m.src : ""; });
      const thumb = await page.evaluate((id) => document.getElementById(id).currentSrc, id);
      check(`${name} unsafe source refused (${id})`, src === thumb && /^http:/.test(src) && !(await page.evaluate(() => window.KIT_PWNED)), src);
      await page.keyboard.press("Escape");
      await settled(page);
    }
    await ctx.close();
  }

  // No script: the thumbnail's link opens the picture.
  {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await Promise.all([page.waitForURL(/main-light\.webp$/), page.click("#g1 img")]);
    check(`${name} no script: the link opens the picture`, page.url().endsWith("main-light.webp"), page.url());
    await ctx.close();
  }
  await browser.close();
}
function fwd(rtl) { return rtl ? "ArrowLeft" : "ArrowRight"; }

try {
  for (const b of browsers) await run(b);
} finally {
  server.stdin.end();
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
for (const r of rows) if (r[0] !== "ok" || args.verbose) console.log(r.join("  "));
console.log(`${rows.length - failed} of ${rows.length} checks passed${haveClip ? "" : " (no ffmpeg: the video case was skipped)"}`);
process.exit(failed ? 1 : 0);
}
