// =====================================================================
// fx.js — particles background + DNA-helix signature (zero deps)
// =====================================================================
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Particles background -----------------------------------------
  const canvas = document.getElementById("particles");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let w, h, parts;
    const COLORS = ["#22E5C9", "#7C5CFC", "#FF4D9D"];
    function resize() {
      w = canvas.width = innerWidth * devicePixelRatio;
      h = canvas.height = innerHeight * devicePixelRatio;
      const n = Math.min(90, Math.floor((innerWidth * innerHeight) / 16000));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25 * devicePixelRatio,
        vy: (Math.random() - 0.5) * 0.25 * devicePixelRatio,
        r: (Math.random() * 1.6 + 0.6) * devicePixelRatio,
        c: COLORS[(Math.random() * COLORS.length) | 0],
      }));
    }
    function tick() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 7);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = 0.55;
        ctx.fill();
        for (let j = i + 1; j < parts.length; j++) {
          const q = parts[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          const max = 120 * devicePixelRatio;
          if (d2 < max * max) {
            ctx.globalAlpha = (1 - Math.sqrt(d2) / max) * 0.18;
            ctx.strokeStyle = p.c;
            ctx.lineWidth = devicePixelRatio;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      if (!reduce) requestAnimationFrame(tick);
    }
    addEventListener("resize", resize);
    resize();
    tick();
  }

  // ---- DNA helix signature ------------------------------------------
  // Renders a vertical double-helix whose rungs are spectrum bars.
  window.renderHelix = function (el, opts) {
    opts = opts || {};
    const W = opts.w || 300, H = opts.h || 360;
    const c = document.createElement("canvas");
    c.width = W * devicePixelRatio; c.height = H * devicePixelRatio;
    c.style.width = W + "px"; c.style.height = H + "px";
    el.innerHTML = ""; el.appendChild(c);
    const x = c.getContext("2d");
    x.scale(devicePixelRatio, devicePixelRatio);
    let t = 0;
    const N = 26, amp = W * 0.32, midX = W / 2;
    function grad(a) {
      const g = x.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, "rgba(34,229,201," + a + ")");
      g.addColorStop(0.55, "rgba(124,92,252," + a + ")");
      g.addColorStop(1, "rgba(255,77,157," + a + ")");
      return g;
    }
    function draw() {
      x.clearRect(0, 0, W, H);
      for (let i = 0; i < N; i++) {
        const p = i / (N - 1);
        const y = p * (H - 30) + 15;
        const ph = p * Math.PI * 4 + t;
        const x1 = midX + Math.sin(ph) * amp;
        const x2 = midX + Math.sin(ph + Math.PI) * amp;
        // rung = spectrum bar; thickness pulses
        const pulse = 0.5 + 0.5 * Math.sin(ph * 2 + t * 1.5);
        x.strokeStyle = grad(0.25 + pulse * 0.5);
        x.lineWidth = 2 + pulse * 3;
        x.beginPath(); x.moveTo(x1, y); x.lineTo(x2, y); x.stroke();
        // backbone nodes
        for (const xx of [x1, x2]) {
          x.beginPath();
          x.arc(xx, y, 3 + pulse * 1.5, 0, 7);
          x.fillStyle = grad(0.9);
          x.fill();
        }
      }
      t += 0.025;
      if (!reduce) requestAnimationFrame(draw);
    }
    draw();
  };
})();
