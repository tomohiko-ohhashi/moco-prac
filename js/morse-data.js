'use strict';

/*
 * モールス符号データ定義(欧文・和文)。
 * 内部表記: 短点 '.' / 長点 '-'。文字間はスペース、語間は '/'。
 * 和文表は無線局運用規則 別表第1号系の公開資料
 * (benricho.org / JARL 早見表 / JA1XRQ 表)と照合済み。
 */

var MorseData = (function () {
  // 欧文(国際モールス): A-Z, 0-9, ITU 記号
  var INTL_TABLE = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.',
    'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---',
    'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---',
    'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-',
    'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--',
    'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
    '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.',
    '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-',
    ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.',
    '-': '-....-', '"': '.-..-.', '@': '.--.-.'
  };

  // 和文(カタカナ+記号)。゛=U+309B ゜=U+309C(独立形)
  var WABUN_TABLE = {
    'イ': '.-', 'ロ': '.-.-', 'ハ': '-...', 'ニ': '-.-.', 'ホ': '-..',
    'ヘ': '.', 'ト': '..-..', 'チ': '..-.', 'リ': '--.', 'ヌ': '....',
    'ル': '-.--.', 'ヲ': '.---', 'ワ': '-.-', 'カ': '.-..', 'ヨ': '--',
    'タ': '-.', 'レ': '---', 'ソ': '---.', 'ツ': '.--.', 'ネ': '--.-',
    'ナ': '.-.', 'ラ': '...', 'ム': '-', 'ウ': '..-', 'ヰ': '.-..-',
    'ノ': '..--', 'オ': '.-...', 'ク': '...-', 'ヤ': '.--', 'マ': '-..-',
    'ケ': '-.--', 'フ': '--..', 'コ': '----', 'エ': '-.---', 'テ': '.-.--',
    'ア': '--.--', 'サ': '-.-.-', 'キ': '-.-..', 'ユ': '-..--', 'メ': '-...-',
    'ミ': '..-.-', 'シ': '--.-.', 'ヱ': '.--..', 'ヒ': '--..-', 'モ': '-..-.',
    'セ': '.---.', 'ス': '---.-', 'ン': '.-.-.',
    '゛': '..',      // ゛ 濁点
    '゜': '..--.',   // ゜ 半濁点
    'ー': '.--.-',       // 長音
    '、': '.-.-.-',      // 区切点
    '」': '.-.-..',      // 段落
    '（': '-.--.-',      // 下向括弧
    '）': '.-..-.'       // 上向括弧
  };

  // 特殊符号(符号表・変換表示のみ。ドリル出題外)
  var WABUN_PROSIGNS = {
    'ホレ': '-..---', // 和文通信の開始
    'ラタ': '...-.'   // 和文通信の終了
  };

  // コッホ法 学習順(LCWO 準拠、41文字=40レベル)
  var KOCH_ORDER = [
    'K', 'M', 'U', 'R', 'E', 'S', 'N', 'A', 'P', 'T',
    'L', 'W', 'I', '.', 'J', 'Z', '=', 'F', 'O', 'Y',
    ',', 'V', 'G', '5', '/', 'Q', '9', '2', 'H', '3',
    '8', 'B', '?', '4', '7', 'C', '1', 'D', '6', '0', 'X'
  ];

  // 和文 五十音グループ(12レベル)。ヰ・ヱは符号表のみで出題外
  var WABUN_ORDER = [
    { label: 'ア行', chars: ['ア', 'イ', 'ウ', 'エ', 'オ'] },
    { label: 'カ行', chars: ['カ', 'キ', 'ク', 'ケ', 'コ'] },
    { label: 'サ行', chars: ['サ', 'シ', 'ス', 'セ', 'ソ'] },
    { label: 'タ行', chars: ['タ', 'チ', 'ツ', 'テ', 'ト'] },
    { label: 'ナ行', chars: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'] },
    { label: 'ハ行', chars: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'] },
    { label: 'マ行', chars: ['マ', 'ミ', 'ム', 'メ', 'モ'] },
    { label: 'ヤ行', chars: ['ヤ', 'ユ', 'ヨ'] },
    { label: 'ラ行', chars: ['ラ', 'リ', 'ル', 'レ', 'ロ'] },
    { label: 'ワ行・ン', chars: ['ワ', 'ヲ', 'ン'] },
    { label: '濁点・長音', chars: ['゛', '゜', 'ー'] },
    { label: '記号', chars: ['、', '」', '（', '）'] }
  ];

  // 五十音表表示用(符号表画面のグリッド順)
  var GOJUON_DISPLAY = [
    'アイウエオ', 'カキクケコ', 'サシスセソ', 'タチツテト', 'ナニヌネノ',
    'ハヒフヘホ', 'マミムメモ', 'ヤ ユ ヨ', 'ラリルレロ', 'ワヰ ヱヲ', 'ン'
  ];

  // タイピングゲーム用の単語リスト(現在レベルの文字だけで組める語を出題)
  var WORDS_INTL = [
    // --- 一般的な英単語(頻出語・身近な名詞)。初級レベル(K M U R E S N A P T)で組める短い語も多く含む ---
    // 2〜3 文字
    'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'IN', 'IS', 'IT', 'ME', 'MY',
    'NO', 'OF', 'ON', 'OR', 'SO', 'TO', 'UP', 'US', 'WE', 'KM',
    'ACT', 'ADD', 'AGE', 'AGO', 'AIR', 'ALL', 'AND', 'ANY', 'APE', 'ARE', 'ARM', 'ART',
    'ASK', 'BAD', 'BAG', 'BED', 'BIG', 'BIT', 'BOX', 'BOY', 'BUS', 'BUT', 'BUY', 'CAN',
    'CAR', 'CAT', 'CUP', 'CUT', 'DAY', 'DOG', 'DRY', 'EAR', 'EAT', 'EGG', 'END', 'ERA',
    'EYE', 'FAR', 'FEW', 'FLY', 'FOR', 'FUN', 'GET', 'GOT', 'HAT', 'HER', 'HIM', 'HIS',
    'HIT', 'HOT', 'HOW', 'ICE', 'ITS', 'JOB', 'KEY', 'KID', 'LAW', 'LAY', 'LEG', 'LET',
    'LIE', 'LOT', 'LOW', 'MAN', 'MAP', 'MAT', 'MAY', 'MEN', 'MIX', 'NAP', 'NET', 'NEW',
    'NOT', 'NOW', 'NUT', 'ODD', 'OFF', 'OIL', 'OLD', 'ONE', 'OUR', 'OUT', 'OWN', 'PAN',
    'PAT', 'PAY', 'PEA', 'PEN', 'PET', 'PUT', 'RAT', 'RED', 'RUM', 'RUN', 'SAD', 'SAT',
    'SAY', 'SEA', 'SEE', 'SET', 'SHE', 'SIT', 'SIX', 'SKY', 'SPA', 'SUM', 'SUN', 'TAP',
    'TAX', 'TEA', 'TEN', 'THE', 'TIE', 'TOP', 'TOY', 'TRY', 'TWO', 'USE', 'WAR', 'WAY',
    'WET', 'WHO', 'WHY', 'WIN', 'YES', 'YET', 'YOU',
    // 4 文字
    'ABLE', 'ALSO', 'AREA', 'ARMY', 'AWAY', 'BABY', 'BACK', 'BALL', 'BAND', 'BANK',
    'BASE', 'BEAR', 'BEST', 'BIRD', 'BLUE', 'BOAT', 'BODY', 'BOOK', 'BORN', 'BOTH',
    'CAKE', 'CALL', 'CAMP', 'CARD', 'CARE', 'CASE', 'CITY', 'COLD', 'COME', 'COOK',
    'COOL', 'COPY', 'CORN', 'COST', 'DARK', 'DATA', 'DATE', 'DEAL', 'DEAR', 'DEEP',
    'DESK', 'DOOR', 'DOWN', 'DRAW', 'DROP', 'DUST', 'EACH', 'EASY', 'EAST', 'EDGE',
    'ELSE', 'EVEN', 'EVER', 'FACE', 'FACT', 'FALL', 'FARM', 'FAST', 'FEAR', 'FEEL',
    'FILE', 'FILM', 'FIND', 'FINE', 'FIRE', 'FISH', 'FIVE', 'FLAT', 'FOOD', 'FOOT',
    'FORM', 'FOUR', 'FREE', 'FROM', 'FULL', 'GAME', 'GATE', 'GIFT', 'GIRL', 'GIVE',
    'GLAD', 'GOAL', 'GOLD', 'GOOD', 'GRAY', 'GROW', 'HAIR', 'HALF', 'HALL', 'HAND',
    'HARD', 'HAVE', 'HEAD', 'HEAR', 'HEAT', 'HELP', 'HERE', 'HIGH', 'HILL', 'HOLD',
    'HOLE', 'HOME', 'HOPE', 'HOUR', 'HUGE', 'IDEA', 'INTO', 'IRON', 'ITEM', 'JOIN',
    'JUMP', 'JUST', 'KEEP', 'KIND', 'KING', 'KNOW', 'LAKE', 'LAND', 'LAST', 'LATE',
    'LEAD', 'LEAF', 'LEFT', 'LESS', 'LIFE', 'LIFT', 'LIKE', 'LINE', 'LIST', 'LIVE',
    'LONG', 'LOOK', 'LOSE', 'LOVE', 'MADE', 'MAIL', 'MAIN', 'MAKE', 'MANY', 'MARK',
    'MAST', 'MEAN', 'MEAT', 'MEET', 'MILK', 'MIND', 'MINE', 'MISS', 'MOON', 'MORE',
    'MOST', 'MOVE', 'MUCH', 'MUST', 'NAME', 'NEAR', 'NEAT', 'NECK', 'NEED', 'NEST',
    'NEWS', 'NEXT', 'NICE', 'NINE', 'NOON', 'NOSE', 'NOTE', 'ONCE', 'ONLY', 'OPEN',
    'OVER', 'PAGE', 'PAIR', 'PARK', 'PART', 'PASS', 'PAST', 'PATH', 'PEAR', 'PLAN',
    'PLAY', 'POOL', 'POOR', 'PULL', 'PURE', 'PUSH', 'RACE', 'RAIN', 'READ', 'REAL',
    'REST', 'RICH', 'RIDE', 'RING', 'RISE', 'RISK', 'ROAD', 'ROCK', 'ROLL', 'ROOF',
    'ROOM', 'ROOT', 'ROSE', 'RULE', 'SAFE', 'SAIL', 'SALT', 'SAME', 'SAND', 'SAVE',
    'SEAT', 'SEED', 'SEEM', 'SELL', 'SEND', 'SHIP', 'SHOP', 'SHOW', 'SIDE', 'SIGN',
    'SING', 'SIZE', 'SKIN', 'SLOW', 'SNAP', 'SNOW', 'SOFT', 'SOIL', 'SOME', 'SONG',
    'SOON', 'SORT', 'SOUL', 'SPAN', 'SPOT', 'STAR', 'STAY', 'STEM', 'STEP', 'STOP',
    'SUCH', 'SUIT', 'SURE', 'TAKE', 'TALK', 'TALL', 'TAME', 'TAPE', 'TEAM', 'TEAR',
    'TELL', 'TERM', 'TEST', 'THAN', 'THAT', 'THEM', 'THEN', 'THEY', 'THIS', 'TIME',
    'TINY', 'TOWN', 'TRAP', 'TREE', 'TRIP', 'TRUE', 'TUNE', 'TURN', 'TYPE', 'UNIT',
    'UPON', 'USER', 'VERY', 'VIEW', 'WAIT', 'WALK', 'WALL', 'WANT', 'WARM', 'WASH',
    'WAVE', 'WEAK', 'WEAR', 'WEEK', 'WELL', 'WENT', 'WEST', 'WHAT', 'WHEN', 'WIDE',
    'WIFE', 'WILD', 'WILL', 'WIND', 'WINE', 'WING', 'WISH', 'WITH', 'WOOD', 'WORD',
    'WORK', 'YARD', 'YEAR', 'ZERO', 'ZONE',
    // 5 文字以上
    'ABOUT', 'ABOVE', 'AFTER', 'AGAIN', 'APPLE', 'BEACH', 'BEGIN', 'BLACK', 'BREAD',
    'BRING', 'BUILD', 'CHAIR', 'CHILD', 'CLEAN', 'CLEAR', 'CLOCK', 'CLOSE', 'CLOUD',
    'COLOR', 'COUNT', 'DANCE', 'DREAM', 'DRINK', 'DRIVE', 'EARLY', 'EARTH', 'EIGHT',
    'ENJOY', 'ENTER', 'EVERY', 'FIELD', 'FIRST', 'FLOOR', 'FRESH', 'FRONT', 'FRUIT',
    'GLASS', 'GRASS', 'GREAT', 'GREEN', 'GROUP', 'HAPPY', 'HEART', 'HEAVY', 'HELLO',
    'HORSE', 'HOTEL', 'HOUSE', 'HUMAN', 'LARGE', 'LAUGH', 'LEARN', 'LIGHT', 'LUNCH',
    'MONEY', 'MONTH', 'MORSE', 'MUSIC', 'NIGHT', 'NORTH', 'NURSE', 'OCEAN', 'OFTEN',
    'ORDER', 'PAPER', 'PARTY', 'PASTE', 'PEACE', 'PHONE', 'PIANO', 'PLACE', 'PLANT',
    'POINT', 'POWER', 'PRICE', 'QUICK', 'QUIET', 'RADIO', 'RIGHT', 'RIVER', 'ROUND',
    'SEVEN', 'SHORT', 'SLEEP', 'SMALL', 'SMILE', 'SOUND', 'SOUTH', 'SPACE', 'SPARE',
    'SPEAK', 'SPEAR', 'SPORT', 'STAND', 'START', 'STEAM', 'STONE', 'STORY', 'SUGAR',
    'SUPER', 'SWEET', 'TABLE', 'TASTE', 'TEACH', 'THANK', 'THING', 'THINK', 'THREE',
    'TODAY', 'TOUCH', 'TRAIN', 'TRUST', 'UNDER', 'VOICE', 'WATCH', 'WATER', 'WHITE',
    'WOMAN', 'WORLD', 'WRITE', 'YOUNG',
    'ANIMAL', 'ANSWER', 'AUTUMN', 'BOTTLE', 'BRIDGE', 'CAMERA', 'CHANGE', 'COFFEE',
    'DINNER', 'DOCTOR', 'FAMILY', 'FATHER', 'FLOWER', 'FOREST', 'FRIEND', 'GARDEN',
    'GROUND', 'ISLAND', 'LETTER', 'LISTEN', 'MARKET', 'MINUTE', 'MOTHER', 'NUMBER',
    'OFFICE', 'ORANGE', 'PEOPLE', 'PLANET', 'PLEASE', 'POCKET', 'RABBIT', 'SCHOOL',
    'SECOND', 'SIGNAL', 'SILVER', 'SIMPLE', 'SPRING', 'STREET', 'STRONG', 'SUMMER',
    'TRAVEL', 'WINDOW', 'WINTER', 'YELLOW',
    'ANTENNA', 'EVENING', 'MACHINE', 'MESSAGE', 'MORNING', 'PICTURE', 'STATION',
    'WEATHER', 'WELCOME',
    // --- アマチュア無線の常用語・略語(少数) ---
    'CQ', 'DE', 'TU', 'TNX', '73', '88', 'SOS', 'PARIS', 'QTH', 'QSL', 'QRZ', 'RST',
    '599', 'AGN', 'PSE', 'OM', 'FB', 'GM', 'GE', 'GN', 'DX', 'HAM'
  ];

  var WORDS_WABUN = [
    // 初級レベル(ア行〜)で組める語
    'アイ', 'イエ', 'ウエ', 'アオ', 'オイ', 'エイ', 'アウ', 'ウオ', 'アイウエオ',
    'カオ', 'コエ', 'イケ', 'エキ', 'カイ', 'キオク', 'カク', 'イカ', 'クウキ', 'アキ',
    'サケ', 'シオ', 'スイカ', 'セカイ', 'ソコ', 'アサ', 'ウシ', 'イス', 'カサ', 'クサ',
    'タコ', 'チカ', 'ツキ', 'テキ', 'トシ', 'イタ', 'ウタ', 'コト', 'アト', 'サト',
    'ナツ', 'ニク', 'ヌノ', 'ネコ', 'ノキ', 'イヌ', 'アナ', 'カニ', 'キヌ', 'ソナタ',
    'ハナ', 'ヒト', 'フネ', 'ヘタ', 'ホシ', 'ハレ', 'ヒカリ', 'フユ', 'ホン', 'アヒル',
    'マチ', 'ミチ', 'ムシ', 'メシ', 'モチ', 'ウミ', 'ヤマ', 'カミ', 'ナミ', 'ミナト',
    'ヤネ', 'ユキ', 'ヨル', 'ユメ', 'ヤサイ', 'ヨコハマ', 'ユカ', 'ヤマ', 'ヨム', 'ユウヒ',
    'ラク', 'リス', 'ルス', 'レキシ', 'ロク', 'サクラ', 'クルマ', 'トリ', 'カワ', 'ソラ',
    'ワニ', 'ワタシ', 'ニホン', 'ムセン', 'アンテナ', 'シンカンセン', 'テンキ', 'ツウシン',
    'ラジオ', 'モールス', 'デンシン', 'コウシン', 'ジュシン', 'ソウシン', 'シンゴウ',
    'オンガク', 'カゼ', 'アメ', 'クモリ', 'ユウガタ', 'トウキョウ', 'オオサカ', 'ナゴヤ',
    'サッポロ', 'フクオカ', 'コンニチハ', 'サヨウナラ', 'アリガトウ', 'オハヨウ',
    'オヤスミ', 'ヨロシク', 'サカナ', 'デンシャ', 'ヒコウキ', 'ガッコウ', 'カイシャ',
    'シゴト', 'ヤスミ', 'ドウゾ', 'オネガイシマス', 'ゲンキ', 'タノシイ', 'ベンキョウ'
  ];

  return {
    WORDS_INTL: WORDS_INTL,
    WORDS_WABUN: WORDS_WABUN,
    INTL_TABLE: INTL_TABLE,
    WABUN_TABLE: WABUN_TABLE,
    WABUN_PROSIGNS: WABUN_PROSIGNS,
    KOCH_ORDER: KOCH_ORDER,
    WABUN_ORDER: WABUN_ORDER,
    GOJUON_DISPLAY: GOJUON_DISPLAY
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MorseData;
} else {
  window.MorseData = MorseData;
}
