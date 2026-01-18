// ============================================
// レポート設定関連機能
// ============================================

import { reportSettings, setReportSettings } from './state.js';

// ============================================
// レポート設定
// ============================================

export function loadReportSettings() {
    const saved = localStorage.getItem('reportSettings');
    if (saved) {
        const loadedSettings = JSON.parse(saved);
        setReportSettings(loadedSettings);
    }

    // UIに反映
    const elements = {
        'reportAccuracyEnabled': reportSettings.accuracyEnabled,
        'reportAnomalyEnabled': reportSettings.anomalyEnabled,
        'reportWarningTasksEnabled': reportSettings.warningTasksEnabled,
        'reportChartEnabled': reportSettings.chartEnabled,
        'reportTrendEnabled': reportSettings.trendEnabled,
        'reportMemberAnalysisEnabled': reportSettings.memberAnalysisEnabled,
        'reportInsightsEnabled': reportSettings.insightsEnabled
    };

    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.checked = value;
    });
}

export function saveReportSettings() {
    const settings = {
        accuracyEnabled: document.getElementById('reportAccuracyEnabled')?.checked ?? true,
        anomalyEnabled: document.getElementById('reportAnomalyEnabled')?.checked ?? true,
        warningTasksEnabled: document.getElementById('reportWarningTasksEnabled')?.checked ?? true,
        chartEnabled: document.getElementById('reportChartEnabled')?.checked ?? true,
        trendEnabled: document.getElementById('reportTrendEnabled')?.checked ?? true,
        memberAnalysisEnabled: document.getElementById('reportMemberAnalysisEnabled')?.checked ?? true,
        insightsEnabled: document.getElementById('reportInsightsEnabled')?.checked ?? true
    };

    setReportSettings(settings);
    localStorage.setItem('reportSettings', JSON.stringify(settings));
}

// ============================================
// デバッグモード設定
// ============================================

export function loadDebugModeSetting() {
    const saved = localStorage.getItem('debugModeEnabled');
    const isEnabled = saved === 'true';

    // State経由で設定（setDebugModeEnabledがあれば）
    if (typeof window.setDebugModeEnabled === 'function') {
        window.setDebugModeEnabled(isEnabled);
    }

    const checkbox = document.getElementById('debugModeEnabled');
    if (checkbox) checkbox.checked = isEnabled;
}

export function saveDebugModeSetting() {
    const checkbox = document.getElementById('debugModeEnabled');
    const isEnabled = checkbox ? checkbox.checked : false;

    if (typeof window.setDebugModeEnabled === 'function') {
        window.setDebugModeEnabled(isEnabled);
    }
    localStorage.setItem('debugModeEnabled', isEnabled);
}

console.log('✅ モジュール report.js loaded');
