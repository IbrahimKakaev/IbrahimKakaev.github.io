/* Plateau hexagonal du hero : 91 cases, trois tons, révélées du centre vers l'extérieur. */
(function () {
  var svg = document.getElementById("board");
  if (!svg) return;

  var NS = "http://www.w3.org/2000/svg";
  var RADIUS = 5;      // 5 anneaux autour de la case centrale, soit 91 cases
  var SIZE = 26;       // rayon d'une case
  var GAP = 0.93;      // espace entre les cases
  var SQRT3 = Math.sqrt(3);

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

  for (var q = -RADIUS; q <= RADIUS; q++) {
    for (var r = -RADIUS; r <= RADIUS; r++) {
      var s = -q - r;
      var dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      if (dist > RADIUS) continue;

      var cx = SIZE * 1.5 * q;
      var cy = SIZE * SQRT3 * (r + q / 2);
      var tone = (((q - r) % 3) + 3) % 3;

      var cell = document.createElementNS(NS, "polygon");
      cell.setAttribute("points", points(cx, cy));
      cell.setAttribute("class", "cell tone" + tone);
      cell.style.setProperty("--delay", dist * 90 + "ms");
      svg.appendChild(cell);
    }
  }
})();
