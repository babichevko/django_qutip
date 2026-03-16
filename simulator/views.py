from django.shortcuts import render

from .forms import QuantumSystemForm, SimulationSetupForm


def system_list(request):
    return render(request, 'simulator/system_list.html')


def editor(request):
    cleaned_data = None

    if request.method == 'POST':
        form = QuantumSystemForm(request.POST)
        if form.is_valid():
            cleaned_data = form.cleaned_data
    else:
        form = QuantumSystemForm()

    return render(
        request,
        'simulator/editor.html',
        {
            'form': form,
            'cleaned_data': cleaned_data,
        },
    )


def state_setup(request):
    cleaned_data = None

    if request.method == 'POST':
        form = SimulationSetupForm(request.POST)
        if form.is_valid():
            cleaned_data = form.cleaned_data
    else:
        form = SimulationSetupForm()

    return render(
        request,
        'simulator/state_setup.html',
        {
            'form': form,
            'cleaned_data': cleaned_data,
        },
    )


def results(request):
    return render(request, 'simulator/results.html')
