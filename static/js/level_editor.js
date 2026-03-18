(function () {
    const svg = document.getElementById('level-editor');
    if (!svg) {
        return;
    }

    const NS = 'http://www.w3.org/2000/svg';
    const state = {
        levels: [],
        transitions: [],
        selectedLevelIds: [],
        selectedTransitionId: null,
        draggingLevelId: null,
        dragOffsetY: 0,
        nextLevelId: 1,
        nextTransitionId: 1,
        energyUnit: 'MHz',
    };

    const viewport = {
        width: 760,
        height: 520,
        lineX1: 180,
        lineX2: 420,
        top: 80,
        bottom: 460,
    };

    const editorStatus = document.getElementById('editor-status');
    const selectionStatus = document.getElementById('selection-status');
    const jsonPreview = document.getElementById('editor-json-preview');
    const levelInspector = document.getElementById('level-inspector');
    const transitionInspector = document.getElementById('transition-inspector');
    const emptySelection = document.getElementById('empty-selection');
    const systemLevelCount = document.getElementById('id_system-level_count');
    const systemSpacing = document.getElementById('id_system-level_spacing');
    const systemEnergyUnit = document.getElementById('id_system-energy_unit');

    const levelLabelInput = document.getElementById('selected-level-label');
    const levelEnergyInput = document.getElementById('selected-level-energy');
    const transitionLabelInput = document.getElementById('selected-transition-label');
    const transitionRabiInput = document.getElementById('selected-transition-rabi');
    const transitionRabiValue = document.getElementById('selected-transition-rabi-value');
    const transitionLinewidthInput = document.getElementById('selected-transition-linewidth');
    const transitionPhotonInput = document.getElementById('selected-transition-photon');

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function createSvgElement(tag, attrs = {}) {
        const el = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([key, value]) => {
            el.setAttribute(key, value);
        });
        return el;
    }

    function formatNumber(value) {
        return Number.parseFloat(value).toFixed(2);
    }

    function energyFromY(y) {
        const spacing = parseFloat(systemSpacing?.value || '1') || 1;
        return ((viewport.bottom - y) / 70) * spacing;
    }

    function yFromEnergy(energy) {
        const spacing = parseFloat(systemSpacing?.value || '1') || 1;
        const scaled = viewport.bottom - (energy / spacing) * 70;
        return clamp(scaled, viewport.top, viewport.bottom);
    }

    function syncEnergyUnit() {
        state.energyUnit = systemEnergyUnit?.value || 'MHz';
    }

    function syncSelectedLevelIds(levelId, withMultiSelect) {
        if (withMultiSelect) {
            if (state.selectedLevelIds.includes(levelId)) {
                state.selectedLevelIds = state.selectedLevelIds.filter((id) => id !== levelId);
            } else {
                state.selectedLevelIds = [...state.selectedLevelIds, levelId].slice(-2);
            }
        } else {
            state.selectedLevelIds = [levelId];
        }
        state.selectedTransitionId = null;
    }

    function selectTransition(transitionId) {
        state.selectedTransitionId = transitionId;
        state.selectedLevelIds = [];
    }

    function clearSelection() {
        state.selectedTransitionId = null;
        state.selectedLevelIds = [];
    }

    function getSelectedLevel() {
        if (state.selectedLevelIds.length !== 1) {
            return null;
        }
        return state.levels.find((level) => level.id === state.selectedLevelIds[0]) || null;
    }

    function getSelectedTransition() {
        if (state.selectedTransitionId === null) {
            return null;
        }
        return state.transitions.find((transition) => transition.id === state.selectedTransitionId) || null;
    }

    function addLevel({ y, label, energy } = {}) {
        const id = state.nextLevelId++;
        const resolvedY = y ?? clamp(viewport.bottom - (state.levels.length * 80), viewport.top, viewport.bottom);
        const level = {
            id,
            label: label || `|${state.levels.length}>`,
            y: resolvedY,
            energy: energy ?? energyFromY(resolvedY),
        };
        state.levels.push(level);
        syncLevelEnergies();
        syncPreview();
        render();
        return level;
    }

    function autoArrangeLevels(count) {
        const total = count ?? state.levels.length;
        if (!total) {
            return;
        }
        const step = total === 1 ? 0 : (viewport.bottom - viewport.top) / (total - 1);
        state.levels.forEach((level, index) => {
            level.y = viewport.bottom - step * index;
        });
        syncLevelEnergies();
        syncPreview();
        render();
    }

    function initLevelsFromForm() {
        const count = clamp(parseInt(systemLevelCount?.value || '3', 10) || 3, 2, 8);
        state.levels = [];
        state.transitions = [];
        state.selectedLevelIds = [];
        state.selectedTransitionId = null;
        state.nextLevelId = 1;
        state.nextTransitionId = 1;
        for (let index = 0; index < count; index += 1) {
            addLevel({ label: `|${index}>` });
        }
        autoArrangeLevels(count);
        editorStatus.textContent = `Создано ${count} уровней из параметров формы.`;
    }

    function addTransitionBetweenSelected() {
        if (state.selectedLevelIds.length !== 2) {
            editorStatus.textContent = 'Для создания перехода выберите ровно два уровня.';
            return;
        }
        const [fromId, toId] = state.selectedLevelIds;
        const fromLevel = state.levels.find((level) => level.id === fromId);
        const toLevel = state.levels.find((level) => level.id === toId);
        if (!fromLevel || !toLevel || fromId === toId) {
            editorStatus.textContent = 'Не удалось создать переход между выбранными уровнями.';
            return;
        }
        const id = state.nextTransitionId++;
        state.transitions.push({
            id,
            fromId,
            toId,
            label: `L${id}`,
            rabi: 0.4,
            linewidth: 0,
            photonEnergy: Math.abs(toLevel.energy - fromLevel.energy),
        });
        selectTransition(id);
        editorStatus.textContent = `Добавлен переход L${id}.`;
        syncPreview();
        render();
    }

    function deleteSelected() {
        const selectedTransition = getSelectedTransition();
        if (selectedTransition) {
            state.transitions = state.transitions.filter((transition) => transition.id !== selectedTransition.id);
            clearSelection();
            editorStatus.textContent = 'Переход удалён.';
            syncPreview();
            render();
            return;
        }
        if (state.selectedLevelIds.length === 1) {
            const levelId = state.selectedLevelIds[0];
            state.levels = state.levels.filter((level) => level.id !== levelId);
            state.transitions = state.transitions.filter(
                (transition) => transition.fromId !== levelId && transition.toId !== levelId,
            );
            clearSelection();
            syncPreview();
            render();
            editorStatus.textContent = 'Уровень и связанные с ним переходы удалены.';
        }
    }

    function syncLevelEnergies() {
        state.levels.forEach((level) => {
            level.y = clamp(level.y, viewport.top, viewport.bottom);
            level.energy = energyFromY(level.y);
        });
        state.transitions.forEach((transition) => {
            const from = state.levels.find((level) => level.id === transition.fromId);
            const to = state.levels.find((level) => level.id === transition.toId);
            if (from && to) {
                transition.photonEnergy = Math.abs(to.energy - from.energy);
            }
        });
    }

    function renderGrid() {
        for (let index = 0; index < 6; index += 1) {
            const y = viewport.top + ((viewport.bottom - viewport.top) / 5) * index;
            const line = createSvgElement('line', {
                x1: 70,
                x2: 700,
                y1: y,
                y2: y,
                class: 'editor-grid-line',
            });
            svg.appendChild(line);
            const label = createSvgElement('text', {
                x: 30,
                y: y + 4,
                class: 'editor-grid-label',
            });
            label.textContent = formatNumber(energyFromY(y));
            svg.appendChild(label);
        }
        const axisLabel = createSvgElement('text', {
            x: 28,
            y: 40,
            class: 'editor-axis-label',
        });
        axisLabel.textContent = `E (${state.energyUnit})`;
        svg.appendChild(axisLabel);
    }

    function renderLevels() {
        state.levels.forEach((level) => {
            const selected = state.selectedLevelIds.includes(level.id);
            const levelLine = createSvgElement('line', {
                x1: viewport.lineX1,
                x2: viewport.lineX2,
                y1: level.y,
                y2: level.y,
                class: selected ? 'energy-level selected' : 'energy-level',
                'data-level-id': level.id,
            });
            levelLine.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
                syncSelectedLevelIds(level.id, event.shiftKey);
                state.draggingLevelId = level.id;
                state.dragOffsetY = level.y - pointerY(event);
                render();
            });
            svg.appendChild(levelLine);

            const handle = createSvgElement('circle', {
                cx: viewport.lineX2 + 18,
                cy: level.y,
                r: 8,
                class: selected ? 'level-handle selected' : 'level-handle',
                'data-level-id': level.id,
            });
            handle.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
                syncSelectedLevelIds(level.id, event.shiftKey);
                state.draggingLevelId = level.id;
                state.dragOffsetY = level.y - pointerY(event);
                render();
            });
            svg.appendChild(handle);

            const label = createSvgElement('text', {
                x: viewport.lineX2 + 34,
                y: level.y + 5,
                class: 'level-label',
            });
            label.textContent = `${level.label}  ${formatNumber(level.energy)} ${state.energyUnit}`;
            svg.appendChild(label);
        });
    }

    function renderTransitions() {
        state.transitions.forEach((transition) => {
            const from = state.levels.find((level) => level.id === transition.fromId);
            const to = state.levels.find((level) => level.id === transition.toId);
            if (!from || !to) {
                return;
            }
            const selected = state.selectedTransitionId === transition.id;
            const x = 520 + ((transition.id % 3) * 48);
            const arrow = createSvgElement('line', {
                x1: x,
                y1: from.y,
                x2: x,
                y2: to.y,
                class: selected ? 'transition-arrow selected' : 'transition-arrow',
                'stroke-width': 2 + transition.rabi * 2.8,
                'marker-end': to.y < from.y ? 'url(#arrowhead-up)' : 'url(#arrowhead-down)',
            });
            arrow.addEventListener('click', (event) => {
                event.stopPropagation();
                selectTransition(transition.id);
                render();
            });
            svg.appendChild(arrow);

            const midpointY = (from.y + to.y) / 2;
            const text = createSvgElement('text', {
                x: x + 16,
                y: midpointY,
                class: 'transition-label',
            });
            text.textContent = `${transition.label}: ${formatNumber(transition.photonEnergy)} ${state.energyUnit}`;
            svg.appendChild(text);
        });
    }

    function renderDefs() {
        const defs = createSvgElement('defs');
        const up = createSvgElement('marker', {
            id: 'arrowhead-up',
            markerWidth: 10,
            markerHeight: 10,
            refX: 5,
            refY: 5,
            orient: 'auto',
        });
        up.appendChild(createSvgElement('path', { d: 'M0,10 L5,0 L10,10 Z', fill: '#0f766e' }));
        defs.appendChild(up);

        const down = createSvgElement('marker', {
            id: 'arrowhead-down',
            markerWidth: 10,
            markerHeight: 10,
            refX: 5,
            refY: 5,
            orient: 'auto',
        });
        down.appendChild(createSvgElement('path', { d: 'M0,0 L5,10 L10,0 Z', fill: '#0f766e' }));
        defs.appendChild(down);
        svg.appendChild(defs);
    }

    function pointerY(event) {
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        return point.matrixTransform(svg.getScreenCTM().inverse()).y;
    }

    function syncInspector() {
        const selectedLevel = getSelectedLevel();
        const selectedTransition = getSelectedTransition();

        if (selectedLevel) {
            emptySelection.hidden = true;
            levelInspector.hidden = false;
            transitionInspector.hidden = true;
            levelLabelInput.value = selectedLevel.label;
            levelEnergyInput.value = formatNumber(selectedLevel.energy);
            selectionStatus.textContent = `Выбрано: уровень ${selectedLevel.label}`;
            return;
        }

        if (selectedTransition) {
            emptySelection.hidden = true;
            levelInspector.hidden = true;
            transitionInspector.hidden = false;
            transitionLabelInput.value = selectedTransition.label;
            transitionRabiInput.value = selectedTransition.rabi;
            transitionRabiValue.textContent = formatNumber(selectedTransition.rabi);
            transitionLinewidthInput.value = selectedTransition.linewidth;
            transitionPhotonInput.value = formatNumber(selectedTransition.photonEnergy);
            selectionStatus.textContent = `Выбрано: переход ${selectedTransition.label}`;
            return;
        }

        emptySelection.hidden = false;
        levelInspector.hidden = true;
        transitionInspector.hidden = true;
        selectionStatus.textContent = 'Выбрано: ничего';
    }

    function syncPreview() {
        const payload = {
            energy_unit: state.energyUnit,
            levels: state.levels.map((level) => ({
                id: level.id,
                label: level.label,
                y: Number(formatNumber(level.y)),
                energy: Number(formatNumber(level.energy)),
            })),
            transitions: state.transitions.map((transition) => ({
                id: transition.id,
                from_id: transition.fromId,
                to_id: transition.toId,
                label: transition.label,
                rabi_frequency: Number(formatNumber(transition.rabi)),
                linewidth: Number(formatNumber(transition.linewidth)),
                photon_energy: Number(formatNumber(transition.photonEnergy)),
            })),
        };
        jsonPreview.value = JSON.stringify(payload, null, 2);
    }

    function render() {
        syncEnergyUnit();
        svg.replaceChildren();
        renderDefs();
        renderGrid();
        renderTransitions();
        renderLevels();
        syncInspector();
        syncPreview();
    }

    svg.addEventListener('pointermove', (event) => {
        if (state.draggingLevelId === null) {
            return;
        }
        const level = state.levels.find((item) => item.id === state.draggingLevelId);
        if (!level) {
            return;
        }
        level.y = clamp(pointerY(event) + state.dragOffsetY, viewport.top, viewport.bottom);
        syncLevelEnergies();
        render();
    });

    svg.addEventListener('pointerup', () => {
        state.draggingLevelId = null;
    });

    svg.addEventListener('pointerleave', () => {
        state.draggingLevelId = null;
    });

    svg.addEventListener('click', () => {
        clearSelection();
        render();
    });

    document.getElementById('init-levels-btn').addEventListener('click', initLevelsFromForm);
    document.getElementById('add-level-btn').addEventListener('click', () => {
        addLevel();
        editorStatus.textContent = 'Добавлен новый уровень.';
    });
    document.getElementById('add-transition-btn').addEventListener('click', addTransitionBetweenSelected);
    document.getElementById('auto-arrange-btn').addEventListener('click', () => {
        autoArrangeLevels();
        editorStatus.textContent = 'Уровни переразложены по вертикали.';
    });
    document.getElementById('delete-selected-btn').addEventListener('click', deleteSelected);

    levelLabelInput.addEventListener('input', () => {
        const selectedLevel = getSelectedLevel();
        if (!selectedLevel) {
            return;
        }
        selectedLevel.label = levelLabelInput.value || `|${selectedLevel.id - 1}>`;
        render();
    });

    levelEnergyInput.addEventListener('input', () => {
        const selectedLevel = getSelectedLevel();
        if (!selectedLevel) {
            return;
        }
        const energy = parseFloat(levelEnergyInput.value);
        if (Number.isNaN(energy)) {
            return;
        }
        selectedLevel.y = yFromEnergy(energy);
        syncLevelEnergies();
        render();
    });

    transitionLabelInput.addEventListener('input', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        transition.label = transitionLabelInput.value || `L${transition.id}`;
        render();
    });

    transitionRabiInput.addEventListener('input', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        transition.rabi = parseFloat(transitionRabiInput.value);
        transitionRabiValue.textContent = formatNumber(transition.rabi);
        render();
    });

    transitionLinewidthInput.addEventListener('input', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        transition.linewidth = parseFloat(transitionLinewidthInput.value || '0');
        syncPreview();
    });

    transitionPhotonInput.addEventListener('input', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        const value = parseFloat(transitionPhotonInput.value);
        if (!Number.isNaN(value)) {
            transition.photonEnergy = value;
            render();
        }
    });

    systemEnergyUnit?.addEventListener('change', render);
    systemSpacing?.addEventListener('change', () => {
        syncLevelEnergies();
        render();
    });

    initLevelsFromForm();
})();
