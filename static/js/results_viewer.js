(function () {
    const dataNode = document.getElementById('latest-run-data');
    if (!dataNode) {
        return;
    }

    const populationContainer = document.getElementById('population-chart');
    const observablesContainer = document.getElementById('observables-chart');
    if (!populationContainer || !observablesContainer) {
        return;
    }

    let result;
    try {
        result = JSON.parse(dataNode.textContent);
    } catch (_error) {
        return;
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
})();
