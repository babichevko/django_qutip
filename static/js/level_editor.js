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
        draggingTransitionId: null,
        dragOffsetY: 0,
        nextLevelId: 1,
        nextTransitionId: 1,
        energyUnit: 'MHz',
    };

    const viewport = {
        width: 760,
        height: 520,
        lineX1: 140,
        lineX2: 470,
        transitionBaseX: 550,
        top: 80,
        bottom: 460,
    };

    const editorStatus = document.getElementById('editor-status');
    const selectionStatus = document.getElementById('selection-status');
    const jsonPreview = document.getElementById('editor-json-preview');
    const levelInspectorCard = document.getElementById('level-inspector-card');
    const transitionInspectorCard = document.getElementById('transition-inspector-card');
    const systemLevelCount = document.getElementById('id_system-level_count');
    const systemSpacing = document.getElementById('id_system-level_spacing');
    const systemEnergyUnit = document.getElementById('id_system-energy_unit');

    const levelLabelInput = document.getElementById('selected-level-label');
    const levelEnergyInput = document.getElementById('selected-level-energy');
    const transitionLabelInput = document.getElementById('selected-transition-label');
    const transitionRabiInput = document.getElementById('selected-transition-rabi');
    const transitionRabiUnitInput = document.getElementById('selected-transition-rabi-unit');
    const transitionRabiValue = document.getElementById('selected-transition-rabi-value');
    const transitionLinewidthInput = document.getElementById('selected-transition-linewidth');
    const transitionLinewidthUnitInput = document.getElementById('selected-transition-linewidth-unit');
    const transitionDetuningInput = document.getElementById('selected-transition-detuning');
    const transitionDetuningUnitInput = document.getElementById('selected-transition-detuning-unit');
    const transitionPhotonInput = document.getElementById('selected-transition-photon');

    const UNIT_FACTORS = {
        Hz: 1,
        kHz: 1e3,
        MHz: 1e6,
        GHz: 1e9,
    };

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

    function toHz(value, unit) {
        return value * (UNIT_FACTORS[unit] || 1);
    }

    function fromHz(value, unit) {
        return value / (UNIT_FACTORS[unit] || 1);
    }

    function energyScale() {
        return parseFloat(systemSpacing?.value || '1') || 1;
    }

    function energyFromY(y) {
        return ((viewport.bottom - y) / 70) * energyScale();
    }

    function yFromEnergy(energy) {
        const scaled = viewport.bottom - (energy / energyScale()) * 70;
        return clamp(scaled, viewport.top, viewport.bottom);
    }

    function pointerY(event) {
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        return point.matrixTransform(svg.getScreenCTM().inverse()).y;
    }

    function syncEnergyUnit() {
        state.energyUnit = systemEnergyUnit?.value || 'MHz';
    }

    function getTransitionDetuningHz(transition) {
        return toHz(transition.detuningValue, transition.detuningUnit);
    }

    function setTransitionDetuningFromHz(transition, valueHz) {
        transition.detuningValue = fromHz(valueHz, transition.detuningUnit);
    }

    function getTransitionRabiHz(transition) {
        return toHz(transition.rabiValue, transition.rabiUnit);
    }

    function detuningOffsetToPixels(detuningHz) {
        if (detuningHz === 0) {
            return 0;
        }
        const sign = Math.sign(detuningHz);
        const offset = 18 * Math.log10(1 + Math.abs(detuningHz) / 1e3);
        return sign * Math.min(120, offset);
    }

    function pixelsToDetuningHz(offsetPixels) {
        if (offsetPixels === 0) {
            return 0;
        }
        const sign = Math.sign(offsetPixels);
        const magnitude = 1e3 * (Math.pow(10, Math.abs(offsetPixels) / 18) - 1);
        return sign * magnitude;
    }

    function transitionStrokeWidth(transition) {
        const width = 2.4 + 0.7 * Math.log10(1 + getTransitionRabiHz(transition) / 1e3);
        return clamp(width, 2.4, 7.5);
    }

    function lowerAndUpperLevel(firstId, secondId) {
        const first = state.levels.find((level) => level.id === firstId);
        const second = state.levels.find((level) => level.id === secondId);
        if (!first || !second) {
            return {};
        }
        return first.energy <= second.energy
            ? { lower: first, upper: second }
            : { lower: second, upper: first };
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

    function clearSelection() {
        state.selectedLevelIds = [];
        state.selectedTransitionId = null;
    }

    function selectLevel(levelId, withMultiSelect) {
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

    function addLevel({ y, label, energy } = {}) {
        const id = state.nextLevelId++;
        const resolvedY = y ?? clamp(viewport.bottom - state.levels.length * 80, viewport.top, viewport.bottom);
        state.levels.push({
            id,
            label: label || `|${state.levels.length}>`,
            y: resolvedY,
            energy: energy ?? energyFromY(resolvedY),
        });
        syncLevelEnergies();
        render();
    }

    function layoutLevelsEvenly() {
        if (!state.levels.length) {
            return;
        }
        const step = state.levels.length === 1 ? 0 : (viewport.bottom - viewport.top) / (state.levels.length - 1);
        state.levels.forEach((level, index) => {
            level.y = viewport.bottom - index * step;
        });
        syncLevelEnergies();
    }

    function initLevelsFromForm() {
        const count = clamp(parseInt(systemLevelCount?.value || '3', 10) || 3, 2, 8);
        state.levels = [];
        state.transitions = [];
        state.nextLevelId = 1;
        state.nextTransitionId = 1;
        clearSelection();
        for (let index = 0; index < count; index += 1) {
            addLevel({ label: `|${index}>` });
        }
        layoutLevelsEvenly();
        editorStatus.textContent = `Создано ${count} уровней из параметров формы.`;
        render();
    }

    function syncLevelEnergies() {
        state.levels.forEach((level) => {
            level.y = clamp(level.y, viewport.top, viewport.bottom);
            level.energy = energyFromY(level.y);
        });
        state.transitions.forEach((transition) => {
            const levels = lowerAndUpperLevel(transition.fromId, transition.toId);
            if (!levels.lower || !levels.upper) {
                return;
            }
            transition.gapEnergy = levels.upper.energy - levels.lower.energy;
            transition.photonEnergy = transition.gapEnergy + fromHz(getTransitionDetuningHz(transition), state.energyUnit);
        });
    }

    function addTransitionBetweenSelected() {
        if (state.selectedLevelIds.length !== 2) {
            editorStatus.textContent = 'Для создания перехода выберите ровно два уровня.';
            return;
        }
        const { lower, upper } = lowerAndUpperLevel(state.selectedLevelIds[0], state.selectedLevelIds[1]);
        if (!lower || !upper || lower.id === upper.id) {
            editorStatus.textContent = 'Не удалось определить нижний и верхний уровни.';
            return;
        }
        const id = state.nextTransitionId++;
        const gapEnergy = upper.energy - lower.energy;
        state.transitions.push({
            id,
            fromId: lower.id,
            toId: upper.id,
            label: `${id}`,
            rabiValue: 0.4,
            rabiUnit: 'MHz',
            linewidthValue: 0,
            linewidthUnit: 'MHz',
            detuningValue: 0,
            detuningUnit: 'MHz',
            gapEnergy,
            photonEnergy: gapEnergy,
        });
        selectTransition(id);
        editorStatus.textContent = `Добавлен переход ${id} между ${lower.label} и ${upper.label}.`;
        render();
    }

    function deleteSelected() {
        const selectedTransition = getSelectedTransition();
        if (selectedTransition) {
            state.transitions = state.transitions.filter((transition) => transition.id !== selectedTransition.id);
            clearSelection();
            editorStatus.textContent = 'Переход удалён.';
            render();
            return;
        }
        const selectedLevel = getSelectedLevel();
        if (selectedLevel) {
            state.levels = state.levels.filter((level) => level.id !== selectedLevel.id);
            state.transitions = state.transitions.filter(
                (transition) => transition.fromId !== selectedLevel.id && transition.toId !== selectedLevel.id,
            );
            clearSelection();
            editorStatus.textContent = 'Уровень и связанные с ним переходы удалены.';
            render();
        }
    }

    function transitionGeometry(transition) {
        const { lower, upper } = lowerAndUpperLevel(transition.fromId, transition.toId);
        if (!lower || !upper) {
            return null;
        }
        const x = viewport.transitionBaseX + (transition.id % 3) * 52;
        const detuningPixels = detuningOffsetToPixels(getTransitionDetuningHz(transition));
        const tipY = clamp(upper.y - detuningPixels, viewport.top, lower.y - 18);
        return {
            x,
            lower,
            upper,
            baseY: lower.y,
            topLevelY: upper.y,
            tipY,
        };
    }

    function renderGrid() {
        for (let index = 0; index < 6; index += 1) {
            const y = viewport.top + ((viewport.bottom - viewport.top) / 5) * index;
            svg.appendChild(createSvgElement('line', {
                x1: 70,
                x2: 700,
                y1: y,
                y2: y,
                class: 'editor-grid-line',
            }));
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
            const commonEvents = (element) => {
                element.addEventListener('pointerdown', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    selectLevel(level.id, event.shiftKey);
                    state.draggingLevelId = level.id;
                    state.dragOffsetY = level.y - pointerY(event);
                    render();
                });
                element.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                });
            };

            const hitArea = createSvgElement('line', {
                x1: viewport.lineX1,
                x2: viewport.lineX2,
                y1: level.y,
                y2: level.y,
                class: 'level-hit-area',
            });
            commonEvents(hitArea);
            svg.appendChild(hitArea);

            const levelLine = createSvgElement('line', {
                x1: viewport.lineX1,
                x2: viewport.lineX2,
                y1: level.y,
                y2: level.y,
                class: selected ? 'energy-level selected' : 'energy-level',
            });
            commonEvents(levelLine);
            svg.appendChild(levelLine);

            const handle = createSvgElement('circle', {
                cx: viewport.lineX2 + 18,
                cy: level.y,
                r: 8,
                class: selected ? 'level-handle selected' : 'level-handle',
            });
            commonEvents(handle);
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
            const geometry = transitionGeometry(transition);
            if (!geometry) {
                return;
            }
            const selected = state.selectedTransitionId === transition.id;
            const strokeWidth = transitionStrokeWidth(transition);

            const shaft = createSvgElement('line', {
                x1: geometry.x,
                x2: geometry.x,
                y1: geometry.baseY,
                y2: geometry.tipY,
                class: selected ? 'transition-arrow selected' : 'transition-arrow',
                'stroke-width': strokeWidth,
            });
            shaft.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                selectTransition(transition.id);
                render();
            });
            svg.appendChild(shaft);

            const wingLeft = createSvgElement('line', {
                x1: geometry.x,
                y1: geometry.tipY,
                x2: geometry.x - 10,
                y2: geometry.tipY + 16,
                class: selected ? 'transition-tip selected' : 'transition-tip',
                'stroke-width': strokeWidth,
            });
            const wingRight = createSvgElement('line', {
                x1: geometry.x,
                y1: geometry.tipY,
                x2: geometry.x + 10,
                y2: geometry.tipY + 16,
                class: selected ? 'transition-tip selected' : 'transition-tip',
                'stroke-width': strokeWidth,
            });
            svg.appendChild(wingLeft);
            svg.appendChild(wingRight);

            const tipHandle = createSvgElement('circle', {
                cx: geometry.x,
                cy: geometry.tipY,
                r: 9,
                class: selected ? 'transition-tip-handle selected' : 'transition-tip-handle',
            });
            tipHandle.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                selectTransition(transition.id);
                state.draggingTransitionId = transition.id;
                render();
            });
            svg.appendChild(tipHandle);

            const text = createSvgElement('text', {
                x: geometry.x + 18,
                y: (geometry.baseY + geometry.tipY) / 2,
                class: 'transition-label',
            });
            text.textContent = `${transition.label}: ${formatNumber(transition.photonEnergy)} ${state.energyUnit}, Δ=${formatNumber(transition.detuningValue)} ${transition.detuningUnit}`;
            svg.appendChild(text);
        });
    }

    function syncInspector() {
        const selectedLevel = getSelectedLevel();
        const selectedTransition = getSelectedTransition();

        levelInspectorCard.hidden = !selectedLevel;
        transitionInspectorCard.hidden = !selectedTransition;

        if (selectedLevel) {
            levelLabelInput.value = selectedLevel.label;
            levelEnergyInput.value = formatNumber(selectedLevel.energy);
            selectionStatus.textContent = `Выбрано: уровень ${selectedLevel.label}`;
            return;
        }

        if (selectedTransition) {
            transitionLabelInput.value = selectedTransition.label;
            transitionRabiInput.value = selectedTransition.rabiValue;
            transitionRabiUnitInput.value = selectedTransition.rabiUnit;
            transitionRabiValue.textContent = `${formatNumber(selectedTransition.rabiValue)} ${selectedTransition.rabiUnit}`;
            transitionLinewidthInput.value = formatNumber(selectedTransition.linewidthValue);
            transitionLinewidthUnitInput.value = selectedTransition.linewidthUnit;
            transitionDetuningInput.value = formatNumber(selectedTransition.detuningValue);
            transitionDetuningUnitInput.value = selectedTransition.detuningUnit;
            transitionPhotonInput.value = formatNumber(selectedTransition.photonEnergy);
            selectionStatus.textContent = `Выбрано: переход ${selectedTransition.label}`;
            return;
        }

        selectionStatus.textContent = 'Выбрано: ничего';
    }

    function syncPreview() {
        jsonPreview.value = JSON.stringify({
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
                rabi_frequency: Number(formatNumber(transition.rabiValue)),
                rabi_unit: transition.rabiUnit,
                rabi_frequency_hz: Number(formatNumber(getTransitionRabiHz(transition))),
                linewidth: Number(formatNumber(transition.linewidthValue)),
                linewidth_unit: transition.linewidthUnit,
                linewidth_hz: Number(formatNumber(toHz(transition.linewidthValue, transition.linewidthUnit))),
                detuning: Number(formatNumber(transition.detuningValue)),
                detuning_unit: transition.detuningUnit,
                detuning_hz: Number(formatNumber(getTransitionDetuningHz(transition))),
                photon_energy: Number(formatNumber(transition.photonEnergy)),
                upper_level_reference: transition.toId,
            })),
        }, null, 2);
    }

    function render() {
        syncEnergyUnit();
        syncLevelEnergies();
        svg.replaceChildren();
        renderGrid();
        renderTransitions();
        renderLevels();
        syncInspector();
        syncPreview();
    }

    svg.addEventListener('pointermove', (event) => {
        if (state.draggingLevelId !== null) {
            const level = state.levels.find((item) => item.id === state.draggingLevelId);
            if (!level) {
                return;
            }
            level.y = clamp(pointerY(event) + state.dragOffsetY, viewport.top, viewport.bottom);
            render();
            return;
        }

        if (state.draggingTransitionId !== null) {
            const transition = state.transitions.find((item) => item.id === state.draggingTransitionId);
            const geometry = transition ? transitionGeometry(transition) : null;
            if (!transition || !geometry) {
                return;
            }
            const tipY = clamp(pointerY(event), viewport.top, geometry.baseY - 18);
            setTransitionDetuningFromHz(transition, pixelsToDetuningHz(geometry.upper.y - tipY));
            render();
        }
    });

    function stopDragging() {
        state.draggingLevelId = null;
        state.draggingTransitionId = null;
    }

    svg.addEventListener('pointerup', stopDragging);
    svg.addEventListener('pointerleave', stopDragging);

    svg.addEventListener('click', (event) => {
        if (event.target !== svg) {
            return;
        }
        clearSelection();
        render();
    });

    document.getElementById('init-levels-btn').addEventListener('click', initLevelsFromForm);
    document.getElementById('add-level-btn').addEventListener('click', () => {
        addLevel();
        editorStatus.textContent = 'Добавлен новый уровень.';
    });
    document.getElementById('add-transition-btn').addEventListener('click', addTransitionBetweenSelected);
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
        render();
    });

    transitionLabelInput.addEventListener('input', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        transition.label = transitionLabelInput.value || `${transition.id}`;
        render();
    });

    transitionRabiInput.addEventListener('input', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        transition.rabiValue = parseFloat(transitionRabiInput.value);
        transitionRabiValue.textContent = `${formatNumber(transition.rabiValue)} ${transition.rabiUnit}`;
        render();
    });

    transitionRabiUnitInput.addEventListener('change', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        transition.rabiUnit = transitionRabiUnitInput.value;
        transitionRabiValue.textContent = `${formatNumber(transition.rabiValue)} ${transition.rabiUnit}`;
        render();
    });

    transitionLinewidthInput.addEventListener('input', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        transition.linewidthValue = parseFloat(transitionLinewidthInput.value || '0');
        syncPreview();
    });

    transitionLinewidthUnitInput.addEventListener('change', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        transition.linewidthUnit = transitionLinewidthUnitInput.value;
        syncPreview();
    });

    transitionDetuningInput.addEventListener('input', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        const value = parseFloat(transitionDetuningInput.value);
        if (Number.isNaN(value)) {
            return;
        }
        transition.detuningValue = value;
        render();
    });

    transitionDetuningUnitInput.addEventListener('change', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        const detuningHz = getTransitionDetuningHz(transition);
        transition.detuningUnit = transitionDetuningUnitInput.value;
        setTransitionDetuningFromHz(transition, detuningHz);
        render();
    });

    transitionPhotonInput.addEventListener('input', () => {
        const transition = getSelectedTransition();
        if (!transition) {
            return;
        }
        const value = parseFloat(transitionPhotonInput.value);
        if (Number.isNaN(value)) {
            return;
        }
        const photonHz = toHz(value, state.energyUnit);
        const gapHz = toHz(transition.gapEnergy, state.energyUnit);
        setTransitionDetuningFromHz(transition, photonHz - gapHz);
        render();
    });

    systemEnergyUnit?.addEventListener('change', render);
    systemSpacing?.addEventListener('change', render);

    initLevelsFromForm();
})();
