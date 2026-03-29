"""URL routes for the simulator app."""

from django.urls import path

from . import views

urlpatterns = [
    path('', views.system_list, name='system_list'),
    path('editor/', views.editor, name='editor'),
    path('<int:system_id>/export/config/', views.export_system_config, name='export_system_config'),
    path('runs/<int:run_id>/export/json/', views.export_run_result_json, name='export_run_result_json'),
    path('runs/<int:run_id>/export/csv/', views.export_run_result_csv, name='export_run_result_csv'),
    path('state/', views.state_setup, name='state_setup'),
    path('results/', views.results, name='results'),
]
