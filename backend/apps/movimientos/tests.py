import os
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
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
from apps.movimientos.models import (
    DetallePrestamo,
    ListaHerramientasPrestamo,
    Prestamo,
    SolicitudPrestamo,
)
from apps.movimientos.pdf import _buscar_libreoffice
from apps.usuarios.models import Rol


class BuscarLibreOfficeTests(SimpleTestCase):
    def test_detecta_instalacion_estandar_de_windows_fuera_del_path(self):
        with TemporaryDirectory() as program_files:
            ejecutable = (
                Path(program_files)
                / "LibreOffice"
                / "program"
                / "soffice.exe"
            )
            ejecutable.parent.mkdir(parents=True)
            ejecutable.touch()

            with (
                patch(
                    "apps.movimientos.pdf.sys",
                    SimpleNamespace(platform="win32"),
                ),
                patch.dict(
                    os.environ,
                    {
                        "ProgramFiles": program_files,
                        "ProgramFiles(x86)": "",
                    },
                    clear=True,
                ),
                patch(
                    "apps.movimientos.pdf.shutil.which",
                    return_value=None,
                ),
            ):
                self.assertEqual(_buscar_libreoffice(), str(ejecutable))


class PrestamoApiTests(APITestCase):
    def setUp(self):
        self.oys_generados = []
        self.convertidor_oys = patch(
            "apps.movimientos.pdf._convertir_excel_a_pdf",
            side_effect=self.convertir_oys_de_prueba,
        )
        self.convertidor_oys.start()
        self.addCleanup(self.convertidor_oys.stop)

        user_model = get_user_model()
        self.rol = Rol.objects.get(nombre="Administrador")
        self.usuario = user_model.objects.create_user(
            username="inventario",
            password="Password123!",
            rol=self.rol,
        )
        self.client.force_authenticate(user=self.usuario)

        self.tipo = TipoActivo.objects.create(nombre="Equipo")
        self.categoria = CategoriaActivo.objects.create(
            tipo_activo=self.tipo,
            nombre="Portátil",
            prefijo_codigo="POR",
        )
        self.disponible = EstadoActivo.objects.create(
            nombre="Disponible",
            permite_prestamo=True,
        )
        self.prestado = EstadoActivo.objects.create(
            nombre="En servicio",
            permite_prestamo=False,
        )
        self.prestado_legacy = EstadoActivo.objects.create(
            nombre="Prestado",
            permite_prestamo=False,
        )
        self.danado = EstadoActivo.objects.create(
            nombre="En reparación",
            permite_prestamo=False,
        )
        self.ubicacion = Ubicacion.objects.create(nombre="Bodega")
        self.otra_ubicacion = Ubicacion.objects.create(nombre="Taller")
        self.activo_1 = self.crear_activo("Portátil 1")
        self.activo_2 = self.crear_activo("Portátil 2")
        self.rol_tecnico = Rol.objects.create(
            nombre="Técnico de pruebas",
            puede_ver_inventario=True,
            puede_ver_movimientos=True,
        )
        self.rol_almacen = Rol.objects.create(
            nombre="Almacén de pruebas",
            puede_ver_inventario=False,
            puede_registrar_devoluciones=True,
            puede_revisar_solicitudes_prestamo=True,
        )
        self.tecnico = user_model.objects.create_user(
            username="tecnico",
            password="Password123!",
            rol=self.rol_tecnico,
        )
        self.almacenista = user_model.objects.create_user(
            username="almacenista",
            password="Password123!",
            first_name="Almacén",
            last_name="Pruebas",
            rol=self.rol_almacen,
        )

    def convertir_oys_de_prueba(self, archivo_excel, carpeta_salida):
        libro = load_workbook(archivo_excel)
        try:
            hoja = libro["LISTADO"]
            self.oys_generados.append({
                "hojas_visibles": [
                    item.title
                    for item in libro.worksheets
                    if item.sheet_state == "visible"
                ],
                "cliente": hoja["D5"].value,
                "solicitante": hoja["M5"].value,
                "consecutivo": hoja["D7"].value,
                "fecha_solicitud": hoja["M7"].value,
                "formato_fecha_solicitud": hoja["M7"].number_format,
                "formato_fecha_salida": hoja["D41"].number_format,
                "descripcion": hoja["B10"].value,
                "cantidad": hoja["N10"].value,
                "recibido": hoja["O10"].value,
                "retornado": hoja["P10"].value,
                "estado": hoja["Q10"].value,
                "observaciones": hoja["A46"].value,
                "entrega_salida": hoja["C43"].value,
                "recibe_salida": hoja["G43"].value,
                "fuente_recibe_salida": hoja["G43"].font.name,
                "fuente_entrega_salida": hoja["C43"].font.name,
                "fuente_recibe_coincide": all(
                    getattr(hoja["G43"].font, atributo)
                    == getattr(hoja["C43"].font, atributo)
                    for atributo in (
                        *hoja["G43"].font.__attrs__,
                        *hoja["G43"].font.__elements__,
                    )
                ),
                "borde_cliente": tuple(
                    getattr(hoja["M5"].border, lado).style
                    if getattr(hoja["M5"].border, lado)
                    else None
                    for lado in ("left", "right", "top", "bottom")
                ),
                "borde_observaciones": tuple(
                    getattr(hoja["A47"].border, lado).style
                    if getattr(hoja["A47"].border, lado)
                    else None
                    for lado in ("left", "right", "top", "bottom")
                ),
                "firma_salida": hoja["C44"].value,
                "area_impresion": str(hoja.print_area),
                "activo_fila_40": hoja["B40"].value,
                "observaciones_fila_47": hoja["A47"].value,
                "logo_preservado": bool(hoja._images) and all(
                    imagen.format == "png"
                    for imagen in hoja._images
                ),
            })
        finally:
            libro.close()

        archivo_pdf = Path(carpeta_salida) / f"{Path(archivo_excel).stem}.pdf"
        archivo_pdf.write_bytes(b"%PDF-1.4 test")
        return archivo_pdf

    def crear_activo(self, nombre):
        return Activo.objects.create(
            tipo_activo=self.tipo,
            categoria=self.categoria,
            nombre=nombre,
            ubicacion=self.ubicacion,
            estado=self.disponible,
            creado_por=self.usuario,
            modificado_por=self.usuario,
        )

    def crear_payload(self, activos=None):
        return {
            "cliente": "Cliente de prueba",
            "consecutivo": "OS-2001",
            "nombre_receptor": "Colaborador de prueba",
            "documento_receptor": "123456",
            "fecha_devolucion_prevista": (
                timezone.localdate() + timedelta(days=2)
            ).isoformat(),
            "observaciones": "",
            "activos": activos or [self.activo_1.pk, self.activo_2.pk],
        }

    def crear_payload_solicitud(self, activos=None, consecutivo="OS-1001"):
        return {
            "cliente": "Cliente de prueba",
            "consecutivo": consecutivo,
            "nombre_receptor": "Técnico de prueba",
            "documento_receptor": "654321",
            "fecha_devolucion_prevista": (
                timezone.localdate() + timedelta(days=2)
            ).isoformat(),
            "motivo": "Trabajo de mantenimiento en planta",
            "observaciones": "Usar en el turno de la mañana",
            "activos": activos or [self.activo_1.pk],
        }

    def test_almacen_administra_listas_y_solicitantes_solo_pueden_consultarlas(self):
        self.rol_almacen.puede_administrar_catalogos = True
        self.rol_almacen.save(update_fields=["puede_administrar_catalogos"])
        self.client.force_authenticate(user=self.almacenista)

        activos = self.client.get(reverse("lista-herramientas-activos"))
        self.assertEqual(activos.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {activo["id"] for activo in activos.data},
            {self.activo_1.pk, self.activo_2.pk},
        )
        self.assertEqual(activos.data[0]["categoria_nombre"], "Portátil")

        creada = self.client.post(
            reverse("lista-herramientas-list"),
            {
                "nombre": "Válvulas de seguridad",
                "activos": [self.activo_1.pk, self.activo_2.pk],
            },
            format="json",
        )
        self.assertEqual(creada.status_code, status.HTTP_201_CREATED)
        self.assertEqual(creada.data["activos"], [self.activo_1.pk, self.activo_2.pk])
        self.assertEqual(
            ListaHerramientasPrestamo.objects.get().creado_por,
            self.almacenista,
        )

        duplicada = self.client.post(
            reverse("lista-herramientas-list"),
            {
                "nombre": "válvulas de seguridad",
                "activos": [self.activo_1.pk],
            },
            format="json",
        )
        self.assertEqual(duplicada.status_code, status.HTTP_400_BAD_REQUEST)
        actualizada = self.client.patch(
            reverse("lista-herramientas-detail", args=[creada.data["id"]]),
            {
                "nombre": "Kit de válvulas actualizado",
                "activos": [self.activo_1.pk],
            },
            format="json",
        )
        self.assertEqual(actualizada.status_code, status.HTTP_200_OK)
        self.assertEqual(actualizada.data["activos"], [self.activo_1.pk])

        self.client.force_authenticate(user=self.tecnico)
        consulta = self.client.get(reverse("lista-herramientas-list"))
        self.assertEqual(consulta.status_code, status.HTTP_200_OK)
        self.assertEqual(consulta.data[0]["nombre"], "Kit de válvulas actualizado")
        self.assertEqual(
            self.client.get(reverse("lista-herramientas-activos")).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        no_autorizada = self.client.post(
            reverse("lista-herramientas-list"),
            {
                "nombre": "Otra lista",
                "activos": [self.activo_1.pk],
            },
            format="json",
        )
        self.assertEqual(no_autorizada.status_code, status.HTTP_403_FORBIDDEN)

    def revisar_solicitud(self, solicitud_id, ajustes=None):
        solicitud = SolicitudPrestamo.objects.get(pk=solicitud_id)
        ajustes = ajustes or {}
        detalles = []
        for activo in solicitud.activos.all():
            revision = {
                "condicion": "BUENO",
                "incluir_en_salida": True,
                "observacion": "",
            }
            revision.update(ajustes.get(activo.pk, {}))
            detalles.append({"activo_id": activo.pk, **revision})

        self.client.force_authenticate(user=self.almacenista)
        response = self.client.post(
            reverse("solicitud-prestamo-revisar", args=[solicitud_id]),
            {"detalles": detalles},
            format="json",
        )
        self.client.force_authenticate(user=self.usuario)
        return response

    def test_crea_prestamo_con_varios_activos_y_actualiza_estado(self):
        response = self.client.post(
            reverse("prestamo-list"),
            self.crear_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["total_activos"], 2)
        self.assertEqual(response.data["estado"], "Vigente")
        self.assertEqual(response.data["cliente"], "Cliente de prueba")
        self.assertEqual(response.data["consecutivo"], "OS-2001")
        self.activo_1.refresh_from_db()
        self.activo_2.refresh_from_db()
        self.assertEqual(self.activo_1.estado, self.prestado)
        self.assertEqual(self.activo_2.estado, self.prestado)

    def test_rechaza_consecutivo_duplicado_en_prestamos_sin_distinguir_mayusculas(self):
        self.client.post(
            reverse("prestamo-list"),
            self.crear_payload([self.activo_1.pk]),
            format="json",
        )

        payload = self.crear_payload([self.activo_2.pk])
        payload["consecutivo"] = "os-2001"
        response = self.client.post(
            reverse("prestamo-list"),
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("consecutivo", response.data)
        self.assertFalse(self.activo_2.historial_prestamos.exists())

    def test_exige_cliente_y_consecutivo_al_crear_prestamo(self):
        for campo in ("cliente", "consecutivo"):
            payload = self.crear_payload([self.activo_1.pk])
            payload.pop(campo)
            response = self.client.post(
                reverse("prestamo-list"),
                payload,
                format="json",
            )

            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn(campo, response.data)

    def test_no_presta_un_activo_que_ya_esta_prestado(self):
        self.client.post(
            reverse("prestamo-list"),
            self.crear_payload([self.activo_1.pk]),
            format="json",
        )

        response = self.client.post(
            reverse("prestamo-list"),
            self.crear_payload([self.activo_1.pk]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(1, self.activo_1.historial_prestamos.count())

    def test_reconoce_en_servicio_y_el_estado_heredado_prestado(self):
        self.activo_1.estado = self.prestado
        self.activo_1.save(update_fields=["estado"])
        self.activo_2.estado = self.prestado_legacy
        self.activo_2.save(update_fields=["estado"])

        resumen = self.client.get(reverse("levantamiento-activos-resumen"))
        disponibles = self.client.get(reverse("activos-disponibles"))

        self.assertEqual(resumen.data["prestados"], 2)
        self.assertEqual(disponibles.data, [])

    def test_usa_prestado_si_en_servicio_no_esta_activo(self):
        self.prestado.activo = False
        self.prestado.save(update_fields=["activo"])

        response = self.client.post(
            reverse("prestamo-list"),
            self.crear_payload([self.activo_1.pk]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.activo_1.refresh_from_db()
        self.assertEqual(self.activo_1.estado, self.prestado_legacy)

    def test_rechaza_fecha_prevista_en_el_pasado(self):
        payload = self.crear_payload([self.activo_1.pk])
        payload["fecha_devolucion_prevista"] = (
            timezone.localdate() - timedelta(days=1)
        ).isoformat()

        response = self.client.post(
            reverse("prestamo-list"),
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(self.activo_1.historial_prestamos.exists())

    def test_rechaza_fecha_prevista_igual_a_hoy(self):
        payload = self.crear_payload([self.activo_1.pk])
        payload["fecha_devolucion_prevista"] = timezone.localdate().isoformat()

        response = self.client.post(
            reverse("prestamo-list"),
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(self.activo_1.historial_prestamos.exists())

    def test_tecnico_crea_solicitud_sin_cambiar_el_inventario(self):
        self.client.force_authenticate(user=self.tecnico)

        response = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["estado"], SolicitudPrestamo.Estado.PENDIENTE)
        self.assertEqual(response.data["solicitante_usuario"], "tecnico")
        self.assertEqual(response.data["cliente"], "Cliente de prueba")
        self.assertEqual(response.data["consecutivo"], "OS-1001")
        self.assertEqual(len(response.data["activos"]), 1)
        self.assertEqual(response.data["activos"][0]["condicion"], "")
        self.assertEqual(SolicitudPrestamo.objects.count(), 1)
        self.assertFalse(self.activo_1.historial_prestamos.exists())
        self.activo_1.refresh_from_db()
        self.assertEqual(self.activo_1.estado, self.disponible)

    def test_tecnico_solo_consulta_sus_solicitudes(self):
        self.client.force_authenticate(user=self.tecnico)
        primera = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud([self.activo_1.pk]),
            format="json",
        )
        otro_tecnico = get_user_model().objects.create_user(
            username="otro-tecnico",
            rol=self.rol_tecnico,
        )
        self.client.force_authenticate(user=otro_tecnico)
        self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud(
                [self.activo_2.pk],
                consecutivo="OS-1002",
            ),
            format="json",
        )

        self.client.force_authenticate(user=self.tecnico)
        response = self.client.get(reverse("solicitud-prestamo-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in response.data], [primera.data["id"]])

    def test_administrador_aprueba_solicitud_y_registra_prestamo(self):
        self.client.force_authenticate(user=self.tecnico)
        solicitud = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud(),
            format="json",
        )
        revision = self.revisar_solicitud(solicitud.data["id"])
        self.assertEqual(revision.status_code, status.HTTP_200_OK)
        self.assertEqual(revision.data["estado"], SolicitudPrestamo.Estado.REVISADA)
        self.assertTrue(revision.data["formato_salida_disponible"])
        formato_previo = self.oys_generados[-1]
        self.assertIn("PREVISUALIZACIÓN", formato_previo["observaciones"])
        self.assertEqual(formato_previo["estado"], "Bueno")
        self.assertTrue(formato_previo["logo_preservado"])
        self.assertEqual(
            formato_previo["borde_cliente"],
            ("medium", "medium", "medium", "medium"),
        )
        self.assertEqual(
            formato_previo["borde_observaciones"],
            ("thin", None, None, "thin"),
        )
        self.assertEqual(formato_previo["formato_fecha_solicitud"], "yyyy-mm-dd")
        self.assertTrue(formato_previo["fuente_recibe_coincide"])

        response = self.client.post(
            reverse("solicitud-prestamo-aprobar", args=[solicitud.data["id"]]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["estado"], SolicitudPrestamo.Estado.APROBADA)
        self.assertIsNotNone(response.data["prestamo_id"])
        self.assertTrue(response.data["formato_salida_disponible"])
        self.assertFalse(response.data["formato_retorno_disponible"])
        self.assertEqual(Prestamo.objects.count(), 1)
        formato = SolicitudPrestamo.objects.get(
            pk=solicitud.data["id"],
        ).formato_salida_pdf
        self.assertTrue(bytes(formato).startswith(b"%PDF-"))
        formato_generado = self.oys_generados[-1]
        self.assertEqual(formato_generado["hojas_visibles"], ["LISTADO"])
        self.assertEqual(formato_generado["cliente"], "Cliente de prueba")
        self.assertEqual(formato_generado["solicitante"], "tecnico")
        self.assertEqual(formato_generado["consecutivo"], "OS-1001")
        self.assertEqual(
            formato_generado["descripcion"],
            f"{self.activo_1.codigo_interno} - Portátil 1",
        )
        self.assertEqual(formato_generado["cantidad"], 1)
        self.assertEqual(formato_generado["recibido"], 1)
        self.assertIsNone(formato_generado["retornado"])
        self.assertEqual(formato_generado["estado"], "Bueno")
        self.assertEqual(formato_generado["formato_fecha_salida"], "yyyy-mm-dd")
        self.assertIn("Motivo: Trabajo de mantenimiento", formato_generado["observaciones"])
        self.assertEqual(formato_generado["entrega_salida"], "inventario")
        self.assertEqual(formato_generado["recibe_salida"], "Técnico de prueba")
        self.assertFalse(formato_generado["firma_salida"])
        self.assertIn(
            "Trabajo de mantenimiento en planta",
            Prestamo.objects.get(pk=response.data["prestamo_id"]).observaciones,
        )
        prestamo = Prestamo.objects.get(pk=response.data["prestamo_id"])
        self.assertEqual(prestamo.cliente, "Cliente de prueba")
        self.assertEqual(prestamo.consecutivo, "OS-1001")
        self.activo_1.refresh_from_db()
        self.assertEqual(self.activo_1.estado, self.prestado)

    def test_activo_malo_bloquea_aprobacion_hasta_excluirlo(self):
        self.client.force_authenticate(user=self.tecnico)
        solicitud = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud([
                self.activo_1.pk,
                self.activo_2.pk,
            ]),
            format="json",
        )
        self.assertEqual(
            self.revisar_solicitud(
                solicitud.data["id"],
                ajustes={
                    self.activo_1.pk: {"condicion": "MALO"},
                },
            ).status_code,
            status.HTTP_200_OK,
        )

        bloqueada = self.client.post(
            reverse("solicitud-prestamo-aprobar", args=[solicitud.data["id"]]),
            {},
            format="json",
        )
        self.assertEqual(bloqueada.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Prestamo.objects.count(), 0)

        revision = self.revisar_solicitud(
            solicitud.data["id"],
            ajustes={
                self.activo_1.pk: {
                    "condicion": "MALO",
                    "incluir_en_salida": False,
                    "observacion": "Herramienta defectuosa",
                },
            },
        )
        self.assertEqual(revision.status_code, status.HTTP_200_OK)
        self.assertIn(
            "No se entrega",
            self.oys_generados[-1]["observaciones"],
        )
        aprobada = self.client.post(
            reverse("solicitud-prestamo-aprobar", args=[solicitud.data["id"]]),
            {},
            format="json",
        )

        self.assertEqual(aprobada.status_code, status.HTTP_200_OK)
        prestamo = Prestamo.objects.get(pk=aprobada.data["prestamo_id"])
        self.assertEqual(
            list(prestamo.detalles.values_list("activo_id", flat=True)),
            [self.activo_2.pk],
        )
        self.activo_1.refresh_from_db()
        self.assertEqual(self.activo_1.estado, self.disponible)

    def test_administrador_elimina_solicitud_y_restablece_activos_pendientes(self):
        self.client.force_authenticate(user=self.tecnico)
        solicitud = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud([
                self.activo_1.pk,
                self.activo_2.pk,
            ]),
            format="json",
        )
        self.assertEqual(
            self.revisar_solicitud(solicitud.data["id"]).status_code,
            status.HTTP_200_OK,
        )
        aprobacion = self.client.post(
            reverse("solicitud-prestamo-aprobar", args=[solicitud.data["id"]]),
            {},
            format="json",
        )
        prestamo_id = aprobacion.data["prestamo_id"]
        detalle = Prestamo.objects.get(pk=prestamo_id).detalles.get(
            activo=self.activo_1,
        )
        devolucion = self.client.post(
            reverse("prestamo-devolver", args=[prestamo_id]),
            {
                "detalles": [{
                    "detalle_id": detalle.pk,
                    "estado": self.danado.pk,
                    "ubicacion": self.otra_ubicacion.pk,
                    "condicion": "DANADO",
                }]
            },
            format="json",
        )
        self.assertEqual(devolucion.status_code, status.HTTP_200_OK)

        eliminacion = self.client.delete(
            reverse(
                "solicitud-prestamo-detail",
                args=[solicitud.data["id"]],
            ),
        )

        self.assertEqual(eliminacion.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            SolicitudPrestamo.objects.filter(
                pk=solicitud.data["id"],
            ).exists()
        )
        self.assertFalse(Prestamo.objects.filter(pk=prestamo_id).exists())
        self.assertFalse(
            DetallePrestamo.objects.filter(
                prestamo_id=prestamo_id,
            ).exists()
        )
        self.activo_1.refresh_from_db()
        self.activo_2.refresh_from_db()
        self.assertEqual(self.activo_1.estado, self.danado)
        self.assertEqual(self.activo_1.ubicacion, self.otra_ubicacion)
        self.assertEqual(self.activo_2.estado, self.disponible)
        self.assertEqual(self.activo_2.ubicacion, self.ubicacion)

    def test_administrador_elimina_prestamo_directo_y_restaura_activo(self):
        prestamo = self.client.post(
            reverse("prestamo-list"),
            self.crear_payload([self.activo_1.pk]),
            format="json",
        )

        eliminacion = self.client.delete(
            reverse("prestamo-detail", args=[prestamo.data["id"]]),
        )

        self.assertEqual(eliminacion.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Prestamo.objects.filter(pk=prestamo.data["id"]).exists())
        self.assertFalse(
            DetallePrestamo.objects.filter(prestamo_id=prestamo.data["id"]).exists()
        )
        self.activo_1.refresh_from_db()
        self.assertEqual(self.activo_1.estado, self.disponible)
        self.assertEqual(self.activo_1.ubicacion, self.ubicacion)

    def test_tecnico_no_puede_eliminar_solicitudes(self):
        self.client.force_authenticate(user=self.tecnico)
        solicitud = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud([self.activo_1.pk]),
            format="json",
        )

        eliminacion = self.client.delete(
            reverse(
                "solicitud-prestamo-detail",
                args=[solicitud.data["id"]],
            ),
        )

        self.assertEqual(eliminacion.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(SolicitudPrestamo.objects.filter(
            pk=solicitud.data["id"],
        ).exists())
        self.client.force_authenticate(user=self.usuario)
        eliminacion_admin = self.client.delete(
            reverse(
                "solicitud-prestamo-detail",
                args=[solicitud.data["id"]],
            ),
        )
        self.assertEqual(
            eliminacion_admin.status_code,
            status.HTTP_204_NO_CONTENT,
        )
        self.assertFalse(
            SolicitudPrestamo.objects.filter(
                pk=solicitud.data["id"],
            ).exists()
        )

    def test_almacen_no_puede_eliminar_solicitudes_ni_prestamos(self):
        self.client.force_authenticate(user=self.tecnico)
        solicitud = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud([self.activo_1.pk]),
            format="json",
        )
        self.client.force_authenticate(user=self.usuario)
        prestamo = self.client.post(
            reverse("prestamo-list"),
            self.crear_payload([self.activo_2.pk]),
            format="json",
        )
        self.assertEqual(solicitud.status_code, status.HTTP_201_CREATED)
        self.assertEqual(prestamo.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.almacenista)
        eliminar_solicitud = self.client.delete(
            reverse(
                "solicitud-prestamo-detail",
                args=[solicitud.data["id"]],
            ),
        )
        eliminar_prestamo = self.client.delete(
            reverse("prestamo-detail", args=[prestamo.data["id"]]),
        )

        self.assertEqual(eliminar_solicitud.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(eliminar_prestamo.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(
            SolicitudPrestamo.objects.filter(pk=solicitud.data["id"]).exists()
        )
        self.assertTrue(Prestamo.objects.filter(pk=prestamo.data["id"]).exists())

    def test_no_aprueba_si_el_activo_ya_no_esta_disponible(self):
        self.client.force_authenticate(user=self.tecnico)
        solicitud = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud(),
            format="json",
        )
        revision = self.revisar_solicitud(solicitud.data["id"])
        self.assertEqual(revision.status_code, status.HTTP_200_OK)
        self.client.post(
            reverse("prestamo-list"),
            self.crear_payload([self.activo_1.pk]),
            format="json",
        )

        response = self.client.post(
            reverse("solicitud-prestamo-aprobar", args=[solicitud.data["id"]]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Prestamo.objects.count(), 1)
        solicitud_db = SolicitudPrestamo.objects.get(pk=solicitud.data["id"])
        self.assertEqual(solicitud_db.estado, SolicitudPrestamo.Estado.REVISADA)
        self.assertIsNone(solicitud_db.prestamo)

    def test_tecnico_no_puede_aprobar_una_solicitud(self):
        solicitud = SolicitudPrestamo.objects.create(
            solicitante=self.tecnico,
            nombre_receptor="Técnico de prueba",
            documento_receptor="654321",
            fecha_devolucion_prevista=timezone.localdate() + timedelta(days=2),
            motivo="Mantenimiento",
        )
        solicitud.activos.add(self.activo_1)
        self.client.force_authenticate(user=self.tecnico)

        revision = self.client.post(
            reverse("solicitud-prestamo-revisar", args=[solicitud.pk]),
            {
                "detalles": [{
                    "activo_id": self.activo_1.pk,
                    "condicion": "BUENO",
                    "incluir_en_salida": True,
                }]
            },
            format="json",
        )
        response = self.client.post(
            reverse("solicitud-prestamo-aprobar", args=[solicitud.pk]),
            {},
            format="json",
        )

        self.assertEqual(revision.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudPrestamo.Estado.PENDIENTE)
        self.assertFalse(self.activo_1.historial_prestamos.exists())

    def test_administrador_rechaza_solicitud_con_motivo(self):
        solicitud = SolicitudPrestamo.objects.create(
            solicitante=self.tecnico,
            nombre_receptor="Técnico de prueba",
            documento_receptor="654321",
            fecha_devolucion_prevista=timezone.localdate() + timedelta(days=2),
            motivo="Mantenimiento",
        )
        solicitud.activos.add(self.activo_1)

        response = self.client.post(
            reverse("solicitud-prestamo-rechazar", args=[solicitud.pk]),
            {"observaciones_resolucion": "El activo está reservado."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["estado"], SolicitudPrestamo.Estado.RECHAZADA)
        self.assertEqual(
            response.data["observaciones_resolucion"],
            "El activo está reservado.",
        )
        self.assertFalse(self.activo_1.historial_prestamos.exists())

    def test_rechaza_consecutivo_duplicado_sin_importar_mayusculas(self):
        self.client.force_authenticate(user=self.tecnico)
        self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud([self.activo_1.pk]),
            format="json",
        )
        response = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud(
                [self.activo_2.pk],
                consecutivo="os-1001",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("consecutivo", response.data)

    def test_rol_inventario_consulta_y_devuelve_pero_no_crea_prestamos(self):
        rol_inventario, _ = Rol.objects.get_or_create(nombre="Inventario")
        rol_inventario.puede_ver_movimientos = True
        rol_inventario.save(update_fields=["puede_ver_movimientos"])
        prestamo_existente = self.client.post(
            reverse("prestamo-list"),
            self.crear_payload([self.activo_1.pk]),
            format="json",
        )
        usuario = get_user_model().objects.create_user(
            username="consulta-movimientos",
            rol=rol_inventario,
        )
        self.client.force_authenticate(user=usuario)

        lectura = self.client.get(reverse("prestamo-list"))
        creacion = self.client.post(
            reverse("prestamo-list"),
            self.crear_payload([self.activo_1.pk]),
            format="json",
        )
        devolucion = self.client.post(
            reverse(
                "prestamo-devolver",
                args=[prestamo_existente.data["id"]],
            ),
            {
                "detalles": [{
                    "detalle_id": prestamo_existente.data["detalles"][0]["id"],
                    "estado": self.disponible.pk,
                    "ubicacion": self.ubicacion.pk,
                    "condicion": "BUENO",
                }]
            },
            format="json",
        )
        eliminacion = self.client.delete(
            reverse("prestamo-detail", args=[prestamo_existente.data["id"]]),
        )

        self.assertEqual(lectura.status_code, status.HTTP_200_OK)
        self.assertEqual(creacion.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(devolucion.status_code, status.HTTP_200_OK)
        self.assertEqual(eliminacion.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.activo_1.historial_prestamos.count(), 1)

    def test_registra_devolucion_parcial_con_estado_y_ubicacion(self):
        prestamo_response = self.client.post(
            reverse("prestamo-list"),
            self.crear_payload(),
            format="json",
        )
        detalle_id = prestamo_response.data["detalles"][0]["id"]

        response = self.client.post(
            reverse("prestamo-devolver", args=[prestamo_response.data["id"]]),
            {
                "detalles": [{
                    "detalle_id": detalle_id,
                    "estado": self.danado.pk,
                    "ubicacion": self.otra_ubicacion.pk,
                    "condicion": "DANADO",
                    "observacion": "Requiere revisión",
                }]
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["estado"], "Parcial")
        self.assertEqual(response.data["activos_pendientes"], 1)
        self.activo_1.refresh_from_db()
        self.assertEqual(self.activo_1.estado, self.danado)
        self.assertEqual(self.activo_1.ubicacion, self.otra_ubicacion)

    def test_almacen_puede_registrar_devolucion_y_crear_pdf_de_retorno(self):
        self.client.force_authenticate(user=self.tecnico)
        solicitud = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud([
                self.activo_1.pk,
                self.activo_2.pk,
            ]),
            format="json",
        )
        self.assertEqual(
            self.revisar_solicitud(solicitud.data["id"]).status_code,
            status.HTTP_200_OK,
        )
        aprobacion = self.client.post(
            reverse("solicitud-prestamo-aprobar", args=[solicitud.data["id"]]),
            {},
            format="json",
        )
        prestamo_id = aprobacion.data["prestamo_id"]
        detalles_prestamo = Prestamo.objects.get(
            pk=prestamo_id,
        ).detalles.order_by("pk")
        detalle_id, detalle_pendiente_id = list(
            detalles_prestamo.values_list("pk", flat=True)
        )

        self.client.force_authenticate(user=self.almacenista)
        prestamos = self.client.get(reverse("prestamo-list"))
        respuesta = self.client.post(
            reverse("prestamo-devolver", args=[prestamo_id]),
            {
                "detalles": [{
                    "detalle_id": detalle_id,
                    "estado": self.disponible.pk,
                    "ubicacion": self.ubicacion.pk,
                    "condicion": "BUENO",
                    "observacion": "",
                }]
            },
            format="json",
        )

        self.assertEqual(prestamos.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        solicitud_db = SolicitudPrestamo.objects.get(pk=solicitud.data["id"])
        self.assertIsNone(solicitud_db.formato_retorno_pdf)
        respuesta_final = self.client.post(
            reverse("prestamo-devolver", args=[prestamo_id]),
            {
                "detalles": [{
                    "detalle_id": detalle_pendiente_id,
                    "estado": self.disponible.pk,
                    "ubicacion": self.ubicacion.pk,
                    "condicion": "BUENO",
                    "observacion": "",
                }]
            },
            format="json",
        )

        self.assertEqual(respuesta_final.status_code, status.HTTP_200_OK)
        self.assertTrue(respuesta_final.data["formato_retorno_disponible"])
        historial = self.client.get(reverse("prestamo-list"))
        prestamo_devuelto = next(
            item for item in historial.data if item["id"] == prestamo_id
        )
        self.assertEqual(prestamo_devuelto["estado"], "Devuelto")
        self.assertTrue(prestamo_devuelto["formato_retorno_disponible"])
        detalle = Prestamo.objects.get(
            pk=prestamo_id,
        ).detalles.get(pk=detalle_id)
        self.assertEqual(detalle.cantidad_recibida, 1)
        self.assertEqual(detalle.devolucion_registrada_por, self.almacenista)
        solicitud_db.refresh_from_db()
        self.assertTrue(bytes(solicitud_db.formato_retorno_pdf).startswith(b"%PDF-"))
        formato_retorno = self.oys_generados[-1]
        self.assertEqual(formato_retorno["retornado"], 1)
        self.assertEqual(formato_retorno["estado"], "Bueno")
        self.assertEqual(formato_retorno["recibe_salida"], "Técnico de prueba")
        descarga_prestamo = self.client.get(
            reverse("prestamo-formato-retorno", args=[prestamo_id]),
        )
        self.assertEqual(descarga_prestamo.status_code, status.HTTP_200_OK)
        self.assertTrue(descarga_prestamo.content.startswith(b"%PDF-"))
        otro_almacenista = get_user_model().objects.create_user(
            username="almacenista-sin-devolucion",
            rol=self.rol_almacen,
        )
        self.client.force_authenticate(user=otro_almacenista)
        descarga_ajena = self.client.get(
            reverse("prestamo-formato-retorno", args=[prestamo_id]),
        )
        self.assertEqual(descarga_ajena.status_code, status.HTTP_200_OK)
        self.assertTrue(descarga_ajena.content.startswith(b"%PDF-"))
        sin_permiso = get_user_model().objects.create_user(
            username="usuario-sin-permiso-devolucion",
        )
        self.client.force_authenticate(user=sin_permiso)
        descarga_sin_permiso = self.client.get(
            reverse("prestamo-formato-retorno", args=[prestamo_id]),
        )
        self.assertEqual(descarga_sin_permiso.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(user=self.tecnico)
        self.assertTrue(
            self.client.get(reverse(
                "solicitud-prestamo-formato-salida",
                args=[solicitud.data["id"]],
            )).content.startswith(b"%PDF-")
        )
        descarga_retorno = self.client.get(reverse(
            "solicitud-prestamo-formato-retorno",
            args=[solicitud.data["id"]],
        ))
        self.assertEqual(descarga_retorno.status_code, status.HTTP_200_OK)
        self.assertTrue(descarga_retorno.content.startswith(b"%PDF-"))

    def test_solicitud_con_mas_de_30_activos_extiende_la_plantilla(self):
        activos = [self.activo_1, self.activo_2]
        activos.extend(
            self.crear_activo(f"Portátil adicional {indice}")
            for indice in range(29)
        )
        self.client.force_authenticate(user=self.tecnico)
        solicitud = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud(
                [activo.pk for activo in activos],
            ),
            format="json",
        )
        revision = self.revisar_solicitud(solicitud.data["id"])
        self.assertEqual(revision.status_code, status.HTTP_200_OK)

        respuesta = self.client.post(
            reverse("solicitud-prestamo-aprobar", args=[solicitud.data["id"]]),
            {},
            format="json",
        )

        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        formato = self.oys_generados[-1]
        self.assertEqual(
            formato["activo_fila_40"],
            f"{activos[30].codigo_interno} - {activos[30].nombre}",
        )
        self.assertIn("Q$48", formato["area_impresion"])

    def test_almacen_no_puede_aprobar_solicitudes_ni_crear_prestamos(self):
        self.client.force_authenticate(user=self.tecnico)
        solicitud = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud([self.activo_1.pk]),
            format="json",
        )
        self.client.force_authenticate(user=self.almacenista)

        solicitudes = self.client.get(reverse("solicitud-prestamo-list"))
        solicitud_nueva = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud(
                [self.activo_2.pk],
                consecutivo="OS-1002",
            ),
            format="json",
        )
        aprobacion = self.client.post(
            reverse("solicitud-prestamo-aprobar", args=[solicitud.data["id"]]),
            {},
            format="json",
        )
        prestamo = self.client.post(
            reverse("prestamo-list"),
            self.crear_payload([self.activo_2.pk]),
            format="json",
        )

        self.assertEqual(solicitudes.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in solicitudes.data], [solicitud.data["id"]])
        self.assertEqual(solicitud_nueva.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(aprobacion.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(prestamo.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(self.activo_2.historial_prestamos.exists())

    def test_permiso_de_aprobacion_habilita_aprobar_pero_no_eliminar(self):
        self.client.force_authenticate(user=self.tecnico)
        solicitud = self.client.post(
            reverse("solicitud-prestamo-list"),
            self.crear_payload_solicitud([self.activo_1.pk]),
            format="json",
        )
        revision = self.revisar_solicitud(solicitud.data["id"])
        self.assertEqual(revision.status_code, status.HTTP_200_OK)

        rol_aprobador = Rol.objects.create(
            nombre="Aprobador de pruebas",
            puede_aprobar_solicitudes_prestamo=True,
        )
        aprobador = get_user_model().objects.create_user(
            username="aprobador",
            rol=rol_aprobador,
        )
        self.client.force_authenticate(user=aprobador)
        solicitudes = self.client.get(reverse("solicitud-prestamo-list"))
        aprobacion = self.client.post(
            reverse(
                "solicitud-prestamo-aprobar",
                args=[solicitud.data["id"]],
            ),
            {},
            format="json",
        )
        eliminacion = self.client.delete(
            reverse(
                "solicitud-prestamo-detail",
                args=[solicitud.data["id"]],
            ),
        )

        self.assertEqual(solicitudes.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in solicitudes.data], [solicitud.data["id"]])
        self.assertEqual(aprobacion.status_code, status.HTTP_200_OK)
        self.assertEqual(eliminacion.status_code, status.HTTP_403_FORBIDDEN)

    def test_almacen_consulta_solo_catalogos_necesarios_para_devolucion(self):
        self.client.force_authenticate(user=self.almacenista)

        estados = self.client.get(reverse("levantamiento-estados"))
        ubicaciones = self.client.get(reverse("levantamiento-ubicaciones"))
        inventario = self.client.get(reverse("levantamiento-crear-activo"))

        self.assertEqual(estados.status_code, status.HTTP_200_OK)
        self.assertEqual(ubicaciones.status_code, status.HTTP_200_OK)
        self.assertEqual(inventario.status_code, status.HTTP_403_FORBIDDEN)

    def test_no_permite_devolver_un_activo_al_estado_en_servicio(self):
        prestamo_response = self.client.post(
            reverse("prestamo-list"),
            self.crear_payload([self.activo_1.pk]),
            format="json",
        )
        detalle_id = prestamo_response.data["detalles"][0]["id"]

        response = self.client.post(
            reverse("prestamo-devolver", args=[prestamo_response.data["id"]]),
            {
                "detalles": [{
                    "detalle_id": detalle_id,
                    "estado": self.prestado.pk,
                    "ubicacion": self.ubicacion.pk,
                    "condicion": "BUENO",
                    "observacion": "",
                }]
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.activo_1.refresh_from_db()
        self.assertEqual(self.activo_1.estado, self.prestado)
