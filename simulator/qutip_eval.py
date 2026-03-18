import ast
import math
import warnings

import numpy as np

warnings.filterwarnings(
    'ignore',
    message='matplotlib not found: Graphics will not work.',
)

import qutip
from qutip import Qobj


_ALLOWED_ATTRIBUTE_ROOTS = {'np', 'numpy', 'qt', 'qutip', 'math'}
_ALLOWED_QOBJ_ATTRIBUTES = {
    'conj',
    'dag',
    'expm',
    'proj',
    'ptrace',
    'sqrtm',
    'tidyup',
    'transform',
    'trans',
    'unit',
}
_ALLOWED_NODES = (
    ast.Expression,
    ast.Call,
    ast.Name,
    ast.Load,
    ast.Constant,
    ast.Tuple,
    ast.List,
    ast.Dict,
    ast.keyword,
    ast.BinOp,
    ast.UnaryOp,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Pow,
    ast.Mod,
    ast.USub,
    ast.UAdd,
    ast.Attribute,
)


class QutipExpressionError(ValueError):
    pass


SAFE_NAMESPACE = {
    name: value
    for name, value in qutip.__dict__.items()
    if not name.startswith('_')
}
SAFE_NAMESPACE.update(
    {
        'np': np,
        'numpy': np,
        'qt': qutip,
        'qutip': qutip,
        'math': math,
        'pi': math.pi,
    }
)


def evaluate_qutip_expression(expression):
    try:
        tree = ast.parse(expression, mode='eval')
    except SyntaxError as exc:
        raise QutipExpressionError('Не удалось разобрать выражение Python.') from exc

    _validate_ast(tree)

    try:
        result = eval(compile(tree, '<qutip-expression>', 'eval'), {'__builtins__': {}}, SAFE_NAMESPACE)
    except Exception as exc:
        raise QutipExpressionError(f'Ошибка при вычислении выражения: {exc}') from exc

    if not isinstance(result, Qobj):
        raise QutipExpressionError('Выражение должно возвращать объект QuTiP типа Qobj.')

    return result


def _validate_ast(node):
    for child in ast.walk(node):
        if not isinstance(child, _ALLOWED_NODES):
            raise QutipExpressionError('В выражении используются неподдерживаемые конструкции Python.')

        if isinstance(child, ast.Attribute):
            if child.attr.startswith('_'):
                raise QutipExpressionError('Доступ к приватным атрибутам запрещён.')

            if isinstance(child.value, ast.Name) and child.value.id in _ALLOWED_ATTRIBUTE_ROOTS:
                continue

            if child.attr in _ALLOWED_QOBJ_ATTRIBUTES:
                continue

            raise QutipExpressionError(
                'Разрешён доступ только к атрибутам модулей np, qutip и math '
                'или к безопасным методам объектов QuTiP.'
            )
