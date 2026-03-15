from django.urls import path

from . import views

urlpatterns = [
    path('', views.system_list, name='system_list'),
    path('editor/', views.editor, name='editor'),
    path('results/', views.results, name='results'),
]
