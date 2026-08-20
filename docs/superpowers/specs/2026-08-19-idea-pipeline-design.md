# アイデア自動実装パイプライン 設計書

作成: 2026-08-19 ／ ステータス: ユーザー承認済み設計（実装計画は別文書）

## 1. 目的と背景

「こうしたい」と思いついた修正・改善アイデアを溜めておくと、人手をほぼ介さず実装・検証・デプロイまで進む仕組みを作る。人間の手間を減らしつつ、**意図と違うものが自動実装される事故を構造的に防ぐ**ことを両立する。

ユーザーとの対話で確定した方針:

| 論点 | 決定 |
|---|---|
| 自動化到達点 | リスク別の段階自動（3レーン方式） |
| 初期運用 | 学習期間方式（2〜4週は全件PRゲート、判定一致を確認してから自動マージ解禁） |
| アイデアの受け皿 | GitHub Issues（iPhone/PCから投入。ラベルで状態管理） |
| 実行環境 | GitHub Actions ＋ 公式 claude-code-action（イベント駆動・PC電源に非依存） |

## 2. 全体フロー

```
[思いつく] → GitHub Issue（1行でも可。iPhoneのGitHubアプリ/Webから）
    ↓ 自動
[① トリアージ] triage.yml
    解釈文＋受入条件をコメント／レーン判定ラベル付与
    解釈に幅がある → needs-clarification で質問して停止
    ↓ 自動
[② 実装] implement.yml
    lane:auto / lane:pr → ブランチ作成→実装→lint/test/Playwright検証→PR作成（スクショ添付）
    lane:design → 設計書（＋必要ならモックアップ）を生成するPRを作成して停止
    ↓
[③ ゲート]
    学習期間: 全レーンとも人間がマージ（スマホから解釈文を読んで1タップ）
    解禁後:   lane:auto はチェック全緑＋ポリシー検査PASSで自動マージ
    ↓ 自動
[④ デプロイ・事後]
    ui-scaling への push で Pages 再デプロイ／Issue 自動クローズ＋結果報告
    意図と違った場合は /revert コメントで即時撤回
```

## 3. レーン定義と意図ズレ防止（3枚の壁）

### 3.1 レーン判定基準

- **lane:auto**（自動走行枠）— 以下を**すべて**満たす場合のみ:
  1. 変更対象が表示・文言・スタイル・既知バグ修正の範囲
  2. 触禁リスト（§3.2）のファイルに変更が及ばない
  3. 受入条件が Playwright / node:test で機械検証可能
  4. 解釈が一義的（トリアージが複数解釈を検出しない）
- **lane:pr** — 機能追加、複数画面にまたがる変更、解釈に幅は無いが影響が広いもの。実装・検証・PR作成まで自動、マージは常に人間。
- **lane:design** — データモデル変更・大機能。コードは書かず、設計書＋必要に応じモックアップを生成して停止。
- **needs-clarification** — 解釈候補が2つ以上。実装せず Issue 上で質問。ユーザーの返信コメントで再トリアージ。

ユーザーはいつでもラベルを張り替えて判定を上書きできる（上書きは学習データとして週次レポートに記録される）。

### 3.2 触禁リスト（lane:auto 変更禁止パス）

データ整合性に関わるモジュールは lane:auto では変更禁止。`.github/pipeline/auto-lane-policy.json` に列挙し、トリアージと CI の両方が参照する:

```
js/storage.js, js/state.js, js/merge-core.js, js/history.js, js/excel-import.js, .github, scripts/pipeline
```

（初期値。運用で追加・削減可。データスキーマの変更を伴う修正は、パスに関わらず lane:design へ。パイプラインの検査機構そのものを lane:auto から保護するため。）

### 3.3 3枚の壁

1. **仕様化の壁**: どのレーンでも、実装前に「私はこう解釈した」＋受入条件を Issue コメントとして残す。この解釈文は PR 本文にも転記される。
2. **自信度エスカレーション**: 解釈が割れたら自動実装せず needs-clarification に降格。「勝手に決めて作る」を構造的に禁止。
3. **機械的ポリシー検査**: lane:auto の PR は `lane-policy-check` ジョブが diff を検査し、触禁パスに触れていたら **fail させて自動マージを物理的にブロック**する（LLM の自己申告に依存しない）。
   （注: pull_request の required checks は PR 側から定義を書き換えうるため、自動マージ経路では implement.yml の Gate が信頼側スクリプトで再検査する。完全な物理ブロックではない点は AUTO_MERGE 解禁の運用前提として管理）

## 4. コンポーネント詳細

### 4.1 Issue テンプレートとラベル

- `.github/ISSUE_TEMPLATE/idea.yml`: 自由記述 textarea 1個のみの最小テンプレート。`idea` ラベルを自動付与。
- ラベル一覧: `idea`（入口）／`lane:auto`・`lane:pr`・`lane:design`・`needs-clarification`（トリアージ結果）／`verification-failed`（状態）。

### 4.2 triage.yml

- トリガー: `issues: [opened, labeled]` で `idea` ラベルを持つもの（テンプレートを使わず作成した Issue に後からラベルを付けた場合も拾う。二重実行はトリアージ済みラベルの有無で抑止。発火条件に Issue 作成者＝リポジトリオーナーを含む（公開リポで第三者の Issue により Claude が起動しないため））、および needs-clarification 中の Issue への**リポジトリオーナーの**コメント。
- 処理: claude-code-action がリポジトリを read-only で参照し、(a) 解釈文 (b) 受入条件（機械検証可能な形式）(c) レーン判定と根拠、を Issue にコメントし、ラベルを付与。
- プロンプトは `.github/pipeline/prompts/triage.md` にバージョン管理（判定基準の調整はこのファイル編集で行う）。
- タイムアウト 10 分。

### 4.3 implement.yml

- トリガー: `issues: [labeled]` で `lane:auto` / `lane:pr` / `lane:design` が付いたとき。
- ベースブランチ: `experiment/ui-scaling`。作業ブランチ: `pipeline/issue-<番号>`。
- 処理（auto/pr）: 実装 → `npm run lint` → `node --test` → Playwright 検証（スモーク＋受入条件） → スクショ撮影 → PR 作成。PR 本文に解釈文・受入条件・スクショ・diff要約を記載。エージェントが仕様として読むのは Issue 本文とリポジトリオーナー投稿のコメントのみ（第三者コメントは取り込まない）。受入条件の検証スペックは tests/e2e/acceptance-issue-<番号>.spec.js として恒久化する。
- 処理（design）: `docs/` 配下に設計書（必要ならモックアップHTML）を生成する PR を作成して停止。
- スクショの見せ方: PR ブランチ内 `qa/issue-<番号>/` にコミットし、コミットSHA固定の raw URL で PR 本文に埋め込む。ブランチ最終コミットで同フォルダを削除し、**squash マージ**によりマージ後のツリーには残さない。
- 排他制御: `concurrency: group: implement`（Issue 単位で直列（同一 Issue の二重実行防止）。別 Issue は並行実行され、衝突は PR マージ時に顕在化する）。実装前に ui-scaling 最新へ rebase し、コンフリクトしたら `verification-failed` 相当で人間へ（並行する対話セッションとの衝突対策）。
- プロンプトは `.github/pipeline/prompts/implement.md`。タイムアウト 30 分。

### 4.4 検証の CI 常設化（e2e）

- `tests/e2e/` に Playwright スモークテスト（起動・全タブ描画・コンソールエラー0）と seed 投入スクリプトを常設。既存の verify-ui / モバイルスケール検証ツール一式の資産を移植する。
- PR 全件で実行（パイプライン産か人間産かを問わない）。**白画面事故クラスの恒久対策を兼ねる**（CICD_ROADMAP レベル3 の最小形）。

### 4.5 lane-policy-check

- lane:auto ラベルの PR に対し、diff が `auto-lane-policy.json` の触禁パスに触れていないか機械検査。触れていれば fail（＝ブランチ保護で自動マージ不可）。検査は base ref のスクリプト・ポリシーで行い（PR 側からの書き換え防止）、rename の旧パス（previous_filename）も検査対象に含める。

### 4.6 自動マージと解禁スイッチ

- リポジトリ変数 `AUTO_MERGE_ENABLED`（初期値 `false`）。
- `true` のとき: lane:auto の PR は全チェック緑で `gh pr merge --squash --auto`。
- `false`（学習期間）のとき: マージせず「準備完了」コメントのみ。人間がマージ。

### 4.7 デプロイ経路の修正

- `deploy.yml` の発火条件に `experiment/ui-scaling` への push を追加（ジョブ内容は不変。preview 展開の既存機構をそのまま使う）。
- これにより「main へ空コミットして発火」の運用をパイプライン経路では廃止する。ui-scaling→main 昇格は本設計のスコープ外（別タスクのまま）。

### 4.8 revert（即時撤回）

- マージ済み PR または元 Issue への `/revert` コメントで発火。squash コミットの revert を ui-scaling に直接 push し、結果をコメント。

### 4.9 週次レポート（学習期間の評価）

- 週1の scheduled workflow が集計 Issue にコメント: 処理件数／レーン別内訳／人間によるラベル上書き件数／マージ・不採用の結果。
- 解禁判断の基準: **2〜4週経過 かつ lane:auto 判定サンプル10件以上で人間判断との不一致0件**。不一致があれば触禁リストかトリアージプロンプトを修正して継続。

## 5. エラー処理

| 事象 | 挙動 |
|---|---|
| 検証 FAIL | PR を draft 化＋`verification-failed` ラベル＋ログ要約コメント。lane ラベルを付け直すと再実行 |
| rebase コンフリクト | 実装中断・Issue に報告して人間へ |
| トリアージ不能（内容が空など） | needs-clarification で質問 |
| Actions/トークン枯渇 | ワークフロー fail をそのまま可視化（黙って握り潰さない） |
| デプロイ後に意図違い発覚 | `/revert` で1コメント撤回（§4.8） |

## 6. セットアップ（1回だけの作業）

1. Claude GitHub App のインストール（`/install-github-app`）＋ Secrets に `CLAUDE_CODE_OAUTH_TOKEN`（既存サブスクから `claude setup-token` で発行。不可の場合は API キー＋支出上限で代替）
2. ラベル一式の作成（スクリプト化）
3. リポジトリ変数 `AUTO_MERGE_ENABLED=false`
4. `experiment/ui-scaling` にブランチ保護を設定し、e2e・lane-policy-check 等を required checks に指定（`gh pr merge --auto` がチェック完了を待つための前提。未設定だと即時マージされてしまう）
5. 公開リポのため Actions 実行分は無料。Claude 消費は既存サブスクのクォータ内

## 7. 段階導入順序

| Phase | 内容 | 確認方法 |
|---|---|---|
| A | ラベル＋Issueテンプレ＋triage.yml のみ | 実アイデア3〜5件でトリアージ精度を観察 |
| B | tests/e2e スモーク常設＋deploy.yml 発火条件追加 | 既存PRで e2e が回ること・push でデプロイされること |
| C | implement.yml＋lane-policy-check＋revert | dry-run Issue で E2E 動作確認（PR作成→手動マージ→revert） |
| D | 週次レポート→学習期間評価→`AUTO_MERGE_ENABLED=true` | 解禁基準（§4.9）を満たしたら |

## 8. スコープ外（YAGNI）

- アプリ内「アイデア送信ボタン」（Issue 作成画面のプリフィルURLを開くだけなので、稼働後に5分で追加可）
- 既存 refactoring-proposals P1〜 の Issue 化（パイプライン稼働後に流し込む運用タスク）
- Mac mini 常駐ワーカー・夜間バッチ（イベント駆動で不足が出るまで作らない）
- ui-scaling→main 昇格（別タスク）

## 9. 関連文書

- [refactoring-proposals.md](../../refactoring-proposals.md) — 稼働後に流し込むバックログ
- [CICD_ROADMAP.md](../../CICD_ROADMAP.md) — §4.4 はレベル3（E2E）の最小形に相当
- [architecture-consulting.md](../../architecture-consulting.md) — 長期ロードマップ（本設計は独立に併走可能）
