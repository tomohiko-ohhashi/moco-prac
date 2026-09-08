'use strict';

/*
 * 符号表・変換ツール。
 * 上: テキスト⇄モールス双方向ライブ変換+再生(文字ハイライト)
 * 下: モード別符号表(セルタップで発音)
 */

var Reference = (function () {
  var $ = function (s) { return UI.$(s); };
  var tr = function (k, p) { return I18n.t(k, p); };
  var playHandle = null;
  var updating = false; // 双方向変換のループ防止
  var previewChips = [];

  function playOpts() {
    return {
      charWpm: App.settings.rx.charWpm,
      effWpm: App.settings.rx.effWpm,
      freq: App.settings.audio.freq
    };
  }

  function stopPlay() {
    if (playHandle) { playHandle.stop(); playHandle = null; }
    $('#conv-play').hidden = false;
    $('#conv-stop').hidden = true;
    highlight(-1);
  }

  function highlight(idx) {
    previewChips.forEach(function (chip, i) {
      chip.classList.toggle('hl', i === idx);
    });
  }

  // 変換結果のプレビュー(文字+符号のチップ列)
  function renderPreview(morse) {
    var box = $('#conv-preview');
    box.textContent = '';
    previewChips = [];
    var r = MorseCodec.decode(morse, UI.getMode());
    r.tokens.forEach(function (t) {
      if (t.code === '/') {
        var gap = UI.el('span', 'chip', '␣');
        gap.style.opacity = '0.5';
        box.appendChild(gap);
        return; // 語間はハイライト対象外(marks に含まれない)
      }
      var chip = UI.el('span', 'chip');
      chip.appendChild(UI.el('span', null, t.char));
      chip.appendChild(UI.el('small', null, MorseCodec.toDisplay(t.code)));
      if (t.unknown) { chip.title = I18n.t('ref.unknown'); }
      box.appendChild(chip);
      previewChips.push(chip);
    });
  }

  function fromText() {
    if (updating) { return; }
    updating = true;
    var morse = MorseCodec.encode($('#conv-text').value, UI.getMode());
    $('#conv-morse').value = MorseCodec.toDisplay(morse).replace(/\//g, ' / ').replace(/\s+/g, ' ').trim();
    renderPreview(morse);
    updating = false;
  }

  function fromMorse() {
    if (updating) { return; }
    updating = true;
    var morse = MorseCodec.normalizeMorse($('#conv-morse').value);
    $('#conv-text').value = MorseCodec.decode(morse, UI.getMode()).text;
    renderPreview(morse);
    updating = false;
  }

  function play() {
    Audio2.ensureAudio();
    stopPlay();
    var morse = MorseCodec.normalizeMorse($('#conv-morse').value);
    if (!morse) { UI.toast(tr('ref.empty')); return; }
    var tl = MorseCodec.computeTimeline(morse, playOpts());
    $('#conv-play').hidden = true;
    $('#conv-stop').hidden = false;
    playHandle = Audio2.playTimeline(tl, {
      freq: App.settings.audio.freq,
      onProgress: highlight,
      onDone: function () { playHandle = null; stopPlay(); }
    });
  }

  // ---------- 符号表 ----------

  function cell(label, code, sub) {
    var c = UI.el('div', 'ref-cell');
    c.setAttribute('role', 'button');
    c.tabIndex = 0;
    c.appendChild(UI.el('span', null, label));
    c.appendChild(UI.el('small', null, sub || MorseCodec.toDisplay(code)));
    var fire = function () {
      Audio2.ensureAudio();
      if (playHandle) { playHandle.stop(); }
      playHandle = Audio2.playMorse(code, {
        charWpm: playOpts().charWpm,
        freq: playOpts().freq,
        onDone: function () { playHandle = null; }
      });
    };
    c.addEventListener('click', fire);
    c.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
    });
    return c;
  }

  function section(title, container) {
    container.appendChild(UI.el('div', 'ref-section-title', title));
    var grid = UI.el('div', 'ref-grid');
    container.appendChild(grid);
    return grid;
  }

  function renderIntlTables(root) {
    var T = MorseData.INTL_TABLE;
    var letters = section(tr('ref.letters'), root);
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (ch) {
      letters.appendChild(cell(ch, T[ch]));
    });
    var digits = section(tr('ref.digits'), root);
    '1234567890'.split('').forEach(function (ch) {
      digits.appendChild(cell(ch, T[ch]));
    });
    var marks = section(tr('ref.marks'), root);
    ['.', ',', '?', "'", '!', '/', '(', ')', ':', ';', '=', '+', '-', '"', '@'].forEach(function (ch) {
      marks.appendChild(cell(ch, T[ch]));
    });
  }

  function renderWabunTables(root) {
    var T = MorseData.WABUN_TABLE;
    var kana = section(tr('ref.kana'), root);
    kana.style.gridTemplateColumns = 'repeat(5, 1fr)';
    MorseData.GOJUON_DISPLAY.forEach(function (row) {
      for (var i = 0; i < 5; i++) {
        var ch = row[i];
        if (!ch || ch === ' ') {
          var empty = UI.el('div');
          kana.appendChild(empty);
        } else {
          kana.appendChild(cell(ch, T[ch]));
        }
      }
    });
    var marks = section(tr('ref.wabunMarks'), root);
    [['゛', 'ref.dakuten'], ['゜', 'ref.handakuten'], ['ー', 'ref.choon'], ['、', 'ref.kugiri'],
     ['」', 'ref.danraku'], ['（', 'ref.parenOpen'], ['）', 'ref.parenClose']].forEach(function (p) {
      var c = cell(p[0], T[p[0]]);
      c.title = tr(p[1]);
      marks.appendChild(c);
    });
    var pro = section(tr('ref.prosigns'), root);
    pro.appendChild(cell('ホレ', MorseData.WABUN_PROSIGNS['ホレ']));
    pro.appendChild(cell('ラタ', MorseData.WABUN_PROSIGNS['ラタ']));
    root.appendChild(UI.el('p', 'hint', tr('ref.wabunHint')));
  }

  function renderTables() {
    var root = $('#ref-tables');
    root.textContent = '';
    if (UI.getMode() === 'intl') {
      $('#ref-table-title').textContent = tr('ref.intlTitle');
      renderIntlTables(root);
    } else {
      $('#ref-table-title').textContent = tr('ref.wabunTitle');
      renderWabunTables(root);
    }
  }

  function init() {
    $('#conv-text').addEventListener('input', fromText);
    $('#conv-morse').addEventListener('input', fromMorse);
    $('#conv-play').addEventListener('click', play);
    $('#conv-stop').addEventListener('click', stopPlay);
    $('#conv-clear').addEventListener('click', function () {
      stopPlay();
      $('#conv-text').value = '';
      $('#conv-morse').value = '';
      renderPreview('');
    });
    UI.bus.on('modechange', function () {
      stopPlay();
      renderTables();
      fromText();
    });
    UI.bus.on('tabchange', function (tab) {
      if (tab !== 'ref') { stopPlay(); }
    });
    UI.bus.on('langchange', function () {
      renderTables();
      fromText(); // プレビューのツールチップ(未知の符号)も描き直す
    });
    renderTables();
  }

  return { init: init };
})();

window.Reference = Reference;
