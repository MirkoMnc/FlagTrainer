/* Classement local (localStorage). Un classement séparé par catégorie :
   mode de jeu × taille du paquet. Tri sur le nombre d'erreurs croissant,
   puis sur la durée. Les parties abandonnées ne sont pas enregistrées. */

var Scores = (function () {
  "use strict";

  var STORE_KEY = "flagtrainer.scores.v1";
  var MAX_PER_BOARD = 10;

  // Le stockage peut être indisponible (navigation privée, cookies bloqués) :
  // dans ce cas le jeu continue de fonctionner, sans classement.
  function read() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function write(all) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(all));
      return true;
    } catch (e) {
      return false;
    }
  }

  function key(mode, size) { return mode + ":" + size; }

  var MODE_LABELS = {
    "open": "Drapeaux · libre", "qcm": "Drapeaux · QCM",
    "cap-open": "Capitales · libre", "cap-qcm": "Capitales · QCM",
    "map": "Carte", "ultimate": "Ultime"
  };

  function label(mode, size) {
    return (MODE_LABELS[mode] || mode) +
      " · " + (Number(size) > 0 ? size + " drapeaux" : "tous les drapeaux");
  }

  // Meilleur d'abord : moins d'erreurs, puis plus rapide, puis plus ancien.
  function compare(a, b) {
    return (a.errors - b.errors) || (a.seconds - b.seconds) || (a.date - b.date);
  }

  function list(mode, size) {
    var board = read()[key(mode, size)];
    return Array.isArray(board) ? board.slice().sort(compare) : [];
  }

  function best(mode, size) {
    return list(mode, size)[0] || null;
  }

  /* Enregistre une partie terminée.
     Retourne le rang obtenu (0 = premier) ou -1 si hors du top 10. */
  function add(mode, size, entry) {
    var all = read();
    var k = key(mode, size);
    var board = Array.isArray(all[k]) ? all[k] : [];

    entry.date = Date.now();
    board.push(entry);
    board.sort(compare);

    var rank = board.indexOf(entry);
    all[k] = board.slice(0, MAX_PER_BOARD);
    write(all);

    return rank < MAX_PER_BOARD ? rank : -1;
  }

  function clear(mode, size) {
    var all = read();
    delete all[key(mode, size)];
    write(all);
  }

  return { list: list, best: best, add: add, clear: clear, label: label };
})();
