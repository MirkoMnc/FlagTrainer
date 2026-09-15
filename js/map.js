/* Carte du monde interactive pour le mode « Carte ».
   - chargement différé de js/world-map-data.js (≈1 Mo, seulement si le mode est lancé)
   - zoom à la molette / boutons, déplacement à la souris ou au doigt
   - résolution de l'élément cliqué vers un code pays
   - mise en évidence (survol, bonne / mauvaise réponse) et recadrage sur un pays */

var WorldMap = (function () {
  "use strict";

  var W = 2754, H = 1398;          // dimensions du viewBox d'origine
  var MIN_W = W / 40;              // zoom maximum
  var DRAG_THRESHOLD = 5;          // px : en dessous, un glissé compte comme un clic
  var CIRCLE_PX = 5;               // rayon à l'écran des cercles des micro-États

  var container = null, svg = null;
  var circles = [];                // cercles des micro-États jouables
  var codes = null;                // Set des codes pays jouables
  var onPick = null;
  var enabled = true;
  var view = { x: 0, y: 0, w: W, h: H };
  var hovered = null;
  var loading = null;

  /* ------------------------------------------------------------------
     Chargement
     ------------------------------------------------------------------ */
  function loadData() {
    if (typeof WORLD_SVG !== "undefined") return Promise.resolve();
    if (loading) return loading;

    loading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "js/world-map-data.js";
      s.onload = resolve;
      s.onerror = function () { loading = null; reject(new Error("carte indisponible")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /* Injecte la carte dans `el`. `opts.codes` : codes jouables ; `opts.onPick(code)`. */
  function mount(el, opts) {
    codes = opts.codes;
    onPick = opts.onPick;

    return loadData().then(function () {
      if (container === el && svg) return;      // déjà montée

      container = el;
      container.innerHTML = WORLD_SVG;
      svg = container.querySelector("svg");

      // Les cercles des micro-États ne sont visibles que pour les pays du jeu.
      circles = [];
      Array.prototype.forEach.call(svg.querySelectorAll(".circlexx"), function (c) {
        if (codeFromClass(c)) { c.classList.add("is-playable"); circles.push(c); }
      });

      bindEvents();
      reset();
      window.addEventListener("resize", apply);
    });
  }

  /* ------------------------------------------------------------------
     Résolution élément -> code pays
     ------------------------------------------------------------------ */
  function codeFromClass(el) {
    var cls = el.getAttribute && el.getAttribute("class");
    if (!cls) return null;
    var tokens = cls.split(/\s+/);
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].length === 2 && codes.has(tokens[i])) return tokens[i];
    }
    return null;
  }

  function codeFromId(el) {
    var id = el.id || "";
    var m = /^([a-z]{2})[_-]?$/.exec(id);
    return m && codes.has(m[1]) ? m[1] : null;
  }

  function codeOf(el) {
    while (el && el !== svg) {
      var code = codeFromId(el) || codeFromClass(el);
      if (code) return code;
      el = el.parentNode;
    }
    return null;
  }

  // Éléments à colorer pour un pays : son groupe/tracé, et son cercle s'il existe.
  function elementsOf(code) {
    var list = [];
    var main = svg.querySelector("#" + code);
    var circle = svg.querySelector("#" + code + "_");
    if (main) list.push(main);
    if (circle) list.push(circle);
    return list;
  }

  /* ------------------------------------------------------------------
     Vue (viewBox), zoom et déplacement
     ------------------------------------------------------------------ */
  function apply() {
    svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);

    // Rayon des cercles constant à l'écran (≈ 5 px) quel que soit le zoom.
    var px = svg.getBoundingClientRect().width || 720;
    var r = (CIRCLE_PX * view.w / px).toFixed(2);
    for (var i = 0; i < circles.length; i++) circles[i].setAttribute("r", r);
  }

  function clampView() {
    view.w = Math.min(Math.max(view.w, MIN_W), W);
    view.h = view.w * H / W;
    view.x = Math.min(Math.max(view.x, 0), W - view.w);
    view.y = Math.min(Math.max(view.y, 0), H - view.h);
  }

  function toSvgPoint(clientX, clientY) {
    var p = svg.createSVGPoint();
    p.x = clientX; p.y = clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  // Zoom d'un facteur autour d'un point écran (le point reste fixe sous le curseur).
  function zoomAt(factor, clientX, clientY) {
    stopAnimation();
    var p = toSvgPoint(clientX, clientY);
    view.x = p.x - (p.x - view.x) * factor;
    view.y = p.y - (p.y - view.y) * factor;
    view.w *= factor;
    clampView();
    apply();
  }

  function zoomCenter(factor) {
    var r = svg.getBoundingClientRect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  }

  function reset() {
    stopAnimation();
    view = { x: 0, y: 0, w: W, h: H };
    apply();
  }

  // Un élément appartient-il à un autre territoire que `code` (ex. Guyane dans le groupe fr) ?
  function isForeign(el, code) {
    var m = /^([a-z]{2})[_-]?$/.exec(el.id || "");
    if (m && m[1] !== code) return true;
    var cls = (el.getAttribute("class") || "").split(/\s+/);
    for (var i = 0; i < cls.length; i++) {
      if (cls[i].length === 2 && cls[i] !== code && cls[i] !== "eu") return true;
    }
    return false;
  }

  /* Boîte englobante « utile » d'un pays : ses pièces principales, sans les
     territoires d'outre-mer ni les îlots (< 5 % de la plus grande pièce),
     plus son cercle de micro-État s'il existe. */
  function mainBox(code) {
    var main = svg.querySelector("#" + code);
    var circle = svg.querySelector("#" + code + "_");
    var pieces = [];

    if (main) {
      var paths = main.tagName === "g" ? main.querySelectorAll("path") : [main];
      Array.prototype.forEach.call(paths, function (p) {
        for (var el = p; el && el !== main; el = el.parentNode) {
          if (isForeign(el, code)) return;
        }
        var b = p.getBBox();
        if (b.width || b.height) pieces.push({ x: b.x, y: b.y, width: b.width, height: b.height });
      });
    }

    var largest = 0;
    pieces.forEach(function (b) { largest = Math.max(largest, b.width * b.height); });

    var box = null;
    pieces.forEach(function (b) {
      if (b.width * b.height < largest * 0.05) return;
      box = box ? union(box, b) : b;
    });

    if (circle) {
      var cb = circle.getBBox();
      box = box ? union(box, cb) : { x: cb.x, y: cb.y, width: cb.width, height: cb.height };
    }
    return box;
  }

  // Recadre en douceur sur un pays (il occupe environ un tiers de la vue).
  function focus(code) {
    var box = mainBox(code);
    if (!box) return;

    var target = {};
    target.w = Math.max(box.width * 3, box.height * 3 * W / H, W / 14);
    target.h = target.w * H / W;
    target.x = box.x + box.width / 2 - target.w / 2;
    target.y = box.y + box.height / 2 - target.h / 2;

    animateTo(target);
  }

  function union(a, b) {
    var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return {
      x: x, y: y,
      width: Math.max(a.x + a.width, b.x + b.width) - x,
      height: Math.max(a.y + a.height, b.y + b.height) - y
    };
  }

  var animId = 0;

  function stopAnimation() {
    if (animId) cancelAnimationFrame(animId);
    animId = 0;
  }

  function animateTo(target) {
    stopAnimation();
    var from = { x: view.x, y: view.y, w: view.w, h: view.h };
    var start = performance.now(), DURATION = 400;

    function step(now) {
      var t = Math.min(1, (now - start) / DURATION);
      var e = 1 - Math.pow(1 - t, 3);      // ease-out
      view.x = from.x + (target.x - from.x) * e;
      view.y = from.y + (target.y - from.y) * e;
      view.w = from.w + (target.w - from.w) * e;
      clampView();
      apply();
      animId = t < 1 ? requestAnimationFrame(step) : 0;
    }
    animId = requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------
     Événements
     ------------------------------------------------------------------ */
  function bindEvents() {
    var dragging = false, moved = 0, lastX = 0, lastY = 0;

    svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1 / 1.25 : 1.25, e.clientX, e.clientY);
    }, { passive: false });

    svg.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      stopAnimation();
      dragging = true; moved = 0;
      lastX = e.clientX; lastY = e.clientY;
    });

    window.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);

      var scale = view.w / svg.getBoundingClientRect().width;
      view.x -= dx * scale;
      view.y -= dy * scale;
      clampView();
      apply();
    });

    window.addEventListener("pointerup", function () { dragging = false; });

    svg.addEventListener("click", function (e) {
      if (moved > DRAG_THRESHOLD) return;     // c'était un déplacement, pas un clic
      if (!enabled || !onPick) return;
      var code = codeOf(e.target);
      if (code) onPick(code);
    });

    // Survol : on colore le pays entier, pas seulement le tracé sous le curseur.
    svg.addEventListener("pointerover", function (e) {
      var code = enabled ? codeOf(e.target) : null;
      if (code === hovered) return;
      setHover(code);
    });
    svg.addEventListener("pointerleave", function () { setHover(null); });
  }

  function setHover(code) {
    if (hovered) elementsOf(hovered).forEach(function (el) { el.classList.remove("is-hover"); });
    hovered = code;
    if (hovered) elementsOf(hovered).forEach(function (el) { el.classList.add("is-hover"); });
  }

  /* ------------------------------------------------------------------
     Mise en évidence
     ------------------------------------------------------------------ */
  function mark(code, kind) {
    elementsOf(code).forEach(function (el) { el.classList.add("is-" + kind); });
  }

  function clearMarks() {
    Array.prototype.forEach.call(svg.querySelectorAll(".is-correct, .is-wrong"), function (el) {
      el.classList.remove("is-correct");
      el.classList.remove("is-wrong");
    });
    setHover(null);
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) setHover(null);
    container.classList.toggle("is-locked", !enabled);
  }

  return {
    mount: mount,
    reset: reset,
    focus: focus,
    mark: mark,
    clearMarks: clearMarks,
    setEnabled: setEnabled,
    zoomIn: function () { zoomCenter(1 / 1.5); },
    zoomOut: function () { zoomCenter(1.5); }
  };
})();
