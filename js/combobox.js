// ============================================
// 汎用 combobox（input + 候補リスト）
// iPhone / PC 両対応のオートコンプリート UI
// ============================================

/**
 * combobox を初期化する
 * @param {Object} cfg
 * @param {HTMLElement} cfg.root        - .combobox ラッパー要素
 * @param {HTMLInputElement} cfg.input  - 入力フィールド
 * @param {HTMLElement} cfg.list        - .combobox-list 要素
 * @param {HTMLButtonElement} cfg.toggle - ▼ ボタン
 * @param {() => string[]} cfg.getOptions - 候補配列を返す関数
 * @param {(value: string, kind: 'existing'|'create') => void} [cfg.onCommit] - 確定時コールバック
 * @param {string} [cfg.placeholderEmpty] - 候補ゼロ時の文言
 * @param {string} [cfg.sectionLabel] - セクションヘッダ文言（既存候補ヘッダ）
 * @param {(query: string) => string} [cfg.createLabel] - 新規追加候補の表示文言生成
 * @returns {{ open: Function, close: Function, refresh: Function, setValue: Function, getValue: Function, destroy: Function }}
 */
export function createCombobox(cfg) {
    const {
        root, input, list, toggle,
        getOptions,
        onCommit,
        placeholderEmpty = '候補なし — 入力した文字列がそのまま登録されます',
        sectionLabel = '既存の候補',
        createLabel = (q) => `「${q}」を新規として登録`,
    } = cfg;

    let activeIndex = -1;
    let currentItems = [];
    let destroyed = false;

    function buildItems(query) {
        const q = query.trim();
        const all = getOptions() || [];
        const matched = !q
            ? all.slice()
            : all.filter(n => n.toLowerCase().includes(q.toLowerCase()));
        const exact = matched.some(n => n === q);
        const items = matched.map(name => ({ kind: 'existing', value: name }));
        if (q && !exact) items.push({ kind: 'create', value: q });
        return items;
    }

    function appendHighlighted(parent, text, query) {
        if (!query) {
            parent.appendChild(document.createTextNode(text));
            return;
        }
        const lowerText = text.toLowerCase();
        const lowerQ = query.toLowerCase();
        let pos = 0;
        while (pos < text.length) {
            const idx = lowerText.indexOf(lowerQ, pos);
            if (idx === -1) {
                parent.appendChild(document.createTextNode(text.slice(pos)));
                break;
            }
            if (idx > pos) parent.appendChild(document.createTextNode(text.slice(pos, idx)));
            const mark = document.createElement('mark');
            mark.textContent = text.slice(idx, idx + query.length);
            parent.appendChild(mark);
            pos = idx + query.length;
        }
    }

    function render(query) {
        currentItems = buildItems(query);
        activeIndex = currentItems.length > 0 ? 0 : -1;
        list.textContent = '';

        if (currentItems.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'combobox-empty';
            empty.textContent = placeholderEmpty;
            list.appendChild(empty);
            return;
        }

        const existingCount = currentItems.filter(i => i.kind === 'existing').length;
        if (existingCount > 0 && sectionLabel) {
            const section = document.createElement('div');
            section.className = 'combobox-section';
            section.textContent = `${sectionLabel}（${existingCount}件）`;
            list.appendChild(section);
        }

        currentItems.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'combobox-item' + (item.kind === 'create' ? ' create-new' : '') + (i === activeIndex ? ' active' : '');
            el.dataset.index = String(i);
            el.setAttribute('role', 'option');

            if (item.kind === 'create') {
                const icon = document.createElement('span');
                icon.className = 'plus-icon';
                icon.textContent = '+';
                el.appendChild(icon);
                const txt = document.createElement('span');
                txt.textContent = createLabel(item.value);
                el.appendChild(txt);
            } else {
                appendHighlighted(el, item.value, query);
            }
            list.appendChild(el);
        });
    }

    function setActive(i) {
        activeIndex = i;
        list.querySelectorAll('.combobox-item').forEach((el, idx) => {
            el.classList.toggle('active', idx === i);
            if (idx === i) el.scrollIntoView({ block: 'nearest' });
        });
    }

    function decideDirection() {
        const rect = root.getBoundingClientRect();
        const viewportH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        const spaceBelow = viewportH - rect.bottom;
        const spaceAbove = rect.top;
        const needed = 280;
        root.classList.toggle('up', spaceBelow < needed && spaceAbove > spaceBelow);
    }

    function open() {
        if (input.readOnly || input.disabled) return;
        render(input.value);
        decideDirection();
        root.classList.add('open');
    }

    function close() {
        root.classList.remove('open');
        activeIndex = -1;
    }

    function commit(value, kind) {
        input.value = value;
        if (typeof onCommit === 'function') onCommit(value, kind);
        // change イベントを既存ロジック向けに発火
        input.dispatchEvent(new Event('change', { bubbles: true }));
        close();
    }

    const onFocus = () => open();
    const onInput = () => {
        render(input.value);
        decideDirection();
        if (!root.classList.contains('open')) root.classList.add('open');
    };
    const onKeydown = (e) => {
        if (!root.classList.contains('open') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            open();
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(Math.min(activeIndex + 1, currentItems.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && currentItems[activeIndex] && root.classList.contains('open')) {
                e.preventDefault();
                const it = currentItems[activeIndex];
                commit(it.value, it.kind);
            }
        } else if (e.key === 'Escape') {
            close();
        }
    };
    const onListPointerDown = (e) => {
        const target = e.target.closest('.combobox-item');
        if (!target) return;
        e.preventDefault();
        const idx = parseInt(target.dataset.index, 10);
        const it = currentItems[idx];
        if (it) commit(it.value, it.kind);
    };
    const onTogglePointerDown = (e) => {
        e.preventDefault();
        if (root.classList.contains('open')) {
            close();
            input.blur();
        } else {
            input.focus();
            open();
        }
    };
    const onDocPointerDown = (e) => {
        if (!root.contains(e.target)) close();
    };
    const onViewportResize = () => {
        if (root.classList.contains('open')) decideDirection();
    };

    input.addEventListener('focus', onFocus);
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
    list.addEventListener('pointerdown', onListPointerDown);
    toggle.addEventListener('pointerdown', onTogglePointerDown);
    document.addEventListener('pointerdown', onDocPointerDown);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onViewportResize);
    }

    return {
        open,
        close,
        refresh() {
            if (root.classList.contains('open')) render(input.value);
        },
        setValue(v) {
            input.value = v == null ? '' : String(v);
        },
        getValue() {
            return input.value;
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            input.removeEventListener('focus', onFocus);
            input.removeEventListener('input', onInput);
            input.removeEventListener('keydown', onKeydown);
            list.removeEventListener('pointerdown', onListPointerDown);
            toggle.removeEventListener('pointerdown', onTogglePointerDown);
            document.removeEventListener('pointerdown', onDocPointerDown);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', onViewportResize);
            }
        },
    };
}

console.log('✅ モジュール combobox.js loaded');
