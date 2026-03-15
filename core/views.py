from django.shortcuts import render


def home(request):
    return render(request, 'core/home.html')


def about(request):
    return render(request, 'core/about.html')


def help_page(request):
    return render(request, 'core/help.html')
