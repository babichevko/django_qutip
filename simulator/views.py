import json

from django.shortcuts import redirect, render
from django.urls import reverse

from .forms import (
    DEFAULT_RABI_FREQUENCY,
    DEFAULT_TRANSITION_LINEWIDTH,
    QuantumSystemForm,
    SimulationSetupForm,
)
from .models import QuantumSystem, SimulationRun
from .physics import SimulationBuildError, run_simulation


def system_list(request):
    systems = QuantumSystem.objects.prefetch_related('simulation_runs')
    return render(
        request,
        'simulator/system_list.html',
        {
            'systems': systems,
        },
    )


def _parse_editor_config(raw_value):
    if not raw_value:
        return {}

    try:
        data = json.loads(raw_value)
    except json.JSONDecodeError:
        return {}

    return data if isinstance(data, dict) else {}


def _editor_levels(editor_config):
    levels = editor_config.get('levels', [])
    if not isinstance(levels, list):
        return []
    return sorted(
        [item for item in levels if isinstance(item, dict) and 'id' in item],
        key=lambda item: item.get('energy', 0.0),
    )


def _level_choices(editor_config):
    choices = []
    for level in _editor_levels(editor_config):
        label = level.get('label') or f"|{level['id']}>"
        energy = level.get('energy')
        choices.append((str(level['id']), f"{label} ({energy} {editor_config.get('energy_unit', 'MHz')})"))
    return choices


def _editor_dimension(editor_config, current_system=None):
    levels = _editor_levels(editor_config)
    if levels:
        return len(levels)
    if current_system is not None:
        return current_system.level_count
    return None


def _json_safe(value):
    if isinstance(value, complex):
        return {'real': value.real, 'imag': value.imag}
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    return value


def _system_initial(current_system):
    if current_system is None:
        return {}
    return {
        'name': current_system.name,
        'notes': current_system.notes,
        'level_count': current_system.level_count,
        'energy_unit': current_system.energy_unit,
        'level_spacing': current_system.level_spacing,
    }


def editor(request):
    system_cleaned_data = None
    state_cleaned_data = None
    current_system = None
    latest_run = None

    current_system_id = request.GET.get('system_id') or request.POST.get('current_system_id')
    if current_system_id:
        try:
            current_system = QuantumSystem.objects.get(pk=current_system_id)
            latest_run = current_system.simulation_runs.first()
        except QuantumSystem.DoesNotExist:
            current_system = None

    editor_config = _parse_editor_config(request.POST.get('editor_config_json')) if request.method == 'POST' else {}
    if current_system and not editor_config:
        editor_config = current_system.config_json

    level_choices = _level_choices(editor_config)
    dimension = _editor_dimension(editor_config, current_system=current_system)

    if request.method == 'POST' and 'system_submit' in request.POST:
        system_form = QuantumSystemForm(request.POST, prefix='system')
        state_form = SimulationSetupForm(prefix='state', level_choices=level_choices, dimension=dimension)
        if system_form.is_valid():
            system_cleaned_data = system_form.cleaned_data
            payload = {
                'name': system_cleaned_data['name'],
                'notes': system_cleaned_data['notes'],
                'level_count': system_cleaned_data['level_count'],
                'energy_unit': system_cleaned_data['energy_unit'],
                'level_spacing': system_cleaned_data['level_spacing'],
                'config_json': editor_config,
            }
            if current_system is None:
                current_system = QuantumSystem.objects.create(**payload)
            else:
                for field_name, value in payload.items():
                    setattr(current_system, field_name, value)
                current_system.save()
            latest_run = current_system.simulation_runs.first()
    elif request.method == 'POST' and 'state_submit' in request.POST:
        system_form = QuantumSystemForm(prefix='system', initial=_system_initial(current_system))
        state_form = SimulationSetupForm(
            request.POST,
            prefix='state',
            level_choices=level_choices,
            dimension=dimension,
        )
        if state_form.is_valid():
            state_cleaned_data = state_form.cleaned_data
            if current_system is None:
                state_form.add_error(
                    None,
                    'Сначала сохраните систему в разделе параметров, затем сохраняйте запуск симуляции.',
                )
            else:
                if editor_config:
                    current_system.config_json = editor_config
                    current_system.save(update_fields=['config_json', 'updated_at'])
                initial_state_code = (
                    state_cleaned_data.get('state_vector_code')
                    or state_cleaned_data.get('density_matrix_code')
                    or ''
                )
                latest_run = SimulationRun.objects.create(
                    system=current_system,
                    initial_state_mode=state_cleaned_data['initial_state_mode'],
                    initial_state_code=initial_state_code,
                    evolution_time=state_cleaned_data['evolution_time'],
                    time_unit=state_cleaned_data['time_unit'],
                    time_steps=state_cleaned_data['time_steps'],
                    metadata_json={
                        'qobj_summary': _json_safe(state_cleaned_data.get('qobj_summary', {})),
                        'editor_config': editor_config,
                        'selected_level_ids': state_cleaned_data.get('plot_level_ids', []),
                        'observables': _json_safe(state_cleaned_data.get('validated_observables', [])),
                    },
                    status='draft',
                )
                try:
                    latest_run.result_json = run_simulation(
                        editor_config or current_system.config_json,
                        initial_state_code=initial_state_code,
                        initial_state_mode=state_cleaned_data['initial_state_mode'],
                        evolution_time=state_cleaned_data['evolution_time'],
                        time_unit=state_cleaned_data['time_unit'],
                        time_steps=state_cleaned_data['time_steps'],
                        selected_level_ids=state_cleaned_data.get('plot_level_ids', []),
                        observables=state_cleaned_data.get('validated_observables', []),
                    )
                    latest_run.status = 'completed'
                except SimulationBuildError as exc:
                    latest_run.status = 'failed'
                    latest_run.metadata_json['simulation_error'] = str(exc)
                    state_form.add_error(None, str(exc))
                except Exception as exc:
                    latest_run.status = 'failed'
                    latest_run.metadata_json['simulation_error'] = f'Неожиданная ошибка симуляции: {exc}'
                    state_form.add_error(None, f'Неожиданная ошибка симуляции: {exc}')
                latest_run.save()
    else:
        system_form = QuantumSystemForm(prefix='system', initial=_system_initial(current_system))
        state_form = SimulationSetupForm(prefix='state', level_choices=level_choices, dimension=dimension)

    return render(
        request,
        'simulator/editor.html',
        {
            'system_form': system_form,
            'state_form': state_form,
            'system_cleaned_data': system_cleaned_data,
            'state_cleaned_data': state_cleaned_data,
            'default_transition_linewidth': DEFAULT_TRANSITION_LINEWIDTH,
            'default_rabi_frequency': DEFAULT_RABI_FREQUENCY,
            'current_system': current_system,
            'latest_run': latest_run,
            'editor_config_json': json.dumps(editor_config, ensure_ascii=False, indent=2),
            'latest_run_result_json': (
                json.dumps(latest_run.result_json, ensure_ascii=False, indent=2)
                if latest_run and latest_run.result_json
                else ''
            ),
        },
    )


def state_setup(request):
    return redirect(f"{reverse('editor')}#initial-state")


def results(request):
    return redirect(f"{reverse('editor')}#results")
