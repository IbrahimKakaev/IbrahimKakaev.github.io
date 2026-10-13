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
