# ローカルLLM分析機能 - 実装構成図（Mermaid）

> **ステータス**: 構想段階（2026-02-24時点）
> **関連ドキュメント**: [構想メモ](./LLM_ANALYSIS_CONCEPT.md) / [テキスト版構成図](./LLM_ANALYSIS_ARCHITECTURE.md)

---

## 1. サーバー構成 全体図

```mermaid
graph TB
    subgraph LAN["社内ネットワーク（外部通信なし）"]

        subgraph PCs["チームリーダーPC"]
            PC_A["PC-A<br/>リーダーA<br/>ブラウザ + localStorage"]
            PC_B["PC-B<br/>リーダーB<br/>ブラウザ + localStorage"]
            PC_C["PC-C<br/>リーダーC<br/>ブラウザ + localStorage"]
        end

        NAS["共有フォルダ / NAS<br/>backups/team-a/<br/>backups/team-b/<br/>backups/team-c/"]

        subgraph LLM_SV["LLMサーバー（GPU搭載）"]
            PIPELINE["分析パイプライン<br/>summarize.py → analyze.py"]
            OLLAMA["Ollama<br/>オープンウェイトモデル<br/>（7B〜14B）"]
            RESULTS["推論結果<br/>results/*.json"]
            PIPELINE --> OLLAMA --> RESULTS
        end

        subgraph APP_SV["アプリサーバー（Webサーバー）"]
            STATIC["静的ファイル配信<br/>index.html / style.css / js/"]
            ANALYSIS["analysis/<br/>team-a.json<br/>team-b.json<br/>team-c.json"]
        end

        PC_A -- "バックアップJSON" --> NAS
        PC_B -- "バックアップJSON" --> NAS
        PC_C -- "バックアップJSON" --> NAS

        NAS -- "① 定期コピー<br/>rsync / cron" --> PIPELINE

        RESULTS -- "② 定期コピー<br/>rsync / cron" --> ANALYSIS

        STATIC -- "HTML/CSS/JS" --> PC_A
        STATIC -- "HTML/CSS/JS" --> PC_B
        STATIC -- "HTML/CSS/JS" --> PC_C

        ANALYSIS -- "fetch<br/>team-a.json" --> PC_A
        ANALYSIS -- "fetch<br/>team-b.json" --> PC_B
        ANALYSIS -- "fetch<br/>team-c.json" --> PC_C
    end

    style LAN fill:none,stroke:#666,stroke-width:2px
    style PCs fill:#e8f4fd,stroke:#4a90d9
    style LLM_SV fill:#fff3e0,stroke:#e67e22
    style APP_SV fill:#e8f5e9,stroke:#27ae60
```

---

## 2. データフロー

```mermaid
flowchart LR
    subgraph Step1["Step 1: バックアップ保存"]
        USER["ユーザー操作"]
        BACKUP["autoBackup()<br/>JSON出力"]
        USER --> BACKUP
    end

    subgraph Step2["Step 2: データ転送"]
        SHARE["共有フォルダに配置"]
        RSYNC1["rsync / cron<br/>LLMサーバーへコピー"]
        SHARE --> RSYNC1
    end

    subgraph Step3["Step 3: LLM推論"]
        SUMMARIZE["要約データ生成<br/>summarize.py"]
        INFER["LLM推論<br/>Ollama API"]
        OUTPUT["結果JSON生成"]
        SUMMARIZE --> INFER --> OUTPUT
    end

    subgraph Step4["Step 4: 結果配信"]
        RSYNC2["rsync / cron<br/>アプリサーバーへ"]
        DEPLOY["analysis/*.json<br/>として配置"]
        RSYNC2 --> DEPLOY
    end

    subgraph Step5["Step 5: 表示"]
        FETCH["fetch で取得"]
        DISPLAY["AI分析セクション表示<br/>評価・展望・推奨アクション"]
        FETCH --> DISPLAY
    end

    Step1 --> Step2 --> Step3 --> Step4 --> Step5

    style Step1 fill:#e3f2fd,stroke:#1976d2
    style Step2 fill:#f3e5f5,stroke:#7b1fa2
    style Step3 fill:#fff3e0,stroke:#e65100
    style Step4 fill:#f3e5f5,stroke:#7b1fa2
    style Step5 fill:#e8f5e9,stroke:#2e7d32
```

---

## 3. LLMサーバー内部 パイプライン

```mermaid
flowchart TD
    CRON["cron 起動<br/>毎日 02:00"]
    RSYNC_IN["rsync<br/>共有フォルダ → /data/backups/"]
    
    subgraph LOOP["チームごとに順次実行"]
        READ["バックアップJSON読み込み<br/>/data/backups/team-X/"]
        SUMMARIZE["要約データ生成<br/>summarize.py"]
        PROMPT["プロンプト構築<br/>システムプロンプト + 要約JSON"]
        OLLAMA["Ollama API 呼び出し<br/>POST localhost:11434/api/generate"]
        VALIDATE["レスポンス検証<br/>JSONパース・フォーマット確認"]
        SAVE["結果JSON保存<br/>/data/results/team-X_analysis.json"]

        READ --> SUMMARIZE --> PROMPT --> OLLAMA --> VALIDATE --> SAVE
    end

    RSYNC_OUT["rsync<br/>/data/results/ → アプリサーバー"]
    LOG["ログ出力・完了通知"]

    CRON --> RSYNC_IN --> LOOP --> RSYNC_OUT --> LOG

    style CRON fill:#fff9c4,stroke:#f57f17
    style LOOP fill:#fff3e0,stroke:#e67e22
    style OLLAMA fill:#ffccbc,stroke:#d84315
```

---

## 4. データ変換フロー

```mermaid
flowchart LR
    subgraph RAW["バックアップJSON（生データ）"]
        EST["estimates<br/>見積レコード"]
        ACT["actuals<br/>実績レコード"]
        REM["remainingEstimates<br/>残見積"]
        SCH["schedules<br/>スケジュール"]
    end

    subgraph SUMMARY["要約JSON（中間データ）"]
        OVR["overall<br/>全体の精度・タスク数"]
        VER["by_version<br/>バージョン別進捗"]
        PRC["by_process<br/>工程別精度"]
        MEM["by_member<br/>メンバー別パフォーマンス"]
        TRD["monthly_trend<br/>月次トレンド"]
        CAP["capacity<br/>キャパシティ情報"]
        ANO["anomalies<br/>異常値タスク"]
    end

    subgraph RESULT["推論結果JSON（最終出力）"]
        EVAL["team_evaluation<br/>総合評価・スコア・強み・課題"]
        OUTLOOK["outlook<br/>完了予測・精度予測・リスク"]
        ACTIONS["recommended_actions<br/>優先度付きプロセス改善提案"]
        NEXT["next_review_focus<br/>次回注視ポイント"]
    end

    RAW -- "summarize.py<br/>集計・計算" --> SUMMARY
    SUMMARY -- "LLM推論<br/>analyze.py" --> RESULT

    style RAW fill:#e3f2fd,stroke:#1565c0
    style SUMMARY fill:#fff3e0,stroke:#e65100
    style RESULT fill:#e8f5e9,stroke:#2e7d32
```

---

## 5. ネットワーク構成

```mermaid
flowchart TB
    subgraph LAN["社内ネットワーク (LAN)"]
        direction TB

        PC["各チームリーダーPC"]
        APP["アプリサーバー<br/>:80 / :443"]
        NAS["共有フォルダ<br/>SMB / NFS"]
        LLM["LLMサーバー"]
        OLLAMA["Ollama<br/>localhost:11434"]

        PC -- "HTTP<br/>静的ファイル取得" --> APP
        PC -- "HTTP<br/>analysis/*.json 取得" --> APP
        PC -- "SMB/NFS<br/>バックアップ配置" --> NAS
        NAS -- "rsync<br/>バックアップ転送" --> LLM
        LLM -- "rsync<br/>推論結果配信" --> APP
        LLM -- "HTTP<br/>ローカル通信のみ" --> OLLAMA
    end

    EXTERNAL["外部ネットワーク<br/>（インターネット）"]
    LAN -. "通信なし ✕" .- EXTERNAL

    style LAN fill:none,stroke:#2196f3,stroke-width:2px
    style EXTERNAL fill:#ffebee,stroke:#c62828,stroke-dasharray: 5 5
    style OLLAMA fill:#ffccbc,stroke:#d84315
```

---

## 6. 定期実行タイムライン

```mermaid
gantt
    title 夜間バッチ処理スケジュール
    dateFormat HH:mm
    axisFormat %H:%M

    section データ転送
    共有フォルダ → LLMサーバー (rsync)   :a1, 02:00, 5m

    section LLM推論
    チームA 要約生成 + 推論              :a2, after a1, 10m
    チームB 要約生成 + 推論              :a3, after a2, 10m
    チームC 要約生成 + 推論              :a4, after a3, 10m

    section 結果配信
    LLMサーバー → アプリサーバー (rsync)  :a5, after a4, 5m

    section ユーザー利用
    出社・レポート確認                    :milestone, 09:00, 0m
```

---

## 7. フロントエンド表示フロー

```mermaid
flowchart TD
    LOAD["レポート画面読み込み"]
    FETCH["fetch('/analysis/team-X.json')"]
    CHECK{レスポンス}

    OK["200 OK"]
    NOT_FOUND["404 Not Found"]

    PARSE["JSONパース"]
    VALIDATE{"generated_at<br/>が古すぎないか?"}

    SHOW_FRESH["AI分析セクション表示<br/>（最新）"]
    SHOW_STALE["AI分析セクション表示<br/>+ 「データが古い可能性」の注記"]
    HIDE["AI分析セクション非表示<br/>（graceful degradation）<br/>既存の静的分析のみ表示"]

    LOAD --> FETCH --> CHECK
    CHECK --> |200| OK --> PARSE --> VALIDATE
    CHECK --> |404| NOT_FOUND --> HIDE
    VALIDATE --> |7日以内| SHOW_FRESH
    VALIDATE --> |7日超過| SHOW_STALE

    style LOAD fill:#e3f2fd,stroke:#1565c0
    style SHOW_FRESH fill:#e8f5e9,stroke:#2e7d32
    style SHOW_STALE fill:#fff9c4,stroke:#f57f17
    style HIDE fill:#f5f5f5,stroke:#9e9e9e
```
