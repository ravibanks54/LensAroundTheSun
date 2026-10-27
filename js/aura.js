/* ============================================================
   Lens Around the Sun — Aura Cam
   Live webcam + a reactive "aura" field and chromatic distortion.
   Everything runs locally in the browser — no frames leave the device.
   Vanilla JS, Canvas 2D, no build step.
   ============================================================ */
(() => {
  'use strict';

  // ---------- Elements ----------
  const view      = document.getElementById('view');
  const ctx       = view.getContext('2d');
  const video     = document.getElementById('cam');
  const stage     = document.getElementById('stage');
  const startWrap = document.getElementById('startWrap');
  const startBtn  = document.getElementById('startBtn');
  const startMsg  = document.getElementById('startMsg');
  const toolbar   = document.getElementById('toolbar');
  const moodRow   = document.getElementById('moods');
  const intensityEl = document.getElementById('intensity');
  const distortEl   = document.getElementById('distort');
  const mirrorBtn = document.getElementById('mirrorBtn');
  const flipBtn   = document.getElementById('flipBtn');
  const shotBtn   = document.getElementById('shotBtn');
  const readingEl = document.getElementById('reading');
  const readName  = document.getElementById('readName');
  const readTrait = document.getElementById('readTrait');
  const strip     = document.getElementById('strip');
  const flash     = document.getElementById('flash');

  // ---------- Config ----------
  const SW = 96, SH = 72;                 // sampling resolution (motion/brightness)
  const MAXW = 1100;                      // cap backing-store width for perf
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Aura palettes: three energy stops, low -> high  (r,g,b)
  const PALETTES = {
    solar:    [[60, 12, 0],  [232, 96, 22],  [255, 212, 120]],
    cosmic:   [[32, 0, 54],  [150, 42, 205],  [96, 232, 255]],
    electric: [[0, 22, 62],  [42, 142, 255],  [205, 246, 255]],
    ethereal: [[44, 10, 44], [232, 122, 200], [182, 255, 222]],
    toxic:    [[10, 42, 0],  [122, 220, 30],  [232, 255, 122]],
  };

  // ---------- State ----------
  const S = {
    running: false,
    facing: 'user',
    mirror: true,
    mood: 'auto',
    intensity: 0.72,
    distort: 0.45,
    palette: PALETTES.cosmic.map((c) => c.slice()),
    stream: null,
  };

  // ---------- Offscreen canvases ----------
  const vcan = document.createElement('canvas');          // mirrored video, backing size
  const vctx = vcan.getContext('2d');
  const tcan = document.createElement('canvas');          // channel-tint scratch
  const tctx = tcan.getContext('2d');
  const samp = document.createElement('canvas');          // tiny sample
  const sctx = samp.getContext('2d', { willReadFrequently: true });
  samp.width = SW; samp.height = SH;
  const aura = document.createElement('canvas');          // tiny energy/aura field
  const actx = aura.getContext('2d');
  aura.width = SW; aura.height = SH;
  const auraImg = actx.createImageData(SW, SH);

  const prevGray = new Float32Array(SW * SH);
  let haveFrame = false;

  // grain tile (built once)
  const grain = (() => {
    const g = document.createElement('canvas');
    g.width = g.height = 128;
    const gc = g.getContext('2d');
    const img = gc.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gc.putImageData(img, 0, 0);
    return g;
  })();
  let grainPattern = null;

  let W = 0, H = 0;

  // ============================================================
  // Sizing
  // ============================================================
  function resize() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.round(r.width * dpr);
    let h = Math.round(r.height * dpr);
    if (w > MAXW) { h = Math.round(h * (MAXW / w)); w = MAXW; }
    if (w < 2 || h < 2) return;
    W = w; H = h;
    view.width = vcan.width = tcan.width = W;
    view.height = vcan.height = tcan.height = H;
    grainPattern = ctx.createPattern(grain, 'repeat');
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);

  // ============================================================
  // Color helpers
  // ============================================================
  function auraColor(t, p, out) {
    // t in 0..1 lerped across three stops
    let a, b, f;
    if (t < 0.5) { a = p[0]; b = p[1]; f = t * 2; }
    else { a = p[1]; b = p[2]; f = (t - 0.5) * 2; }
    out[0] = a[0] + (b[0] - a[0]) * f;
    out[1] = a[1] + (b[1] - a[1]) * f;
    out[2] = a[2] + (b[2] - a[2]) * f;
  }

  function hslToRgb(h, s, l) {
    h /= 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const pp = 2 * l - q;
    const hue = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return pp + (q - pp) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6;
      return pp;
    };
    return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
  }

  function rgbToHue(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d === 0) return -1; // greyscale, no meaningful hue
    let h;
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
    return h;
  }

  // Aura reading by dominant hue
  const READINGS = [
    [0,   'Crimson',  'Passion, courage, raw drive'],
    [40,  'Amber',    'Warmth, confidence, vitality'],
    [70,  'Gold',     'Optimism, playfulness, ease'],
    [160, 'Emerald',  'Growth, balance, healing'],
    [200, 'Teal',     'Calm, clarity, open mind'],
    [255, 'Indigo',   'Intuition, depth, quiet focus'],
    [300, 'Violet',   'Imagination, mystery, vision'],
    [340, 'Rose',     'Love, tenderness, connection'],
    [361, 'Crimson',  'Passion, courage, raw drive'],
  ];
  function readingFor(hue) {
    if (hue < 0) return ['Silver', 'Still, neutral, present'];
    for (const [max, name, trait] of READINGS) if (hue < max) return [name, trait];
    return ['Crimson', 'Passion, courage, raw drive'];
  }

  // ============================================================
  // Render loop
  // ============================================================
  let t = 0, readTick = 0;

  function draw() {
    if (!S.running) return;
    requestAnimationFrame(draw);
    if (video.readyState < 2 || !W) return;
    t += 1;

    // --- 1. mirrored video, cover-fit, into vcan ---
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(W / vw, H / vh);
    const dw = vw * scale, dh = vh * scale;
    const ox = (W - dw) / 2, oy = (H - dh) / 2;
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.clearRect(0, 0, W, H);
    if (S.mirror) vctx.setTransform(-1, 0, 0, 1, W, 0);
    vctx.drawImage(video, ox, oy, dw, dh);
    vctx.setTransform(1, 0, 0, 1, 0, 0);

    // --- 2. sample small, compute energy field + motion ---
    sctx.drawImage(vcan, 0, 0, SW, SH);
    const px = sctx.getImageData(0, 0, SW, SH).data;
    const out = auraImg.data;
    const col = [0, 0, 0];
    const gain = 1.1 + S.intensity * 1.6;
    let ar = 0, ag = 0, ab = 0, acount = 0, totalMotion = 0;

    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const gray = (r + g + b) / 3;
      const motion = Math.min(1, Math.abs(gray - prevGray[j]) / 255 * 6);
      prevGray[j] = gray;
      totalMotion += motion;

      let e = (gray / 255) * 0.42 + motion * 0.85;
      e = Math.min(1, e * gain);

      auraColor(e, S.palette, col);
      out[i]     = col[0];
      out[i + 1] = col[1];
      out[i + 2] = col[2];
      out[i + 3] = Math.min(255, e * S.intensity * 320);

      // accumulate colour for auto reading (skip very dark pixels)
      if (gray > 45) { ar += r; ag += g; ab += b; acount++; }
    }
    actx.putImageData(auraImg, 0, 0);

    // --- 3. composite onto view ---
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#060507';
    ctx.fillRect(0, 0, W, H);

    // chromatic aberration (RGB split), scaled by distortion + live motion
    const avgMotion = totalMotion / (SW * SH);
    const wob = reduceMotion ? 0 : 1;
    const base = S.distort * (W * 0.012);
    const off = base * (0.6 + avgMotion * 9) + (reduceMotion ? 0 : Math.sin(t * 0.05) * base * 0.4);
    const dy = reduceMotion ? 0 : Math.cos(t * 0.045) * off * 0.35;

    ctx.globalCompositeOperation = 'lighter';
    drawChannel(-off, -dy, 'rgb(255,0,0)');
    drawChannel(0, 0, 'rgb(0,255,0)');
    drawChannel(off, dy, 'rgb(0,0,255)');

    // aura field: big soft glow + sharper core, with a breathing wobble
    const pad = W * 0.14;
    const sw = reduceMotion ? 0 : Math.sin(t * 0.03) * pad * 0.5 * (0.5 + S.distort);
    const sh = reduceMotion ? 0 : Math.cos(t * 0.027) * pad * 0.5 * (0.5 + S.distort);

    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = `blur(${Math.max(16, W * 0.03)}px)`;
    ctx.drawImage(aura, -pad + sw, -pad + sh, W + pad * 2, H + pad * 2);
    ctx.filter = `blur(${Math.max(5, W * 0.008)}px)`;
    ctx.globalAlpha = 0.6 + S.intensity * 0.4;
    ctx.drawImage(aura, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';

    // vignette
    ctx.globalCompositeOperation = 'source-over';
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // grain
    if (grainPattern) {
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = grainPattern;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // --- 4. aura reading (throttled) ---
    if (++readTick >= 18 && acount > 0) {
      readTick = 0;
      let hue, nm, tr;
      if (S.mood === 'auto') {
        hue = rgbToHue(ar / acount, ag / acount, ab / acount);
        [nm, tr] = readingFor(hue);
        if (hue >= 0) rebuildAutoPalette(hue);
      } else {
        const p = S.palette[1];
        hue = rgbToHue(p[0], p[1], p[2]);
        [nm, tr] = readingFor(hue);
      }
      readName.textContent = nm;
      readTrait.textContent = tr;
    }

    haveFrame = true;
  }

  function drawChannel(dx, dy, tint) {
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = 'source-over';
    tctx.clearRect(0, 0, W, H);
    tctx.drawImage(vcan, 0, 0);
    tctx.globalCompositeOperation = 'multiply';
    tctx.fillStyle = tint;
    tctx.fillRect(0, 0, W, H);
    ctx.drawImage(tcan, dx, dy);
  }

  function rebuildAutoPalette(hue) {
    S.palette = [
      hslToRgb(hue, 0.7, 0.12),
      hslToRgb(hue, 0.85, 0.45),
      hslToRgb((hue + 25) % 360, 0.9, 0.8),
    ];
  }

  // ============================================================
  // Camera control
  // ============================================================
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return fail('This browser does not support camera access.');
    }
    if (!window.isSecureContext) {
      return fail('The camera needs a secure context. Open this page over https, ' +
        'or run a local server: <code>python3 -m http.server 8000</code> then visit ' +
        '<code>http://localhost:8000/aura.html</code>.');
    }
    startBtn.disabled = true;
    startBtn.textContent = 'Opening camera…';
    try {
      stopStream();
      S.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: S.facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = S.stream;
      await video.play();
      resize();
      S.running = true;
      startWrap.hidden = true;
      toolbar.hidden = false;
      readingEl.hidden = false;
      requestAnimationFrame(draw);
    } catch (err) {
      const msg = err && err.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in your browser, then try again.'
        : err && err.name === 'NotFoundError'
          ? 'No camera was found on this device.'
          : 'Could not start the camera: ' + (err && err.message ? err.message : err);
      fail(msg);
    }
  }

  function fail(html) {
    S.running = false;
    startBtn.disabled = false;
    startBtn.textContent = 'Try again';
    startMsg.innerHTML = html;
    startMsg.hidden = false;
    startWrap.hidden = false;
  }

  function stopStream() {
    if (S.stream) { S.stream.getTracks().forEach((tk) => tk.stop()); S.stream = null; }
  }

  // ============================================================
  // Capture
  // ============================================================
  function capture() {
    if (!haveFrame) return;
    const url = view.toDataURL('image/png');
    // flash
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    // download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aura-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    // thumbnail
    const th = document.createElement('a');
    th.href = url; th.download = a.download; th.className = 'thumb';
    th.title = 'Download again';
    const img = new Image(); img.src = url; img.alt = 'Captured aura photo';
    th.appendChild(img);
    strip.prepend(th);
    strip.hidden = false;
    while (strip.children.length > 12) strip.lastChild.remove();
  }

  // ============================================================
  // Controls wiring
  // ============================================================
  startBtn.addEventListener('click', startCamera);

  // mood chips
  Object.keys(PALETTES).concat([]); // keep order; build in HTML already, just wire
  moodRow.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mood]');
    if (!btn) return;
    S.mood = btn.dataset.mood;
    [...moodRow.children].forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
    if (S.mood !== 'auto') S.palette = PALETTES[S.mood].map((c) => c.slice());
  });

  intensityEl.addEventListener('input', () => { S.intensity = +intensityEl.value / 100; });
  distortEl.addEventListener('input', () => { S.distort = +distortEl.value / 100; });

  mirrorBtn.addEventListener('click', () => {
    S.mirror = !S.mirror;
    mirrorBtn.setAttribute('aria-pressed', String(S.mirror));
  });

  flipBtn.addEventListener('click', () => {
    S.facing = S.facing === 'user' ? 'environment' : 'user';
    if (S.running) startCamera();
  });

  shotBtn.addEventListener('click', capture);

  // keyboard: space / C to capture
  window.addEventListener('keydown', (e) => {
    if (!S.running) return;
    if (e.code === 'Space' || e.key.toLowerCase() === 'c') { e.preventDefault(); capture(); }
  });

  window.addEventListener('pagehide', stopStream);
})();
