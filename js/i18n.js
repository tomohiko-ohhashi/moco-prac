'use strict';

/*
 * 表示言語(日本語 / English)。
 * - t(key, params): 現在の言語の文字列を返す({n} を params で置換)
 * - apply(): data-i18n / data-i18n-title / data-i18n-aria / data-i18n-ph を持つ
 *   要素の文字列を差し替え、<html lang> と <title> も更新する
 * 辞書は ja / en でキーを揃える(テストで検査)。Node でも読み込める。
 */

var I18n = (function () {
  var DICT = {
    ja: {
      'app.title': 'もこぷらっ！ − モールス練習アプリ',
      'mode.aria': '符号モード',
      'mode.intl': '欧文',
      'mode.wabun': '和文',
      'tab.aria': 'メインタブ',
      'tab.rx': '聞き取り',
      'tab.tx': '打鍵',
      'tab.ref': '符号表',
      'tab.settings': '設定',
      'level.aria': 'レベル',
      'level.down': 'レベルを下げる',
      'level.up': 'レベルを上げる',
      'common.clear': 'クリア',
      'common.again': 'もう一度',
      'common.next': '次へ',
      'common.close': '閉じる',
      'common.play': '🔊 再生',
      'common.skip': 'スキップ',

      'rx.aria': '聞き取り練習',
      'rx.eff.aria': '実効速度',
      'rx.eff.down': '実効速度を下げる',
      'rx.eff.up': '実効速度を上げる',
      'rx.start': 'セッション開始',
      'rx.idleInfo': '再生される符号を聞いて、文字を答えてください。',
      'rx.replay': '🔊 もう一度再生',
      'rx.backspace': '1文字削除',
      'rx.submit': '判定',
      'rx.summaryTitle': 'セッション結果',
      'rx.levelUp': '⬆ レベルアップ',
      'rx.qnum': '第 {n} 問 / {total}',
      'rx.yours': 'あなたの回答: {a}',
      'rx.rate': '正答率 {n}%',
      'rx.levelUpToast': 'レベルアップ! Lv {n}',

      'tx.aria': '打鍵練習',
      'tx.submode.aria': '練習モード',
      'tx.free': '自由打鍵',
      'tx.drill': '課題',
      'tx.tree': 'ツリー',
      'tx.game': 'ゲーム',
      'tx.target': 'お題:',
      'tx.listen': '🔊 聞く',
      'tx.auto': '自動',
      'tx.autoTitle': 'お題が変わったら自動で再生',
      'tx.drillScore': '正解 {c} / {a}',
      'tx.correct': '○ 正解',
      'tx.wrong': '× 正解は {ch} {code}',
      'tx.half.aria': '表示する側',
      'tx.half.dit': '・側',
      'tx.half.dah': '−側',
      'tx.pad': 'タップ / 長押しで打鍵(PC は Space キー)',
      'tx.dit': '短点',
      'tx.dah': '長点',
      'tree.aria': 'モールスツリー',

      'game.dur.aria': '制限時間',
      'game.sec': '{n}秒',
      'game.src.aria': '出題',
      'game.words': '単語',
      'game.random': 'ランダム5文字',
      'game.code': '・− 表示',
      'game.codeTitle': '文字の下にトンツーを表示',
      'game.start': '▶ スタート',
      'game.hint': '制限時間内にできるだけ多くの文字を打鍵しましょう',
      'game.best': '自己ベスト({d}秒): {chars} 文字 / {cpm} CPM / 正答率 {acc}%',
      'game.next': '次: {w}',
      'game.score': '{c} 文字 / ミス {m}',
      'game.time': '残り {n} 秒',
      'game.resultChars': '{n} 文字',
      'game.resultDetail': '{d} 秒 / ミス {m} / 正答率 {acc}% / {cpm} CPM',
      'game.newBest': ' 🎉 自己ベスト',

      'ref.aria': '符号表・変換',
      'ref.convTitle': '変換ツール',
      'ref.text': 'テキスト',
      'ref.textPh': 'SOS / こんにちは',
      'ref.morse': 'モールス(・− / .- どちらでも)',
      'ref.play': '▶ 再生',
      'ref.stop': '■ 停止',
      'ref.tableHint': 'タップすると符号を再生します。',
      'ref.unknown': '未知の符号',
      'ref.empty': '変換するテキストを入力してください',
      'ref.intlTitle': '欧文符号表',
      'ref.wabunTitle': '和文符号表',
      'ref.letters': '文字',
      'ref.digits': '数字',
      'ref.marks': '記号',
      'ref.kana': '五十音',
      'ref.wabunMarks': '濁点・記号',
      'ref.prosigns': '特殊符号',
      'ref.dakuten': '濁点',
      'ref.handakuten': '半濁点',
      'ref.choon': '長音',
      'ref.kugiri': '区切点',
      'ref.danraku': '段落',
      'ref.parenOpen': '下向括弧',
      'ref.parenClose': '上向括弧',
      'ref.wabunHint': 'ホレ=本文開始、ラタ=本文終了。濁音・半濁音は「カ ゛」のように清音の後に濁点を打ちます。',

      'set.aria': '設定',
      'set.sound': '音',
      'set.freq': '周波数',
      'set.volume': '音量',
      'set.test': 'テスト再生',
      'set.testBtn': '🔊 テスト',
      'set.rx': '聞き取り練習',
      'set.charWpm': '文字速度',
      'set.effWpm': '実効速度',
      'set.questions': '出題数 / セッション',
      'set.questionsUnit': '{n} 問',
      'set.groupSize': '出題文字数',
      'set.tx': '打鍵練習',
      'set.txWpm': '判定速度',
      'set.input': '入力方式',
      'set.straight': 'ストレート',
      'set.paddle': '二つボタン',
      'set.slow': 'ゆっくり確定',
      'set.slowHint': '文字・語の確定を1.5倍待つ',
      'set.autoPlay': 'お題を自動再生',
      'set.autoPlayHint': '課題モードでお題が変わるたびに符号を鳴らす',
      'set.screen': '画面',
      'set.wakeLock': 'スリープ防止',
      'set.wakeLockHint': '練習中に画面を消灯しない',
      'set.wakeLockFail': 'スリープ防止を有効にできませんでした',
      'set.language': '言語',
      'set.stats': '統計',
      'set.statLevel': 'レベル',
      'set.statSessions': 'セッション',
      'set.statRate': '文字正答率',
      'set.statRxIntl': '聞き取り・欧文',
      'set.statRxWabun': '聞き取り・和文',
      'set.statTxIntl': '打鍵・欧文',
      'set.statTxWabun': '打鍵・和文',
      'set.resetStats': '統計をリセット',
      'set.resetAll': '全データをリセット',
      'set.resetStatsConfirm': '学習統計(レベル・正答率)をリセットします。よろしいですか?',
      'set.resetStatsDone': '統計をリセットしました',
      'set.resetAllConfirm': '設定・統計をすべて削除して初期状態に戻します。よろしいですか?',
      'about.title': 'このアプリについて',
      'about.name': 'もこぷらっ！(モールス練習アプリ)',
      'about.desc': '欧文・和文対応のモールス信号練習アプリ。オフラインでも動作します。',
      'about.repo': 'GitHub リポジトリ',
      'about.ios': '⚠ iPhone / iPad はマナーモード(消音スイッチON)にしていると音が出ません。音が出ない場合は消音スイッチと音量をご確認ください。'
    },
    en: {
      'app.title': 'もこぷらっ！ − Morse Code Trainer',
      'mode.aria': 'Code mode',
      'mode.intl': 'Intl',
      'mode.wabun': 'Wabun',
      'tab.aria': 'Main tabs',
      'tab.rx': 'Listen',
      'tab.tx': 'Key',
      'tab.ref': 'Chart',
      'tab.settings': 'Settings',
      'level.aria': 'Level',
      'level.down': 'Lower level',
      'level.up': 'Raise level',
      'common.clear': 'Clear',
      'common.again': 'Again',
      'common.next': 'Next',
      'common.close': 'Close',
      'common.play': '🔊 Play',
      'common.skip': 'Skip',

      'rx.aria': 'Listening practice',
      'rx.eff.aria': 'Effective speed',
      'rx.eff.down': 'Decrease effective speed',
      'rx.eff.up': 'Increase effective speed',
      'rx.start': 'Start session',
      'rx.idleInfo': 'Listen to the code and answer the character(s).',
      'rx.replay': '🔊 Play again',
      'rx.backspace': 'Delete one character',
      'rx.submit': 'Check',
      'rx.summaryTitle': 'Session results',
      'rx.levelUp': '⬆ Level up',
      'rx.qnum': 'Q {n} / {total}',
      'rx.yours': 'Your answer: {a}',
      'rx.rate': 'Accuracy {n}%',
      'rx.levelUpToast': 'Level up! Lv {n}',

      'tx.aria': 'Keying practice',
      'tx.submode.aria': 'Practice mode',
      'tx.free': 'Free',
      'tx.drill': 'Drill',
      'tx.tree': 'Tree',
      'tx.game': 'Game',
      'tx.target': 'Target:',
      'tx.listen': '🔊 Listen',
      'tx.auto': 'Auto',
      'tx.autoTitle': 'Play automatically when the target changes',
      'tx.drillScore': 'Correct {c} / {a}',
      'tx.correct': '○ Correct',
      'tx.wrong': '× Answer: {ch} {code}',
      'tx.half.aria': 'Visible half',
      'tx.half.dit': '・ side',
      'tx.half.dah': '− side',
      'tx.pad': 'Tap / hold to key (Space key on PC)',
      'tx.dit': 'Dit',
      'tx.dah': 'Dah',
      'tree.aria': 'Morse tree',

      'game.dur.aria': 'Time limit',
      'game.sec': '{n}s',
      'game.src.aria': 'Source',
      'game.words': 'Words',
      'game.random': 'Random 5',
      'game.code': 'Show ・−',
      'game.codeTitle': 'Show the code under each character',
      'game.start': '▶ Start',
      'game.hint': 'Key as many characters as you can before time runs out',
      'game.best': 'Best ({d}s): {chars} chars / {cpm} CPM / {acc}% accuracy',
      'game.next': 'Next: {w}',
      'game.score': '{c} chars / {m} misses',
      'game.time': '{n} s left',
      'game.resultChars': '{n} chars',
      'game.resultDetail': '{d} s / {m} misses / {acc}% accuracy / {cpm} CPM',
      'game.newBest': ' 🎉 New best',

      'ref.aria': 'Code chart & converter',
      'ref.convTitle': 'Converter',
      'ref.text': 'Text',
      'ref.textPh': 'SOS / HELLO',
      'ref.morse': 'Morse (・− or .- both accepted)',
      'ref.play': '▶ Play',
      'ref.stop': '■ Stop',
      'ref.tableHint': 'Tap a cell to play its code.',
      'ref.unknown': 'Unknown code',
      'ref.empty': 'Enter some text to convert',
      'ref.intlTitle': 'International Morse',
      'ref.wabunTitle': 'Wabun (Japanese) Morse',
      'ref.letters': 'Letters',
      'ref.digits': 'Digits',
      'ref.marks': 'Punctuation',
      'ref.kana': 'Kana',
      'ref.wabunMarks': 'Marks',
      'ref.prosigns': 'Prosigns',
      'ref.dakuten': 'Dakuten (voiced)',
      'ref.handakuten': 'Handakuten (semi-voiced)',
      'ref.choon': 'Long vowel',
      'ref.kugiri': 'Comma',
      'ref.danraku': 'Paragraph',
      'ref.parenOpen': 'Open bracket',
      'ref.parenClose': 'Close bracket',
      'ref.wabunHint': 'ホレ = start of text, ラタ = end of text. Voiced kana are keyed as the base kana followed by ゛ (e.g. カ ゛ → ガ).',

      'set.aria': 'Settings',
      'set.sound': 'Sound',
      'set.freq': 'Pitch',
      'set.volume': 'Volume',
      'set.test': 'Test tone',
      'set.testBtn': '🔊 Test',
      'set.rx': 'Listening',
      'set.charWpm': 'Character speed',
      'set.effWpm': 'Effective speed',
      'set.questions': 'Questions / session',
      'set.questionsUnit': '{n}',
      'set.groupSize': 'Chars / question',
      'set.tx': 'Keying',
      'set.txWpm': 'Decode speed',
      'set.input': 'Input',
      'set.straight': 'Straight',
      'set.paddle': 'Two buttons',
      'set.slow': 'Slow decode',
      'set.slowHint': 'Wait 1.5× longer before confirming a character / word',
      'set.autoPlay': 'Auto-play target',
      'set.autoPlayHint': 'Play the code whenever the drill target changes',
      'set.screen': 'Screen',
      'set.wakeLock': 'Keep screen on',
      'set.wakeLockHint': 'Prevent the screen from sleeping while practicing',
      'set.wakeLockFail': 'Could not enable keep-screen-on',
      'set.language': 'Language',
      'set.stats': 'Statistics',
      'set.statLevel': 'Level',
      'set.statSessions': 'Sessions',
      'set.statRate': 'Char accuracy',
      'set.statRxIntl': 'Listen · Intl',
      'set.statRxWabun': 'Listen · Wabun',
      'set.statTxIntl': 'Key · Intl',
      'set.statTxWabun': 'Key · Wabun',
      'set.resetStats': 'Reset statistics',
      'set.resetAll': 'Reset all data',
      'set.resetStatsConfirm': 'Reset learning statistics (levels and accuracy)?',
      'set.resetStatsDone': 'Statistics have been reset',
      'set.resetAllConfirm': 'Delete all settings and statistics and start over?',
      'about.title': 'About',
      'about.name': 'もこぷらっ！ (Morse Code Trainer)',
      'about.desc': 'Morse code trainer for International and Wabun (Japanese) code. Works offline.',
      'about.repo': 'GitHub repository',
      'about.ios': '⚠ On iPhone / iPad no sound is produced while the silent switch is on. If you hear nothing, check the silent switch and the volume.'
    }
  };

  var LANGS = ['ja', 'en'];
  var lang = 'ja';

  function normalize(l) {
    return LANGS.indexOf(l) >= 0 ? l : 'ja';
  }

  function setLang(l) {
    lang = normalize(l);
  }

  function getLang() { return lang; }

  function t(key, params) {
    var d = DICT[lang] || DICT.ja;
    var s = Object.prototype.hasOwnProperty.call(d, key) ? d[key] : DICT.ja[key];
    if (s === undefined) { return key; }
    if (params) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m;
      });
    }
    return s;
  }

  // data-i18n 属性を持つ要素の文字列を差し替える(ブラウザのみ)
  function apply(root) {
    if (typeof document === 'undefined') { return; }
    root = root || document;
    var each = function (sel, fn) {
      Array.prototype.forEach.call(root.querySelectorAll(sel), fn);
    };
    each('[data-i18n]', function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    each('[data-i18n-title]', function (el) { el.title = t(el.getAttribute('data-i18n-title')); });
    each('[data-i18n-aria]', function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    each('[data-i18n-ph]', function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    if (root === document) {
      document.documentElement.lang = lang;
      document.title = t('app.title');
    }
  }

  return {
    DICT: DICT,
    LANGS: LANGS,
    setLang: setLang,
    getLang: getLang,
    normalize: normalize,
    t: t,
    apply: apply
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = I18n;
} else {
  window.I18n = I18n;
}
