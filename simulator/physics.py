import math

import numpy as np
import qutip

from .qutip_eval import evaluate_qutip_expression


UNIT_FACTORS = {
    'Hz': 1.0,
    'kHz': 1e3,
    'MHz': 1e6,
    'GHz': 1e9,
}

TIME_FACTORS = {
    's': 1.0,
    'ms': 1e-3,
    'us': 1e-6,
    'ns': 1e-9,
}


class SimulationBuildError(ValueError):
    pass


def run_simulation(
    config,
    initial_state_code,
    initial_state_mode,
    evolution_time,
    time_unit,
    time_steps,
    selected_level_ids=None,
    observables=None,
    custom_collapse_operators=None,
):
    levels = sorted(config.get('levels', []), key=lambda item: item['energy'])
    transitions = config.get('transitions', [])

    if len(levels) < 2:
        raise SimulationBuildError('Для симуляции нужны как минимум два уровня.')

    dimension = len(levels)
    level_index_by_id = {level['id']: index for index, level in enumerate(levels)}
    energies_hz = [_to_hz(level['energy'], config.get('energy_unit', 'MHz')) for level in levels]

    hamiltonian = qutip.Qobj(np.zeros((dimension, dimension), dtype=complex))
    collapse_operators = []
    frame_offsets_hz, frame_warnings = _build_rotating_frame_offsets(
        levels=levels,
        transitions=transitions,
        level_index_by_id=level_index_by_id,
        energies_hz=energies_hz,
        energy_unit=config.get('energy_unit', 'MHz'),
    )

    for level, energy_hz in zip(levels, energies_hz):
        level_index = level_index_by_id[level['id']]
        residual_hz = energy_hz - frame_offsets_hz[level_index]
        hamiltonian += (2 * math.pi * residual_hz) * basis_projector(dimension, level_index)

    for transition in transitions:
        from_id = transition.get('from_id')
        to_id = transition.get('to_id')
        if from_id not in level_index_by_id or to_id not in level_index_by_id:
            continue

        lower_index = level_index_by_id[from_id]
        upper_index = level_index_by_id[to_id]

        if energies_hz[lower_index] > energies_hz[upper_index]:
            lower_index, upper_index = upper_index, lower_index

        rabi_hz = _transition_rabi_hz(transition)
        linewidth_hz = _transition_linewidth_hz(transition)

        exchange = qutip.basis(dimension, lower_index) * qutip.basis(dimension, upper_index).dag()

        # Multi-drive RWA in an explicit rotating frame. Diagonal residuals are added above.
        hamiltonian += (math.pi * rabi_hz) * (exchange + exchange.dag())

        if linewidth_hz > 0:
            gamma = 2 * math.pi * linewidth_hz
            collapse_operators.append(math.sqrt(gamma) * exchange)

    custom_collapse_defs = custom_collapse_operators or []
    for definition in custom_collapse_defs:
        collapse_operators.append(_build_observable_operator(definition, dimension))

    rho0 = build_initial_state(initial_state_code, initial_state_mode, dimension)
    tlist = np.linspace(0.0, evolution_time * TIME_FACTORS[time_unit], time_steps)
    all_population_selection = _resolve_population_selection(levels, level_index_by_id, None)
    population_selection = _resolve_population_selection(levels, level_index_by_id, selected_level_ids)
    observable_defs = observables or []

    e_ops = [item['operator'] for item in all_population_selection]
    e_ops.extend(_build_observable_operator(item, dimension) for item in observable_defs)

    result = qutip.mesolve(
        hamiltonian,
        rho0,
        tlist,
        c_ops=collapse_operators,
        e_ops=e_ops,
    )

    population_expect_count = len(all_population_selection)
    all_population_expect = result.expect[:population_expect_count]
    observable_expect = result.expect[population_expect_count:]
    time_axis = (tlist / TIME_FACTORS[time_unit]).tolist()
    all_population_series = [
        {
            'level_id': item['level']['id'],
            'label': item['level']['label'],
            'values': _real_series(values),
        }
        for item, values in zip(all_population_selection, all_population_expect)
    ]
    all_population_by_id = {item['level_id']: item for item in all_population_series}

    return {
        'dimension': dimension,
        'time_unit': time_unit,
        'time_axis': time_axis,
        'level_labels': [level['label'] for level in levels],
        'level_ids': [level['id'] for level in levels],
        'population_series': [
            all_population_by_id[item['level']['id']]
            for item in population_selection
        ],
        'all_population_series': all_population_series,
        'observable_series': [
            _serialize_observable_series(definition, values)
            for definition, values in zip(observable_defs, observable_expect)
        ],
        'hamiltonian_shape': list(hamiltonian.shape),
        'collapse_count': len(collapse_operators),
        'auto_collapse_count': len(collapse_operators) - len(custom_collapse_defs),
        'custom_collapse_count': len(custom_collapse_defs),
        'frame_level_offsets_hz': [float(value) for value in frame_offsets_hz],
        'frame_level_residuals_hz': [
            float(energies_hz[index] - frame_offsets_hz[index])
            for index in range(dimension)
        ],
        'frame_warnings': frame_warnings,
    }


def build_initial_state(initial_state_code, initial_state_mode, dimension):
    qobj = evaluate_qutip_expression(initial_state_code)

    if initial_state_mode == 'state_vector':
        if not (qobj.isket or qobj.isbra):
            raise SimulationBuildError('Начальное состояние должно быть вектором состояния QuTiP.')
        if qobj.shape[0] != dimension and qobj.shape[1] != dimension:
            raise SimulationBuildError('Размерность вектора состояния не совпадает с числом уровней.')
        return qobj

    if initial_state_mode == 'density_matrix':
        if not qobj.isoper or qobj.shape != (dimension, dimension):
            raise SimulationBuildError('Матрица плотности должна иметь размерность NxN, где N — число уровней.')
        return qobj

    raise SimulationBuildError('Неизвестный режим начального состояния.')


def basis_projector(dimension, index):
    basis = qutip.basis(dimension, index)
    return basis * basis.dag()


def _build_rotating_frame_offsets(levels, transitions, level_index_by_id, energies_hz, energy_unit):
    adjacency = {index: [] for index in range(len(levels))}
    for transition in transitions:
        from_id = transition.get('from_id')
        to_id = transition.get('to_id')
        if from_id not in level_index_by_id or to_id not in level_index_by_id:
            continue

        first_index = level_index_by_id[from_id]
        second_index = level_index_by_id[to_id]
        photon_hz = _transition_photon_hz(transition, energy_unit)

        lower_index = first_index
        upper_index = second_index
        if energies_hz[first_index] > energies_hz[second_index]:
            lower_index, upper_index = second_index, first_index

        adjacency[lower_index].append((upper_index, photon_hz))
        adjacency[upper_index].append((lower_index, -photon_hz))

    offsets = [None] * len(levels)
    warnings = []
    tolerance_hz = 1e-3

    order = sorted(range(len(levels)), key=lambda index: energies_hz[index])
    for seed_index in order:
        if offsets[seed_index] is not None:
            continue
        offsets[seed_index] = energies_hz[seed_index]
        stack = [seed_index]

        while stack:
            current = stack.pop()
            for neighbor, delta_hz in adjacency[current]:
                expected = offsets[current] + delta_hz
                if offsets[neighbor] is None:
                    offsets[neighbor] = expected
                    stack.append(neighbor)
                elif abs(offsets[neighbor] - expected) > tolerance_hz:
                    warnings.append(
                        f'Frame inconsistency between levels {levels[current]["label"]} and {levels[neighbor]["label"]}.'
                    )

    return [offset if offset is not None else energies_hz[index] for index, offset in enumerate(offsets)], warnings


def _resolve_population_selection(levels, level_index_by_id, selected_level_ids):
    if not selected_level_ids:
        selected_level_ids = [level['id'] for level in levels]

    selection = []
    for level_id in selected_level_ids:
        if level_id not in level_index_by_id:
            continue
        level = next(level for level in levels if level['id'] == level_id)
        selection.append(
            {
                'level': level,
                'operator': basis_projector(len(levels), level_index_by_id[level_id]),
            }
        )

    if not selection:
        raise SimulationBuildError('Не удалось определить уровни для графиков населённостей.')

    return selection


def _build_observable_operator(definition, dimension):
    expression = definition.get('expression', '')
    label = definition.get('label', 'O')
    qobj = evaluate_qutip_expression(expression)

    if not qobj.isoper:
        raise SimulationBuildError(f'Наблюдаемая `{label}` должна быть оператором QuTiP.')
    if qobj.shape != (dimension, dimension):
        raise SimulationBuildError(
            f'Наблюдаемая `{label}` должна иметь размер {dimension}x{dimension}.'
        )
    return qobj


def _real_series(values):
    array = np.real_if_close(np.asarray(values))
    if np.iscomplexobj(array):
        return np.real(array).tolist()
    return array.tolist()


def _serialize_observable_series(definition, values):
    array = np.asarray(values, dtype=complex)
    imag_part = np.imag(array)
    has_imag = bool(np.max(np.abs(imag_part)) > 1e-9)
    return {
        'label': definition.get('label', 'O'),
        'expression': definition.get('expression', ''),
        'real_values': np.real(array).tolist(),
        'imag_values': imag_part.tolist(),
        'has_imag': has_imag,
    }


def _to_hz(value, unit):
    return float(value) * UNIT_FACTORS.get(unit, 1.0)


def _transition_photon_hz(transition, energy_unit):
    if 'detuning_hz' in transition and 'photon_energy' in transition:
        return _to_hz(transition['photon_energy'], energy_unit)
    return _to_hz(transition.get('photon_energy', 0.0), energy_unit)


def _transition_rabi_hz(transition):
    if 'rabi_frequency_hz' in transition:
        return float(transition['rabi_frequency_hz'])
    return _to_hz(transition.get('rabi_frequency', 0.0), transition.get('rabi_unit', 'MHz'))


def _transition_linewidth_hz(transition):
    if 'linewidth_hz' in transition:
        return float(transition['linewidth_hz'])
    return _to_hz(transition.get('linewidth', 0.0), transition.get('linewidth_unit', 'MHz'))
