# 実装ワークフロー

> **ブランチ**: `experiment/redesign-impl`
> **Worktree**: `/Users/kmori/Documents/work/manhour-impl`
> **ベース**: `experiment/redesign`

このドキュメントは、改善提案書（`docs/improvements/01-10`）を実装していくための運用ガイドです。

---

## 基本原則

1. **ブランチ分離**: 実装は `experiment/redesign-impl` ブランチで行う。`experiment/redesign` は設計書の正本として保持
2. **小さなコミット**: 1コミット = 1改善項目（または1改善項目の1部分）
3. **非同期レビュー**: ユーザーの確認を待たず進めるが、すべてが後追いできる状態を維持
4. **自動デプロイ**: プッシュするたびにGitHub Pagesへ反映

---

## 改善項目1つの実装フロー

```
┌─────────────────────────────────────────────┐
│ STEP 1: 設計メモ作成 (5分)                   │
│   docs/improvements/memos/<ID>.md を作成     │
│   _template.md をコピーして埋める            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ STEP 2: 実装                                 │
│   該当ファイルを編集                          │
│   実装方針に迷ったら decisions-pending.md に  │
│   記録して仮判断で進める                      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ STEP 3: 動作確認 + スクショ                  │
│   Playwrightで Before/After を自動撮影       │
│   screenshots/<ID>-before.png, after.png     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ STEP 4: コミット                             │
│   feat(<ID>): <簡潔な説明>                   │
│                                              │
│   本文に:                                     │
│   - 実装範囲                                  │
│   - 設計書との差分（あれば）                   │
│   - 残作業                                    │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ STEP 5: progress.md 更新                     │
│   実装完了項目を時系列で追記                   │
│   判断ポイント、確認してほしい点を記載         │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ STEP 6: プッシュ + デプロイ                  │
│   ./scripts/deploy.sh <コミットメッセージ>    │
│   → impl ブランチpush + main空コミットpush   │
└─────────────────────────────────────────────┘
                    ↓
              [次の項目へ]
```

---

## コミットメッセージ規約

### フォーマット
```
<type>(<ID>): <簡潔な説明>

<本文: 何を変え、なぜ、どこに影響するか>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

### type
- `feat`: 新機能の追加（改善提案の実装）
- `fix`: バグ修正
- `refactor`: リファクタリング
- `style`: スタイルのみの変更
- `docs`: ドキュメント変更
- `test`: テスト追加

### ID
改善提案書のID（例: `A-1`, `B-6-1`, `C-9`）

### 例
```
feat(A-1): テンプレート機能の基本CRUD実装

- 新規ファイル: js/template.js
- 変更: state.js (templates配列追加), storage.js (永続化)
- UI: クイック入力タブに「テンプレ」セグメント追加（index.html）

設計書との差分:
- 「セット」機能は次コミットに分離
- テンプレート最大数は20件で仮実装

残作業:
- [ ] テンプレート適用処理
- [ ] テンプレートセット（複数エントリ）
- [ ] 利用頻度による自動ソート

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

---

## ディレクトリ構成

```
docs/improvements/
├── 01〜10.md           # 設計書（変更しない。正本）
├── index.html          # サマリーHTML
├── README.md           # 総合ガイド
├── WORKFLOW.md         # このファイル
├── progress.md         # 進捗ログ（追記型）
├── decisions-pending.md # 保留判断リスト
├── memos/              # 実装前の設計メモ
│   ├── _template.md    # メモテンプレート
│   ├── A-1.md          # 実装項目ごとのメモ
│   └── ...
└── screenshots/        # Before/After証跡
    ├── A-1-before.png
    ├── A-1-after-desktop.png
    └── A-1-after-mobile.png
```

---

## デプロイ

### 通常のデプロイ
```bash
# manhour-impl ディレクトリで実行
./scripts/deploy.sh "feat(A-1): テンプレート機能の基本実装"
```

このスクリプトは以下を自動化します:
1. 変更ファイルのステージング
2. コミット
3. `experiment/redesign-impl` をpush
4. `main` に空コミット + push（GitHub Pages再ビルド発火）

### ライブ環境のURL

| 環境 | URL | ソースブランチ |
|------|-----|---------------|
| **本番** | https://kgmk2212.github.io/manhour-management/ | `main` |
| **実装プレビュー** | https://kgmk2212.github.io/manhour-management/preview/redesign-impl/ | `experiment/redesign-impl` |
| **リデザインプレビュー** | https://kgmk2212.github.io/manhour-management/preview/redesign/ | `experiment/redesign` |
| **サンドボックス** | https://kgmk2212.github.io/manhour-management/preview/sandbox/ | `experiment/sandbox` |

デプロイは main ブランチへのpush時（または空コミット）にGitHub Actionsが発火。
各ブランチの最新版が対応する `/preview/*/` 配下に自動配信される。

### 手動デプロイ（既存コミットを再デプロイしたい時）
```bash
./scripts/deploy.sh --redeploy-only
```

---

## ユーザーのレビュータイミング

ユーザーは好きなタイミングで以下を確認できます:

| 確認したい内容 | 見る場所 |
|--------------|---------|
| 何が実装されたか（時系列） | `progress.md` |
| 各項目の判断理由 | `memos/<ID>.md` |
| 画面の変化 | `screenshots/` |
| コードの詳細 | `git log` + `git show <commit>` |
| 保留されている判断 | `decisions-pending.md` |
| 本番環境での動作 | GitHub Pages URL |

---

## 緊急時のロールバック

### 特定の改善項目を取り消したい
```bash
# コミットを特定
git log --grep "A-1" --oneline

# そのコミットを打ち消すコミットを作成
git revert <commit-hash>

# デプロイ
./scripts/deploy.sh "revert: A-1 テンプレート機能を差し戻し"
```

### まるごと元に戻したい
```bash
git reset --hard experiment/redesign
./scripts/deploy.sh --redeploy-only "reset: 実装ブランチを設計書状態に戻す"
```

---

## 設計書との差分が発生したら

実装中に「設計書どおりにすると問題がある」と気づいた場合:

1. **軽微な変更**（実装の詳細レベル）: memoとcommit bodyに記録するだけ
2. **方針レベルの変更**: `decisions-pending.md` に記録してユーザーに確認を仰ぐ
3. **設計書を書き換えたい場合**: `experiment/redesign` で設計書を修正し、このブランチにmerge

---

## よくあるケース

### ケース1: 実装中に別の項目との依存関係に気づいた
→ `decisions-pending.md` に記録、仮で進める。後でユーザーと相談

### ケース2: 設計書には無い修正が必要だと気づいた
→ 新しいIDを付与（例: `A-13`）、設計書に追記するかmemoで済ませるか判断

### ケース3: 実装が大きくなりすぎた
→ コミットを分割。1コミットで完結しないなら `progress.md` に「進行中」として記録
