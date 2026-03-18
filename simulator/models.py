from django.db import models


class QuantumSystem(models.Model):
    ENERGY_UNIT_CHOICES = [
        ('Hz', 'Hz'),
        ('kHz', 'kHz'),
        ('MHz', 'MHz'),
    ]

    name = models.CharField('Название системы', max_length=120)
    notes = models.TextField('Комментарий', blank=True)
    level_count = models.PositiveSmallIntegerField('Количество уровней')
    energy_unit = models.CharField(
        'Единицы энергии',
        max_length=8,
        choices=ENERGY_UNIT_CHOICES,
        default='MHz',
    )
    level_spacing = models.FloatField('Типичный энергетический зазор', default=1.0)
    config_json = models.JSONField('Конфигурация системы', default=dict, blank=True)
    created_at = models.DateTimeField('Создано', auto_now_add=True)
    updated_at = models.DateTimeField('Обновлено', auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']
        verbose_name = 'Квантовая система'
        verbose_name_plural = 'Квантовые системы'

    def __str__(self):
        return self.name


class SimulationRun(models.Model):
    INITIAL_STATE_MODE_CHOICES = [
        ('state_vector', 'Вектор состояния'),
        ('density_matrix', 'Матрица плотности'),
    ]
    TIME_UNIT_CHOICES = [
        ('s', 's'),
        ('ms', 'ms'),
        ('us', 'us'),
        ('ns', 'ns'),
    ]
    STATUS_CHOICES = [
        ('draft', 'Черновик'),
        ('completed', 'Завершён'),
        ('failed', 'Ошибка'),
    ]

    system = models.ForeignKey(
        QuantumSystem,
        on_delete=models.CASCADE,
        related_name='simulation_runs',
        verbose_name='Квантовая система',
    )
    initial_state_mode = models.CharField(
        'Режим начального состояния',
        max_length=24,
        choices=INITIAL_STATE_MODE_CHOICES,
    )
    initial_state_code = models.TextField('Код QuTiP для начального состояния')
    evolution_time = models.FloatField('Длительность эволюции')
    time_unit = models.CharField(
        'Единицы времени',
        max_length=8,
        choices=TIME_UNIT_CHOICES,
        default='us',
    )
    time_steps = models.PositiveIntegerField('Количество временных шагов', default=400)
    result_json = models.JSONField('Результаты симуляции', default=dict, blank=True)
    metadata_json = models.JSONField('Служебные данные', default=dict, blank=True)
    status = models.CharField(
        'Статус',
        max_length=16,
        choices=STATUS_CHOICES,
        default='draft',
    )
    created_at = models.DateTimeField('Создано', auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Запуск симуляции'
        verbose_name_plural = 'Запуски симуляции'

    def __str__(self):
        return f'{self.system.name} [{self.created_at:%Y-%m-%d %H:%M}]'
