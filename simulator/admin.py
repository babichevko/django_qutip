"""Admin registration for simulator models."""

from django.contrib import admin

from .models import QuantumSystem, SimulationRun


@admin.register(QuantumSystem)
class QuantumSystemAdmin(admin.ModelAdmin):
    """Admin presentation for saved quantum systems."""

    list_display = ('name', 'level_count', 'energy_unit', 'updated_at')
    list_filter = ('energy_unit', 'level_count')
    search_fields = ('name', 'notes')
    ordering = ('-updated_at',)


@admin.register(SimulationRun)
class SimulationRunAdmin(admin.ModelAdmin):
    """Admin presentation for simulation runs."""

    list_display = (
        'system',
        'initial_state_mode',
        'evolution_time',
        'time_unit',
        'time_steps',
        'status',
        'created_at',
    )
    list_filter = ('initial_state_mode', 'time_unit', 'status')
    search_fields = ('system__name', 'initial_state_code')
    autocomplete_fields = ('system',)
    ordering = ('-created_at',)
