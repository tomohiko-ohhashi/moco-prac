'use strict';

/*
 * 聞き取り練習(受信トレーナー)。
 * レベル集合からランダム出題 → 再生 → ボタングリッドで回答 → 判定。
 * 回答は画面上のボタン(ネイティブキーボード不使用)。PC の物理キーも受ける。
 */

var RxTrainer = (function () {
  var $ = function (s) { return UI.$(s); };

  var session = null; // { total, index, correctCount, target, answer, phase }
  var playHandle = null;

  // 欧文グリッドの固定順: A-Z → 0-9 → 記号
  var INTL_GRID_ORDER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')
    .concat(['.', ',', '?', '/', '=']);

  function wabunGridOrder() {
    var order = [];
    MorseData.WABUN_ORDER.forEach(function (g) {
      order = order.concat(g.chars);
    });
    return order;
  }

  function gridOrder() {
    var set = App.levelChars('rx');
    var inSet = {};
    set.forEach(function (c) { inSet[c] = true; });
    var base = UI.getMode() === 'intl' ? INTL_GRID_ORDER : wabunGridOrder();
    var grid = base.filter(function (c) { return inSet[c]; });
    // 固定順に無い文字(欧文の追加記号等)は末尾に
    set.forEach(function (c) { if (grid.indexOf(c) < 0) { grid.push(c); } });
    return grid;
  }

  function stopPlay() {
    if (playHandle) { playHandle.stop(); playHandle = null; }
  }

  function playMorse(morse, onDone) {
    stopPlay();
    var s = App.settings;
    var tl = MorseCodec.computeTimeline(morse, {
      charWpm: s.rx.charWpm,
      effWpm: s.rx.effWpm
    });
    playHandle = Audio2.playTimeline(tl, {
      freq: s.audio.freq,
      onDone: function () { playHandle = null; if (onDone) { onDone(); } }
    });
  }

  // ---------- 画面描画 ----------

  function renderHeader() {
    var st = App.modeStats('rx');
    $('#rx-level-label').textContent = 'Lv ' + st.level + '/' + App.maxLevel();
    $('#rx-eff-label').textContent = App.settings.rx.effWpm + ' wpm';
    var wrap = $('#rx-level-chars');
    wrap.textContent = '';
    var chars = App.levelChars('rx');
    var newest = UI.getMode() === 'intl'
      ? chars[chars.length - 1]
      : null;
    var newGroup = UI.getMode() === 'wabun'
      ? MorseData.WABUN_ORDER[st.level - 1].chars
      : null;
    chars.forEach(function (c) {
      var span = UI.el('span', null, c);
      if (c === newest || (newGroup && newGroup.indexOf(c) >= 0)) {
        span.classList.add('new');
      }
      wrap.appendChild(span);
    });
  }

  function showStage(name) {
    ['rx-idle', 'rx-play', 'rx-result', 'rx-summary'].forEach(function (id) {
      $('#' + id).hidden = id !== name;
    });
  }

  function renderGrid() {
    var grid = $('#rx-grid');
    grid.textContent = '';
    gridOrder().forEach(function (c) {
      var b = UI.el('button', null, c);
      b.type = 'button';
      b.addEventListener('click', function () {
        Audio2.ensureAudio();
        appendAnswer(c);
      });
      grid.appendChild(b);
    });
  }

  function renderAnswer() {
    $('#rx-answer').textContent = session ? session.answer : '';
  }

  // ---------- セッション ----------

  function pickQuestion() {
    var chars = App.levelChars('rx');
    var n = App.settings.rx.groupSize;
    var out = '';
    var prev = session && session.target ? session.target : '';
    for (var guard = 0; guard < 20; guard++) {
      out = '';
      var last = null;
      for (var i = 0; i < n; i++) {
        var c;
        for (var g = 0; g < 10; g++) {
          c = chars[Math.floor(Math.random() * chars.length)];
          if (c !== last || chars.length < 2) { break; } // 直前文字の重複回避
        }
        last = c;
        out += c;
      }
      if (out !== prev || chars.length < 2) { break; } // 直前問題の重複回避
    }
    return out;
  }

  function startSession() {
    Audio2.ensureAudio();
    session = {
      total: App.settings.rx.questions,
      index: 0,
      correctCount: 0,
      target: '',
      answer: '',
      phase: 'play'
    };
    nextQuestion();
  }

  function nextQuestion() {
    if (session.index >= session.total) {
      showSummary();
      return;
    }
    session.target = pickQuestion();
    session.answer = '';
    session.phase = 'play';
    session.index++;
    $('#rx-qnum').textContent = '第 ' + session.index + ' 問 / ' + session.total;
    renderAnswer();
    showStage('rx-play');
    playMorse(MorseCodec.encode(session.target, UI.getMode()));
  }

  function appendAnswer(c) {
    if (!session || session.phase !== 'play') { return; }
    if (session.answer.length >= session.target.length) { return; }
    session.answer += c;
    renderAnswer();
  }

  function backspace() {
    if (!session || session.phase !== 'play') { return; }
    session.answer = session.answer.slice(0, -1);
    renderAnswer();
  }

  function judge() {
    if (!session || session.phase !== 'play') { return; }
    stopPlay();
    session.phase = 'result';
    var t = session.target;
    var a = session.answer;
    var allOk = a === t;
    if (allOk) { session.correctCount++; }
    for (var i = 0; i < t.length; i++) {
      App.recordChar('rx', t[i], a[i] === t[i]);
    }
    App.saveStats();

    $('#rx-verdict').textContent = allOk ? '○' : '×';
    $('#rx-verdict').className = 'verdict ' + (allOk ? 'ok' : 'ng');

    var diff = $('#rx-diff');
    diff.textContent = '';
    for (var j = 0; j < t.length; j++) {
      diff.appendChild(UI.el('span', a[j] === t[j] ? 'good' : 'bad', t[j]));
    }
    if (!allOk && a) {
      var yours = UI.el('div', 'hint', 'あなたの回答: ' + a);
      yours.style.fontSize = '15px';
      diff.appendChild(yours);
    }
    $('#rx-morse').textContent =
      MorseCodec.toDisplay(MorseCodec.encode(t, UI.getMode()));
    showStage('rx-result');
  }

  function showSummary() {
    stopPlay();
    session.phase = 'summary';
    var st = App.modeStats('rx');
    st.sessions++;
    App.saveStats();

    var rate = session.total > 0
      ? Math.round(100 * session.correctCount / session.total) : 0;
    $('#rx-score').textContent = session.correctCount + ' / ' + session.total +
      '(' + rate + '%)';

    // 苦手文字ワースト3(このモードの累積統計、出題2回以上)
    var worst = [];
    for (var ch in st.chars) {
      if (!Object.prototype.hasOwnProperty.call(st.chars, ch)) { continue; }
      var c = st.chars[ch];
      if (c.a >= 2) {
        worst.push({ ch: ch, rate: c.c / c.a, a: c.a });
      }
    }
    worst.sort(function (x, y) { return x.rate - y.rate; });
    var list = $('#rx-worst');
    list.textContent = '';
    worst.slice(0, 3).forEach(function (w) {
      if (w.rate >= 1) { return; }
      var li = UI.el('li');
      li.appendChild(UI.el('span', null,
        w.ch + '(' + MorseCodec.toDisplay(MorseCodec.encodeChar(w.ch, UI.getMode()) || '') + ')'));
      li.appendChild(UI.el('span', null, '正答率 ' + Math.round(w.rate * 100) + '%'));
      list.appendChild(li);
    });

    var canLevelUp = rate >= 90 && st.level < App.maxLevel();
    $('#rx-levelup').hidden = !canLevelUp;
    showStage('rx-summary');
  }

  function endToIdle() {
    stopPlay();
    session = null;
    renderHeader();
    renderGrid();
    showStage('rx-idle');
  }

  // ---------- 初期化 ----------

  function init() {
    $('#rx-start').addEventListener('click', startSession);
    $('#rx-replay').addEventListener('click', function () {
      if (session && session.phase === 'play') {
        Audio2.ensureAudio();
        playMorse(MorseCodec.encode(session.target, UI.getMode()));
      }
    });
    $('#rx-backspace').addEventListener('click', backspace);
    $('#rx-submit').addEventListener('click', judge);
    $('#rx-result-replay').addEventListener('click', function () {
      Audio2.ensureAudio();
      playMorse(MorseCodec.encode(session.target, UI.getMode()));
    });
    $('#rx-next').addEventListener('click', function () {
      Audio2.ensureAudio();
      nextQuestion();
    });
    $('#rx-again').addEventListener('click', startSession);
    $('#rx-levelup').addEventListener('click', function () {
      var st = App.modeStats('rx');
      if (st.level < App.maxLevel()) {
        st.level++;
        App.saveStats();
        UI.toast('レベルアップ! Lv ' + st.level);
      }
      endToIdle();
    });

    // レベル手動変更
    $('#rx-level-down').addEventListener('click', function () {
      var st = App.modeStats('rx');
      if (st.level > 1) { st.level--; App.saveStats(); endToIdle(); }
    });
    $('#rx-level-up').addEventListener('click', function () {
      var st = App.modeStats('rx');
      if (st.level < App.maxLevel()) { st.level++; App.saveStats(); endToIdle(); }
    });

    // 実効速度ステッパ(画面上)
    $('#rx-eff-down').addEventListener('click', function () {
      var rx = App.settings.rx;
      if (rx.effWpm > 4) { rx.effWpm--; App.saveSettings(); renderHeader(); }
    });
    $('#rx-eff-up').addEventListener('click', function () {
      var rx = App.settings.rx;
      if (rx.effWpm < rx.charWpm) { rx.effWpm++; App.saveSettings(); renderHeader(); }
    });

    // 物理キーボード(デスクトップ向け)
    document.addEventListener('keydown', function (e) {
      if (UI.getTab() !== 'rx' || !session) { return; }
      if (e.repeat) { return; }
      if (session.phase === 'play') {
        if (e.key === 'Enter') { judge(); e.preventDefault(); return; }
        if (e.key === 'Backspace') { backspace(); e.preventDefault(); return; }
        if (e.key.length === 1) {
          var norm = MorseCodec.normalizeText(e.key, UI.getMode());
          if (norm && App.levelChars('rx').indexOf(norm) >= 0) {
            appendAnswer(norm);
          }
        }
      } else if (session.phase === 'result' && e.key === 'Enter') {
        nextQuestion();
        e.preventDefault();
      }
    });

    UI.bus.on('modechange', endToIdle);
    UI.bus.on('settingschange', function () {
      if (!session) { renderHeader(); }
    });
    UI.bus.on('tabchange', function (t) {
      if (t !== 'rx') { stopPlay(); }
    });

    endToIdle();
  }

  return { init: init };
})();

window.RxTrainer = RxTrainer;
