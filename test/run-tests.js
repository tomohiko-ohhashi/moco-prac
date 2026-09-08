'use strict';

/* 依存ゼロのセルフテスト。実行: node test/run-tests.js */

var Data = require('../js/morse-data.js');
var Codec = require('../js/morse-codec.js');
var createKeyer = require('../js/keyer.js');
var Tree = require('../js/morse-tree.js');

var failures = 0;
var count = 0;

function assert(cond, label) {
  count++;
  if (cond) { return; }
  failures++;
  console.error('  ✗ ' + label);
}

function assertEq(actual, expected, label) {
  count++;
  if (actual === expected) { return; }
  failures++;
  console.error('  ✗ ' + label + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual));
}

function section(name) { console.log('- ' + name); }

// ---------- データ ----------
section('morse-data');

function checkTable(name, table) {
  var seen = {};
  var n = 0;
  for (var k in table) {
    if (!Object.prototype.hasOwnProperty.call(table, k)) { continue; }
    n++;
    var code = table[k];
    assert(/^[.-]+$/.test(code), name + '[' + k + '] は .- のみ: ' + JSON.stringify(code));
    assert(!seen[code], name + ' 内で符号重複: ' + code + ' (' + seen[code] + ' と ' + k + ')');
    seen[code] = k;
  }
  return n;
}

assertEq(checkTable('INTL', Data.INTL_TABLE), 51, '欧文テーブル件数 51 (A-Z + 0-9 + 記号15)');
assertEq(checkTable('WABUN', Data.WABUN_TABLE), 55, '和文テーブル件数 55 (カナ48 + 記号7)');
checkTable('PROSIGN', Data.WABUN_PROSIGNS);

assertEq(Data.INTL_TABLE['A'], '.-', 'A = .-');
assertEq(Data.INTL_TABLE['5'], '.....', '5 = .....');
assertEq(Data.WABUN_TABLE['イ'], '.-', 'イ = .-');
assertEq(Data.WABUN_TABLE['ン'], '.-.-.', 'ン = .-.-.');
assertEq(Data.WABUN_TABLE['゛'], '..', '濁点 = ..');
assertEq(Data.WABUN_TABLE['゜'], '..--.', '半濁点 = ..--.');
assertEq(Data.WABUN_TABLE['ー'], '.--.-', '長音 = .--.-');
assertEq(Data.WABUN_PROSIGNS['ホレ'], '-..---', 'ホレ = -..---');
assertEq(Data.WABUN_PROSIGNS['ラタ'], '...-.', 'ラタ = ...-.');

assertEq(Data.KOCH_ORDER.length, 41, 'コッホ順 41 文字(40レベル)');
(function () {
  var seen = {};
  Data.KOCH_ORDER.forEach(function (c) {
    assert(Data.INTL_TABLE[c], 'コッホ順の文字が欧文表にある: ' + c);
    assert(!seen[c], 'コッホ順に重複なし: ' + c);
    seen[c] = true;
  });
})();

assertEq(Data.WABUN_ORDER.length, 12, '和文レベルは 12 グループ');
(function () {
  var seen = {};
  var total = 0;
  Data.WABUN_ORDER.forEach(function (g) {
    g.chars.forEach(function (c) {
      total++;
      assert(Data.WABUN_TABLE[c], '五十音グループの文字が和文表にある: ' + c);
      assert(!seen[c], '五十音グループに重複なし: ' + c);
      seen[c] = true;
    });
  });
  assertEq(total, 53, '出題対象は 53 文字(全55 − ヰヱ)');
  assert(!seen['ヰ'] && !seen['ヱ'], 'ヰ・ヱは出題外');
})();

// ---------- コーデック ----------
section('morse-codec');

assertEq(Codec.encode('PARIS', 'intl'), '.--. .- .-. .. ...', "encode('PARIS')");
assertEq(Codec.encode('sos sos', 'intl'), '... --- ... / ... --- ...', '小文字+語間');
assertEq(Codec.encode('ガ', 'wabun'), '.-.. ..', 'ガ → カ+濁点');
assertEq(Codec.encode('パ', 'wabun'), '-... ..--.', 'パ → ハ+半濁点');
assertEq(Codec.normalizeText('がっこう', 'wabun'), 'カ゛ツコウ', 'ひらがな・小書きの正規化');
assertEq(Codec.normalizeText('ｶﾞ', 'wabun'), 'カ゛', '半角ｶﾞの正規化');
assertEq(Codec.normalizeText('キャベツ', 'wabun'), 'キヤヘ゛ツ', '小書きャ+濁点');
assertEq(Codec.normalizeText('ヴ', 'wabun'), 'ウ゛', 'ヴ → ウ+濁点');
assertEq(Codec.normalizeText('Ａb Ｃ', 'intl'), 'AB C', '全角英字の正規化');

// ラウンドトリップ: 表の全文字が encode→decode で戻る
(function () {
  ['intl', 'wabun'].forEach(function (mode) {
    var table = mode === 'intl' ? Data.INTL_TABLE : Data.WABUN_TABLE;
    for (var ch in table) {
      if (!Object.prototype.hasOwnProperty.call(table, ch)) { continue; }
      var r = Codec.decode(table[ch], mode);
      assertEq(r.text, ch, mode + ' ラウンドトリップ: ' + ch);
    }
  });
})();

assertEq(Codec.decode('-... ..', 'wabun').text, 'バ', "['-...','..'] → バ 合成");
assertEq(Codec.decode('.-.. ..--.', 'wabun').text, 'カ゜', '合成不能の半濁点は独立表記');
(function () {
  var r = Codec.decode('.-------', 'intl');
  assertEq(r.text, '〓', '未知符号 → 〓');
  assertEq(r.tokens[0].code, '.-------', '未知符号の生符号を保持');
})();
assertEq(Codec.decode('・－・－ ／ ・－', 'wabun').text, 'ロ イ', '・－ 表記と全角／の受理');
assertEq(Codec.toDisplay('.-'), '・－', '表示変換');

// ---------- タイムライン ----------
section('computeTimeline');

(function () {
  var tl = Codec.computeTimeline('.', { charWpm: 20, effWpm: 20 });
  assertEq(tl.unitMs, 60, 'ditMs(20wpm) = 60');
})();
(function () {
  var tl = Codec.computeTimeline(Codec.encode('PARIS', 'intl'), { charWpm: 20, effWpm: 20 });
  assertEq(Math.round(tl.totalMs), 3000, 'PARIS@20/20 = 3000ms (50units)');
  assertEq(tl.tones.length, 14, 'PARIS のトーン数 14');
  assertEq(tl.marks.length, 5, 'PARIS のマーク数 5');
  assertEq(tl.marks[0].startMs, 0, '先頭マークは 0ms');
})();
(function () {
  // Farnsworth: 要素は charWpm、ギャップのみ effWpm
  var fast = Codec.computeTimeline('.- .-', { charWpm: 18, effWpm: 18 });
  var farn = Codec.computeTimeline('.- .-', { charWpm: 18, effWpm: 9 });
  var u = 1200 / 18;
  var fu = 1200 / 9;
  assertEq(Math.round(farn.tones[0].durMs), Math.round(u), 'Farnsworth でも短点は charWpm');
  assertEq(Math.round(farn.marks[1].startMs - fast.marks[1].startMs), Math.round(3 * (fu - u)), '文字間ギャップのみ伸長');
})();
(function () {
  var eff = Codec.computeTimeline('.', { charWpm: 20, effWpm: 30 });
  assertEq(eff.farnUnitMs, eff.unitMs, 'effWpm > charWpm は charWpm に丸め');
})();
(function () {
  var tl = Codec.computeTimeline('... / ---', { charWpm: 20, effWpm: 20 });
  // S(5u) + 語間7u + O(11u) + 末尾7u = 30u
  assertEq(Math.round(tl.totalMs), 30 * 60, '語間は 7u');
  assertEq(Math.round(tl.marks[1].startMs), 12 * 60, '語区切り後の開始位置');
})();

// ---------- キーヤー ----------
section('keyer');

(function () {
  var unit = 80;
  var chars = [];
  var words = 0;
  var els = [];
  var k = createKeyer({
    unitMs: unit,
    onElement: function (el) { els.push(el); },
    onChar: function (code) { chars.push(code); },
    onWord: function () { words++; }
  });
  var t = 1000;
  // 60ms 押下 → 短点
  k.down(t); k.up(t + 60);
  assertEq(els[0], '.', '60ms押下 → 短点 (unit=80)');
  // 200ms 押下 → 長点
  k.down(t + 100); k.up(t + 300);
  assertEq(els[1], '-', '200ms押下 → 長点');
  // 無音 170ms(>160) → 文字確定
  k.poll(t + 300 + 170);
  assertEq(chars.length, 1, '無音170msで文字確定');
  assertEq(chars[0], '.-', '確定コードは .-');
  // 無音 420ms(>400) → 語確定
  k.poll(t + 300 + 420);
  assertEq(words, 1, '無音420msで語確定');
  k.poll(t + 300 + 900);
  assertEq(words, 1, '語確定は一度だけ');
})();

(function () {
  // カ(.-..) → ゛(..) のスクリプト打鍵が「ガ」にデコードされる
  var unit = 80;
  var decoded = '';
  var k = createKeyer({
    unitMs: unit,
    onChar: function (code) {
      var r = Codec.decode(decoded ? Codec.encode(decoded, 'wabun') + ' ' + code : code, 'wabun');
      decoded = r.text;
    }
  });
  var t = 0;
  function tap(durUnits) { k.down(t); t += durUnits * unit; k.up(t); t += unit; }
  // カ = .-..
  tap(1); tap(3); tap(1); tap(1);
  t += 2 * unit; k.poll(t); // 文字間
  // ゛ = ..
  tap(1); tap(1);
  t += 2 * unit + 1; k.poll(t);
  assertEq(decoded, 'ガ', 'カ+゛の打鍵 → ガ');
})();

(function () {
  // ゆっくり確定: 閾値 1.5 倍
  var chars = [];
  var k = createKeyer({ unitMs: 80, slow: true, onChar: function (c) { chars.push(c); } });
  k.down(0); k.up(60);
  k.poll(60 + 170); // 通常なら確定(>160)だが slow は 240 まで待つ
  assertEq(chars.length, 0, 'slow時 170ms では未確定');
  k.poll(60 + 250);
  assertEq(chars.length, 1, 'slow時 250ms で確定');
})();

(function () {
  // 二つボタンモード + cancel
  var els = [];
  var k = createKeyer({ unitMs: 80, onElement: function (e) { els.push(e); } });
  k.element('.', 0);
  k.element('-', 100);
  assertEq(k.getBuffer(), '.-', '要素直接入力');
  k.reset();
  k.down(0);
  k.cancel(50);
  assert(!k.isDown(), 'cancel で押下解除');
})();

// ---------- モールスツリー ----------
section('morse-tree');

(function () {
  var t = Tree.build('intl');
  assertEq(t.depth, 4, '欧文ツリーの深さ 4');
  assertEq(t.leaves, 16, '欧文ツリーの葉 16');
  assertEq(t.nodes.length, 31, '欧文ツリーのノード数 31 (根 + 2+4+8+16)');
  var withChar = t.nodes.filter(function (n) { return n.char; }).length;
  assertEq(withChar, 26, '欧文ツリーは A-Z の 26 文字を配置');
  assertEq(t.byCode['-.-'].char, 'K', "'-.-' → K");
  assertEq(t.byCode['.'].char, 'E', "'.' → E");
  assertEq(t.byCode['-'].char, 'T', "'-' → T");
  assertEq(t.byCode['.'].x, 0.25, '短点側は左(x=0.25)');
  assertEq(t.byCode['-'].x, 0.75, '長点側は右(x=0.75)');
  assertEq(t.byCode['..'].x, 0.125, "'..' の横位置 0.125");
  assert(t.byCode['-'].dah && !t.byCode['.'].dah, 'dah フラグ');
  assertEq(t.byCode['..--'].char, null, "'..--' は欧文では空ノード");
  assertEq(Tree.parentCode('-.-'), '-.', '親符号');
  // 全ノードの符号が index と整合する(左=短点)
  t.nodes.forEach(function (n) {
    if (n.depth === 0) { return; }
    var bits = n.code.replace(/\./g, '0').replace(/-/g, '1');
    assertEq(parseInt(bits, 2), n.index, 'index と符号の対応: ' + n.code);
  });
})();

(function () {
  var t = Tree.build('wabun');
  assertEq(t.depth, 5, '和文ツリーの深さ 5');
  assertEq(t.nodes.length, 63, '和文ツリーのノード数 63');
  var withChar = t.nodes.filter(function (n) { return n.char; }).length;
  assertEq(withChar, 51, '和文ツリーは 5 要素以下の 51 文字(カナ48 + ゛゜ー)');
  assertEq(t.byCode['.-'].char, 'イ', "'.-' → イ");
  assertEq(t.byCode['..'].char, '゛', "'..' → ゛");
  assertEq(t.byCode['--.--'].char, 'ア', "'--.--' → ア");
  assert(!t.byCode['.-.-.-'], '6 要素の記号はツリー外');
})();

// ---------- 結果 ----------
console.log('');
if (failures > 0) {
  console.error(failures + ' / ' + count + ' 件失敗');
  process.exit(1);
} else {
  console.log('OK: ' + count + ' 件成功');
}
