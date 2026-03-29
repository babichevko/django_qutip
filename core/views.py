"""Views for the informational pages."""

from django.shortcuts import render


def home(request):
    """Render the landing page."""

    return render(request, 'core/home.html')


def about(request):
    """Render the project overview page."""

    return render(request, 'core/about.html')


def help_page(request):
    """Render the user help page."""

    return render(request, 'core/help.html')
