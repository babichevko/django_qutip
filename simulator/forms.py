from django import forms


ENERGY_UNIT_CHOICES = [
    ('Hz', 'Hz'),
    ('kHz', 'kHz'),
    ('MHz', 'MHz'),
]

TIME_UNIT_CHOICES = [
    ('s', 's'),
    ('ms', 'ms'),
    ('us', 'us'),
    ('ns', 'ns'),
]

INITIAL_STATE_MODE_CHOICES = [
    ('populations', 'Вероятности уровней'),
    ('density_matrix', 'Матрица плотности'),
]


class QuantumSystemForm(forms.Form):
    name = forms.CharField(
        label='Название системы',
        max_length=120,
        error_messages={
            'required': 'Введите название системы.',
            'max_length': 'Название слишком длинное.',
        },
    )
    level_count = forms.IntegerField(
        label='Количество уровней',
        min_value=2,
        max_value=8,
        initial=3,
        error_messages={
            'required': 'Укажите количество уровней.',
            'min_value': 'В системе должно быть хотя бы 2 уровня.',
            'max_value': 'Для учебного MVP пока поддерживается не больше 8 уровней.',
            'invalid': 'Введите целое число уровней.',
        },
    )
    energy_unit = forms.ChoiceField(
        label='Единицы энергии',
        choices=ENERGY_UNIT_CHOICES,
        initial='MHz',
    )
    level_spacing = forms.FloatField(
        label='Типичный энергетический зазор',
        min_value=0.0,
        initial=1.0,
        error_messages={
            'required': 'Укажите энергетический зазор.',
            'min_value': 'Энергетический зазор не может быть отрицательным.',
            'invalid': 'Введите число для энергетического зазора.',
        },
    )
    transition_linewidth = forms.FloatField(
        label='Ширина линии перехода по умолчанию',
        min_value=0.0,
        initial=0.0,
        error_messages={
            'required': 'Укажите ширину линии.',
            'min_value': 'Ширина линии не может быть отрицательной.',
            'invalid': 'Введите число для ширины линии.',
        },
    )
    rabi_frequency = forms.FloatField(
        label='Частота Раби по умолчанию',
        min_value=0.0,
        initial=0.1,
        error_messages={
            'required': 'Укажите частоту Раби.',
            'min_value': 'Частота Раби не может быть отрицательной.',
            'invalid': 'Введите число для частоты Раби.',
        },
    )
    notes = forms.CharField(
        label='Комментарий',
        required=False,
        widget=forms.Textarea(attrs={'rows': 4}),
        help_text='Необязательное описание системы или физических предположений.',
    )


class SimulationSetupForm(forms.Form):
    initial_state_mode = forms.ChoiceField(
        label='Способ задания начального состояния',
        choices=INITIAL_STATE_MODE_CHOICES,
        initial='populations',
    )
    populations = forms.CharField(
        label='Вероятности уровней',
        required=False,
        widget=forms.Textarea(
            attrs={
                'rows': 4,
                'placeholder': 'Например: 1, 0, 0',
            }
        ),
        help_text='Введите вероятности через запятую. Их сумма должна быть равна 1.',
    )
    density_matrix = forms.CharField(
        label='Матрица плотности',
        required=False,
        widget=forms.Textarea(
            attrs={
                'rows': 6,
                'placeholder': 'Например:\n1, 0\n0, 0',
            }
        ),
        help_text='Введите квадратную матрицу построчно. Значения разделяйте запятыми.',
    )
    evolution_time = forms.FloatField(
        label='Длительность эволюции',
        min_value=0.0,
        initial=10.0,
        error_messages={
            'required': 'Укажите длительность эволюции.',
            'min_value': 'Длительность эволюции должна быть положительной.',
            'invalid': 'Введите число для длительности эволюции.',
        },
    )
    time_unit = forms.ChoiceField(
        label='Единицы времени',
        choices=TIME_UNIT_CHOICES,
        initial='us',
    )
    time_steps = forms.IntegerField(
        label='Количество временных шагов',
        min_value=10,
        max_value=5000,
        initial=400,
        error_messages={
            'required': 'Укажите количество временных шагов.',
            'min_value': 'Нужно хотя бы 10 временных шагов.',
            'max_value': 'Пока ограничимся 5000 временными шагами.',
            'invalid': 'Введите целое число временных шагов.',
        },
    )

    def clean(self):
        cleaned_data = super().clean()
        mode = cleaned_data.get('initial_state_mode')
        populations = (cleaned_data.get('populations') or '').strip()
        density_matrix = (cleaned_data.get('density_matrix') or '').strip()

        if mode == 'populations':
            if not populations:
                self.add_error(
                    'populations',
                    'Для режима вероятностей заполните список вероятностей уровней.',
                )
            else:
                values = self._parse_population_values(populations)
                if values is not None and abs(sum(values) - 1.0) > 1e-6:
                    self.add_error(
                        'populations',
                        'Сумма вероятностей должна быть равна 1.',
                    )

        if mode == 'density_matrix':
            if not density_matrix:
                self.add_error(
                    'density_matrix',
                    'Для режима матрицы плотности заполните матрицу.',
                )
            else:
                self._validate_density_matrix(density_matrix)

        return cleaned_data

    def _parse_population_values(self, raw_value):
        chunks = [item.strip() for item in raw_value.split(',') if item.strip()]
        if not chunks:
            self.add_error('populations', 'Нужно указать хотя бы одну вероятность.')
            return None

        values = []
        for chunk in chunks:
            try:
                value = float(chunk)
            except ValueError:
                self.add_error(
                    'populations',
                    'Вероятности должны быть числами, разделёнными запятыми.',
                )
                return None
            if value < 0:
                self.add_error(
                    'populations',
                    'Вероятности не могут быть отрицательными.',
                )
                return None
            values.append(value)
        return values

    def _validate_density_matrix(self, raw_value):
        rows = [row.strip() for row in raw_value.splitlines() if row.strip()]
        parsed_rows = []

        for row in rows:
            chunks = [item.strip() for item in row.split(',')]
            if not chunks:
                continue
            try:
                parsed_row = [complex(item.replace('i', 'j')) for item in chunks]
            except ValueError:
                self.add_error(
                    'density_matrix',
                    'Матрица плотности должна содержать числа, разделённые запятыми.',
                )
                return
            parsed_rows.append(parsed_row)

        if not parsed_rows:
            self.add_error('density_matrix', 'Матрица плотности не должна быть пустой.')
            return

        row_length = len(parsed_rows[0])
        if any(len(row) != row_length for row in parsed_rows):
            self.add_error(
                'density_matrix',
                'Во всех строках матрицы должно быть одинаковое количество элементов.',
            )
            return

        if len(parsed_rows) != row_length:
            self.add_error(
                'density_matrix',
                'Матрица плотности должна быть квадратной.',
            )
            return
