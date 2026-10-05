document.documentElement.classList.add("js");

var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Plateau hexagonal du hero : 91 cases en trois tons, révélées du centre vers l'extérieur.
   Survol : la case prend la couleur d'un des trois joueurs. Clic : une onde part de la case. */
(function () {
  var svg = document.getElementById("board");
  if (!svg) return;

  var NS = "http://www.w3.org/2000/svg";
  var RADIUS = 5;      // 5 anneaux autour de la case centrale, soit 91 cases
  var SIZE = 26;       // rayon d'une case
  var GAP = 0.93;      // espace entre les cases
  var SQRT3 = Math.sqrt(3);
  var cells = [];

  var halfW = 1.5 * RADIUS * SIZE + SIZE + 2;
  var halfH = SQRT3 * SIZE * (RADIUS + 0.5) + 2;
  svg.setAttribute("viewBox", [-halfW, -halfH, halfW * 2, halfH * 2].join(" "));

  function points(cx, cy) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = (Math.PI / 180) * (60 * i);
      pts.push((cx + SIZE * GAP * Math.cos(a)).toFixed(2) + "," + (cy + SIZE * GAP * Math.sin(a)).toFixed(2));
    }
    return pts.join(" ");
  }

  // Le joueur dépend du tiers du plateau où se trouve la case
  function player(cx, cy) {
    var angle = (Math.atan2(cy, cx) * 180 / Math.PI + 450) % 360;
    return 1 + Math.floor(angle / 120);
  }

  function flash(cell, pl, duration) {
    cell.el.classList.add("hot", "pl" + pl);
    clearTimeout(cell.timer);
    cell.timer = setTimeout(function () {
      cell.el.classList.remove("hot", "pl1", "pl2", "pl3");
    }, duration);
  }

  for (var q = -RADIUS; q <= RADIUS; q++) {
    for (var r = -RADIUS; r <= RADIUS; r++) {
      var s = -q - r;
      var dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      if (dist > RADIUS) continue;

      var cx = SIZE * 1.5 * q;
      var cy = SIZE * SQRT3 * (r + q / 2);
      var tone = (((q - r) % 3) + 3) % 3;

      var el = document.createElementNS(NS, "polygon");
      el.setAttribute("points", points(cx, cy));
      el.setAttribute("class", "cell tone" + tone);
      el.style.setProperty("--delay", dist * 90 + "ms");
      svg.appendChild(el);

      var cell = { el: el, q: q, r: r, pl: dist === 0 ? 1 : player(cx, cy), timer: 0 };
      el.cell = cell;
      cells.push(cell);
    }
  }

  svg.addEventListener("pointerover", function (e) {
    var cell = e.target.cell;
    if (cell) flash(cell, cell.pl, 700);
  });

  svg.addEventListener("click", function (e) {
    var origin = e.target.cell;
    if (!origin) return;
    var pl = origin.pl;
    cells.forEach(function (cell) {
      var d = Math.max(Math.abs(cell.q - origin.q), Math.abs(cell.r - origin.r),
        Math.abs((-cell.q - cell.r) - (-origin.q - origin.r)));
      if (reduceMotion) {
        if (d === 0) flash(cell, pl, 500);
        return;
      }
      setTimeout(function () { flash(cell, pl, 260); }, d * 70);
    });
  });
})();

/* Navigation : met en évidence la section visible */
(function () {
  var links = document.querySelectorAll(".nav-links a");
  if (!("IntersectionObserver" in window) || !links.length) return;

  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      links.forEach(function (a) { a.classList.remove("active"); });
      var link = byId[entry.target.id];
      if (link) link.classList.add("active");
    });
  }, { rootMargin: "-45% 0px -50% 0px" });

  document.querySelectorAll("main section[id]").forEach(function (section) {
    observer.observe(section);
  });
})();

/* Apparition douce des blocs au défilement */
(function () {
  var items = document.querySelectorAll(".card, .row, .skills > div, .extras");
  if (reduceMotion || !("IntersectionObserver" in window)) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" });

  items.forEach(function (item) {
    item.classList.add("reveal");
    observer.observe(item);
  });
})();
