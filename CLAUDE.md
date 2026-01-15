# 工数管理システム - 開発ガイド

> **このファイルについて**
> - **CLAUDE.md**: プロジェクトで共有する開発方針（Git管理）
> - **CLAUDE.local.md**: 個人用の追加指示やメモ（.gitignoreで除外）

## プロジェクト概要
単一HTMLファイルで構成された工数管理システム。見積・実績の管理、レポート分析、担当者別の工数分析などの機能を提供。

## 技術スタック
- 純粋なHTML/CSS/JavaScript（フレームワークなし）
- ExcelJS（Excelファイル出力）
- Chart.js風の独自Canvas描画
- ローカルストレージによるデータ永続化

## UI/UX方針

### モーダルの操作
- 基本的にモーダル外クリックで閉じる機能を実装する
- 例外：確認が必要な重要な操作（削除確認など）や、入力途中で閉じると困るもの
- 実装方法：
  ```javascript
  modalElement.addEventListener('click', function(event) {
      if (event.target === modalElement) {
          closeModalFunction();
      }
  });
  ```

### アラート表示
- **重要でないメッセージは外クリックで閉じられるようにする**
- 成功メッセージ（「登録しました」「追加しました」など）は外クリック可能
- エラーメッセージやバリデーション警告は外クリック不可（明示的な確認が必要）
- カスタムアラート関数 `showAlert(message, dismissible)` を使用
  - `dismissible: true` - 外クリックで閉じられる（成功メッセージ用）
  - `dismissible: false` - OKボタンのみで閉じる（エラー/警告用）

## データ管理方針

### バックアップ機能
- **新しい設定項目を追加する際は、必ずバックアップJSONにエクスポートする**
- エクスポート側（`autoBackup`関数）：`settings`オブジェクトに設定値を追加
- インポート側（`handleFileImport`関数）：`data.settings`から設定値を復元し、UI要素（チェックボックス等）に反映
- localStorageを使用する設定は全てバックアップ対象とする
- これにより、ユーザーが環境を移行する際に設定が引き継がれる
