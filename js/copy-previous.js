/**
 * [A-2] 前日コピー機能
 * 前営業日（または指定日）の実績をコピーして新しい日付で作成
 */

import { actuals } from './state.js';
import { pushAction } from './history.js';
import { showAlert, sortMembers } from './utils.js';
import { validateActualInput } from './validation.js';

/**
 * 指定日より前の直近で実績がある日を探す
 */
function findMostRecentActualDate(beforeDate, member) {
    const dates = actuals
        .filter(a => a.date < beforeDate && (!member || a.member === member))
        .map(a => a.date);
    if (dates.length === 0) return null;
    return dates.sort().reverse()[0];
}

/**
 * 前営業日（土日を飛ばした前日）を返す
 */
function getPreviousBusinessDay(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    do {
        date.setDate(date.getDate() - 1);
    } while (date.getDay() === 0 || date.getDay() === 6);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

let modalState = {
    sourceDate: null,
    targetDate: null,
    member: null,
    selections: new Map()
};

export function openCopyPreviousModal() {
    const workDateInput = document.getElementById('quickWorkDate');
    const memberSelect = document.getElementById('quickMemberSelect');

    const today = new Date().toISOString().split('T')[0];
    const targetDate = (workDateInput && workDateInput.value) || today;

    let defaultMember = memberSelect && memberSelect.value ? memberSelect.value : '';
    if (!defaultMember) {
        const recent = actuals
            .filter(a => a.date < targetDate)
            .sort((a, b) => b.date.localeCompare(a.date));
        if (recent.length > 0) defaultMember = recent[0].member;
    }

    let sourceDate = getPreviousBusinessDay(targetDate);
    const hasActualsOnSource = actuals.some(a =>
        a.date === sourceDate && (!defaultMember || a.member === defaultMember)
    );
    if (!hasActualsOnSource) {
        const recent = findMostRecentActualDate(targetDate, defaultMember);
        if (recent) sourceDate = recent;
    }

    modalState = {
        sourceDate,
        targetDate,
        member: defaultMember,
        selections: new Map()
    };

    renderCopyPreviousModal();
    document.getElementById('copyPreviousModal').classList.add('active');
}

export function closeCopyPreviousModal() {
    const modal = document.getElementById('copyPreviousModal');
    if (modal) modal.classList.remove('active');
    modalState.selections.clear();
}

function getWeekday(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, d).getDay()];
}

/** Helper: create option element */
function makeOption(value, label, selected) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (selected) opt.selected = true;
    return opt;
}

function renderCopyPreviousModal() {
    const { sourceDate, targetDate, member } = modalState;

    const members = sortMembers([...new Set(actuals.map(a => a.member).filter(Boolean))]);

    const availableDates = [...new Set(
        actuals
            .filter(a => a.date < targetDate && (!member || a.member === member))
            .map(a => a.date)
    )].sort().reverse().slice(0, 30);

    const sourceActuals = actuals.filter(a =>
        a.date === sourceDate && (!member || a.member === member)
    );

    sourceActuals.forEach(a => {
        if (!modalState.selections.has(a.id)) {
            modalState.selections.set(a.id, { selected: true, hours: a.hours });
        }
    });

    const body = document.getElementById('copyPreviousModalBody');
    if (!body) return;
    body.textContent = '';

    // コントロール部分
    const controlRow = document.createElement('div');
    controlRow.className = 'copy-prev-controls';

    const targetGroup = document.createElement('div');
    targetGroup.className = 'copy-prev-field';
    const targetLabel = document.createElement('label');
    targetLabel.textContent = 'コピー先（今回登録する日）';
    const targetValue = document.createElement('div');
    targetValue.className = 'copy-prev-value';
    targetValue.textContent = `${targetDate} (${getWeekday(targetDate)})`;
    targetGroup.append(targetLabel, targetValue);

    const memberGroup = document.createElement('div');
    memberGroup.className = 'copy-prev-field';
    const memberLabel = document.createElement('label');
    memberLabel.textContent = 'メンバー';
    const memberSel = document.createElement('select');
    memberSel.id = 'copyPrevMemberSelect';
    memberSel.appendChild(makeOption('', '全員', !member));
    members.forEach(m => memberSel.appendChild(makeOption(m, m, m === member)));
    memberSel.addEventListener('change', (e) => {
        modalState.member = e.target.value;
        modalState.selections.clear();
        renderCopyPreviousModal();
    });
    memberGroup.append(memberLabel, memberSel);

    const sourceGroup = document.createElement('div');
    sourceGroup.className = 'copy-prev-field';
    const sourceLabel = document.createElement('label');
    sourceLabel.textContent = 'コピー元の日付';
    const sourceSel = document.createElement('select');
    sourceSel.id = 'copyPrevSourceSelect';
    if (availableDates.length === 0) {
        sourceSel.appendChild(makeOption('', '（実績データなし）', true));
        sourceSel.disabled = true;
    } else {
        availableDates.forEach(d => {
            const count = actuals.filter(a => a.date === d && (!member || a.member === member)).length;
            sourceSel.appendChild(makeOption(d, `${d} (${getWeekday(d)}) — ${count}件`, d === sourceDate));
        });
    }
    sourceSel.addEventListener('change', (e) => {
        modalState.sourceDate = e.target.value;
        modalState.selections.clear();
        renderCopyPreviousModal();
    });
    sourceGroup.append(sourceLabel, sourceSel);

    controlRow.append(targetGroup, memberGroup, sourceGroup);
    body.appendChild(controlRow);

    // リストヘッダー
    const listHeader = document.createElement('div');
    listHeader.className = 'copy-prev-list-header';
    listHeader.textContent = sourceActuals.length > 0
        ? `コピーする実績を選択（${sourceDate} から ${targetDate} へ）`
        : '選択した日付・メンバーには実績がありません';
    body.appendChild(listHeader);

    if (sourceActuals.length > 0) {
        // 一括ボタン
        const bulkRow = document.createElement('div');
        bulkRow.className = 'copy-prev-bulk';
        const selectAllBtn = document.createElement('button');
        selectAllBtn.type = 'button';
        selectAllBtn.className = 'copy-prev-bulk-btn';
        selectAllBtn.textContent = 'すべて選択';
        selectAllBtn.addEventListener('click', () => {
            sourceActuals.forEach(a => {
                const s = modalState.selections.get(a.id) || { selected: true, hours: a.hours };
                modalState.selections.set(a.id, { ...s, selected: true });
            });
            renderCopyPreviousModal();
        });
        const deselectAllBtn = document.createElement('button');
        deselectAllBtn.type = 'button';
        deselectAllBtn.className = 'copy-prev-bulk-btn';
        deselectAllBtn.textContent = 'すべて解除';
        deselectAllBtn.addEventListener('click', () => {
            sourceActuals.forEach(a => {
                const s = modalState.selections.get(a.id) || { selected: false, hours: a.hours };
                modalState.selections.set(a.id, { ...s, selected: false });
            });
            renderCopyPreviousModal();
        });
        bulkRow.append(selectAllBtn, deselectAllBtn);
        body.appendChild(bulkRow);

        const list = document.createElement('ul');
        list.className = 'copy-prev-list';

        sourceActuals.forEach(a => {
            const state = modalState.selections.get(a.id) || { selected: true, hours: a.hours };

            const item = document.createElement('li');
            item.className = 'copy-prev-item' + (state.selected ? ' is-selected' : '');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = state.selected;
            checkbox.addEventListener('change', (e) => {
                const s = modalState.selections.get(a.id);
                modalState.selections.set(a.id, { ...s, selected: e.target.checked });
                item.classList.toggle('is-selected', e.target.checked);
            });

            const label = document.createElement('div');
            label.className = 'copy-prev-item-label';
            const title = document.createElement('div');
            title.className = 'copy-prev-item-title';
            title.textContent = a.version
                ? `${a.version} / ${a.task} / ${a.process}`
                : a.task;
            const meta = document.createElement('div');
            meta.className = 'copy-prev-item-meta';
            meta.textContent = a.member;
            label.append(title, meta);

            const hoursInput = document.createElement('input');
            hoursInput.type = 'number';
            hoursInput.className = 'copy-prev-item-hours';
            hoursInput.step = '0.25';
            hoursInput.min = '0.1';
            hoursInput.value = state.hours;
            hoursInput.addEventListener('input', (e) => {
                const s = modalState.selections.get(a.id);
                modalState.selections.set(a.id, {
                    ...s,
                    hours: parseFloat(e.target.value) || 0
                });
            });
            const hoursUnit = document.createElement('span');
            hoursUnit.className = 'copy-prev-item-unit';
            hoursUnit.textContent = 'h';

            item.append(checkbox, label, hoursInput, hoursUnit);
            list.appendChild(item);
        });

        body.appendChild(list);

        // Summary
        const selectedCount = sourceActuals.filter(a => modalState.selections.get(a.id)?.selected).length;
        const totalHours = sourceActuals
            .filter(a => modalState.selections.get(a.id)?.selected)
            .reduce((s, a) => s + (modalState.selections.get(a.id)?.hours || 0), 0);

        const summary = document.createElement('div');
        summary.className = 'copy-prev-summary';
        summary.textContent = `選択中: ${selectedCount}件 / 合計 ${totalHours.toFixed(1)}h`;
        body.appendChild(summary);
    }

    // Footer
    const footer = document.getElementById('copyPreviousModalFooter');
    if (footer) {
        footer.textContent = '';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'キャンセル';
        cancelBtn.addEventListener('click', closeCopyPreviousModal);

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'btn btn-primary';
        applyBtn.textContent = 'コピーして登録';
        applyBtn.disabled = sourceActuals.length === 0;
        applyBtn.addEventListener('click', applyCopyPrevious);

        footer.append(cancelBtn, applyBtn);
    }
}

function applyCopyPrevious() {
    const { sourceDate, targetDate } = modalState;
    const sourceActuals = actuals.filter(a =>
        a.date === sourceDate && (!modalState.member || a.member === modalState.member)
    );

    const toCopy = sourceActuals.filter(a => {
        const s = modalState.selections.get(a.id);
        return s && s.selected && s.hours > 0;
    });

    if (toCopy.length === 0) {
        alert('コピーする実績を1件以上選択してください');
        return;
    }

    const toCreate = [];
    const issues = [];

    for (const source of toCopy) {
        const state = modalState.selections.get(source.id);
        const newActual = {
            id: Date.now() + Math.random(),
            date: targetDate,
            version: source.version || '',
            task: source.task,
            process: source.process || '',
            member: source.member,
            hours: state.hours,
            createdAt: new Date().toISOString()
        };

        const result = validateActualInput(newActual);
        if (!result.isValid) {
            issues.push({ source, errors: result.errors });
        } else {
            toCreate.push({ newActual, warnings: result.warnings });
        }
    }

    if (issues.length > 0) {
        const msgs = issues.map(i => {
            const label = i.source.version
                ? `${i.source.version}/${i.source.task}/${i.source.process}`
                : i.source.task;
            return `• ${label}: ${i.errors.join('; ')}`;
        }).join('\n');
        alert(`以下の実績はコピーできませんでした:\n\n${msgs}\n\n一度キャンセルして個別に確認してください。`);
        return;
    }

    const allWarnings = toCreate.flatMap(c => c.warnings);
    if (allWarnings.length > 0) {
        const uniqueWarnings = [...new Set(allWarnings)];
        const msg = `コピー作成する${toCreate.length}件について以下の注意事項があります:\n\n${uniqueWarnings.map(w => '• ' + w).join('\n')}\n\nこのまま登録しますか？`;
        if (!confirm(msg)) return;
    }

    const addedActuals = [];
    for (const { newActual } of toCreate) {
        actuals.push(newActual);
        addedActuals.push({ ...newActual });
    }

    pushAction({
        type: 'actual_add',
        description: `前日コピー: ${toCreate.length}件 (${sourceDate} → ${targetDate})`,
        data: { added: addedActuals[0], addedAll: addedActuals }
    });

    if (typeof window.saveData === 'function') window.saveData();

    closeCopyPreviousModal();

    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();

    showAlert(`${toCreate.length}件をコピー作成しました`, true);
}

console.log('✅ モジュール copy-previous.js loaded');
