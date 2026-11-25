from django.contrib.auth import authenticate, get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Rol


User = get_user_model()


class AdministracionUsuariosTests(APITestCase):
    def setUp(self):
        self.rol_admin, _ = Rol.objects.get_or_create(nombre="Administrador")
        self.rol_inventario, _ = Rol.objects.get_or_create(nombre="Inventario")
        self.admin = User.objects.create_user(
            username="admin-api",
            password="AdminPassword123!",
            documento="87654321",
            rol=self.rol_admin,
        )
        self.usuario = User.objects.create_user(
            username="consulta-api",
            password="UserPassword123!",
            documento="12345678",
            rol=self.rol_inventario,
        )

    def test_admin_crea_usuario_y_contrasena_es_guardada_con_hash(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            reverse("usuario-list"),
            {
                "username": "nuevo-usuario",
                "first_name": "Nuevo",
                "last_name": "Usuario",
                "documento": "23456789",
                "rol": self.rol_inventario.pk,
                "password": "xY7#sP4!uQ9",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        nuevo_usuario = User.objects.get(username="nuevo-usuario")
        self.assertTrue(nuevo_usuario.check_password("xY7#sP4!uQ9"))
        self.assertNotIn("password", response.data)
        self.assertEqual(
            authenticate(username="nuevo-usuario", password="xY7#sP4!uQ9"),
            nuevo_usuario,
        )

    def test_admin_actualiza_permisos_de_rol(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse("rol-detail", args=[self.rol_inventario.pk]),
            {
                "puede_ver_movimientos": True,
                "puede_ver_reportes": True,
                "puede_registrar_devoluciones": True,
                "puede_revisar_solicitudes_prestamo": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.rol_inventario.refresh_from_db()
        self.assertTrue(self.rol_inventario.puede_ver_movimientos)
        self.assertTrue(self.rol_inventario.puede_ver_reportes)
        self.assertTrue(self.rol_inventario.puede_registrar_devoluciones)
        self.assertTrue(self.rol_inventario.puede_revisar_solicitudes_prestamo)

    def test_rol_inventario_recibe_permisos_operativos_sin_administrar_usuarios(self):
        self.rol_inventario.refresh_from_db()

        self.assertTrue(self.rol_inventario.puede_modificar_inventario)
        self.assertTrue(self.rol_inventario.puede_administrar_catalogos)
        self.assertTrue(self.rol_inventario.puede_registrar_devoluciones)
        self.assertTrue(self.rol_inventario.puede_revisar_solicitudes_prestamo)
        self.assertTrue(self.rol_inventario.puede_aprobar_solicitudes_prestamo)
        self.assertFalse(self.rol_inventario.puede_ver_reportes)

        self.client.force_authenticate(user=self.usuario)
        usuarios = self.client.get(reverse("usuario-list"))
        roles = self.client.get(reverse("rol-list"))

        self.assertEqual(usuarios.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(roles.status_code, status.HTTP_403_FORBIDDEN)

    def test_usuario_no_administrador_no_puede_administrar_usuarios_ni_roles(self):
        self.client.force_authenticate(user=self.usuario)

        usuarios = self.client.get(reverse("usuario-list"))
        roles = self.client.patch(
            reverse("rol-detail", args=[self.rol_inventario.pk]),
            {"puede_ver_reportes": True},
            format="json",
        )

        self.assertEqual(usuarios.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(roles.status_code, status.HTTP_403_FORBIDDEN)

    def test_perfil_expone_solo_permisos_del_rol_y_admin(self):
        self.rol_inventario.puede_ver_movimientos = True
        self.rol_inventario.save(update_fields=["puede_ver_movimientos"])
        self.client.force_authenticate(user=self.usuario)

        response = self.client.get(reverse("perfil-usuario"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["es_administrador"])
        self.assertEqual(response.data["documento"], "12345678")
        self.assertTrue(response.data["permisos"]["puede_ver_movimientos"])
        self.assertFalse(response.data["permisos"]["puede_ver_reportes"])
        self.assertTrue(
            response.data["permisos"]["puede_registrar_devoluciones"]
        )
        self.assertTrue(response.data["permisos"]["puede_modificar_inventario"])
        self.assertTrue(response.data["permisos"]["puede_administrar_catalogos"])
        self.assertTrue(
            response.data["permisos"]["puede_revisar_solicitudes_prestamo"]
        )
        self.assertTrue(
            response.data["permisos"]["puede_aprobar_solicitudes_prestamo"]
        )

    def test_perfil_expone_permiso_de_devolucion_y_admin_lo_conserva(self):
        self.rol_inventario.puede_registrar_devoluciones = True
        self.rol_inventario.save(update_fields=["puede_registrar_devoluciones"])
        self.client.force_authenticate(user=self.usuario)

        respuesta_almacen = self.client.get(reverse("perfil-usuario"))
        self.assertTrue(
            respuesta_almacen.data["permisos"]["puede_registrar_devoluciones"]
        )

        self.client.force_authenticate(user=self.admin)
        respuesta_admin = self.client.get(reverse("perfil-usuario"))
        self.assertTrue(
            respuesta_admin.data["permisos"]["puede_registrar_devoluciones"]
        )
        self.assertTrue(
            respuesta_admin.data["permisos"]["puede_revisar_solicitudes_prestamo"]
        )

    def test_perfil_expone_permiso_de_revision_de_solicitudes(self):
        self.rol_inventario.puede_revisar_solicitudes_prestamo = True
        self.rol_inventario.save(
            update_fields=["puede_revisar_solicitudes_prestamo"]
        )
        self.client.force_authenticate(user=self.usuario)

        respuesta = self.client.get(reverse("perfil-usuario"))

        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertTrue(
            respuesta.data["permisos"]["puede_revisar_solicitudes_prestamo"]
        )

    def test_rol_inventario_limita_a_un_superusuario_en_la_aplicacion(self):
        usuario = User.objects.create_superuser(
            username="almacen-superusuario",
            password="AdminPassword123!",
            rol=self.rol_inventario,
        )
        self.client.force_authenticate(user=usuario)

        perfil = self.client.get(reverse("perfil-usuario"))
        usuarios = self.client.get(reverse("usuario-list"))

        self.assertEqual(perfil.status_code, status.HTTP_200_OK)
        self.assertFalse(perfil.data["es_administrador"])
        self.assertEqual(usuarios.status_code, status.HTTP_403_FORBIDDEN)

    def test_administrador_no_puede_quitarse_sus_permisos(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse("usuario-detail", args=[self.admin.pk]),
            {"rol": self.rol_inventario.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
