from django.contrib.auth.models import AbstractUser
from django.db import models


class Rol(models.Model):
    nombre = models.CharField(max_length=50, unique=True)
    descripcion = models.TextField(blank=True)
    puede_ver_inventario = models.BooleanField(default=True)
    puede_modificar_inventario = models.BooleanField(default=False)
    puede_administrar_catalogos = models.BooleanField(default=False)
    puede_ver_movimientos = models.BooleanField(default=False)
    puede_ver_reportes = models.BooleanField(default=False)
    puede_registrar_devoluciones = models.BooleanField(default=False)
    puede_revisar_solicitudes_prestamo = models.BooleanField(default=False)
    puede_aprobar_solicitudes_prestamo = models.BooleanField(default=False)
    activo = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "roles"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Usuario(AbstractUser):
    documento = models.CharField(
        max_length=30,
        unique=True,
        null=True,
        blank=True
    )

    telefono = models.CharField(
        max_length=30,
        blank=True
    )

    cargo = models.CharField(
        max_length=100,
        blank=True
    )

    area = models.CharField(
        max_length=100,
        blank=True
    )

    rol = models.ForeignKey(
        Rol,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="usuarios"
    )

    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_modificacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "usuarios"
        ordering = ["last_name", "first_name"]

    def __str__(self):
        nombre = f"{self.first_name} {self.last_name}".strip()
        return nombre or self.username