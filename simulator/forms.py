from django import forms

from .qutip_eval import QutipExpressionError, evaluate_qutip_expression


DEFAULT_TRANSITION_LINEWIDTH = 0.0
DEFAULT_RABI_FREQUENCY = 0.1

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
    ('state_vector', 'Вектор состояния (код QuTiP)'),
    ('density_matrix', 'Матрица плотности (код QuTiP)'),
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
        initial='state_vector',
    )
    state_vector_code = forms.CharField(
        label='Код QuTiP для вектора состояния',
        required=False,
        widget=forms.Textarea(
            attrs={
                'rows': 4,
                'placeholder': 'basis(2, 0)',
            }
        ),
        help_text='Введите выражение Python, возвращающее Qobj-вектор состояния.',
    )
    density_matrix_code = forms.CharField(
        label='Код QuTiP для матрицы плотности',
        required=False,
        widget=forms.Textarea(
            attrs={
                'rows': 4,
                'placeholder': 'fock_dm(5, 2)',
            }
        ),
        help_text='Введите выражение Python, возвращающее Qobj-матрицу плотности.',
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
        vector_code = (cleaned_data.get('state_vector_code') or '').strip()
        density_code = (cleaned_data.get('density_matrix_code') or '').strip()

        if mode == 'state_vector':
            if not vector_code:
                self.add_error(
                    'state_vector_code',
                    'Для этого режима введите код QuTiP, создающий вектор состояния.',
                )
            else:
                qobj = self._evaluate_expression('state_vector_code', vector_code)
                if qobj is not None:
                    self._validate_state_vector(qobj)

        if mode == 'density_matrix':
            if not density_code:
                self.add_error(
                    'density_matrix_code',
                    'Для этого режима введите код QuTiP, создающий матрицу плотности.',
                )
            else:
                qobj = self._evaluate_expression('density_matrix_code', density_code)
                if qobj is not None:
                    self._validate_density_matrix(qobj)

        if cleaned_data.get('evolution_time') == 0:
            self.add_error('evolution_time', 'Длительность эволюции должна быть больше нуля.')

        return cleaned_data

    def _evaluate_expression(self, field_name, expression):
        try:
            qobj = evaluate_qutip_expression(expression)
        except QutipExpressionError as exc:
            self.add_error(field_name, str(exc))
            return None

        self.cleaned_data['validated_qobj'] = qobj
        self.cleaned_data['qobj_summary'] = self._build_summary(qobj)
        return qobj

    def _validate_state_vector(self, qobj):
        if not (qobj.isket or qobj.isbra):
            self.add_error(
                'state_vector_code',
                'Выражение должно возвращать вектор состояния QuTiP, а не оператор.',
            )
            return

        norm = float(qobj.norm())
        if abs(norm - 1.0) > 1e-8:
            self.add_error(
                'state_vector_code',
                f'Вектор состояния должен быть нормирован. Сейчас норма равна {norm:.8f}.',
            )

    def _validate_density_matrix(self, qobj):
        if not qobj.isoper:
            self.add_error(
                'density_matrix_code',
                'Выражение должно возвращать оператор QuTiP, представляющий матрицу плотности.',
            )
            return

        trace_value = complex(qobj.tr())
        if abs(trace_value - 1.0) > 1e-8:
            self.add_error(
                'density_matrix_code',
                f'След матрицы плотности должен быть равен 1. Сейчас след равен {trace_value:.8g}.',
            )

        if not qobj.isherm:
            self.add_error(
                'density_matrix_code',
                'Матрица плотности должна быть эрмитовой.',
            )
            return

        eigenvalues = qobj.eigenenergies()
        if any(value < -1e-8 for value in eigenvalues):
            self.add_error(
                'density_matrix_code',
                'Матрица плотности должна быть положительно полуопределённой.',
            )

    def _build_summary(self, qobj):
        summary = {
            'shape': qobj.shape,
            'dims': qobj.dims,
            'type': qobj.type,
        }

        if qobj.isket or qobj.isbra:
            summary['norm'] = float(qobj.norm())
        if qobj.isoper:
            summary['trace'] = complex(qobj.tr())
            summary['hermitian'] = bool(qobj.isherm)

        return summary
