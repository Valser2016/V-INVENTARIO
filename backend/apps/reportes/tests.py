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
from apps.movimientos.models import DetallePrestamo, Prestamo, SolicitudPrestamo
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

    def test_reporte_prestamos_usa_numero_visible_de_solicitud(self):
        fecha_prevista = timezone.localdate() + timedelta(days=5)
        solicitud_eliminada = SolicitudPrestamo.objects.create(
            solicitante=self.admin,
            nombre_receptor="Solicitud eliminada",
            documento_receptor="111111",
            fecha_devolucion_prevista=fecha_prevista,
            motivo="Solicitud de prueba que se eliminará",
        )
        prestamo = Prestamo.objects.create(
            nombre_receptor="Colaborador",
            documento_receptor="998877",
            fecha_devolucion_prevista=fecha_prevista,
            creado_por=self.admin,
        )
        solicitud_actual = SolicitudPrestamo.objects.create(
            solicitante=self.admin,
            nombre_receptor=prestamo.nombre_receptor,
            documento_receptor=prestamo.documento_receptor,
            fecha_devolucion_prevista=fecha_prevista,
            motivo="Solicitud actual",
            estado=SolicitudPrestamo.Estado.APROBADA,
            prestamo=prestamo,
        )
        solicitud_eliminada.delete()

        response = self.client.get(reverse("reporte-prestamos"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(solicitud_actual.pk, 1)
        fila = next(
            fila for fila in response.data
            if fila["id"] == prestamo.pk
        )
        self.assertEqual(fila["numero_solicitud"], 1)

    def test_reporte_prestamos_permite_descargar_pdfs_de_salida_y_devolucion(self):
        fecha_prevista = timezone.localdate() + timedelta(days=5)
        prestamo = Prestamo.objects.create(
            nombre_receptor="Colaborador",
            documento_receptor="998877",
            fecha_devolucion_prevista=fecha_prevista,
            creado_por=self.admin,
        )
        SolicitudPrestamo.objects.create(
            solicitante=self.admin,
            consecutivo="OS-PRUEBA-09",
            nombre_receptor=prestamo.nombre_receptor,
            documento_receptor=prestamo.documento_receptor,
            fecha_devolucion_prevista=fecha_prevista,
            motivo="Prueba de descarga",
            estado=SolicitudPrestamo.Estado.APROBADA,
            prestamo=prestamo,
            formato_salida_pdf=b"%PDF-prueba",
            formato_retorno_pdf=b"%PDF-devolucion",
        )
        prestamo_sin_pdf = Prestamo.objects.create(
            nombre_receptor="Sin formato",
            documento_receptor="112233",
            fecha_devolucion_prevista=fecha_prevista,
            creado_por=self.admin,
        )

        self.rol_consulta.puede_ver_reportes = True
        self.rol_consulta.save(update_fields=["puede_ver_reportes"])
        usuario_reportes = get_user_model().objects.create_user(
            username="usuario-reportes",
            password="UserPassword123!",
            rol=self.rol_consulta,
        )
        self.client.force_authenticate(user=usuario_reportes)

        reporte = self.client.get(reverse("reporte-prestamos"))
        formatos = {
            fila["id"]: (
                fila["formato_salida_disponible"],
                fila["formato_retorno_disponible"],
            )
            for fila in reporte.data
        }
        self.assertEqual(reporte.status_code, status.HTTP_200_OK)
        self.assertEqual(formatos[prestamo.pk], (True, True))
        self.assertEqual(formatos[prestamo_sin_pdf.pk], (False, False))

        descarga = self.client.get(
            reverse(
                "reporte-prestamo-listado-herramientas",
                kwargs={"pk": prestamo.pk},
            )
        )
        self.assertEqual(descarga.status_code, status.HTTP_200_OK)
        self.assertEqual(descarga["Content-Type"], "application/pdf")
        self.assertEqual(descarga.content, b"%PDF-prueba")

        descarga_retorno = self.client.get(
            reverse(
                "reporte-prestamo-formato-retorno",
                kwargs={"pk": prestamo.pk},
            )
        )
        self.assertEqual(descarga_retorno.status_code, status.HTTP_200_OK)
        self.assertEqual(descarga_retorno["Content-Type"], "application/pdf")
        self.assertEqual(
            descarga_retorno["Content-Disposition"],
            'attachment; filename="OYS-FO-09-os-prueba-09-retorno.pdf"',
        )
        self.assertEqual(descarga_retorno.content, b"%PDF-devolucion")

        no_disponible = self.client.get(
            reverse(
                "reporte-prestamo-listado-herramientas",
                kwargs={"pk": prestamo_sin_pdf.pk},
            )
        )
        self.assertEqual(no_disponible.status_code, status.HTTP_404_NOT_FOUND)

        retorno_no_disponible = self.client.get(
            reverse(
                "reporte-prestamo-formato-retorno",
                kwargs={"pk": prestamo_sin_pdf.pk},
            )
        )
        self.assertEqual(
            retorno_no_disponible.status_code,
            status.HTTP_404_NOT_FOUND,
        )

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
