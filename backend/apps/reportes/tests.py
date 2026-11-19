from datetime import timedelta
from io import BytesIO

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import status
from rest_framework.test import APITestCase

from apps.inventario.models import (
    Activo,
    CategoriaActivo,
    EstadoActivo,
    TipoActivo,
    Ubicacion,
)
from apps.movimientos.models import DetallePrestamo, Prestamo
from apps.usuarios.models import Rol


class ReportesApiTests(APITestCase):
    def setUp(self):
        self.rol_admin, _ = Rol.objects.get_or_create(nombre="Administrador")
        self.rol_consulta, _ = Rol.objects.get_or_create(nombre="Consulta")
        self.admin = get_user_model().objects.create_user(
            username="admin-reportes",
            password="AdminPassword123!",
            rol=self.rol_admin,
        )
        self.tipo = TipoActivo.objects.create(nombre="Computador")
        self.categoria = CategoriaActivo.objects.create(
            tipo_activo=self.tipo,
            nombre="Portátil",
            prefijo_codigo="RPT",
        )
        self.estado = EstadoActivo.objects.create(nombre="Disponible")
        self.ubicacion = Ubicacion.objects.create(nombre="Oficina")
        self.activo = Activo.objects.create(
            tipo_activo=self.tipo,
            categoria=self.categoria,
            nombre="Equipo de reporte",
            ubicacion=self.ubicacion,
            estado=self.estado,
            creado_por=self.admin,
            modificado_por=self.admin,
        )
        self.client.force_authenticate(user=self.admin)

    def test_inventario_reporte_resume_y_filtra_activos(self):
        response = self.client.get(reverse("reporte-inventario"), {"q": "RPT-001"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["resumen"]["total"], 1)
        self.assertEqual(response.data["resultados"][0]["codigo"], "RPT-001")
        self.assertEqual(response.data["distribucion"]["estados"][0]["total"], 1)

    def test_reporte_de_vencimientos_incluye_activo_pendiente(self):
        prestamo = Prestamo.objects.create(
            nombre_receptor="Colaborador",
            documento_receptor="998877",
            fecha_devolucion_prevista=timezone.localdate() - timedelta(days=3),
            creado_por=self.admin,
        )
        estado_prestado = EstadoActivo.objects.create(nombre="Prestado")
        self.activo.estado = estado_prestado
        self.activo.save(update_fields=["estado"])
        DetallePrestamo.objects.create(
            prestamo=prestamo,
            activo=self.activo,
            estado_al_prestar=self.estado,
            ubicacion_al_prestar=self.ubicacion,
        )

        response = self.client.get(reverse("reporte-vencimientos"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["dias_vencido"], 3)
        self.assertEqual(response.data[0]["activos_pendientes"], "RPT-001")

    def test_exporta_a_excel_y_pdf(self):
        response_excel = self.client.get(
            reverse(
                "reporte-exportar",
                kwargs={"tipo": "inventario", "formato": "xlsx"},
            )
        )
        workbook = load_workbook(BytesIO(response_excel.content), read_only=True)
        filas = list(workbook.active.values)

        response_pdf = self.client.get(
            reverse(
                "reporte-exportar",
                kwargs={"tipo": "inventario", "formato": "pdf"},
            )
        )

        self.assertEqual(response_excel.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response_excel["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("Código", filas[1])
        self.assertEqual(response_pdf.status_code, status.HTTP_200_OK)
        self.assertEqual(response_pdf["Content-Type"], "application/pdf")
        self.assertTrue(response_pdf.content.startswith(b"%PDF-"))

    def test_requiere_permiso_de_reportes(self):
        self.rol_consulta.puede_ver_reportes = False
        self.rol_consulta.save(update_fields=["puede_ver_reportes"])
        usuario = get_user_model().objects.create_user(
            username="sin-reportes",
            password="UserPassword123!",
            rol=self.rol_consulta,
        )
        self.client.force_authenticate(user=usuario)

        response = self.client.get(reverse("reporte-inventario"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
