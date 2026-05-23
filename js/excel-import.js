// Excel ファイルから見積・実績を追加読み込みする機能
// 仕様書: docs/superpowers/specs/2026-05-23-excel-append-import-design.md

/**
 * Excel ファイル取り込みのエントリポイント
 * @param {File} file - ユーザーが選択した xlsx/xls ファイル
 */
export async function handleExcelImport(file) {
    alert('Excel 読み込み機能は実装中です（' + file.name + '）');
}

console.log('✅ モジュール excel-import.js loaded');
