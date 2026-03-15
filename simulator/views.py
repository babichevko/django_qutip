from django.shortcuts import render


def system_list(request):
    return render(request, 'simulator/system_list.html')


def editor(request):
    return render(request, 'simulator/editor.html')


def results(request):
    return render(request, 'simulator/results.html')
