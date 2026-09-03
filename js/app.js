/* FlagTrainer — logique du jeu.
   Le paquet de drapeaux est une file : une bonne réponse retire la carte,
   une mauvaise réponse la réinsère à une position aléatoire plus loin. */

(function () {
  "use strict";

  var FLAG_URL = "https://flagcdn.com/w640/";      // grande image affichée
  var THUMB_URL = "https://flagcdn.com/w80/";      // vignettes du récapitulatif

  /* ------------------------------------------------------------------
     Normalisation & comparaison des réponses
     ------------------------------------------------------------------ */

  // "République démocratique du Congo" -> "republique democratique du congo"
  function normalize(str) {
    return String(str)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")   // accents (après normalize NFD)
      .toLowerCase()
      .replace(/[’']/g, " ")
      .replace(/[^a-z0-9]+/g, " ")       // tirets, points, ponctuation
      .replace(/^(le|la|les|l) /, "")    // article initial
      .trim()
      .replace(/\s+/g, " ");
  }

  // Distance de Levenshtein (tolérance aux fautes de frappe).
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    var prev = [], i, j, tmp;
    for (j = 0; j <= b.length; j++) prev[j] = j;

    for (i = 1; i <= a.length; i++) {
      tmp = [i];
      for (j = 1; j <= b.length; j++) {
        tmp[j] = Math.min(
          prev[j] + 1,                                          // suppression
          tmp[j - 1] + 1,                                       // insertion
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)         // substitution
        );
      }
      prev = tmp;
    }
    return prev[b.length];
  }

  function tolerance(len) {
    if (len <= 4) return 0;   // Iran / Irak, Mali / Malte… : aucune tolérance
    if (len <= 8) return 1;
    return 2;
  }

  // Index : chaque libellé normalisé (nom + synonymes) -> code du pays.
  var LABELS = [];   // [{ key, code }]
  var EXACT = {};    // key -> code

  COUNTRIES.forEach(function (c) {
    var labels = [c.name].concat(c.alt || []);
    labels.forEach(function (label) {
      var key = normalize(label);
      if (!key) return;
      if (!(key in EXACT)) EXACT[key] = c.code;
      LABELS.push({ key: key, code: c.code });
    });
  });

  /* Retourne { code, fuzzy } ou null.
     Le rattrapage orthographique n'est accepté que s'il ne désigne
     qu'un seul pays : sinon "zambie"/"gambie" deviendraient équivalents. */
  function matchAnswer(input) {
    var key = normalize(input);
    if (!key) return null;
    if (EXACT[key]) return { code: EXACT[key], fuzzy: false };

    var codes = [];
    for (var i = 0; i < LABELS.length; i++) {
      var lab = LABELS[i];
      var tol = tolerance(Math.min(lab.key.length, key.length));
      if (tol === 0) continue;
      if (Math.abs(lab.key.length - key.length) > tol) continue;
      if (levenshtein(lab.key, key) <= tol && codes.indexOf(lab.code) === -1) {
        codes.push(lab.code);
        if (codes.length > 1) return null;   // ambigu -> refusé
      }
    }
    return codes.length === 1 ? { code: codes[0], fuzzy: true } : null;
  }

  function countryByCode(code) {
    for (var i = 0; i < COUNTRIES.length; i++) {
      if (COUNTRIES[i].code === code) return COUNTRIES[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------
     Éléments du DOM
     ------------------------------------------------------------------ */
  var $ = function (id) { return document.getElementById(id); };

  var screens = { start: $("screen-start"), game: $("screen-game"), end: $("screen-end") };
  var flagImg = $("flag-img");
  var input = $("answer-input");
  var form = $("answer-form");
  var feedback = $("feedback");
  var btnValidate = $("btn-validate");
  var btnSkip = $("btn-skip");
  var preloader = new Image();

  /* ------------------------------------------------------------------
     État de la partie
     ------------------------------------------------------------------ */
  var state = null;
  var AWAIT_NEXT = false;   // true = on attend "Continuer" après une erreur

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function showScreen(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle("screen--active", k === name);
    });
  }

  function startGame() {
    var size = parseInt($("deck-size").value, 10) || 0;
    var deck = shuffle(COUNTRIES);
    if (size > 0 && size < deck.length) deck = deck.slice(0, size);

    state = {
      queue: deck,                 // drapeaux restant à trouver
      total: deck.length,
      solved: 0,
      errors: 0,
      firstTry: 0,
      missed: {},                  // code -> nombre d'erreurs
      startedAt: Date.now()
    };

    AWAIT_NEXT = false;
    showScreen("game");
    render();
  }

  /* ------------------------------------------------------------------
     Affichage
     ------------------------------------------------------------------ */
  function current() { return state.queue[0]; }

  function render() {
    var c = current();
    if (!c) return endGame();

    flagImg.classList.add("is-loading");
    flagImg.src = FLAG_URL + c.code + ".png";
    flagImg.alt = "Drapeau à identifier";

    // Préchargement du drapeau suivant pour éviter le clignotement.
    if (state.queue[1]) preloader.src = FLAG_URL + state.queue[1].code + ".png";

    input.value = "";
    input.disabled = false;
    input.focus();
    btnSkip.hidden = false;
    btnValidate.textContent = "Valider";
    feedback.className = "feedback";
    feedback.textContent = "";

    updateHud();
  }

  flagImg.addEventListener("load", function () { flagImg.classList.remove("is-loading"); });
  flagImg.addEventListener("error", function () {
    flagImg.classList.remove("is-loading");
    flagImg.alt = "Image du drapeau indisponible (vérifie ta connexion internet)";
  });

  function updateHud() {
    $("stat-remaining").textContent = state.queue.length;
    $("stat-done").textContent = state.solved;
    $("stat-errors").textContent = state.errors;
    var pct = state.total ? (state.solved / state.total) * 100 : 0;
    $("progress-bar").style.width = pct + "%";
  }

  /* ------------------------------------------------------------------
     Réponses
     ------------------------------------------------------------------ */
  function submitAnswer() {
    if (AWAIT_NEXT) return goNext();

    var raw = input.value.trim();
    if (!raw) return;

    var c = current();
    var found = matchAnswer(raw);

    if (found && found.code === c.code) {
      if (!state.missed[c.code]) state.firstTry++;
      state.solved++;
      state.queue.shift();

      feedback.className = "feedback feedback--ok";
      feedback.innerHTML = "✅ Exact : <b>" + c.name + "</b>" +
        (found.fuzzy ? "<small>Orthographe exacte : " + c.name + "</small>" : "");
      updateHud();

      // Petite pause pour laisser lire le retour, puis carte suivante.
      input.disabled = true;
      setTimeout(function () { if (state) render(); }, 550);
      return;
    }

    // Mauvaise réponse : on remet le drapeau plus loin dans le paquet.
    state.errors++;
    state.missed[c.code] = (state.missed[c.code] || 0) + 1;

    var proposed = found ? countryByCode(found.code) : null;
    feedback.className = "feedback feedback--ko";
    feedback.innerHTML = "❌ Raté" + (proposed ? " — tu as répondu <b>" + proposed.name + "</b>" : "") +
      ". C'était <b>" + c.name + "</b>." +
      "<small>Ce drapeau reviendra plus tard dans la partie.</small>";

    requeueCurrent();
    waitForNext();
  }

  function skipAnswer() {
    if (AWAIT_NEXT) return goNext();

    var c = current();
    state.errors++;
    state.missed[c.code] = (state.missed[c.code] || 0) + 1;

    feedback.className = "feedback feedback--ko";
    feedback.innerHTML = "👉 C'était <b>" + c.name + "</b>." +
      "<small>Ce drapeau reviendra plus tard dans la partie.</small>";

    requeueCurrent();
    waitForNext();
  }

  // Retire la carte courante et la réinsère à une place aléatoire,
  // au moins 3 rangs plus loin quand le paquet est assez grand.
  function requeueCurrent() {
    var c = state.queue.shift();
    var min = Math.min(3, state.queue.length);
    var pos = min + Math.floor(Math.random() * (state.queue.length - min + 1));
    state.queue.splice(pos, 0, c);
    updateHud();
  }

  function waitForNext() {
    AWAIT_NEXT = true;
    input.value = "";
    input.disabled = true;
    btnSkip.hidden = true;
    btnValidate.textContent = "Continuer";
    btnValidate.focus();
  }

  function goNext() {
    AWAIT_NEXT = false;
    render();
  }

  /* ------------------------------------------------------------------
     Fin de partie
     ------------------------------------------------------------------ */
  function endGame() {
    var seconds = Math.round((Date.now() - state.startedAt) / 1000);
    var mm = Math.floor(seconds / 60), ss = seconds % 60;

    $("score-first-try").textContent = state.firstTry + " / " + state.total;
    $("score-errors").textContent = state.errors;
    $("score-time").textContent = mm + ":" + (ss < 10 ? "0" : "") + ss;
    $("end-summary").textContent = state.total + " drapeaux identifiés, " +
      state.firstTry + " du premier coup.";

    var codes = Object.keys(state.missed);
    var block = $("review-block"), list = $("review-list");
    list.innerHTML = "";

    if (codes.length) {
      codes.sort(function (a, b) { return state.missed[b] - state.missed[a]; })
        .forEach(function (code) {
          var c = countryByCode(code);
          var item = document.createElement("div");
          item.className = "review__item";

          var img = document.createElement("img");
          img.src = THUMB_URL + code + ".png";
          img.alt = "";

          var txt = document.createElement("div");
          txt.innerHTML = c.name + "<div class='miss'>" + state.missed[code] +
            (state.missed[code] > 1 ? " erreurs" : " erreur") + "</div>";

          item.appendChild(img);
          item.appendChild(txt);
          list.appendChild(item);
        });
      block.hidden = false;
    } else {
      block.hidden = true;
    }

    state = null;
    showScreen("end");
  }

  /* ------------------------------------------------------------------
     Branchements
     ------------------------------------------------------------------ */
  $("opt-all").textContent = "Tous les drapeaux (" + COUNTRIES.length + ")";

  $("btn-start").addEventListener("click", startGame);
  $("btn-replay").addEventListener("click", function () { showScreen("start"); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    submitAnswer();
  });

  // Entrée : valider, puis enchaîner sur le drapeau suivant.
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); submitAnswer(); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !AWAIT_NEXT) return;
    if (!screens.game.classList.contains("screen--active")) return;
    // Le même Enter vient peut-être de valider la réponse : ne pas enchaîner deux fois.
    if (e.target === input) return;
    e.preventDefault();
    goNext();
  });

  btnSkip.addEventListener("click", skipAnswer);

  $("btn-quit").addEventListener("click", function () {
    if (state && confirm("Abandonner la partie en cours ?")) endGame();
  });
})();
