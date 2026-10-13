/* Thème : sombre par défaut, clair sur demande, choix mémorisé. */
(function () {
  var root = document.documentElement;
  var btn = document.querySelector(".theme");
  if (!btn) return;

  function sync() {
    var light = root.dataset.theme === "light";
    btn.textContent = light ? btn.dataset.dark : btn.dataset.light;
    btn.setAttribute("aria-label", light ? btn.dataset.toDark : btn.dataset.toLight);
  }

  btn.hidden = false;
  sync();
  btn.addEventListener("click", function () {
    var light = root.dataset.theme !== "light";
    if (light) root.dataset.theme = "light"; else delete root.dataset.theme;
    try { localStorage.setItem("theme", light ? "light" : "dark"); } catch (e) {}
    sync();
    document.dispatchEvent(new Event("themechange"));
  });
})();

/* Carte du réseau du hero.
   Le graphe est lu dans la page : chaque ligne [data-node] est un projet (ou le stage),
   ses technologies viennent de sa ligne .stack (ou de data-tech). Deux projets sont donc
   reliés seulement s'ils partagent réellement une technologie. */
(function () {
  var canvas = document.getElementById("net");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  var nodes = [], links = [], byId = {};

  function node(id, label, type, row) {
    if (byId[id]) return byId[id];
    var n = { id: id, label: label, type: type, row: row, links: [], x: 0, y: 0, dx: 0, dy: 0, hit: 0 };
    byId[id] = n;
    nodes.push(n);
    return n;
  }

  function link(a, b) {
    var l = { a: a, b: b };
    links.push(l);
    a.links.push(l);
    b.links.push(l);
  }

  var me = node("me", "Ibrahim Kakaev", "me", document.getElementById("contact"));
  Array.prototype.forEach.call(document.querySelectorAll("[data-node]"), function (row) {
    var hub = node("hub:" + row.dataset.node, row.dataset.node, "hub", row);
    var stack = row.querySelector(".stack");
    var source = row.dataset.tech || (stack ? stack.textContent : "");
    link(me, hub);
    source.split(/\s*[,\/]\s*/).forEach(function (name) {
      name = name.trim();
      if (name) link(hub, node("tech:" + name.toLowerCase(), name, "tech", null));
    });
  });
  if (nodes.length < 3) return;

  /* Placement par forces (Fruchterman-Reingold), calculé une fois, avec un hasard à graine
     fixe : la carte est identique à chaque visite. */
  var seed = 11;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  (function layout() {
    var k = Math.sqrt(4 / nodes.length);
    var i, j, a, b, dx, dy, d, f;
    nodes.forEach(function (n) {
      var ang = rnd() * Math.PI * 2;
      var r = n.type === "me" ? 0 : n.type === "hub" ? 0.45 : 0.9;
      n.x = Math.cos(ang) * r;
      n.y = Math.sin(ang) * r;
    });
    for (var it = 0; it < 500; it++) {
      var temp = 0.12 * (1 - it / 500) + 0.002;
      for (i = 0; i < nodes.length; i++) { nodes[i].dx = 0; nodes[i].dy = 0; }
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          b = nodes[j];
          dx = a.x - b.x; dy = a.y - b.y;
          d = Math.sqrt(dx * dx + dy * dy) || 0.001;
          f = (k * k) / d / d;
          a.dx += dx * f; a.dy += dy * f;
          b.dx -= dx * f; b.dy -= dy * f;
        }
        a.dx -= a.x * 0.35 * k;
        a.dy -= a.y * 0.35 * k;
      }
      for (i = 0; i < links.length; i++) {
        a = links[i].a; b = links[i].b;
        dx = a.x - b.x; dy = a.y - b.y;
        d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        f = (d / k) * (a === me || b === me ? 0.35 : 1.1);   // liens courts vers les technologies, longs vers le centre
        a.dx -= dx * f; a.dy -= dy * f;
        b.dx += dx * f; b.dy += dy * f;
      }
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        d = Math.sqrt(a.dx * a.dx + a.dy * a.dy) || 0.001;
        f = Math.min(d, temp) / d;
        a.x += a.dx * f;
        a.y += a.dy * f;
      }
    }
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    });
    nodes.forEach(function (n) {
      n.x = ((n.x - minX) / (maxX - minX)) * 2 - 1;
      n.y = ((n.y - minY) / (maxY - minY)) * 2 - 1;
      n.phase = rnd() * Math.PI * 2;
      n.freq = 0.5 + rnd() * 0.7;
    });
  })();

  var W = 0, H = 0, dpr = 1;
  var colors = {};
  var pointer = null;      // position de la souris dans le canvas, ou null
  var active = null;       // nœud survolé
  var shiftX = 0, shiftY = 0;
  var packets = [];
  var visible = true, frame = 0, last = 0, clock = 0;

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ["bg", "text", "muted", "accent", "edge", "node"].forEach(function (name) {
      colors[name] = cs.getPropertyValue("--" + name).trim();
    });
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function place(time) {
    var padX = W < 520 ? 40 : 64;
    var padY = 34;
    var scroll = Math.max(-40, -window.scrollY * 0.06);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.px = padX + ((n.x + 1) / 2) * (W - 2 * padX) + shiftX + Math.sin(time * 0.0007 * n.freq + n.phase) * 4;
      n.py = padY + ((n.y + 1) / 2) * (H - 2 * padY) + shiftY + scroll + Math.cos(time * 0.0006 * n.freq + n.phase) * 4;
    }
  }

  function isLit(n) {
    if (!active) return true;
    if (n === active) return true;
    for (var i = 0; i < active.links.length; i++) {
      if (active.links[i].a === n || active.links[i].b === n) return true;
    }
    return false;
  }

  function label(n, lit) {
    var hub = n.type !== "tech";
    ctx.font = hub ? (n.type === "me" ? "800 13px Syne, sans-serif" : (W < 520 ? "700 11px Syne, sans-serif" : "700 13px Syne, sans-serif"))
                   : '500 11px "IBM Plex Mono", monospace';
    var tw = ctx.measureText(n.label).width;
    var x = Math.min(Math.max(n.px, tw / 2 + 3), W - tw / 2 - 3);
    var y = hub ? n.py - 13 : n.py + 16;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors.bg;
    ctx.strokeText(n.label, x, y);
    ctx.fillStyle = hub ? colors.text : (lit && active ? colors.text : colors.muted);
    ctx.fillText(n.label, x, y);
  }

  function draw(time) {
    var i, n, l, lit;
    place(time);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.lineWidth = 1;
    for (i = 0; i < links.length; i++) {
      l = links[i];
      lit = active && (l.a === active || l.b === active);
      ctx.globalAlpha = active && !lit ? 0.3 : 1;
      ctx.strokeStyle = lit ? colors.text : colors.edge;
      ctx.beginPath();
      ctx.moveTo(l.a.px, l.a.py);
      ctx.lineTo(l.b.px, l.b.py);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.accent;
    ctx.strokeStyle = colors.accent;
    for (i = 0; i < packets.length; i++) {
      var p = packets[i];
      var from = p.dir > 0 ? p.link.a : p.link.b;
      var to = p.dir > 0 ? p.link.b : p.link.a;
      var x = from.px + (to.px - from.px) * p.t;
      var y = from.py + (to.py - from.py) * p.t;
      var tail = Math.max(0, p.t - 0.12);
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(from.px + (to.px - from.px) * tail, from.py + (to.py - from.py) * tail);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }

    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      lit = isLit(n);
      ctx.globalAlpha = lit ? 1 : 0.3;
      if (n.type === "tech") {
        ctx.fillStyle = n === active ? colors.accent : colors.node;
        ctx.beginPath();
        ctx.arc(n.px, n.py, n.links.length > 1 ? 4 : 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        var s = n.type === "me" ? 7 : 5;
        if (n.hit > 0.02) {
          ctx.globalAlpha = n.hit * (lit ? 1 : 0.3);
          ctx.strokeStyle = colors.accent;
          ctx.strokeRect(n.px - s - 6 * (1 - n.hit) - 2, n.py - s - 6 * (1 - n.hit) - 2,
                         2 * (s + 6 * (1 - n.hit) + 2), 2 * (s + 6 * (1 - n.hit) + 2));
          ctx.globalAlpha = lit ? 1 : 0.3;
        }
        ctx.fillStyle = n.type === "me" || n === active ? colors.accent : colors.bg;
        ctx.fillRect(n.px - s, n.py - s, 2 * s, 2 * s);
        ctx.strokeStyle = n.type === "me" || n === active ? colors.accent : colors.text;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(n.px - s, n.py - s, 2 * s, 2 * s);
        ctx.lineWidth = 1;
      }
    }

    /* Étiquettes : projets toujours ; technologies partagées sur grand canvas ; les autres au survol. */
    for (var pass = 0; pass < 2; pass++) {   // les noms de projets passent au-dessus des technologies
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        if ((n.type === "tech") !== (pass === 0)) continue;
        lit = isLit(n);
        var show = n.type === "hub" || (active ? lit : W >= 520 && (n.type === "me" || n.links.length > 1));
        if (!show) continue;
        ctx.globalAlpha = lit ? 1 : 0.3;
        label(n, lit);
      }
    }
    ctx.globalAlpha = 1;
  }

  function step(dt) {
    var max = W < 520 ? 12 : 26;
    if (packets.length < max && rnd() < dt * 0.006) {
      var pool = active && rnd() < 0.75 ? active.links : links;
      var l = pool[Math.floor(rnd() * pool.length)];
      var dir = active && pool === active.links ? (l.a === active ? 1 : -1) : (rnd() < 0.5 ? 1 : -1);
      packets.push({ link: l, dir: dir, t: 0, speed: 0.00045 + rnd() * 0.0005 });
    }
    for (var i = packets.length - 1; i >= 0; i--) {
      var p = packets[i];
      p.t += p.speed * dt;
      if (p.t >= 1) {
        (p.dir > 0 ? p.link.b : p.link.a).hit = 1;
        packets.splice(i, 1);
      }
    }
    for (i = 0; i < nodes.length; i++) nodes[i].hit *= Math.pow(0.996, dt);

    var tx = pointer ? (pointer.x / W - 0.5) * -14 : 0;
    var ty = pointer ? (pointer.y / H - 0.5) * -14 : 0;
    shiftX += (tx - shiftX) * Math.min(1, dt * 0.004);
    shiftY += (ty - shiftY) * Math.min(1, dt * 0.004);
  }

  function tick(now) {
    var dt = Math.min(now - last, 50);
    last = now;
    clock += dt;
    step(dt);
    draw(clock);
    frame = requestAnimationFrame(tick);
  }

  /* La boucle ne tourne que si la carte est à l'écran, l'onglet visible et le mouvement autorisé. */
  function update() {
    var run = visible && !document.hidden && !reduce.matches && W > 0;
    if (run && !frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    } else if (!run && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    if (!run && W > 0) {
      if (reduce.matches) { packets.length = 0; shiftX = 0; shiftY = 0; }
      draw(reduce.matches ? 0 : clock);
    }
  }

  function pick() {
    active = null;
    if (!pointer) return;
    var best = 30 * 30;
    for (var i = 0; i < nodes.length; i++) {
      var dx = nodes[i].px - pointer.x, dy = nodes[i].py - pointer.y;
      var d = dx * dx + dy * dy;
      if (d < best) { best = d; active = nodes[i]; }
    }
  }

  function onPointer(e) {
    var rect = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    pick();
    canvas.style.cursor = active && active.row ? "pointer" : "";
    if (!frame) draw(reduce.matches ? 0 : clock);
  }

  canvas.addEventListener("pointermove", onPointer);
  canvas.addEventListener("pointerdown", onPointer);
  canvas.addEventListener("pointerleave", function () {
    pointer = null;
    active = null;
    canvas.style.cursor = "";
    if (!frame) draw(reduce.matches ? 0 : clock);
  });
  canvas.addEventListener("click", function () {
    if (!active || !active.row) return;
    var row = active.row;
    row.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" });
    row.classList.remove("ping");
    void row.offsetWidth;
    row.classList.add("ping");
  });

  canvas.parentNode.classList.add("on");
  readColors();
  resize();

  if ("ResizeObserver" in window) {
    new ResizeObserver(function () {
      resize();   // redimensionner efface le canvas : on redessine tout de suite
      if (W > 0) draw(reduce.matches ? 0 : clock);
      update();
    }).observe(canvas);
  } else {
    window.addEventListener("resize", function () { resize(); if (W > 0) draw(reduce.matches ? 0 : clock); update(); });
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1].isIntersecting;
      update();
    }).observe(canvas);
  }
  document.addEventListener("visibilitychange", update);
  document.addEventListener("themechange", function () { readColors(); if (!frame) draw(reduce.matches ? 0 : clock); });
  if (reduce.addEventListener) reduce.addEventListener("change", update);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { if (!frame && W > 0) draw(reduce.matches ? 0 : clock); });
  }
  if (W > 0) draw(0);   // première image immédiate, sans attendre la boucle d'animation
  update();
})();

/* Révélation au scroll : repli par IntersectionObserver pour les navigateurs
   sans animation-timeline (le CSS natif s'en charge ailleurs). */
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.CSS && CSS.supports && CSS.supports("animation-timeline: view()")) return;
  if (!("IntersectionObserver" in window)) return;

  var items = document.querySelectorAll("main .row, main .section h2, .skills dt, .skills dd, .contact-list li, .reports > li");
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      io.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" });

  document.documentElement.classList.add("io");
  Array.prototype.forEach.call(items, function (el) {
    el.classList.add("rv");
    io.observe(el);
  });
})();
