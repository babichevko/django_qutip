from django.shortcuts import redirect, render
from django.urls import reverse

from .forms import (
    DEFAULT_RABI_FREQUENCY,
    DEFAULT_TRANSITION_LINEWIDTH,
    QuantumSystemForm,
    SimulationSetupForm,
)


def system_list(request):
    return render(request, 'simulator/system_list.html')


def editor(request):
    system_cleaned_data = None
    state_cleaned_data = None

    if request.method == 'POST' and 'system_submit' in request.POST:
        system_form = QuantumSystemForm(request.POST, prefix='system')
        state_form = SimulationSetupForm(prefix='state')
        if system_form.is_valid():
            system_cleaned_data = system_form.cleaned_data
    elif request.method == 'POST' and 'state_submit' in request.POST:
        system_form = QuantumSystemForm(prefix='system')
        state_form = SimulationSetupForm(request.POST, prefix='state')
        if state_form.is_valid():
            state_cleaned_data = state_form.cleaned_data
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
        },
    )


def state_setup(request):
    return redirect(f"{reverse('editor')}#initial-state")


def results(request):
    return redirect(f"{reverse('editor')}#results")
