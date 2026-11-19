from django.db.models import Q

from .models import EstadoActivo


NOMBRES_ESTADO_PRESTADO = ("En servicio", "Prestado")


def es_estado_prestado(nombre):
    return (nombre or "").strip().casefold() in {
        nombre_estado.casefold()
        for nombre_estado in NOMBRES_ESTADO_PRESTADO
    }


def filtro_estado_prestado(campo="nombre"):
    filtro = Q()
    for nombre_estado in NOMBRES_ESTADO_PRESTADO:
        filtro |= Q(**{f"{campo}__iexact": nombre_estado})
    return filtro


def obtener_estado_prestado():
    estados_activos = EstadoActivo.objects.filter(activo=True)
    for nombre_estado in NOMBRES_ESTADO_PRESTADO:
        estado = estados_activos.filter(nombre__iexact=nombre_estado).first()
        if estado:
            return estado
    return None
