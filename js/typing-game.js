'use strict';

/*
 * タイピングゲーム(打鍵タブのサブモード)。
 * 制限時間内に表示された単語を 1 文字ずつ打鍵し、文字数・ミス・CPM を競う。
 * 出題語は現在レベルの文字だけで組める語を単語リストから選び、
 * 足りなければレベルの文字からランダムに生成する。
 *
 * 純ロジック(candidates / makeRandomWord / summarize)は Node でテスト可能。
 */

var TypingGame = (function () {
  var isNode = (typeof module !== 'undefined' && typeof require === 'function');
  var Data = isNode ? require('./morse-data.js') : window.MorseData;
  var Codec = isNode ? require('./morse-codec.js') : window.MorseCodec;

  var DURATIONS = [30, 60, 120];
  var MIN_CANDIDATES = 6; // これ未満ならランダム語で補う

  // ---------- 純ロジック ----------

  // レベルの文字集合だけで組める語(正規化済み)を返す
  function candidates(mode, levelChars) {
    var list = mode === 'wabun' ? Data.WORDS_WABUN : Data.WORDS_INTL;
    var set = {};
    levelChars.forEach(function (c) { set[c] = true; });
    var out = [];
    var seen = {};
    list.forEach(function (w) {
      var n = Codec.normalizeText(w, mode);
      if (!n || seen[n] || n.indexOf(' ') >= 0) { return; }
      for (var i = 0; i < n.length; i++) {
        if (!set[n[i]]) { return; }
      }
      seen[n] = true;
      out.push(n);
    });
    return out;
  }

  /*
   * 苦手度: 文字別統計 {a: 出題数, c: 正解数} から 0〜1 の値を返す。
   * (a - c + 1) / (a + 2) のラプラス平滑化。未出題は 0.5、全問正解は徐々に 0 へ近づく。
   */
  function weakness(st) {
    var a = st ? (st.a || 0) : 0;
    var c = st ? (st.c || 0) : 0;
    return (a - c + 1) / (a + 2);
  }

  // 語の重み: 1 + 4 × (文字の苦手度の平均)。苦手文字を含む語ほど選ばれやすい
  function wordWeight(word, charStats) {
    if (!word.length) { return 1; }
    var sum = 0;
    for (var i = 0; i < word.length; i++) { sum += weakness(charStats && charStats[word[i]]); }
    return 1 + 4 * (sum / word.length);
  }

  // 重み付きランダム抽選(重みが全て 0 なら一様)。戻り値は index
  function pickWeighted(weights, rnd) {
    rnd = rnd || Math.random;
    var total = 0;
    for (var i = 0; i < weights.length; i++) { total += weights[i]; }
    if (total <= 0) { return Math.floor(rnd() * weights.length); }
    var r = rnd() * total;
    for (var j = 0; j < weights.length; j++) {
      r -= weights[j];
      if (r < 0) { return j; }
    }
    return weights.length - 1;
  }

  /*
   * レベルの文字からランダムな語を作る。len 省略時は 2〜4 文字。
   * charStats を渡すと苦手な文字が出やすくなる(重み 0.3 + 苦手度)。
   * 和文の ゛゜ー は先頭や連続では使わない。
   */
  function makeRandomWord(levelChars, rnd, len, charStats) {
    rnd = rnd || Math.random;
    if (!len) { len = 2 + Math.floor(rnd() * 3); }
    var marks = { '゛': true, '゜': true, 'ー': true };
    var bases = levelChars.filter(function (c) { return !marks[c]; });
    var pool = bases.length ? bases : levelChars;
    function draw(from) {
      if (!charStats) { return from[Math.floor(rnd() * from.length)]; }
      var ws = from.map(function (c) { return 0.3 + weakness(charStats[c]); });
      return from[pickWeighted(ws, rnd)];
    }
    var w = '';
    for (var i = 0; i < len; i++) {
      var from = (i === 0) ? pool : levelChars;
      var c = draw(from);
      if (marks[c] && (i === 0 || marks[w[i - 1]])) { c = draw(pool); }
      w += c;
    }
    return w;
  }

  function summarize(correct, mistakes, durationSec) {
    var total = correct + mistakes;
    return {
      chars: correct,
      mistakes: mistakes,
      accuracy: total ? Math.round(correct / total * 100) : 0,
      cpm: durationSec ? Math.round(correct / (durationSec / 60)) : 0
    };
  }

  // ---------- ブラウザ側(状態機械 + DOM) ----------

  var $ = function (s) { return document.querySelector(s); };
  var state = 'idle';          // 'idle' | 'countdown' | 'play' | 'result'
  var duration = 60;
  var source = 'words';        // 'words' | 'random'(レベル文字からランダム 5 文字)
  var showCode = true;         // 文字の下にトンツーを表示
  var RANDOM_LEN = 5;
  var words = [];              // 候補語
  var word = '';               // 現在の語(正規化済み)
  var next = '';               // 次の語
  var pos = 0;                 // 現在の文字位置
  var correct = 0;
  var mistakes = 0;
  var wordsDone = 0;
  var endAt = 0;
  var tickTimer = null;
  var countTimer = null;
  var hooks = {};              // { getMode, getLevelChars, recordChar, saveStats, getBest, setBest, levelUp, levelDown, levelLabel }

  function pickWord(avoid) {
    var charStats = hooks.getCharStats ? hooks.getCharStats() : null;
    if (source === 'random') {
      return makeRandomWord(hooks.getLevelChars(), Math.random, RANDOM_LEN, charStats);
    }
    var w;
    if (words.length >= MIN_CANDIDATES) {
      // 苦手文字を含む語を優先(重み付き抽選)。直前と同じ語は避ける
      var weights = words.map(function (x) { return wordWeight(x, charStats); });
      for (var g = 0; g < 8; g++) {
        w = words[pickWeighted(weights)];
        if (w !== avoid) { break; }
      }
      return w;
    }
    // 候補が少ないときはリストとランダム語を半々で
    if (words.length && Math.random() < 0.5) {
      w = words[Math.floor(Math.random() * words.length)];
      if (w !== avoid) { return w; }
    }
    return makeRandomWord(hooks.getLevelChars(), Math.random, 0, charStats);
  }

  // 各文字を「文字 + トンツー(・−)」のチップで表示
  function renderWord(flashWrong) {
    var box = $('#tx-game-word');
    var mode = hooks.getMode();
    box.textContent = '';
    for (var i = 0; i < word.length; i++) {
      var cls = i < pos ? 'done' : (i === pos ? 'cur' : 'pending');
      if (i === pos && flashWrong) { cls += ' wrong'; }
      var span = document.createElement('span');
      span.className = cls;
      var ch = document.createElement('b');
      ch.textContent = word[i];
      span.appendChild(ch);
      if (showCode) {
        var code = document.createElement('small');
        code.textContent = Codec.toDisplay(Codec.encodeChar(word[i], mode) || '');
        span.appendChild(code);
      }
      box.appendChild(span);
    }
    $('#tx-game-next').textContent = next ? '次: ' + next : '';
  }

  function renderScore() {
    $('#tx-game-score').textContent = correct + ' 文字 / ミス ' + mistakes;
  }

  function renderTime() {
    var remain = Math.max(0, endAt - performance.now());
    $('#tx-game-time').textContent = '残り ' + Math.ceil(remain / 1000) + ' 秒';
    $('#tx-game-bar-fill').style.width = (remain / (duration * 1000) * 100) + '%';
  }

  function renderIdle() {
    var best = hooks.getBest();
    $('#tx-game-best').textContent = best
      ? '自己ベスト(' + best.duration + '秒): ' + best.chars + ' 文字 / ' + best.cpm + ' CPM / 正答率 ' + best.accuracy + '%'
      : '制限時間内にできるだけ多くの文字を打鍵しましょう';
    $('#tx-game-level-label').textContent = hooks.levelLabel();
    document.querySelectorAll('.tx-game-dur').forEach(function (b) {
      b.classList.toggle('active', Number(b.getAttribute('data-dur')) === duration);
    });
    renderOptions();
  }

  function renderOptions() {
    $('#tx-game-src-words').classList.toggle('active', source === 'words');
    $('#tx-game-src-random').classList.toggle('active', source === 'random');
    var b = $('#tx-game-code');
    b.classList.toggle('active', showCode);
    b.setAttribute('aria-pressed', showCode ? 'true' : 'false');
  }

  function show(which) {
    $('#tx-game-idle').hidden = which !== 'idle';
    $('#tx-game-play').hidden = which !== 'play';
    $('#tx-game-result').hidden = which !== 'result';
  }

  function stopTimers() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (countTimer) { clearInterval(countTimer); countTimer = null; }
  }

  function start() {
    if (state === 'countdown' || state === 'play') { return; }
    words = candidates(hooks.getMode(), hooks.getLevelChars());
    correct = 0; mistakes = 0; wordsDone = 0; pos = 0;
    word = pickWord('');
    next = pickWord(word);
    state = 'countdown';
    show('play');
    renderScore();
    $('#tx-game-time').textContent = '';
    $('#tx-game-bar-fill').style.width = '100%';
    $('#tx-game-next').textContent = '';
    var n = 3;
    var box = $('#tx-game-word');
    box.textContent = '';
    var span = document.createElement('span');
    span.className = 'count';
    span.textContent = String(n);
    box.appendChild(span);
    countTimer = setInterval(function () {
      n--;
      if (n > 0) { span.textContent = String(n); return; }
      clearInterval(countTimer); countTimer = null;
      beginPlay();
    }, 1000);
  }

  function beginPlay() {
    state = 'play';
    endAt = performance.now() + duration * 1000;
    renderWord(false);
    renderTime();
    tickTimer = setInterval(function () {
      renderTime();
      if (performance.now() >= endAt) { finish(); }
    }, 100);
  }

  function finish() {
    if (state !== 'play') { return; }
    stopTimers();
    state = 'result';
    var r = summarize(correct, mistakes, duration);
    r.duration = duration;
    var best = hooks.getBest();
    var isBest = !best || best.duration !== duration || r.chars > best.chars;
    if (isBest) { hooks.setBest(r); }
    hooks.saveStats();
    $('#tx-game-result-score').textContent = r.chars + ' 文字';
    $('#tx-game-result-detail').textContent =
      duration + ' 秒 / ミス ' + r.mistakes + ' / 正答率 ' + r.accuracy + '% / ' + r.cpm + ' CPM' +
      (isBest && r.chars > 0 ? ' 🎉 自己ベスト' : '');
    show('result');
  }

  // モードを離れる・タブを離れる: 結果を出さずに中断
  function abort() {
    stopTimers();
    state = 'idle';
    show('idle');
    renderIdle();
  }

  // キーヤーから確定した符号を受け取る
  function onChar(code) {
    if (state !== 'play') { return; }
    var expected = word[pos];
    var ch = Codec.decode(code, hooks.getMode()).text;
    var ok = ch === expected;
    hooks.recordChar(expected, ok);
    if (ok) {
      correct++;
      pos++;
      if (pos >= word.length) {
        wordsDone++;
        word = next;
        next = pickWord(word);
        pos = 0;
      }
      renderWord(false);
    } else {
      mistakes++;
      renderWord(true);
      if (navigator.vibrate && /Android/i.test(navigator.userAgent)) {
        try { navigator.vibrate(60); } catch (e) { /* noop */ }
      }
    }
    renderScore();
  }

  function init(h) {
    hooks = h;
    duration = DURATIONS.indexOf(h.initialDuration) >= 0 ? h.initialDuration : 60;
    source = h.initialSource === 'random' ? 'random' : 'words';
    showCode = h.initialShowCode !== false;
    $('#tx-game-src-words').addEventListener('click', function () { setSource('words'); });
    $('#tx-game-src-random').addEventListener('click', function () { setSource('random'); });
    $('#tx-game-code').addEventListener('click', function () {
      showCode = !showCode;
      if (hooks.onOptionsChange) { hooks.onOptionsChange({ source: source, showCode: showCode }); }
      renderOptions();
      if (state === 'play') { renderWord(false); }
    });
    $('#tx-game-start').addEventListener('click', start);
    $('#tx-game-again').addEventListener('click', function () { abort(); start(); });
    $('#tx-game-result-close').addEventListener('click', abort);
    document.querySelectorAll('.tx-game-dur').forEach(function (b) {
      b.addEventListener('click', function () {
        duration = Number(b.getAttribute('data-dur'));
        if (hooks.onDurationChange) { hooks.onDurationChange(duration); }
        renderIdle();
      });
    });
    $('#tx-game-level-down').addEventListener('click', function () { hooks.levelDown(); renderIdle(); });
    $('#tx-game-level-up').addEventListener('click', function () { hooks.levelUp(); renderIdle(); });
    renderIdle();
  }

  // 出題ソースの切替。プレイ中に切り替えた場合は次の語から反映
  function setSource(src) {
    source = src === 'random' ? 'random' : 'words';
    if (hooks.onOptionsChange) { hooks.onOptionsChange({ source: source, showCode: showCode }); }
    renderOptions();
    if (state === 'play' || state === 'countdown') { next = pickWord(word); renderWord(false); }
  }

  return {
    DURATIONS: DURATIONS,
    RANDOM_LEN: RANDOM_LEN,
    candidates: candidates,
    makeRandomWord: makeRandomWord,
    weakness: weakness,
    wordWeight: wordWeight,
    pickWeighted: pickWeighted,
    summarize: summarize,
    init: init,
    enter: function () { abort(); },
    leave: abort,
    onChar: onChar,
    finish: finish,
    getState: function () { return state; },
    refresh: renderIdle
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TypingGame;
} else {
  window.TypingGame = TypingGame;
}
