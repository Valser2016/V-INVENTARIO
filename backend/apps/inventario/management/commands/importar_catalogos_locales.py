from django.core.management.base import BaseCommand, CommandError
from django.db import DEFAULT_DB_ALIAS, transaction

from apps.inventario.models import (
    CategoriaActivo,
    EstadoActivo,
    TipoActivo,
    Ubicacion,
)
from apps.usuarios.models import Rol


TIPOS = (
    ("Equipo", "", True),
    ("Equipo de instrumentaci\u00f3n", "", True),
    ("Equipos de alturas", "", True),
    ("Equipos de computo", "", True),
    ("Equipos de izaje", "", True),
    ("Herramienta", "", True),
)

CATEGORIAS = (
    ("Equipo de instrumentaci\u00f3n", "Celda de carga", "CEC", "", True),
    ("Equipos de izaje", "Diferencial", "DIF", "", True),
    ("Equipo de instrumentaci\u00f3n", "Man\u00f3metro", "MAN", "", True),
    (
        "Equipo de instrumentaci\u00f3n",
        "Transmisor de presi\u00f3n",
        "TP",
        "",
        True,
    ),
)

ESTADOS = (
    ("Disponible", "", True, True),
    ("En calibraci\u00f3n", "", False, True),
    ("En mantenimiento", "", False, True),
    ("En servicio", "", False, True),
    ("Fuera de servicio", "", False, True),
    ("Obsoleto", "", False, True),
)

UBICACIONES = (
    ("Almac\u00e9n", "", True),
    ("Laboratorio", "", True),
)

ROLES = (
    {
        "nombre": "Administrador",
        "puede_ver_inventario": True,
        "puede_modificar_inventario": True,
        "puede_administrar_catalogos": True,
        "puede_ver_movimientos": True,
        "puede_ver_reportes": True,
        "puede_registrar_devoluciones": True,
        "puede_revisar_solicitudes_prestamo": True,
        "puede_aprobar_solicitudes_prestamo": True,
        "activo": True,
    },
    {
        "nombre": "Consulta",
        "puede_ver_inventario": True,
        "puede_modificar_inventario": False,
        "puede_administrar_catalogos": False,
        "puede_ver_movimientos": False,
        "puede_ver_reportes": True,
        "puede_registrar_devoluciones": False,
        "puede_revisar_solicitudes_prestamo": False,
        "puede_aprobar_solicitudes_prestamo": False,
        "activo": True,
    },
    {
        "nombre": "Inventario",
        "puede_ver_inventario": True,
        "puede_modificar_inventario": True,
        "puede_administrar_catalogos": True,
        "puede_ver_movimientos": True,
        "puede_ver_reportes": False,
        "puede_registrar_devoluciones": True,
        "puede_revisar_solicitudes_prestamo": True,
        "puede_aprobar_solicitudes_prestamo": True,
        "activo": True,
    },
    {
        "nombre": "Tecnico",
        "puede_ver_inventario": False,
        "puede_modificar_inventario": False,
        "puede_administrar_catalogos": False,
        "puede_ver_movimientos": True,
        "puede_ver_reportes": False,
        "puede_registrar_devoluciones": False,
        "puede_revisar_solicitudes_prestamo": False,
        "puede_aprobar_solicitudes_prestamo": False,
        "activo": True,
    },
)


class Command(BaseCommand):
    help = "Agrega a la base activa los cat\u00e1logos locales que falten."

    def handle(self, *args, **options):
        database = DEFAULT_DB_ALIAS
        agregados = {
            "tipos": 0,
            "categorias": 0,
            "estados": 0,
            "ubicaciones": 0,
            "roles": 0,
        }

        with transaction.atomic(using=database):
            for nombre, descripcion, activo in TIPOS:
                _, creado = TipoActivo.objects.using(database).get_or_create(
                    nombre=nombre,
                    defaults={"descripcion": descripcion, "activo": activo},
                )
                agregados["tipos"] += creado

            for (
                tipo_nombre,
                nombre,
                prefijo_codigo,
                descripcion,
                activo,
            ) in CATEGORIAS:
                tipo = TipoActivo.objects.using(database).get(nombre=tipo_nombre)
                existentes = CategoriaActivo.objects.using(database)
                categoria = existentes.filter(
                    tipo_activo=tipo,
                    nombre=nombre,
                ).first()
                if categoria:
                    continue

                conflicto = existentes.filter(
                    prefijo_codigo=prefijo_codigo
                ).select_related("tipo_activo").first()
                if conflicto:
                    raise CommandError(
                        f"El prefijo '{prefijo_codigo}' para '{tipo_nombre} / "
                        f"{nombre}' ya pertenece a "
                        f"'{conflicto.tipo_activo.nombre} / {conflicto.nombre}'. "
                        "No se importaron cambios."
                    )

                CategoriaActivo.objects.using(database).create(
                    tipo_activo=tipo,
                    nombre=nombre,
                    prefijo_codigo=prefijo_codigo,
                    descripcion=descripcion,
                    activo=activo,
                )
                agregados["categorias"] += 1

            for nombre, descripcion, permite_prestamo, activo in ESTADOS:
                _, creado = EstadoActivo.objects.using(database).get_or_create(
                    nombre=nombre,
                    defaults={
                        "descripcion": descripcion,
                        "permite_prestamo": permite_prestamo,
                        "activo": activo,
                    },
                )
                agregados["estados"] += creado

            for nombre, descripcion, activo in UBICACIONES:
                _, creado = Ubicacion.objects.using(database).get_or_create(
                    nombre=nombre,
                    defaults={"descripcion": descripcion, "activo": activo},
                )
                agregados["ubicaciones"] += creado

            for role in ROLES:
                nombre = role["nombre"]
                _, creado = Rol.objects.using(database).get_or_create(
                    nombre=nombre,
                    defaults={
                        key: value
                        for key, value in role.items()
                        if key != "nombre"
                    },
                )
                agregados["roles"] += creado

        resumen = ", ".join(
            f"{nombre}={cantidad}" for nombre, cantidad in agregados.items()
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Cat\u00e1logos sincronizados; registros agregados: {resumen}. "
                "Los existentes se conservaron."
            )
        )
