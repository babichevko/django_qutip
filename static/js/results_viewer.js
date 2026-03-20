(function () {
    const dataNode = document.getElementById('latest-run-data');
    if (!dataNode) {
        return;
    }

    const editorConfigNode = document.getElementById('editor-json-preview');
    const populationContainer = document.getElementById('population-chart');
    const observablesContainer = document.getElementById('observables-chart');
    const animationContainer = document.getElementById('population-animation');
    const animationToggle = document.getElementById('animation-toggle');
    const animationSlider = document.getElementById('animation-slider');
    const animationTimeChip = document.getElementById('animation-time-chip');
    if (!populationContainer || !observablesContainer || !animationContainer) {
        return;
    }

    let result;
    try {
        result = JSON.parse(dataNode.textContent);
    } catch (_error) {
        return;
    }

    let editorConfig = {};
    try {
        editorConfig = JSON.parse(editorConfigNode?.value || '{}');
    } catch (_error) {
        editorConfig = {};
    }

    const colors = ['#0f766e', '#c97c1d', '#8b5cf6', '#dc2626', '#2563eb', '#4d7c0f', '#b45309', '#be185d'];

    function createSvgElement(tag, attrs = {}) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
        return el;
    }

    function createEmptyState(container, message) {
        container.replaceChildren();
        const placeholder = document.createElement('div');
        placeholder.className = 'plot-empty';
        placeholder.textContent = message;
        container.appendChild(placeholder);
    }

    function linePath(points) {
        return points
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
            .join(' ');
    }

    function numericExtent(seriesList) {
        const values = [];
        seriesList.forEach((series) => {
            values.push(...series.values);
            if (series.imagValues && series.hasImag) {
                values.push(...series.imagValues);
            }
        });
        if (!values.length) {
            return { min: 0, max: 1 };
        }
        let min = Math.min(...values);
        let max = Math.max(...values);
        if (Math.abs(max - min) < 1e-12) {
            min -= 0.5;
            max += 0.5;
        }
        return { min, max };
    }

    function renderChart(container, config) {
        const { title, timeAxis, seriesList, yLabel } = config;
        if (!seriesList.length) {
            createEmptyState(container, 'Для этого блока пока не выбрано ни одной серии.');
            return;
        }

        container.replaceChildren();

        const width = 760;
        const height = 260;
        const margin = { top: 20, right: 18, bottom: 38, left: 54 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        const xMin = timeAxis[0] || 0;
        const xMax = timeAxis[timeAxis.length - 1] || 1;
        const extent = numericExtent(seriesList);

        const xScale = (value) => {
            if (xMax === xMin) {
                return margin.left;
            }
            return margin.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
        };
        const yScale = (value) => margin.top + (1 - (value - extent.min) / (extent.max - extent.min)) * plotHeight;

        const caption = document.createElement('p');
        caption.className = 'help-text';
        caption.textContent = title;
        container.appendChild(caption);

        const svg = createSvgElement('svg', {
            viewBox: `0 0 ${width} ${height}`,
            class: 'plot-svg',
            role: 'img',
            'aria-label': title,
        });

        for (let index = 0; index <= 4; index += 1) {
            const yValue = extent.min + ((extent.max - extent.min) / 4) * index;
            const y = yScale(yValue);
            svg.appendChild(createSvgElement('line', {
                x1: margin.left,
                x2: width - margin.right,
                y1: y,
                y2: y,
                class: 'plot-grid',
            }));
            const label = createSvgElement('text', {
                x: 8,
                y: y + 4,
                class: 'plot-label',
            });
            label.textContent = yValue.toFixed(3);
            svg.appendChild(label);
        }

        svg.appendChild(createSvgElement('line', {
            x1: margin.left,
            x2: width - margin.right,
            y1: height - margin.bottom,
            y2: height - margin.bottom,
            class: 'plot-axis',
        }));
        svg.appendChild(createSvgElement('line', {
            x1: margin.left,
            x2: margin.left,
            y1: margin.top,
            y2: height - margin.bottom,
            class: 'plot-axis',
        }));

        const xStart = createSvgElement('text', {
            x: margin.left,
            y: height - 10,
            class: 'plot-label',
        });
        xStart.textContent = `${xMin.toFixed(2)} ${result.time_unit}`;
        svg.appendChild(xStart);

        const xEnd = createSvgElement('text', {
            x: width - margin.right - 56,
            y: height - 10,
            class: 'plot-label',
        });
        xEnd.textContent = `${xMax.toFixed(2)} ${result.time_unit}`;
        svg.appendChild(xEnd);

        const yAxis = createSvgElement('text', {
            x: 18,
            y: 16,
            class: 'plot-label',
        });
        yAxis.textContent = yLabel;
        svg.appendChild(yAxis);

        const legend = createSvgElement('g', { class: 'plot-legend' });
        seriesList.forEach((series, index) => {
            const color = colors[index % colors.length];
            const realPoints = series.values.map((value, pointIndex) => ({
                x: xScale(timeAxis[pointIndex]),
                y: yScale(value),
            }));
            svg.appendChild(createSvgElement('path', {
                d: linePath(realPoints),
                class: 'plot-line',
                stroke: color,
            }));

            if (series.imagValues && series.hasImag) {
                const imagPoints = series.imagValues.map((value, pointIndex) => ({
                    x: xScale(timeAxis[pointIndex]),
                    y: yScale(value),
                }));
                svg.appendChild(createSvgElement('path', {
                    d: linePath(imagPoints),
                    class: 'plot-line imaginary',
                    stroke: color,
                }));
            }

            const legendY = 18 + index * 18;
            legend.appendChild(createSvgElement('line', {
                x1: width - 200,
                x2: width - 176,
                y1: legendY,
                y2: legendY,
                stroke: color,
                'stroke-width': 3,
            }));
            const legendText = createSvgElement('text', {
                x: width - 168,
                y: legendY + 4,
            });
            legendText.textContent = series.label;
            legend.appendChild(legendText);
        });
        svg.appendChild(legend);
        container.appendChild(svg);
    }

    function renderPopulationAnimation() {
        const levelMap = new Map((editorConfig.levels || []).map((level) => [level.id, level]));
        const animationSeries = result.all_population_series || result.population_series || [];
        if (!animationSeries.length) {
            createEmptyState(animationContainer, 'Нет данных populations для анимации.');
            return;
        }

        const fallbackLevels = animationSeries.map((series, index) => ({
            id: series.level_id,
            label: series.label,
            y: 360 - index * 80,
            energy: index,
        }));
        const levels = (editorConfig.levels || []).length ? editorConfig.levels : fallbackLevels;
        const transitions = editorConfig.transitions || [];
        const orderedLevels = [...levels].sort((first, second) => first.energy - second.energy);
        const seriesById = new Map(animationSeries.map((series) => [series.level_id, series]));

        let frameIndex = 0;
        let playing = true;
        let lastTick = 0;
        const maxFrame = Math.max((result.time_axis || []).length - 1, 0);

        animationContainer.replaceChildren();
        animationSlider.max = String(maxFrame);
        animationSlider.value = '0';

        const width = 760;
        const height = 300;
        const svg = createSvgElement('svg', {
            viewBox: `0 0 ${width} ${height}`,
            class: 'population-animation-svg',
            role: 'img',
            'aria-label': 'Анимация населённостей по уровням',
        });
        animationContainer.appendChild(svg);

        const levelElements = orderedLevels.map((level, index) => {
            const y = 250 - index * 58;
            const line = createSvgElement('line', {
                x1: 170,
                x2: 420,
                y1: y,
                y2: y,
                class: 'animation-level',
            });
            const label = createSvgElement('text', {
                x: 440,
                y: y + 5,
                class: 'animation-level-label',
            });
            const population = createSvgElement('text', {
                x: 36,
                y: y + 5,
                class: 'animation-population-label',
            });
            label.textContent = level.label || `|${index}>`;
            svg.appendChild(line);
            svg.appendChild(label);
            svg.appendChild(population);
            return { level, line, population, y };
        });

        transitions.forEach((transition, index) => {
            const fromLevel = levelElements.find((item) => item.level.id === transition.from_id);
            const toLevel = levelElements.find((item) => item.level.id === transition.to_id);
            if (!fromLevel || !toLevel) {
                return;
            }
            const x = 500 + (index % 3) * 46;
            const beam = createSvgElement('line', {
                x1: x,
                x2: x,
                y1: fromLevel.y,
                y2: toLevel.y,
                class: 'animation-beam',
            });
            svg.appendChild(beam);
        });

        const timeLabel = createSvgElement('text', {
            x: 18,
            y: 26,
            class: 'animation-time-label',
        });
        svg.appendChild(timeLabel);

        function updateFrame(nextFrameIndex) {
            frameIndex = nextFrameIndex;
            animationSlider.value = String(frameIndex);
            const timeValue = result.time_axis?.[frameIndex] ?? 0;
            animationTimeChip.textContent = `t = ${timeValue.toFixed(2)} ${result.time_unit}`;
            timeLabel.textContent = `Текущее время: ${timeValue.toFixed(2)} ${result.time_unit}`;

            levelElements.forEach((item) => {
                const series = seriesById.get(item.level.id);
                const population = series?.values?.[frameIndex] ?? 0;
                const strokeWidth = 4 + population * 18;
                const opacity = 0.3 + population * 0.7;
                item.line.setAttribute('stroke-width', strokeWidth.toFixed(2));
                item.line.setAttribute('stroke', `rgba(15, 118, 110, ${opacity.toFixed(3)})`);
                item.population.textContent = `p = ${population.toFixed(3)}`;
            });
        }

        function step(timestamp) {
            if (playing && timestamp - lastTick > 120 && maxFrame > 0) {
                lastTick = timestamp;
                updateFrame((frameIndex + 1) % (maxFrame + 1));
            }
            window.requestAnimationFrame(step);
        }

        animationToggle.addEventListener('click', () => {
            playing = !playing;
            animationToggle.textContent = playing ? 'Пауза' : 'Пуск';
        });
        animationSlider.addEventListener('input', () => {
            playing = false;
            animationToggle.textContent = 'Пуск';
            updateFrame(Number(animationSlider.value));
        });

        updateFrame(0);
        window.requestAnimationFrame(step);
    }

    const populationSeries = (result.population_series || []).map((series) => ({
        label: series.label,
        values: series.values || [],
    }));
    renderChart(populationContainer, {
        title: 'Населённости выбранных уровней',
        timeAxis: result.time_axis || [],
        seriesList: populationSeries,
        yLabel: 'Population',
    });

    const observablesSeries = (result.observable_series || []).map((series) => ({
        label: series.label,
        values: series.real_values || [],
        imagValues: series.imag_values || [],
        hasImag: Boolean(series.has_imag),
    }));
    renderChart(observablesContainer, {
        title: 'Ожидаемые значения наблюдаемых',
        timeAxis: result.time_axis || [],
        seriesList: observablesSeries,
        yLabel: 'Expectation',
    });

    renderPopulationAnimation();
})();
