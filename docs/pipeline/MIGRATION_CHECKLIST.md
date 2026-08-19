# 会社 Org 移管チェックリスト

> 個人アカウント `kgmk2212/manhour-management` を会社 GitHub Organization（Team プラン）へ
> 移管する際の手順と地雷。2026-08-20 の調査に基づく。
> 移管は「パイプラインが個人環境で実用になると確認できてから」実施する想定。

---

## 0. 段階方針

| 段階 | GitHub | Claude | 状態 |
|------|--------|--------|------|
| 段階1（現在） | 個人アカウント | 個人アカウント | 資産を混ぜない。パイプラインの実用性を検証する期間 |
| 段階2（移管後） | 会社 Org | 会社アカウント | 業務資産として正規化 |

**会社 Claude アカウントの認証情報を個人リポジトリの Secrets に置くことはしない。**
会社の座席資格情報を会社の管理外に出さないため。段階1と段階2の間の中途半端な状態を作らない。

---

## 1. 移管前に会社側で確認すること（ブロッカー）

これが通らないと移管できない。着手前に順に確認する。

| # | 確認事項 | 確認先 | NG だった場合 |
|---|----------|--------|---------------|
| 1 | 会社 Org で **Public リポジトリ**を作ってよいか | 情シス / 法務 / 広報 | Pages が使えない → Cloudflare Pages 等の別配信へ |
| 2 | Org の Actions でサードパーティ Action が許可されているか | Org Settings → Actions → General | `anthropics/claude-code-action@v1` の許可申請 |
| 3 | Org に **Claude GitHub App** をインストールできるか | Org Settings → Third-party Access | 管理者承認の申請 |
| 4 | ~~会社 Claude（Team）で `claude setup-token` が発行できるか~~ | 確認済み — 下記参照 | — |

#4 は解決済み。公式ドキュメントに明記があり、**Team プランでも OAuth トークンを発行できる**:

> "`CLAUDE_CODE_OAUTH_TOKEN`: an OAuth token that authenticates with your Claude subscription,
> available on Pro, Max, Team, and Enterprise plans."

### なぜ Public が必須なのか

**GitHub Team では private リポジトリから Pages を公開できない。** 根拠3つが一致:

1. GitHub 料金比較ページ — Free / Team とも Pages は「Public repositories」欄にあり、両者に差がない
2. docs の plans ページ — Team の機能として "GitHub Pages in public repositories"
3. 実機確認 — Team 所属アカウントで `Upgrade or make this repository public to enable Pages`

サイト自体を組織メンバー限定にできるのは Enterprise Cloud のみ:

> "To publish a GitHub Pages site privately, your organization must use GitHub Enterprise Cloud."

仮に private repo から出せたとしても、サイトはインターネットに公開される:

> "GitHub Pages sites are publicly available on the internet, even if the repository for the site is private (if your plan or organization allows it)."

### Public 継続のリスク評価

守るべき実体はすでに公開されていない:

- アプリは **localStorage 完結**。業務データはサイトにもリポジトリにも載らない
- 外部ライブラリは**ローカルバンドル（CDN 不使用）**。外部への通信が無い
- リポジトリに追跡されているデータは**全部ダミー**（田中／佐藤／鈴木 × ログイン機能／検索機能／帳票出力）

残る実質的リスクは **Issue の業務文脈**のみ。対処は運用ルール1本:

> **Issue に案件名・顧客名・社内固有名詞を書かない。** アプリの機能改善として記述する。

---

## 2. 移管で引き継がれるもの / 引き継がれないもの

公式ドキュメント確認済み。

### 引き継がれる

> "its issues, pull requests, wiki, stars, and watchers are also transferred"

> "If the transferred repository contains webhooks, services, secrets, or deploy keys, they will remain associated after the transfer is complete."

**Secrets は引き継がれる。** これが最大の地雷（§3-1）。

### 引き継がれない

> "we don't redirect GitHub Pages associated with the repository"

Pages の URL は死ぬ。リダイレクトされない。

### 未確認（移管後に実機で確認する）

- Actions variables（`AUTO_MERGE_ENABLED`）
- branch protection ルール
- GitHub App のインストール状態（Org 側で入れ直しが要るはず）

---

## 3. 地雷リスト

### 3-1.【最重要】Secrets が引き継がれ、個人トークンのまま動き続ける

`CLAUDE_CODE_OAUTH_TOKEN` と `PIPELINE_PAT` は移管後もそのまま残る。
**正常に動くので気づけない。** 会社リポジトリが個人の Claude サブスクと個人の GitHub PAT を
消費し続ける状態になる。段階方針（§0）が崩れる。

移管直後に必ず両方差し替える:

```bash
gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <org>/manhour-management
gh secret set PIPELINE_PAT --repo <org>/manhour-management
```

`PIPELINE_PAT` は会社アカウントで fine-grained PAT を発行し直す
（対象リポジトリを限定 / Contents・Issues・Pull requests = Read and write）。
**個人アカウント側の PAT は失効させる。**

OAuth トークンが誰のものになるかは、生成時にログインしていたアカウントで決まる:

> "an OAuth token is tied to the subscription of the person who ran `claude setup-token`"

差し替え手順:

```bash
claude auth status                        # 現在のアカウントを確認
claude auth logout && claude auth login   # 目的のアカウントへ切り替え
claude setup-token                        # 新トークンを生成（表示のみ・保存されない）
gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <org>/manhour-management
```

**重要**: Secret を上書き・削除しても、そのトークン自体は生き続ける:

> "If you delete a secret, the credential it held stays valid."

したがって「間違ったアカウントで作ってしまったら差し替えれば済む」ではない。
アカウント側で明示的に失効させる必要がある（OAuth トークンの失効手順はドキュメントに
記載が無く未確認）。**そもそも間違ったアカウントで作らないことが最善。**

### 3-1b. 移管後は OAuth トークンより API キー / WIF を検討する

公式ドキュメントの推奨:

> "For a secret shared across repositories, authenticate with an API key from the Claude Console
> rather than an OAuth token, since an OAuth token is tied to the subscription of the person who
> ran `claude setup-token`."

OAuth トークンは個人の座席に紐づくため、会社 Org の資産としては筋が悪い（発行者が退職・異動すると
止まる）。移管時は次のどちらかへ切り替えるのが本筋:

- **Claude Console の API キー** — 組織の資産として管理でき、予算上限・失効が効く
- **Workload Identity Federation** — 長期シークレットを一切置かない。GitHub の OIDC トークンを
  Console のサービスアカウント経由で交換する。ワークフローに
  `anthropic_federation_rule_id` / `anthropic_organization_id` / `anthropic_service_account_id` を設定し、
  `id-token: write` 権限を付与する

段階2の設計時に、会社の Anthropic Console 組織の有無とあわせて判断する。

### 3-2.【サイレント故障】`repository_owner` 判定でトリアージが停止する

`.github/workflows/triage.yml:27,32` が `github.repository_owner` を直接参照している。
移管すると値が Org 名になり Issue 作成者と一致しなくなるため、
**ワークフローがスキップされるだけでエラーが出ない。**

移管前に許可ユーザーリスト方式へ変更しておく。implement.yml 等の後続ワークフローにも
同じ判定が入るため、一箇所の修正ではなく方針として統一する。

→ ab10a0d8 セッションへハンドオフ済み。

### 3-3.【データ消失に見える】localStorage がオリジン単位で分断される

localStorage は `scheme://host` 単位。`kgmk2212.github.io` → `<org>.github.io` は
**ホストが変わるため、新 URL を開くとデータが空になる。**
パスは無関係なので、同一ホスト内（`/manhour-management/` と `/preview/ui-scaling/`）では共有されている。

手順:

1. 移管前に、実データが入っている端末**すべて**（スマホ・PC）でバックアップ JSON をエクスポート
   （`js/storage.js:453` `exportBackup`）
2. 移管・Pages 再有効化後、新 URL で復元（`js/storage.js:458` `importBackup`）
3. スマホのホーム画面ショートカット／ブックマークを新 URL に張り替え

補足: 移管後は `<org>.github.io` 配下の**他の Org リポジトリの Pages と localStorage を共有**する。
同一オリジンなので、他サイトの JS から工数データが読める理屈になる。
会社 Org に他の Pages サイトがある場合は留意する。

### 3-4. Pages の再有効化が必要

Pages 設定は引き継がれず、旧 URL からのリダイレクトも無い。
移管後に Settings → Pages で GitHub Actions ソースを再設定し、
`deploy.yml` を `workflow_dispatch` で手動実行して復旧を確認する。

`deploy.yml` は main をルート、`experiment/{sandbox,redesign,ui-scaling}` を
`preview/` 配下に展開する構成。全ブランチが移管先に存在することを確認する。

### 3-5. ワークフローの main ミラーを忘れない

`SETUP.md` §6 のとおり、issues / issue_comment / schedule トリガーは
**default branch（main）上のワークフローしか発火しない。**
移管後に default branch が main のままか確認し、`triage.yml` を編集したら
`bash scripts/pipeline/mirror-workflows-to-main.sh` を実行する。

§3-2 の修正を入れたあとにミラーを忘れると、修正したのに動かないという二重の混乱になる。

### 3-6. OLLAMA_ORIGINS の CORS 設定が壊れる

LLM 分析機能はブラウザからローカル Ollama に接続する。許可オリジンに旧ホストが
設定されているため、移管後は CORS で失敗する。

```bash
launchctl setenv OLLAMA_ORIGINS "https://<org>.github.io"
```

使用している全端末で再設定する。`README.md:75,79,82` 参照。

### 3-7. ハードコードされたリポジトリ名の掃き出し

**アプリのコード（`js/` · `index.html` · `style.css`）にはハードコードが一切無い。**
確認済み。移管でアプリのコード修正は発生しない。

書き換えが要るのはドキュメントとスクリプトのみ:

| ファイル | 該当行数 |
|----------|----------|
| `docs/superpowers/plans/2026-08-19-idea-pipeline.md` | 18 |
| `docs/pipeline/SETUP.md` | 7 |
| `docs/LLM_ANALYSIS_ARCHITECTURE.md` | 6 |
| `docs/LLM_WORKFLOW.md` | 4 |
| `README.md` | 3 |
| `docs/LLM_ANALYSIS_CONCEPT.md` | 2 |
| `docs/LLM_IMPLEMENTATION_PLAN.md` | 2 |
| `scripts/pipeline/setup-labels.sh` | 1 |

計 43 行。`git grep -l kgmk2212` で追跡し、sed で一括置換できる。

### 3-8. Actions の課金

Public を維持する限り Actions は**無料**で、課金は発生しない。
仮に private にした場合は Team の 3,000分/月枠を消費する
（Claude Code Action は1実行で数分使うため、月数百回で枯れる）。
これが Public 維持を推す実務的な理由のひとつ。

---

## 4. 移管手順（Public 維持前提）

1. §1 の4項目をすべてクリアする
2. 全端末でバックアップ JSON をエクスポート（§3-3）
3. `triage.yml` のオーナー判定が許可リスト方式になっていることを確認（§3-2）
4. Settings → General → Transfer ownership で会社 Org へ移管
5. Secrets 2件を会社アカウントのものに差し替え／個人 PAT を失効（§3-1）
6. Org に Claude GitHub App をインストール
7. Settings → Pages を再設定し、`deploy.yml` を `workflow_dispatch` で実行（§3-4）
8. Actions variables（`AUTO_MERGE_ENABLED=false`）と branch protection の有無を確認。
   無ければ `SETUP.md` §2 §4 で再設定
9. ハードコード置換（§3-7）
10. 全端末で新 URL を開き、バックアップ復元・ショートカット張り替え（§3-3）
11. `OLLAMA_ORIGINS` を再設定（§3-6）
12. ワークフローを main へミラー（§3-5）

---

## 5. 完了判定

- [ ] 新 Pages URL でアプリが開き、復元したデータが表示される
- [ ] `idea` ラベル付き Issue を立てるとトリアージが起動する（§3-2 の回帰確認）
- [ ] トリアージのコメントが Claude から投稿される（§3-1 の差し替え確認）
- [ ] LLM 分析機能が CORS エラーなく動く（§3-6）
- [ ] `deploy.yml` が push で発火し Pages が更新される
- [ ] 個人アカウントの `PIPELINE_PAT` が失効済みである

---

## 6. Public が NG だった場合の代替

会社ポリシーで Public リポジトリが許可されない場合、Pages は使えない。

**会社 Org へ private で移管 + Cloudflare Pages で配信**する。
このアプリは静的サイトでビルド不要なので相性は良い。Cloudflare Access を噛ませれば
会社メールドメイン認証でサイト自体を閉じられる。

ただし構成が一段複雑になり、Access を本番ドメインに適用するには独自ドメインが要る可能性がある
（会社ドメインのサブドメイン申請 = 情シス手続き）。Actions も private 扱いで
3,000分/月枠を消費する。§1 の #1 が NG だと判明した時点で改めて設計する。

---

## 7. 調査の出典

- [Transferring a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)
- [Changing the visibility of your GitHub Pages site](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)
- [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub's plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)
- [GitHub pricing](https://github.com/pricing)
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)

## 関連

- `docs/pipeline/SETUP.md` — パイプラインのセットアップ手順（移管後に §3-7 の置換対象）
- `.github/workflows/triage.yml` — §3-2 の修正対象
- `.github/workflows/deploy.yml` — §3-4 の Pages 配信構成
