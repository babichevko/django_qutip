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

    for transition in transitions:
        from_id = transition.get('from_id')
        to_id = transition.get('to_id')
        if from_id not in level_index_by_id or to_id not in level_index_by_id:
            continue

        lower_index = level_index_by_id[from_id]
        upper_index = level_index_by_id[to_id]

        if energies_hz[lower_index] > energies_hz[upper_index]:
            lower_index, upper_index = upper_index, lower_index

        gap_hz = energies_hz[upper_index] - energies_hz[lower_index]
        photon_hz = _transition_photon_hz(transition, config.get('energy_unit', 'MHz'))
        detuning_hz = photon_hz - gap_hz
        rabi_hz = _transition_rabi_hz(transition)
        linewidth_hz = _transition_linewidth_hz(transition)

        projector_upper = basis_projector(dimension, upper_index)
        exchange = qutip.basis(dimension, lower_index) * qutip.basis(dimension, upper_index).dag()

        # RWA with frequencies provided in Hz: convert to angular frequencies via 2*pi.
        hamiltonian += (-2 * math.pi * detuning_hz) * projector_upper
        hamiltonian += (math.pi * rabi_hz) * (exchange + exchange.dag())

        if linewidth_hz > 0:
            gamma = 2 * math.pi * linewidth_hz
            collapse_operators.append(math.sqrt(gamma) * exchange)

    rho0 = build_initial_state(initial_state_code, initial_state_mode, dimension)
    tlist = np.linspace(0.0, evolution_time * TIME_FACTORS[time_unit], time_steps)
    population_selection = _resolve_population_selection(levels, level_index_by_id, selected_level_ids)
    observable_defs = observables or []

    e_ops = [item['operator'] for item in population_selection]
    e_ops.extend(_build_observable_operator(item, dimension) for item in observable_defs)

    result = qutip.mesolve(
        hamiltonian,
        rho0,
        tlist,
        c_ops=collapse_operators,
        e_ops=e_ops,
    )

    population_expect_count = len(population_selection)
    population_expect = result.expect[:population_expect_count]
    observable_expect = result.expect[population_expect_count:]
    time_axis = (tlist / TIME_FACTORS[time_unit]).tolist()

    return {
        'dimension': dimension,
        'time_unit': time_unit,
        'time_axis': time_axis,
        'level_labels': [level['label'] for level in levels],
        'level_ids': [level['id'] for level in levels],
        'population_series': [
            {
                'level_id': item['level']['id'],
                'label': item['level']['label'],
                'values': _real_series(values),
            }
            for item, values in zip(population_selection, population_expect)
        ],
        'observable_series': [
            _serialize_observable_series(definition, values)
            for definition, values in zip(observable_defs, observable_expect)
        ],
        'hamiltonian_shape': list(hamiltonian.shape),
        'collapse_count': len(collapse_operators),
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
