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

    if request.method == 'POST' and 'system_submit' in request.POST:
        system_form = QuantumSystemForm(request.POST, prefix='system')
        state_form = SimulationSetupForm(prefix='state')
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
        system_form = QuantumSystemForm(prefix='system')
        state_form = SimulationSetupForm(request.POST, prefix='state')
        if state_form.is_valid():
            state_cleaned_data = state_form.cleaned_data
            if current_system is None:
                state_form.add_error(
                    None,
                    'Сначала сохраните систему в разделе параметров, затем сохраняйте запуск симуляции.',
                )
            else:
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
                        'qobj_summary': state_cleaned_data.get('qobj_summary', {}),
                        'editor_config': editor_config,
                    },
                    status='draft',
                )
    else:
        system_form = QuantumSystemForm(prefix='system')
        state_form = SimulationSetupForm(prefix='state')

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
        },
    )


def state_setup(request):
    return redirect(f"{reverse('editor')}#initial-state")


def results(request):
    return redirect(f"{reverse('editor')}#results")
