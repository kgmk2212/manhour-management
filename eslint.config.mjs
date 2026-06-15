// ESLint flat config（レベル2 CI）
//
// 目的: 今回の「nonProjectWork 未定義参照で初期化が落ち全画面が白紙」のような
// "構文は正しいが未定義参照" 型の事故を、公開前に静的に弾く。
// レベル1 CI の `node --check`（構文チェック）では検出できない領域を補う。
//
// 方針:
//  - ルールは no-undef を中心に絞る（整形・スタイル系は入れない）。
//  - このプロジェクトは「関数や状態を window に生やして参照する」既存スタイルのため、
//    ブラウザグローバル(globals.browser)と、import せず bare 参照される既存の
//    アプリグローバルを appGlobals としてホワイトリスト登録する。
//  - 一度登録しておけば、以後の "新規の未登録 bare 参照"（＝今回型の事故）だけが
//    no-undef で赤くなる。

import globals from "globals";

// import せず window 経由で bare 参照される既存のアプリグローバル。
// （例: report.js が phaseCollapsed を import せず参照し、init.js が
//  window.phaseCollapsed = State.phaseCollapsed で実体を供給している）
const appGlobals = {
  phaseCollapsed: "readonly",
};

// 同梱ライブラリ(lib/)が window に供給するグローバル（CDN 不使用・ローカルバンドル）。
// SheetJS(XLSX) は `await import('../lib/xlsx.mjs')` で動的 import し引数で受け渡すため
// bare 参照されず、登録不要（登録すると将来の typo を見逃すので入れない）。
const libGlobals = {
  JapaneseHolidays: "readonly", // lib/japanese-holidays.js（<script> 読み込みで window に供給）
};

export default [
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...appGlobals,
        ...libGlobals,
      },
    },
    rules: {
      "no-undef": "error",
      // 未使用変数は別軸の整理対象。CI を no-undef に集中させるため当面オフ。
      "no-unused-vars": "off",
    },
  },
];
