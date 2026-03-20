(function () {
    function byId(id) {
        return document.getElementById(id);
    }

    function createSvgElement(tag, attrs) {
        var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.keys(attrs || {}).forEach(function (key) {
            el.setAttribute(key, attrs[key]);
        });
        return el;
    }

    function createEmptyState(container, message) {
        if (!container) {
            return;
        }
        container.innerHTML = '';
        var placeholder = document.createElement('div');
        placeholder.className = 'plot-empty';
        placeholder.textContent = message;
        container.appendChild(placeholder);
    }

    var dataNode = byId('latest-run-data');
    if (!dataNode) {
        return;
    }

    var populationContainer = byId('population-chart');
    var observablesContainer = byId('observables-chart');
    var animationContainer = byId('population-animation');
    var animationToggle = byId('animation-toggle');
    var animationSlider = byId('animation-slider');
    var animationTimeChip = byId('animation-time-chip');
    var editorConfigNode = byId('editor-json-preview');

    if (!populationContainer || !observablesContainer || !animationContainer) {
        return;
    }

    var result;
    try {
        result = JSON.parse(dataNode.textContent);
    } catch (_error) {
        createEmptyState(animationContainer, 'Не удалось разобрать данные расчёта для анимации.');
        return;
    }

    var editorConfig = {};
    try {
        editorConfig = JSON.parse(editorConfigNode ? editorConfigNode.value : '{}');
    } catch (_error) {
        editorConfig = {};
    }

    var colors = ['#0f766e', '#c97c1d', '#8b5cf6', '#dc2626', '#2563eb', '#4d7c0f', '#b45309', '#be185d'];

    function linePath(points) {
        return points
            .map(function (point, index) {
                return (index === 0 ? 'M' : 'L') + ' ' + point.x.toFixed(2) + ' ' + point.y.toFixed(2);
            })
            .join(' ');
    }

    function numericExtent(seriesList) {
        var values = [];
        seriesList.forEach(function (series) {
            values = values.concat(series.values || []);
            if (series.imagValues && series.hasImag) {
                values = values.concat(series.imagValues || []);
            }
        });
        if (!values.length) {
            return { min: 0, max: 1 };
        }
        var min = Math.min.apply(null, values);
        var max = Math.max.apply(null, values);
        if (Math.abs(max - min) < 1e-12) {
            min -= 0.5;
            max += 0.5;
        }
        return { min: min, max: max };
    }

    function renderChart(container, config) {
        var title = config.title;
        var timeAxis = config.timeAxis || [];
        var seriesList = config.seriesList || [];
        var yLabel = config.yLabel;

        if (!seriesList.length) {
            createEmptyState(container, 'Для этого блока пока не выбрано ни одной серии.');
            return;
        }

        container.innerHTML = '';

        var width = 760;
        var height = 260;
        var margin = { top: 20, right: 18, bottom: 38, left: 54 };
        var plotWidth = width - margin.left - margin.right;
        var plotHeight = height - margin.top - margin.bottom;
        var xMin = timeAxis.length ? timeAxis[0] : 0;
        var xMax = timeAxis.length ? timeAxis[timeAxis.length - 1] : 1;
        var extent = numericExtent(seriesList);

        function xScale(value) {
            if (xMax === xMin) {
                return margin.left;
            }
            return margin.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
        }

        function yScale(value) {
            return margin.top + (1 - (value - extent.min) / (extent.max - extent.min)) * plotHeight;
        }

        var caption = document.createElement('p');
        caption.className = 'help-text';
        caption.textContent = title;
        container.appendChild(caption);

        var svg = createSvgElement('svg', {
            viewBox: '0 0 ' + width + ' ' + height,
            class: 'plot-svg',
            role: 'img',
            'aria-label': title,
        });

        for (var index = 0; index <= 4; index += 1) {
            var yValue = extent.min + ((extent.max - extent.min) / 4) * index;
            var y = yScale(yValue);
            svg.appendChild(createSvgElement('line', {
                x1: margin.left,
                x2: width - margin.right,
                y1: y,
                y2: y,
                class: 'plot-grid',
            }));
            var label = createSvgElement('text', {
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

        var xStart = createSvgElement('text', {
            x: margin.left,
            y: height - 10,
            class: 'plot-label',
        });
        xStart.textContent = xMin.toFixed(2) + ' ' + result.time_unit;
        svg.appendChild(xStart);

        var xEnd = createSvgElement('text', {
            x: width - margin.right - 56,
            y: height - 10,
            class: 'plot-label',
        });
        xEnd.textContent = xMax.toFixed(2) + ' ' + result.time_unit;
        svg.appendChild(xEnd);

        var yAxis = createSvgElement('text', {
            x: 18,
            y: 16,
            class: 'plot-label',
        });
        yAxis.textContent = yLabel;
        svg.appendChild(yAxis);

        var legend = createSvgElement('g', { class: 'plot-legend' });
        seriesList.forEach(function (series, seriesIndex) {
            var color = colors[seriesIndex % colors.length];
            var realPoints = (series.values || []).map(function (value, pointIndex) {
                return {
                    x: xScale(timeAxis[pointIndex]),
                    y: yScale(value),
                };
            });
            svg.appendChild(createSvgElement('path', {
                d: linePath(realPoints),
                class: 'plot-line',
                stroke: color,
            }));

            if (series.imagValues && series.hasImag) {
                var imagPoints = (series.imagValues || []).map(function (value, pointIndex) {
                    return {
                        x: xScale(timeAxis[pointIndex]),
                        y: yScale(value),
                    };
                });
                svg.appendChild(createSvgElement('path', {
                    d: linePath(imagPoints),
                    class: 'plot-line imaginary',
                    stroke: color,
                }));
            }

            var legendY = 18 + seriesIndex * 18;
            legend.appendChild(createSvgElement('line', {
                x1: width - 200,
                x2: width - 176,
                y1: legendY,
                y2: legendY,
                stroke: color,
                'stroke-width': 3,
            }));
            var legendText = createSvgElement('text', {
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
        var animationSeries = result.all_population_series || result.population_series || [];
        if (!animationSeries.length) {
            createEmptyState(animationContainer, 'Нет данных populations для анимации.');
            return;
        }

        var levels = (editorConfig.levels && editorConfig.levels.length) ? editorConfig.levels.slice() : [];
        if (!levels.length) {
            levels = animationSeries.map(function (series, index) {
                return {
                    id: series.level_id,
                    label: series.label,
                    energy: index,
                };
            });
        }
        levels.sort(function (a, b) {
            return (a.energy || 0) - (b.energy || 0);
        });

        var seriesById = {};
        animationSeries.forEach(function (series) {
            seriesById[String(series.level_id)] = series;
        });

        var transitions = editorConfig.transitions || [];
        var frameIndex = 0;
        var maxFrame = Math.max(((result.time_axis || []).length - 1), 0);
        var playing = true;
        var timerId = null;

        animationContainer.innerHTML = '';

        if (animationSlider) {
            animationSlider.max = String(maxFrame);
            animationSlider.value = '0';
        }
        if (animationTimeChip) {
            animationTimeChip.textContent = 't = 0.00 ' + result.time_unit;
        }

        if (transitions.length) {
            var transitionMarkers = document.createElement('div');
            transitionMarkers.className = 'animation-transition-markers';
            transitions.forEach(function (transition) {
                var chip = document.createElement('div');
                chip.className = 'animation-transition-chip';
                chip.textContent = transition.label || String(transition.id);
                transitionMarkers.appendChild(chip);
            });
            animationContainer.appendChild(transitionMarkers);
        }

        var timeLabel = document.createElement('p');
        timeLabel.className = 'animation-time-label';
        animationContainer.appendChild(timeLabel);

        var stage = document.createElement('div');
        stage.className = 'population-animation-stage';
        animationContainer.appendChild(stage);

        var levelElements = levels.map(function (level, index) {
            var row = document.createElement('div');
            row.className = 'animation-row';

            var label = document.createElement('div');
            label.className = 'animation-level-label';
            label.textContent = level.label || ('|' + index + '>');

            var track = document.createElement('div');
            track.className = 'animation-level-track';

            var line = document.createElement('div');
            line.className = 'animation-level-line';
            track.appendChild(line);

            var population = document.createElement('div');
            population.className = 'animation-population-label';

            row.appendChild(label);
            row.appendChild(track);
            row.appendChild(population);
            stage.appendChild(row);

            return {
                id: String(level.id),
                line: line,
                population: population,
            };
        });

        function updateFrame(nextFrameIndex) {
            frameIndex = nextFrameIndex;

            if (animationSlider) {
                animationSlider.value = String(frameIndex);
            }

            var timeValue = (result.time_axis && result.time_axis[frameIndex]) || 0;
            if (animationTimeChip) {
                animationTimeChip.textContent = 't = ' + timeValue.toFixed(2) + ' ' + result.time_unit;
            }
            timeLabel.textContent = 'Текущее время: ' + timeValue.toFixed(2) + ' ' + result.time_unit;

            levelElements.forEach(function (item) {
                var series = seriesById[item.id];
                var populationValue = (series && series.values && series.values[frameIndex]) || 0;
                var thickness = 4 + populationValue * 18;
                var opacity = 0.22 + populationValue * 0.78;
                item.line.style.height = thickness.toFixed(2) + 'px';
                item.line.style.backgroundColor = 'rgba(15, 118, 110, ' + opacity.toFixed(3) + ')';
                item.line.style.boxShadow = populationValue > 0.02
                    ? '0 0 18px rgba(15, 118, 110, ' + (opacity * 0.45).toFixed(3) + ')'
                    : 'none';
                item.population.textContent = 'p = ' + populationValue.toFixed(3);
            });
        }

        function stopTimer() {
            if (timerId !== null) {
                window.clearInterval(timerId);
                timerId = null;
            }
        }

        function startTimer() {
            stopTimer();
            if (maxFrame <= 0) {
                return;
            }
            timerId = window.setInterval(function () {
                if (!playing) {
                    return;
                }
                updateFrame((frameIndex + 1) % (maxFrame + 1));
            }, 140);
        }

        if (animationToggle) {
            animationToggle.textContent = 'Пауза';
            animationToggle.onclick = function () {
                playing = !playing;
                animationToggle.textContent = playing ? 'Пауза' : 'Пуск';
            };
        }

        if (animationSlider) {
            animationSlider.oninput = function () {
                playing = false;
                if (animationToggle) {
                    animationToggle.textContent = 'Пуск';
                }
                updateFrame(Number(animationSlider.value));
            };
        }

        updateFrame(0);
        startTimer();
    }

    try {
        renderChart(populationContainer, {
            title: 'Населённости выбранных уровней',
            timeAxis: result.time_axis || [],
            seriesList: (result.population_series || []).map(function (series) {
                return {
                    label: series.label,
                    values: series.values || [],
                };
            }),
            yLabel: 'Population',
        });
    } catch (_error) {
        createEmptyState(populationContainer, 'Не удалось построить график населённостей.');
    }

    try {
        renderChart(observablesContainer, {
            title: 'Ожидаемые значения наблюдаемых',
            timeAxis: result.time_axis || [],
            seriesList: (result.observable_series || []).map(function (series) {
                return {
                    label: series.label,
                    values: series.real_values || [],
                    imagValues: series.imag_values || [],
                    hasImag: Boolean(series.has_imag),
                };
            }),
            yLabel: 'Expectation',
        });
    } catch (_error) {
        createEmptyState(observablesContainer, 'Не удалось построить график наблюдаемых.');
    }

    try {
        renderPopulationAnimation();
    } catch (error) {
        createEmptyState(animationContainer, 'Ошибка анимации: ' + error.message);
    }
})();
