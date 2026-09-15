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

  var screens = { menu: $("screen-menu"), start: $("screen-start"), game: $("screen-game"), end: $("screen-end") };
  var flagImg = $("flag-img");
  var input = $("answer-input");
  var form = $("answer-form");
  var feedback = $("feedback");
  var btnValidate = $("btn-validate");
  var btnSkip = $("btn-skip");
  var btnNext = $("btn-next");
  var choicesBox = $("choices");
  var mapBox = $("map-box");
  var preloader = new Image();
  var ALL_CODES = new Set(COUNTRIES.map(function (c) { return c.code; }));

  /* ------------------------------------------------------------------
     État de la partie
     ------------------------------------------------------------------ */
  var state = null;
  var AWAIT_NEXT = false;   // true = on attend "Continuer" après une erreur
  var MODE = "open";        // "open" = réponse libre, "qcm" = 4 propositions

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

    function begin() {
      state = {
        queue: deck,                 // drapeaux restant à trouver
        mode: MODE,
        size: size,                  // catégorie de classement (0 = tous)
        total: deck.length,
        solved: 0,
        errors: 0,
        firstTry: 0,
        missed: {},                  // code -> nombre d'erreurs
        startedAt: Date.now()
      };

      AWAIT_NEXT = false;
      screens.game.classList.toggle("screen--map", MODE === "map");
      showScreen("game");
      render();
    }

    if (MODE !== "map") return begin();

    // Le mode carte charge la carte (≈1 Mo) la première fois seulement.
    var btn = $("btn-start");
    btn.disabled = true;
    btn.textContent = "Chargement de la carte…";
    WorldMap.mount($("map"), { codes: ALL_CODES, onPick: pickCountry }).then(
      function () { btn.disabled = false; btn.textContent = "Start"; begin(); },
      function () {
        btn.disabled = false; btn.textContent = "Start";
        alert("Impossible de charger la carte. Vérifie ta connexion puis réessaie.");
      }
    );
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

    feedback.className = "feedback";
    feedback.textContent = "";
    btnNext.hidden = true;

    form.hidden = true;
    choicesBox.hidden = true;
    mapBox.hidden = true;

    if (state.mode === "qcm") {
      choicesBox.hidden = false;
      buildChoices(c);
    } else if (state.mode === "map") {
      mapBox.hidden = false;
      WorldMap.clearMarks();
      WorldMap.reset();
      WorldMap.setEnabled(true);
    } else {
      form.hidden = false;
      input.value = "";
      input.disabled = false;
      input.focus();
      btnSkip.hidden = false;
    }

    updateHud();
  }

  // Construit les 4 propositions : la bonne + 3 pays tirés au hasard.
  function buildChoices(c) {
    var pool = [];
    while (pool.length < 3) {
      var pick = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
      if (pick.code === c.code) continue;
      if (pool.some(function (p) { return p.code === pick.code; })) continue;
      pool.push(pick);
    }

    choicesBox.innerHTML = "";
    shuffle(pool.concat([c])).forEach(function (country, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      btn.dataset.code = country.code;
      btn.innerHTML = "<span class='choice__key'>" + (i + 1) + "</span>" + country.name;
      btn.addEventListener("click", function () { pickChoice(country.code); });
      choicesBox.appendChild(btn);
    });
  }

  function pickChoice(code) {
    if (AWAIT_NEXT || !state || state.mode !== "qcm") return;
    var c = current();

    // Verrouille les 4 boutons et colore la bonne / la mauvaise réponse.
    Array.prototype.forEach.call(choicesBox.children, function (btn) {
      btn.disabled = true;
      if (btn.dataset.code === c.code) btn.classList.add("is-correct");
      else if (btn.dataset.code === code) btn.classList.add("is-wrong");
    });

    if (code === c.code) return handleCorrect(c);
    handleWrong(c, countryByCode(code).name);
  }

  // Mode carte : clic sur un pays.
  function pickCountry(code) {
    if (AWAIT_NEXT || !state || state.mode !== "map") return;
    var c = current();

    WorldMap.setEnabled(false);
    if (code === c.code) {
      WorldMap.mark(code, "correct");
      return handleCorrect(c);
    }

    // On montre l'erreur et on recadre sur la bonne réponse.
    WorldMap.mark(code, "wrong");
    WorldMap.mark(c.code, "correct");
    WorldMap.focus(c.code);
    handleWrong(c, countryByCode(code).name);
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
  // Mode réponse libre : on compare la saisie au pays attendu.
  function submitAnswer() {
    if (AWAIT_NEXT) return goNext();

    var raw = input.value.trim();
    if (!raw) return;

    var c = current();
    var found = matchAnswer(raw);

    if (found && found.code === c.code) return handleCorrect(c, found.fuzzy);
    handleWrong(c, found ? countryByCode(found.code).name : null);
  }

  // Le drapeau est trouvé : il sort définitivement du paquet.
  function handleCorrect(c, fuzzy) {
    if (!state.missed[c.code]) state.firstTry++;
    state.solved++;
    state.queue.shift();

    feedback.className = "feedback feedback--ok";
    feedback.innerHTML = "✅ Exact : <b>" + c.name + "</b>" +
      (fuzzy ? "<small>Orthographe exacte : " + c.name + "</small>" : "");
    updateHud();

    // Petite pause pour laisser lire le retour, puis carte suivante.
    input.disabled = true;
    setTimeout(function () { if (state) render(); }, 550);
  }

  // Mauvaise réponse : on remet le drapeau plus loin dans le paquet.
  function handleWrong(c, proposedName) {
    state.errors++;
    state.missed[c.code] = (state.missed[c.code] || 0) + 1;

    var verb = state.mode === "map" ? "cliqué sur" : "répondu";
    feedback.className = "feedback feedback--ko";
    feedback.innerHTML = "❌ Raté" + (proposedName ? " — tu as " + verb + " <b>" + proposedName + "</b>" : "") +
      ". C'était <b>" + c.name + "</b>." +
      "<small>Ce drapeau reviendra plus tard dans la partie.</small>";

    requeueCurrent();
    waitForNext();
  }

  function skipAnswer() {
    if (AWAIT_NEXT) return goNext();

    var c = current();
    if (state.mode === "map") {
      WorldMap.setEnabled(false);
      WorldMap.mark(c.code, "correct");
      WorldMap.focus(c.code);
    }
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
    btnNext.hidden = false;
    btnNext.focus();
  }

  function goNext() {
    AWAIT_NEXT = false;
    render();
  }

  /* ------------------------------------------------------------------
     Fin de partie
     ------------------------------------------------------------------ */
  function endGame(abandoned) {
    var seconds = Math.round((Date.now() - state.startedAt) / 1000);

    $("score-first-try").textContent = state.firstTry + " / " + state.total;
    $("score-errors").textContent = state.errors;
    $("score-time").textContent = formatTime(seconds);
    $("end-summary").textContent = abandoned
      ? "Partie abandonnée : " + state.solved + " drapeau" + (state.solved > 1 ? "x" : "") +
        " sur " + state.total + " (score non enregistré au classement)."
      : state.total + " drapeaux identifiés, " + state.firstTry + " du premier coup.";

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

    // Classement local de la catégorie jouée (mode × taille du paquet).
    lastMode = state.mode;
    lastSize = state.size;
    var rank = abandoned ? -1 : Scores.add(lastMode, lastSize, {
      errors: state.errors,
      seconds: seconds,
      firstTry: state.firstTry,
      total: state.total
    });
    renderBoard(rank);

    state = null;
    showScreen("end");
  }

  /* ------------------------------------------------------------------
     Classement local
     ------------------------------------------------------------------ */
  var lastMode = null, lastSize = null;

  function formatTime(seconds) {
    var mm = Math.floor(seconds / 60), ss = seconds % 60;
    return mm + ":" + (ss < 10 ? "0" : "") + ss;
  }

  function formatDate(ms) {
    var d = new Date(ms);
    return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2);
  }

  function plural(n) { return n + (n > 1 ? " erreurs" : " erreur"); }

  // newRank = rang de la partie qui vient d'être jouée, pour la mettre en avant.
  function renderBoard(newRank) {
    var rows = Scores.list(lastMode, lastSize);
    var block = $("board-block"), list = $("board-list");

    $("board-title").textContent = Scores.label(lastMode, lastSize);
    list.innerHTML = "";

    if (!rows.length) { block.hidden = true; return; }

    rows.forEach(function (row, i) {
      var li = document.createElement("li");
      li.className = "board__row" + (i === newRank ? " is-new" : "");
      li.innerHTML =
        "<span class='board__rank'>" + (i + 1) + "</span>" +
        "<span class='board__score'>" + plural(row.errors) + "</span>" +
        "<span class='board__meta'>" + formatTime(row.seconds) + " · " + formatDate(row.date) + "</span>";
      list.appendChild(li);
    });

    block.hidden = false;
  }

  // Record affiché sur l'écran d'accueil, pour le mode et la taille choisis.
  function updateBestLine() {
    var size = parseInt($("deck-size").value, 10) || 0;
    var b = Scores.best(MODE, size);
    $("best-line").textContent = b
      ? "🏆 Record " + Scores.label(MODE, size) + " : " + plural(b.errors) + " en " + formatTime(b.seconds)
      : "Aucun score enregistré pour cette catégorie.";
  }

  /* ------------------------------------------------------------------
     Branchements
     ------------------------------------------------------------------ */
  $("opt-all").textContent = "Tous les drapeaux (" + COUNTRIES.length + ")";

  /* Menu principal : deux entrées. « Drapeaux » regroupe les modes réponse
     libre et QCM ; « Carte » est un mode à part entière. */
  var CATEGORIES = {
    flag: { title: "Drapeaux", desc: "Un drapeau s'affiche, à toi de retrouver son pays." },
    map:  { title: "Carte",    desc: "Un drapeau s'affiche, clique sur son pays sur la carte du monde." }
  };
  var flagMode = "open";      // dernier mode choisi dans la catégorie Drapeaux

  function openSetup(category) {
    var cat = CATEGORIES[category];
    MODE = category === "map" ? "map" : flagMode;
    $("setup-title").textContent = cat.title;
    $("setup-desc").textContent = cat.desc;
    $("field-mode").hidden = category === "map";
    showScreen("start");
    updateBestLine();
  }

  Array.prototype.forEach.call(document.querySelectorAll(".menu-card"), function (card) {
    card.addEventListener("click", function () { openSetup(card.dataset.category); });
  });

  $("btn-back").addEventListener("click", function () { showScreen("menu"); });
  $("btn-menu").addEventListener("click", function () { showScreen("menu"); });

  // Choix du mode dans la catégorie Drapeaux.
  Array.prototype.forEach.call($("mode-toggle").children, function (btn) {
    btn.addEventListener("click", function () {
      MODE = flagMode = btn.dataset.mode;
      Array.prototype.forEach.call($("mode-toggle").children, function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      updateBestLine();
    });
  });

  $("deck-size").addEventListener("change", updateBestLine);

  $("btn-start").addEventListener("click", startGame);
  btnNext.addEventListener("click", goNext);
  $("btn-replay").addEventListener("click", function () {
    showScreen("start");
    updateBestLine();
  });

  $("btn-clear-board").addEventListener("click", function () {
    if (!confirm("Effacer le classement « " + Scores.label(lastMode, lastSize) + " » ?")) return;
    Scores.clear(lastMode, lastSize);
    renderBoard(-1);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    submitAnswer();
  });

  // Entrée : valider, puis enchaîner sur le drapeau suivant.
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); submitAnswer(); }
  });

  document.addEventListener("keydown", function (e) {
    if (!screens.game.classList.contains("screen--active")) return;

    // En QCM, les touches 1 à 4 sélectionnent une proposition.
    if (!AWAIT_NEXT && state && state.mode === "qcm" && /^[1-4]$/.test(e.key)) {
      var btn = choicesBox.children[Number(e.key) - 1];
      if (btn && !btn.disabled) { e.preventDefault(); pickChoice(btn.dataset.code); }
      return;
    }

    if (e.key !== "Enter" || !AWAIT_NEXT) return;
    // Le même Enter vient peut-être de valider la réponse : ne pas enchaîner deux fois.
    if (e.target === input) return;
    e.preventDefault();
    goNext();
  });

  btnSkip.addEventListener("click", skipAnswer);
  $("btn-reveal").addEventListener("click", skipAnswer);
  $("btn-zoom-in").addEventListener("click", WorldMap.zoomIn);
  $("btn-zoom-out").addEventListener("click", WorldMap.zoomOut);
  $("btn-zoom-reset").addEventListener("click", WorldMap.reset);

  $("btn-quit").addEventListener("click", function () {
    if (state && confirm("Abandonner la partie en cours ?")) endGame(true);
  });

  updateBestLine();
})();
