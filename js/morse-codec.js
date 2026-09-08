'use strict';

/*
 * テキスト⇄モールスの変換とタイムライン計算(純関数のみ)。
 * モールス内部表記: '.' と '-'。文字間はスペース1つ、語間は ' / '。
 */

var MorseCodec = (function () {
  var Data = (typeof module !== 'undefined' && typeof require === 'function')
    ? require('./morse-data.js')
    : window.MorseData;

  var COMBINING_VOICED = '゙';     // 結合濁点
  var COMBINING_SEMIVOICED = '゚'; // 結合半濁点
  var VOICED = '゛';               // ゛(独立)
  var SEMIVOICED = '゜';           // ゜(独立)
  var UNKNOWN_CHAR = '〓';         // 〓(未知符号)

  // 小書き→並字
  var SMALL_KANA = {
    'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ',
    'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ',
    'ヵ': 'カ', 'ヶ': 'ケ'
  };

  // 変換で受理する記号ゆれ → 正規形
  var WABUN_PUNCT_ALIAS = {
    '。': '、', '，': '、', ',': '、', '.': '、',
    '(': '（', ')': '）'
  };

  function getTable(mode) {
    return mode === 'wabun' ? Data.WABUN_TABLE : Data.INTL_TABLE;
  }

  // テキストをモード別に正規化(符号化可能な文字列へ)
  function normalizeText(text, mode) {
    if (!text) { return ''; }
    // NFKC は独立゛(U+309B)を「スペース+結合濁点」に分解するため先に結合形へ寄せる
    var s = String(text)
      .replace(/゛/g, '゙')
      .replace(/゜/g, '゚')
      .normalize('NFKC');
    if (mode !== 'wabun') {
      s = s.toUpperCase();
      var outI = '';
      for (var i = 0; i < s.length; i++) {
        var c = s[i];
        if (/\s/.test(c)) {
          if (outI && outI[outI.length - 1] !== ' ') { outI += ' '; }
        } else if (Data.INTL_TABLE[c]) {
          outI += c;
        }
      }
      return outI.replace(/ $/, '');
    }
    // 和文: 濁点分解 → 独立記号化 → カタカナ化 → 小書き展開
    s = s.normalize('NFD');
    var out = '';
    for (var j = 0; j < s.length; j++) {
      var ch = s[j];
      var cc = ch.charCodeAt(0);
      if (ch === COMBINING_VOICED) { ch = VOICED; }
      else if (ch === COMBINING_SEMIVOICED) { ch = SEMIVOICED; }
      else if (cc >= 0x3041 && cc <= 0x3096) {
        ch = String.fromCharCode(cc + 0x60); // ひらがな→カタカナ
      }
      if (SMALL_KANA[ch]) { ch = SMALL_KANA[ch]; }
      if (WABUN_PUNCT_ALIAS[ch]) { ch = WABUN_PUNCT_ALIAS[ch]; }
      if (/\s/.test(ch)) {
        if (out && out[out.length - 1] !== ' ') { out += ' '; }
      } else if (Data.WABUN_TABLE[ch]) {
        out += ch;
      }
    }
    return out.replace(/ $/, '');
  }

  function encodeChar(ch, mode) {
    return getTable(mode)[ch] || null;
  }

  // 正規化済み前提でなくてよい。戻り値: '.--. .- / ...' 形式
  function encode(text, mode) {
    var norm = normalizeText(text, mode);
    var parts = [];
    for (var i = 0; i < norm.length; i++) {
      var ch = norm[i];
      if (ch === ' ') { parts.push('/'); continue; }
      var code = getTable(mode)[ch];
      if (code) { parts.push(code); }
    }
    return parts.join(' ');
  }

  // 入力モールスの表記ゆれを '.'/'-' に正規化
  function normalizeMorse(morse) {
    if (!morse) { return ''; }
    return String(morse)
      .replace(/[・･]/g, '.')
      .replace(/[−－–—ー_]/g, '-')
      .replace(/[／]/g, '/')
      .replace(/[^.\-/\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildReverse(mode) {
    var table = getTable(mode);
    var rev = {};
    for (var k in table) {
      if (Object.prototype.hasOwnProperty.call(table, k)) {
        rev[table[k]] = k;
      }
    }
    return rev;
  }

  var reverseCache = {};
  function getReverse(mode) {
    var key = mode === 'wabun' ? 'wabun' : 'intl';
    if (!reverseCache[key]) { reverseCache[key] = buildReverse(key); }
    return reverseCache[key];
  }

  // ゛/゜を直前の文字と合成(ガ等)。合成不能なら独立表記のまま
  function composeWabun(prev, mark) {
    if (!prev) { return null; }
    var combining = mark === VOICED ? COMBINING_VOICED : COMBINING_SEMIVOICED;
    var composed = (prev + combining).normalize('NFC');
    return composed.length === 1 ? composed : null;
  }

  /*
   * decode('.-.. ..', 'wabun') → { text: 'ガ', tokens: [...] }
   * tokens[i] = { code, char, unknown } (charは合成後表示に使った生トークン)
   */
  function decode(morse, mode) {
    var norm = normalizeMorse(morse);
    var rev = getReverse(mode);
    var tokens = [];
    var text = '';
    if (!norm) { return { text: '', tokens: tokens }; }
    var codes = norm.split(' ');
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i];
      if (!code) { continue; }
      if (code === '/') {
        tokens.push({ code: '/', char: ' ', unknown: false });
        text += ' ';
        continue;
      }
      var ch = rev[code];
      if (!ch) {
        tokens.push({ code: code, char: UNKNOWN_CHAR, unknown: true });
        text += UNKNOWN_CHAR;
        continue;
      }
      if (mode === 'wabun' && (ch === VOICED || ch === SEMIVOICED) && text) {
        var prev = text[text.length - 1];
        var composed = composeWabun(prev, ch);
        if (composed) {
          text = text.slice(0, -1) + composed;
          tokens.push({ code: code, char: ch, unknown: false, composedWith: prev });
          continue;
        }
      }
      tokens.push({ code: code, char: ch, unknown: false });
      text += ch;
    }
    return { text: text, tokens: tokens };
  }

  // 表示用: '.-' → '・－'
  function toDisplay(morse) {
    return String(morse).replace(/\./g, '・').replace(/-/g, '－');
  }

  /*
   * モールス文字列から再生タイムラインを計算する純関数。
   * 短点=1u 長点=3u 要素間=1u は charWpm、文字間=3u 語間=7u は effWpm
   * (Farnsworth 単純方式)。effWpm > charWpm は charWpm に丸める。
   * 戻り値 totalMs は末尾の語間(7 farnUnit)込み(ループ再生用)。
   * marks[i] は i 番目の文字トークン(語区切り '/' を除く)の開始時刻。
   */
  function computeTimeline(morse, opts) {
    opts = opts || {};
    var charWpm = opts.charWpm || 20;
    var effWpm = Math.min(opts.effWpm || charWpm, charWpm);
    var unit = 1200 / charWpm;
    var farnUnit = 1200 / effWpm;
    var norm = normalizeMorse(morse);
    var tones = [];
    var marks = [];
    var t = 0;
    var charIndex = 0;
    if (!norm) {
      return { totalMs: 0, tones: tones, marks: marks, unitMs: unit, farnUnitMs: farnUnit };
    }
    var codes = norm.split(' ');
    var pendingGap = 0; // 直前トークンが積んだ後続ギャップ
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i];
      if (!code) { continue; }
      if (code === '/') {
        // 直前の文字間ギャップ(3u)を語間(7u)に置き換える
        if (pendingGap > 0) { t -= pendingGap; }
        t += farnUnit * 7;
        pendingGap = farnUnit * 7;
        continue;
      }
      marks.push({ charIndex: charIndex, startMs: t });
      charIndex++;
      for (var j = 0; j < code.length; j++) {
        if (j > 0) { t += unit; } // 要素間
        var dur = code[j] === '-' ? unit * 3 : unit;
        tones.push({ startMs: t, durMs: dur });
        t += dur;
      }
      t += farnUnit * 3; // 文字間
      pendingGap = farnUnit * 3;
    }
    // 末尾: 文字間ギャップを語間(7 farnUnit)に引き上げて総時間とする
    if (pendingGap > 0) {
      t = t - pendingGap + farnUnit * 7;
    }
    return { totalMs: t, tones: tones, marks: marks, unitMs: unit, farnUnitMs: farnUnit };
  }

  return {
    normalizeText: normalizeText,
    normalizeMorse: normalizeMorse,
    encode: encode,
    encodeChar: encodeChar,
    decode: decode,
    toDisplay: toDisplay,
    computeTimeline: computeTimeline,
    UNKNOWN_CHAR: UNKNOWN_CHAR,
    VOICED: VOICED,
    SEMIVOICED: SEMIVOICED
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MorseCodec;
} else {
  window.MorseCodec = MorseCodec;
}
