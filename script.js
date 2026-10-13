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
   ses technologies viennent de sa ligne .stack (ou de data-tech). Pour rester lisible,
   seules les technologies partagées par plusieurs projets deviennent des nœuds ; la liste
   complète d'un projet s'affiche dans la légende au survol. */
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
    hub.info = source.replace(/\s+/g, " ").trim();
    link(me, hub);
    source.split(/\s*[,\/]\s*/).forEach(function (name) {
      name = name.trim();
      if (name) link(hub, node("tech:" + name.toLowerCase(), name, "tech", null));
    });
  });
  nodes = nodes.filter(function (n) { return n.type !== "tech" || n.links.length > 1; });
  links = links.filter(function (l) { return nodes.indexOf(l.a) >= 0 && nodes.indexOf(l.b) >= 0; });
  nodes.forEach(function (n) {
    n.links = n.links.filter(function (l) { return links.indexOf(l) >= 0; });
  });
  if (nodes.length < 3) return;

  var caption = canvas.parentNode.querySelector(".net-caption");
  var captionText = caption ? caption.textContent : "";

  /* Placement : moi au centre, les projets répartis régulièrement sur une ellipse (dans l'ordre
     de la page), chaque technologie partagée attirée entre ses projets puis écartée des autres
     nœuds pour que les étiquettes ne se chevauchent pas. Calculé une fois, sans hasard. */
  (function layout() {
    var hubs = nodes.filter(function (n) { return n.type === "hub"; });
    var techs = nodes.filter(function (n) { return n.type === "tech"; });

    me.x = 0; me.y = 0;
    hubs.forEach(function (n, i) {
      var ang = (i / hubs.length) * Math.PI * 2;
      n.x = Math.sin(ang);
      n.y = -Math.cos(ang);
    });
    techs.forEach(function (n) {
      n.cx = 0; n.cy = 0;
      n.links.forEach(function (l) {
        var hub = l.a === n ? l.b : l.a;
        n.cx += hub.x / n.links.length;
        n.cy += hub.y / n.links.length;
      });
      n.x = n.cx * 0.8; n.y = n.cy * 0.8;
    });
    for (var it = 0; it < 400; it++) {
      techs.forEach(function (n) {
        var fx = (n.cx - n.x) * 0.05, fy = (n.cy - n.y) * 0.05;
        nodes.forEach(function (o) {
          if (o === n) return;
          var dx = n.x - o.x, dy = n.y - o.y;
          var d2 = dx * dx + dy * dy + 0.0001;
          fx += (dx / d2) * 0.006;
          fy += (dy / d2) * 0.006;
        });
        var r = Math.sqrt(fx * fx + fy * fy) || 0.001;
        var stepLen = Math.min(r, 0.03) / r;
        n.x += fx * stepLen;
        n.y += fy * stepLen;
        var out = Math.sqrt(n.x * n.x + n.y * n.y);
        if (out > 0.78) { n.x *= 0.78 / out; n.y *= 0.78 / out; }   // reste à l'intérieur de l'ellipse
      });
    }
    nodes.forEach(function (n, i) {
      n.phase = i * 1.7;
      n.freq = 0.6 + (i % 4) * 0.18;
    });
  })();

  var seed = 11;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

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
    var padX = W < 520 ? 48 : 80;
    var padY = 46;
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
    var small = W < 520;
    ctx.font = hub ? (small ? "700 13px Syne, sans-serif" : "700 16px Syne, sans-serif")
                   : (small ? '500 12px "IBM Plex Mono", monospace' : '500 14px "IBM Plex Mono", monospace');
    var tw = ctx.measureText(n.label).width;
    var x = Math.min(Math.max(n.px, tw / 2 + 3), W - tw / 2 - 3);
    var y = hub ? n.py - (n.type === "me" ? 24 : 21) : n.py + 21;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = colors.bg;
    ctx.strokeText(n.label, x, y);
    ctx.fillStyle = hub ? colors.text : colors.node;
    ctx.fillText(n.label, x, y);
  }

  function draw(time) {
    var i, n, l, lit;
    place(time);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.lineWidth = 1.5;
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
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from.px + (to.px - from.px) * tail, from.py + (to.py - from.py) * tail);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
    }

    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      lit = isLit(n);
      ctx.globalAlpha = lit ? 1 : 0.3;
      if (n.type === "tech") {
        ctx.fillStyle = n === active ? colors.accent : colors.node;
        ctx.beginPath();
        ctx.arc(n.px, n.py, 7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        var s = n.type === "me" ? 11 : 8;
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
        ctx.lineWidth = 2;
        ctx.strokeRect(n.px - s, n.py - s, 2 * s, 2 * s);
        ctx.lineWidth = 1.5;
      }
    }

    /* Tous les nœuds sont étiquetés. */
    for (var pass = 0; pass < 2; pass++) {   // les noms de projets passent au-dessus des technologies
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        if ((n.type === "tech") !== (pass === 0)) continue;
        lit = isLit(n);
        ctx.globalAlpha = lit ? 1 : 0.3;
        label(n, lit);
      }
    }
    ctx.globalAlpha = 1;
  }

  function step(dt) {
    var max = W < 520 ? 6 : 10;
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
    var best = 44 * 44;
    for (var i = 0; i < nodes.length; i++) {
      var dx = nodes[i].px - pointer.x, dy = nodes[i].py - pointer.y;
      var d = dx * dx + dy * dy;
      if (d < best) { best = d; active = nodes[i]; }
    }
  }

  /* La légende sous la carte donne les technologies du projet survolé. */
  function showInfo() {
    if (!caption) return;
    var text = active && active.info ? active.label + " : " + active.info : captionText;
    if (caption.textContent !== text) caption.textContent = text;
  }

  function onPointer(e) {
    var rect = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    pick();
    showInfo();
    canvas.style.cursor = active && active.row ? "pointer" : "";
    if (!frame) draw(reduce.matches ? 0 : clock);
  }

  canvas.addEventListener("pointermove", onPointer);
  canvas.addEventListener("pointerdown", onPointer);
  canvas.addEventListener("pointerleave", function () {
    pointer = null;
    active = null;
    showInfo();
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
