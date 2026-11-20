from datetime import date, timedelta
from io import BytesIO
import os
from pathlib import Path
from tempfile import NamedTemporaryFile, TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from openpyxl import Workbook, load_workbook
from openpyxl.utils.units import pixels_to_EMU
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from apps.inventario.models import (
    Activo,
    CategoriaActivo,
    EstadoActivo,
    TipoActivo,
    Ubicacion,
)
from apps.movimientos.models import DetallePrestamo, Prestamo, SolicitudPrestamo
from apps.usuarios.models import Rol
from apps.levantamiento.services.hoja_vida_excel import (
    _dimensiones_campo_foto,
)
from apps.levantamiento.services.importador_excel import validar_excel

User = get_user_model()


class ApiAutenticacionTests(APITestCase):
    client_class = APIClient

    def setUp(self):
        cache.clear()
        rol_consulta, _ = Rol.objects.get_or_create(nombre="Consulta")
        self.user = User.objects.create_user(
            username="usuario",
            password="Password123!",
            first_name="Usuario",
            last_name="Prueba",
            rol=rol_consulta,
        )

    def test_inicio_sesion_jwt_devuelve_tokens(self):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "usuario", "password": "Password123!"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.json())
        self.assertIn("refresh", response.json())

    def test_usuario_dado_de_baja_no_puede_iniciar_sesion(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "usuario", "password": "Password123!"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_usuario_levantamiento_solo_expone_datos_minimos_de_activos(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get(reverse("levantamiento-usuarios"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(),
            [{"id": self.user.id, "nombre_completo": "Usuario Prueba"}],
        )

    def test_login_se_limita_a_cinco_intentos_por_minuto(self):
        for _ in range(5):
            response = self.client.post(
                reverse("token_obtain_pair"),
                {"username": "usuario", "password": "incorrecta"},
                content_type="application/json",
            )
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "usuario", "password": "incorrecta"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_token_invalido_no_autentica(self):
        response = self.client.post(
            reverse("token_refresh"),
            {"refresh": "token-invalido"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_expirado_no_autentica(self):
        refresh = RefreshToken.for_user(self.user)
        refresh.set_exp(lifetime=timedelta(days=-1))

        response = self.client.post(
            reverse("token_refresh"),
            {"refresh": str(refresh)},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_acceso_sin_autenticacion_rechazado(self):
        response = self.client.get(reverse("levantamiento-tipos"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_health_check_publico_retorna_estado_ok(self):
        response = self.client.get(reverse("health-check"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {"status": "ok"})

    @override_settings(SECURE_SSL_REDIRECT=True)
    def test_health_check_no_redirige_a_https_con_redirect_activo(self):
        response = self.client.get(reverse("health-check"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("Location", response)

    def test_usuario_autenticado_no_admin_no_accede_al_panel_admin(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)

    def test_refresh_rotates_y_bloquea_refresh_anterior(self):
        refresh = RefreshToken.for_user(self.user)
        old_refresh = str(refresh)

        response = self.client.post(
            reverse("token_refresh"),
            {"refresh": old_refresh},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.json())
        self.assertIn("refresh", response.json())
        self.assertNotEqual(response.json()["refresh"], old_refresh)
        with self.assertRaises(TokenError):
            RefreshToken(old_refresh).check_blacklist()

    def test_logout_bloquea_refresh_token(self):
        refresh = RefreshToken.for_user(self.user)

        response = self.client.post(
            reverse("token_blacklist"),
            {"refresh": str(refresh)},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        with self.assertRaises(TokenError):
            refresh.check_blacklist()


class InventarioTests(APITestCase):
    client_class = APIClient

    def setUp(self):
        self.rol_inventario, _ = Rol.objects.get_or_create(nombre="Administrador")
        self.user = User.objects.create_user(
            username="responsable",
            password="Password123!",
            first_name="Responsable",
            last_name="Inventario",
            rol=self.rol_inventario,
        )
        self.tipo = TipoActivo.objects.create(
            nombre="Computador",
            descripcion="Equipo informático",
        )
        self.categoria = CategoriaActivo.objects.create(
            tipo_activo=self.tipo,
            nombre="Portátil",
            prefijo_codigo="PC",
        )
        self.estado = EstadoActivo.objects.create(
            nombre="Disponible",
            descripcion="Disponible para uso",
        )
        self.ubicacion = Ubicacion.objects.create(
            nombre="Oficina Central",
        )
        self.client.force_authenticate(user=self.user)

    def test_usuarios_devuelve_solo_id_y_nombre_y_excluye_inactivos(self):
        self.user.documento = "DOCUMENTO-PRIVADO"
        self.user.cargo = "Cargo privado"
        self.user.area = "Área privada"
        self.user.save(update_fields=["documento", "cargo", "area"])
        usuario_inactivo = User.objects.create_user(
            username="usuario-inactivo",
            first_name="Usuario",
            last_name="Inactivo",
            is_active=False,
            documento="DOCUMENTO-INACTIVO",
            cargo="Cargo privado",
            area="Área privada",
        )
        response = self.client.get(reverse("levantamiento-usuarios"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usuarios = response.json()
        self.assertTrue(all(set(usuario) == {"id", "nombre_completo"} for usuario in usuarios))
        self.assertNotIn(usuario_inactivo.id, [usuario["id"] for usuario in usuarios])
        self.assertIn(
            {"id": self.user.id, "nombre_completo": "Responsable Inventario"},
            usuarios,
        )
        self.assertNotIn("DOCUMENTO-PRIVADO", response.content.decode())
        self.assertNotIn("Cargo privado", response.content.decode())
        self.assertNotIn("Área privada", response.content.decode())

    def test_usuario_sin_rol_de_inventario_puede_leer_pero_no_crear(self):
        rol_consulta, _ = Rol.objects.get_or_create(nombre="Consulta")
        usuario_consulta = User.objects.create_user(
            username="consulta",
            rol=rol_consulta,
        )
        self.client.force_authenticate(user=usuario_consulta)

        lectura = self.client.get(reverse("levantamiento-crear-activo"))
        creacion = self.client.post(
            reverse("levantamiento-crear-activo"),
            {},
            content_type="application/json",
        )

        self.assertEqual(lectura.status_code, status.HTTP_200_OK)
        self.assertEqual(creacion.status_code, status.HTTP_403_FORBIDDEN)

    def test_rol_inventario_puede_editar_y_desactivar_activos(self):
        rol_inventario, _ = Rol.objects.get_or_create(nombre="Inventario")
        usuario = User.objects.create_user(
            username="inventario-operativo",
            rol=rol_inventario,
        )
        self.client.force_authenticate(user=usuario)
        activo = Activo.objects.create(
            codigo_interno="PC-001",
            tipo_activo=self.tipo,
            categoria=self.categoria,
            nombre="Activo original",
            ubicacion=self.ubicacion,
            estado=self.estado,
            creado_por=self.user,
            modificado_por=self.user,
        )

        lectura = self.client.get(reverse("levantamiento-crear-activo"))
        actualizacion = self.client.patch(
            reverse("levantamiento-detalle-activo", args=[activo.pk]),
            {"nombre": "Activo actualizado"},
            content_type="application/json",
        )
        desactivacion = self.client.patch(
            reverse("levantamiento-detalle-activo", args=[activo.pk]),
            {"activo": False},
            content_type="application/json",
        )

        self.assertEqual(lectura.status_code, status.HTTP_200_OK)
        self.assertEqual(actualizacion.status_code, status.HTTP_200_OK)
        self.assertEqual(actualizacion.data["nombre"], "Activo actualizado")
        self.assertEqual(desactivacion.status_code, status.HTTP_200_OK)
        activo.refresh_from_db()
        self.assertFalse(activo.activo)
        self.assertEqual(activo.modificado_por, usuario)

    def test_rol_inventario_administra_catalogos_sin_acceso_a_roles(self):
        rol_inventario, _ = Rol.objects.get_or_create(nombre="Inventario")
        usuario = User.objects.create_user(
            username="inventario-catalogos",
            rol=rol_inventario,
        )
        self.client.force_authenticate(user=usuario)

        catalogos = self.client.get(reverse("configuracion-tipo-list"))
        actualizacion = self.client.patch(
            reverse("configuracion-tipo-detail", args=[self.tipo.pk]),
            {"descripcion": "Actualizado por Inventario"},
            content_type="application/json",
        )
        roles = self.client.get(reverse("rol-list"))

        self.assertEqual(catalogos.status_code, status.HTTP_200_OK)
        self.assertEqual(actualizacion.status_code, status.HTTP_200_OK)
        self.assertEqual(
            actualizacion.data["descripcion"],
            "Actualizado por Inventario",
        )
        self.assertEqual(roles.status_code, status.HTTP_403_FORBIDDEN)

    def test_crear_y_leer_activo(self):
        create_response = self.client.post(
            reverse("levantamiento-crear-activo"),
            self._payload_activo(
                nombre="Laptop de prueba",
                marca="Marca Test",
                modelo="Modelo Test",
                serie_codigo="SERIE-001",
                fecha_adquisicion="2026-10-06",
                proveedor="Proveedor Test",
                vida_util="5 años",
                responsable=self.user.id,
                cuenta_con_manual=True,
                valor="1500.00",
                observaciones="Activo creado para prueba",
            ),
            content_type="application/json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        activo = Activo.objects.get(pk=create_response.json()["id"])
        self.assertEqual(activo.codigo_interno, "PC-001")
        self.assertEqual(activo.creado_por, self.user)
        self.assertEqual(activo.modificado_por, self.user)

        list_response = self.client.get(reverse("levantamiento-tipos"))

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            any(item["nombre"] == "Computador" for item in list_response.json())
        )

    def test_crea_activo_con_foto_y_la_entrega_solo_a_usuarios_autorizados(self):
        imagen_buffer = BytesIO()
        Image.new("RGB", (4, 4), color="green").save(imagen_buffer, format="PNG")
        imagen_bytes = imagen_buffer.getvalue()
        imagen_buffer.close()

        with TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                respuesta = self.client.post(
                    reverse("levantamiento-crear-activo"),
                    {
                        **self._payload_activo(),
                        "activo": True,
                        "foto": SimpleUploadedFile(
                            "activo.png",
                            imagen_bytes,
                            content_type="image/png",
                        ),
                    },
                    format="multipart",
                )

                self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
                self.assertEqual(
                    respuesta.data["foto_url"].split("?")[0],
                    f"/levantamiento/activos/{respuesta.data['id']}/foto/",
                )
                activo = Activo.objects.get(pk=respuesta.data["id"])
                self.assertTrue(activo.activo)
                self.assertTrue(activo.foto.name.startswith("activos/"))

                foto = self.client.get(
                    reverse("levantamiento-activo-foto", args=[activo.pk]),
                )
                self.assertEqual(foto.status_code, status.HTTP_200_OK)
                self.assertEqual(foto["Content-Type"], "image/png")
                contenido_foto = b"".join(foto.streaming_content)
                self.assertEqual(contenido_foto, imagen_bytes)

                hoja_vida = self.client.get(
                    reverse("levantamiento-hoja-vida-activo", args=[activo.pk]),
                )
                self.assertEqual(hoja_vida.status_code, status.HTTP_200_OK)
                libro = load_workbook(
                    BytesIO(b"".join(hoja_vida.streaming_content)),
                )
                hoja = libro["HOJA DE VIDA EQUIPOS"]
                self.assertEqual(len(hoja._images), 2)
                self.assertEqual(
                    libro.sheetnames,
                    ["HOJA DE VIDA EQUIPOS"],
                )
                foto = next(
                    imagen
                    for imagen in hoja._images
                    if imagen.anchor._from.col == 14
                )
                plantilla = load_workbook(
                    Path(__file__).resolve().parent
                    / "plantillas"
                    / "OYS-FO-11 HOJA DE VIDA MAQUINAS.xlsx",
                )
                hoja_plantilla = plantilla["HOJA DE VIDA EQUIPOS"]
                ancho_campo, alto_campo = _dimensiones_campo_foto(
                    hoja_plantilla,
                )
                self.assertEqual((foto.width, foto.height), (4, 4))
                self.assertEqual(foto.anchor._from.col, 14)
                self.assertEqual(foto.anchor._from.row, 5)
                self.assertEqual(
                    foto.anchor._from.colOff,
                    pixels_to_EMU((ancho_campo - foto.width) // 2),
                )
                self.assertEqual(
                    foto.anchor._from.rowOff,
                    pixels_to_EMU((alto_campo - foto.height) // 2),
                )
                self.assertEqual(
                    {
                        columna: dimension.width
                        for columna, dimension in hoja.column_dimensions.items()
                    },
                    {
                        columna: dimension.width
                        for columna, dimension in hoja_plantilla.column_dimensions.items()
                    },
                )
                self.assertEqual(
                    {
                        fila: dimension.height
                        for fila, dimension in hoja.row_dimensions.items()
                    },
                    {
                        fila: dimension.height
                        for fila, dimension in hoja_plantilla.row_dimensions.items()
                    },
                )
                plantilla.close()
                libro.close()

                ruta_foto = activo.foto.path
                eliminacion = self.client.patch(
                    reverse("levantamiento-detalle-activo", args=[activo.pk]),
                    {"foto": None},
                    content_type="application/json",
                )
                self.assertEqual(eliminacion.status_code, status.HTTP_200_OK)
                self.assertIsNone(eliminacion.data["foto_url"])
                self.assertFalse(os.path.exists(ruta_foto))

                self.client.force_authenticate(user=None)
                no_autorizada = self.client.get(
                    reverse("levantamiento-activo-foto", args=[activo.pk]),
                )
                self.assertEqual(
                    no_autorizada.status_code,
                    status.HTTP_401_UNAUTHORIZED,
                )

    def test_descarga_hoja_de_vida_oys_fo_11_con_datos_del_activo(self):
        activo = Activo.objects.create(
            codigo_interno="PC-001",
            tipo_activo=self.tipo,
            categoria=self.categoria,
            nombre="Equipo de prueba",
            marca="Marca",
            modelo="Modelo",
            serie_codigo="SERIE-001",
            proveedor="Proveedor",
            vida_util="5 años",
            ubicacion=self.ubicacion,
            estado=self.estado,
            cuenta_con_manual=True,
            valor="1250000.00",
            observaciones="Observación de prueba",
            creado_por=self.user,
            modificado_por=self.user,
        )

        respuesta = self.client.get(
            reverse("levantamiento-hoja-vida-activo", args=[activo.pk]),
        )

        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertIn("OYS-FO-11-PC-001.xlsx", respuesta["Content-Disposition"])
        contenido = b"".join(respuesta.streaming_content)
        libro = load_workbook(BytesIO(contenido), data_only=True)
        hoja = libro["HOJA DE VIDA EQUIPOS"]
        self.assertEqual(hoja["F5"].value, "Equipo de prueba")
        self.assertEqual(hoja["F6"].value, "Marca")
        self.assertEqual(hoja["F12"].value, "Oficina Central")
        self.assertEqual(hoja["F13"].value, "SI")
        self.assertEqual(libro.sheetnames, ["HOJA DE VIDA EQUIPOS"])
        libro.close()

    def test_hoja_vida_redimensiona_foto_grande_sin_recortarla(self):
        imagen_buffer = BytesIO()
        Image.new("RGB", (1200, 900), color="green").save(
            imagen_buffer,
            format="PNG",
        )

        with TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                activo = Activo.objects.create(
                    codigo_interno="PC-002",
                    tipo_activo=self.tipo,
                    categoria=self.categoria,
                    nombre="Equipo con foto grande",
                    ubicacion=self.ubicacion,
                    estado=self.estado,
                    creado_por=self.user,
                    modificado_por=self.user,
                    foto=SimpleUploadedFile(
                        "foto-grande.png",
                        imagen_buffer.getvalue(),
                        content_type="image/png",
                    ),
                )

                respuesta = self.client.get(
                    reverse(
                        "levantamiento-hoja-vida-activo",
                        args=[activo.pk],
                    ),
                )

        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        libro = load_workbook(
            BytesIO(b"".join(respuesta.streaming_content)),
            data_only=True,
        )
        hoja = libro["HOJA DE VIDA EQUIPOS"]
        foto = next(
            imagen
            for imagen in hoja._images
            if imagen.anchor._from.col == 14
        )
        ancho_campo, alto_campo = _dimensiones_campo_foto(hoja)
        self.assertLessEqual(foto.width, ancho_campo)
        self.assertLessEqual(foto.height, alto_campo)
        self.assertAlmostEqual(foto.width / foto.height, 4 / 3, places=2)
        libro.close()

    def test_elimina_permanentemente_activo_sin_historial(self):
        activo = Activo.objects.create(
            codigo_interno="PC-001",
            tipo_activo=self.tipo,
            categoria=self.categoria,
            nombre="Equipo para eliminar",
            ubicacion=self.ubicacion,
            estado=self.estado,
            creado_por=self.user,
            modificado_por=self.user,
        )

        respuesta = self.client.delete(
            reverse("levantamiento-detalle-activo", args=[activo.pk]),
        )

        self.assertEqual(respuesta.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Activo.objects.filter(pk=activo.pk).exists())

    def test_no_elimina_activo_con_historial_de_prestamo(self):
        activo = Activo.objects.create(
            codigo_interno="PC-001",
            tipo_activo=self.tipo,
            categoria=self.categoria,
            nombre="Equipo prestado",
            ubicacion=self.ubicacion,
            estado=self.estado,
            creado_por=self.user,
            modificado_por=self.user,
        )
        prestamo = Prestamo.objects.create(
            nombre_receptor="Persona de prueba",
            documento_receptor="123",
            fecha_devolucion_prevista=date(2030, 1, 1),
            creado_por=self.user,
        )
        DetallePrestamo.objects.create(
            prestamo=prestamo,
            activo=activo,
            estado_al_prestar=self.estado,
            ubicacion_al_prestar=self.ubicacion,
        )

        respuesta = self.client.delete(
            reverse("levantamiento-detalle-activo", args=[activo.pk]),
        )

        self.assertEqual(respuesta.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("movimientos o historial", respuesta.data["detail"])
        self.assertTrue(Activo.objects.filter(pk=activo.pk).exists())

    def test_no_elimina_activo_incluido_en_solicitud_pendiente(self):
        activo = Activo.objects.create(
            codigo_interno="PC-001",
            tipo_activo=self.tipo,
            categoria=self.categoria,
            nombre="Equipo solicitado",
            ubicacion=self.ubicacion,
            estado=self.estado,
            creado_por=self.user,
            modificado_por=self.user,
        )
        solicitud = SolicitudPrestamo.objects.create(
            solicitante=self.user,
            nombre_receptor="Persona solicitante",
            documento_receptor="123",
            fecha_devolucion_prevista=date(2030, 1, 1),
            motivo="Uso de prueba",
        )
        solicitud.activos.add(activo)

        respuesta = self.client.delete(
            reverse("levantamiento-detalle-activo", args=[activo.pk]),
        )

        self.assertEqual(respuesta.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("solicitudes", respuesta.data["detail"])
        self.assertTrue(Activo.objects.filter(pk=activo.pk).exists())

    def _payload_activo(self, **overrides):
        payload = {
            "tipo_activo": self.tipo.id,
            "categoria": self.categoria.id,
            "modalidad_control": "INDIVIDUAL",
            "nombre": "Activo de prueba",
            "ubicacion": self.ubicacion.id,
            "estado": self.estado.id,
        }
        payload.update(overrides)
        return payload

    def test_creacion_acepta_fecha_de_adquisicion_vacia(self):
        response = self.client.post(
            reverse("levantamiento-crear-activo"),
            self._payload_activo(fecha_adquisicion=None),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        activo = Activo.objects.get(pk=response.json()["id"])
        self.assertIsNone(activo.fecha_adquisicion)

    def test_codigo_numerico_siguiente_a_pc_999_es_pc_1000(self):
        Activo.objects.create(
            codigo_interno="PC-999",
            tipo_activo=self.tipo,
            categoria=self.categoria,
            nombre="Activo anterior",
            ubicacion=self.ubicacion,
            estado=self.estado,
            creado_por=self.user,
            modificado_por=self.user,
        )

        response = self.client.post(
            reverse("levantamiento-crear-activo"),
            self._payload_activo(),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["codigo_interno"], "PC-1000")

    def test_validacion_de_campos_obligatorios(self):
        response = self.client.post(
            reverse("levantamiento-crear-activo"),
            {
                "tipo_activo": self.tipo.id,
                "categoria": self.categoria.id,
                "modalidad_control": "INDIVIDUAL",
                "nombre": "",
                "ubicacion": self.ubicacion.id,
                "estado": self.estado.id,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("nombre", response.json())

    def test_listado_activos_usa_paginacion_de_25_y_nombres_relacionados(self):
        for numero in range(26):
            Activo.objects.create(
                codigo_interno=f"PC-{numero + 1:03d}",
                tipo_activo=self.tipo,
                categoria=self.categoria,
                nombre=f"Activo {numero + 1}",
                ubicacion=self.ubicacion,
                estado=self.estado,
                creado_por=self.user,
                modificado_por=self.user,
            )

        response = self.client.get(reverse("levantamiento-crear-activo"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["count"], 26)
        self.assertEqual(len(response.json()["results"]), 25)
        self.assertIsNotNone(response.json()["next"])
        self.assertEqual(
            response.json()["results"][0]["tipo_activo_nombre"],
            "Computador",
        )
        self.assertEqual(
            response.json()["results"][0]["categoria_nombre"],
            "Portátil",
        )

    def test_resumen_dashboard_cuenta_activos_por_estado(self):
        estado_prestado = EstadoActivo.objects.create(nombre="Prestado")
        estado_obsoleto = EstadoActivo.objects.create(nombre="Obsoleto")
        for codigo, estado in (
            ("PC-001", self.estado),
            ("PC-002", self.estado),
            ("PC-003", estado_prestado),
            ("PC-004", estado_obsoleto),
        ):
            Activo.objects.create(
                codigo_interno=codigo,
                tipo_activo=self.tipo,
                categoria=self.categoria,
                nombre=codigo,
                ubicacion=self.ubicacion,
                estado=estado,
                creado_por=self.user,
                modificado_por=self.user,
            )

        response = self.client.get(
            reverse("levantamiento-activos-resumen")
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(),
            {
                "total": 4,
                "disponibles": 2,
                "prestados": 1,
                "obsoletos": 1,
            },
        )


class ConfiguracionCatalogosTests(APITestCase):
    def setUp(self):
        self.rol_administrador, _ = Rol.objects.get_or_create(
            nombre="Administrador"
        )
        self.admin = User.objects.create_user(
            username="admin-config",
            password="Password123!",
            rol=self.rol_administrador,
        )
        self.client.force_authenticate(user=self.admin)

    def test_administrador_crea_edita_y_desactiva_tipo(self):
        response = self.client.post(
            reverse("configuracion-tipo-list"),
            {"nombre": "Mobiliario", "descripcion": "Muebles", "activo": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        tipo_id = response.json()["id"]

        update = self.client.patch(
            reverse("configuracion-tipo-detail", args=[tipo_id]),
            {"activo": False},
            format="json",
        )

        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertFalse(update.json()["activo"])
        self.assertEqual(self.client.delete(
            reverse("configuracion-tipo-detail", args=[tipo_id])
        ).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(
            self.client.get(reverse("levantamiento-tipos")).json(),
            [],
        )

    def test_administrador_asigna_categoria_a_tipo(self):
        tipo = TipoActivo.objects.create(nombre="Instrumentos")

        response = self.client.post(
            reverse("configuracion-categoria-list"),
            {
                "tipo_activo": tipo.id,
                "nombre": "Medición",
                "prefijo_codigo": "MED",
                "descripcion": "Instrumentos de medición",
                "activo": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["tipo_activo"], tipo.id)
        self.assertEqual(response.json()["tipo_activo_nombre"], "Instrumentos")

    def test_usuario_sin_permiso_de_catalogos_no_puede_modificarlos(self):
        rol_sin_permisos, _ = Rol.objects.get_or_create(nombre="Consulta")
        usuario = User.objects.create_user(
            username="consulta-config",
            password="Password123!",
            rol=rol_sin_permisos,
        )
        self.client.force_authenticate(user=usuario)

        response = self.client.post(
            reverse("configuracion-estado-list"),
            {"nombre": "Disponible", "permite_prestamo": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_catalogos_requieren_autenticacion(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(reverse("configuracion-ubicacion-list"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ImportadorExcelTests(TestCase):
    client_class = APIClient

    def setUp(self):
        self.tipo = TipoActivo.objects.create(
            nombre="Computador",
        )
        self.categoria = CategoriaActivo.objects.create(
            tipo_activo=self.tipo,
            nombre="Portátil",
            prefijo_codigo="PC",
        )
        self.estado = EstadoActivo.objects.create(
            nombre="Disponible",
        )
        self.ubicacion = Ubicacion.objects.create(
            nombre="Oficina Central",
        )
        self.usuario = User.objects.create_user(
            username="responsable",
            password="Password123!",
        )

    def _crear_archivo_excel(self, valido):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "Activos"
        worksheet.append([
            "TIPO_ACTIVO",
            "CATEGORIA",
            "MODALIDAD",
            "NOMBRE",
            "MARCA",
            "MODELO",
            "SERIE_CODIGO",
            "FECHA_ADQUISICION",
            "PROVEEDOR",
            "VIDA_UTIL",
            "UBICACION",
            "ESTADO",
            "RESPONSABLE",
            "CUENTA_CON_MANUAL",
            "VALOR",
            "OBSERVACIONES",
        ])

        if valido:
            worksheet.append([
                "Computador",
                "Portátil",
                "Individual",
                "Laptop válida",
                "Marca válida",
                "Modelo válido",
                "SERIE-VALIDA",
                date(2026, 10, 6),
                "Proveedor válido",
                "5 años",
                "Oficina Central",
                "Disponible",
                "responsable",
                "Sí",
                "1500",
                "Activo válido",
            ])
        else:
            worksheet.append([
                "Computador",
                "",
                "Individual",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
            ])

        archivo = NamedTemporaryFile(suffix=".xlsx", delete=False)
        try:
            ruta_archivo = archivo.name
        finally:
            archivo.close()

        try:
            workbook.save(ruta_archivo)
        except Exception:
            os.remove(ruta_archivo)
            raise
        finally:
            workbook.close()
        return ruta_archivo

    def test_importacion_excel_valida(self):
        ruta_archivo = self._crear_archivo_excel(valido=True)

        try:
            resultado = validar_excel(ruta_archivo)
        finally:
            os.remove(ruta_archivo)

        self.assertTrue(resultado["valido"], resultado["errores"])
        self.assertEqual(resultado["filas_correctas"], 1)
        self.assertEqual(len(resultado["datos_validos"]), 1)
        self.assertEqual(resultado["datos_validos"][0]["nombre"], "Laptop válida")

    def test_importacion_excel_invalida(self):
        ruta_archivo = self._crear_archivo_excel(valido=False)

        try:
            resultado = validar_excel(ruta_archivo)
        finally:
            os.remove(ruta_archivo)

        self.assertFalse(resultado["valido"])
        self.assertEqual(resultado["filas_con_error"], 1)
        self.assertIn("CATEGORIA es obligatoria.", resultado["errores"][0]["mensajes"])
        self.assertIn("NOMBRE es obligatorio.", resultado["errores"][0]["mensajes"])
