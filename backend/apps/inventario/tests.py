from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.inventario.models import (
    CategoriaActivo,
    EstadoActivo,
    TipoActivo,
    Ubicacion,
)
from apps.usuarios.models import Rol


class ImportarCatalogosLocalesTests(TestCase):
    def test_importa_faltantes_y_conserva_registros_existentes(self):
        tipo_existente = TipoActivo.objects.create(
            nombre="Equipo",
            descripcion="Descripcion de produccion",
            activo=False,
        )

        call_command("importar_catalogos_locales", stdout=StringIO())

        tipo_existente.refresh_from_db()
        self.assertEqual(tipo_existente.descripcion, "Descripcion de produccion")
        self.assertFalse(tipo_existente.activo)
        self.assertTrue(
            CategoriaActivo.objects.filter(
                tipo_activo__nombre="Equipo de instrumentaci\u00f3n",
                nombre="Celda de carga",
                prefijo_codigo="CEC",
            ).exists()
        )
        self.assertTrue(
            EstadoActivo.objects.filter(
                nombre="Disponible",
                permite_prestamo=True,
            ).exists()
        )
        self.assertTrue(Ubicacion.objects.filter(nombre="Almac\u00e9n").exists())
        self.assertTrue(
            Rol.objects.filter(
                nombre="Tecnico",
                puede_ver_movimientos=True,
            ).exists()
        )

    def test_la_importacion_es_idempotente(self):
        call_command("importar_catalogos_locales", stdout=StringIO())
        call_command("importar_catalogos_locales", stdout=StringIO())

        self.assertEqual(TipoActivo.objects.count(), 6)
        self.assertEqual(CategoriaActivo.objects.count(), 4)
        self.assertEqual(EstadoActivo.objects.count(), 6)
        self.assertEqual(Ubicacion.objects.count(), 2)
        self.assertEqual(Rol.objects.filter(nombre="Tecnico").count(), 1)

    def test_conflicto_de_prefijo_aborta_sin_importacion_parcial(self):
        tipo = TipoActivo.objects.create(nombre="Equipo de instrumentaci\u00f3n")
        CategoriaActivo.objects.create(
            tipo_activo=tipo,
            nombre="Otra categoria",
            prefijo_codigo="CEC",
        )

        with self.assertRaisesRegex(CommandError, "CEC"):
            call_command("importar_catalogos_locales", stdout=StringIO())

        self.assertFalse(TipoActivo.objects.filter(nombre="Equipo").exists())
        self.assertEqual(EstadoActivo.objects.count(), 0)
        self.assertEqual(Ubicacion.objects.count(), 0)
