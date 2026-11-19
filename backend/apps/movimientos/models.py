from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from apps.inventario.models import Activo, EstadoActivo, Ubicacion


class Prestamo(models.Model):
    cliente = models.CharField(max_length=150, blank=True, default="")
    consecutivo = models.CharField(max_length=50, blank=True, default="")
    nombre_receptor = models.CharField(max_length=150)
    documento_receptor = models.CharField(max_length=30)
    fecha_devolucion_prevista = models.DateField()
    observaciones = models.TextField(blank=True)
    fecha_prestamo = models.DateTimeField(auto_now_add=True)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="prestamos_creados",
    )

    class Meta:
        db_table = "prestamos"
        ordering = ["-fecha_prestamo", "-id"]
        constraints = [
            models.UniqueConstraint(
                Lower("consecutivo"),
                condition=~Q(consecutivo=""),
                name="prestamo_consecutivo_ci_uniq",
            )
        ]

    def __str__(self):
        return f"Préstamo {self.pk} - {self.nombre_receptor}"


class SolicitudPrestamo(models.Model):
    class Estado(models.TextChoices):
        PENDIENTE = "PENDIENTE", "Pendiente"
        REVISADA = "REVISADA", "Revisada"
        APROBADA = "APROBADA", "Aprobada"
        RECHAZADA = "RECHAZADA", "Rechazada"

    solicitante = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="solicitudes_prestamo",
    )
    cliente = models.CharField(max_length=150, blank=True, default="")
    consecutivo = models.CharField(max_length=50, blank=True, default="")
    nombre_receptor = models.CharField(max_length=150)
    documento_receptor = models.CharField(max_length=30)
    fecha_devolucion_prevista = models.DateField()
    motivo = models.TextField()
    observaciones = models.TextField(blank=True)
    activos = models.ManyToManyField(
        Activo,
        related_name="solicitudes_prestamo",
    )
    estado = models.CharField(
        max_length=10,
        choices=Estado.choices,
        default=Estado.PENDIENTE,
    )
    fecha_solicitud = models.DateTimeField(auto_now_add=True)
    resuelto_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="solicitudes_prestamo_resueltas",
        null=True,
        blank=True,
    )
    fecha_resolucion = models.DateTimeField(null=True, blank=True)
    observaciones_resolucion = models.TextField(blank=True)
    revisado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="solicitudes_prestamo_revisadas",
        null=True,
        blank=True,
    )
    fecha_revision = models.DateTimeField(null=True, blank=True)
    prestamo = models.OneToOneField(
        Prestamo,
        on_delete=models.PROTECT,
        related_name="solicitud",
        null=True,
        blank=True,
    )
    formato_salida_pdf = models.BinaryField(null=True, blank=True)
    formato_retorno_pdf = models.BinaryField(null=True, blank=True)

    class Meta:
        db_table = "solicitudes_prestamo"
        ordering = ["-fecha_solicitud", "-id"]
        constraints = [
            models.UniqueConstraint(
                Lower("consecutivo"),
                condition=~Q(consecutivo=""),
                name="solicitud_consecutivo_ci_uniq",
            )
        ]

    def __str__(self):
        return f"Solicitud {self.pk} - {self.nombre_receptor}"


class ListaHerramientasPrestamo(models.Model):
    nombre = models.CharField(max_length=100)
    activos = models.ManyToManyField(
        Activo,
        related_name="listas_herramientas_prestamo",
    )
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="listas_herramientas_prestamo_creadas",
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "listas_herramientas_prestamo"
        ordering = ["nombre", "pk"]
        constraints = [
            models.UniqueConstraint(
                Lower("nombre"),
                name="lista_herramientas_nombre_ci_uniq",
            )
        ]

    def __str__(self):
        return self.nombre


class RevisionActivoSolicitud(models.Model):
    class Condicion(models.TextChoices):
        BUENO = "BUENO", "Bueno"
        MALO = "MALO", "Malo"

    solicitud = models.ForeignKey(
        SolicitudPrestamo,
        on_delete=models.CASCADE,
        related_name="revision_activos",
    )
    activo = models.ForeignKey(
        Activo,
        on_delete=models.PROTECT,
        related_name="revisiones_solicitud_prestamo",
    )
    condicion = models.CharField(
        max_length=5,
        choices=Condicion.choices,
        blank=True,
    )
    observacion = models.TextField(blank=True)
    incluir_en_salida = models.BooleanField(default=True)

    class Meta:
        db_table = "revisiones_activos_solicitud_prestamo"
        ordering = ["activo__codigo_interno", "pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["solicitud", "activo"],
                name="activo_unico_revision_solicitud",
            )
        ]


class DetallePrestamo(models.Model):
    class CondicionDevolucion(models.TextChoices):
        BUENO = "BUENO", "Bueno"
        CON_NOVEDAD = "CON_NOVEDAD", "Con novedad"
        DANADO = "DANADO", "Dañado"

    prestamo = models.ForeignKey(
        Prestamo,
        on_delete=models.PROTECT,
        related_name="detalles",
    )
    activo = models.ForeignKey(
        Activo,
        on_delete=models.PROTECT,
        related_name="historial_prestamos",
    )
    estado_al_prestar = models.ForeignKey(
        EstadoActivo,
        on_delete=models.PROTECT,
        related_name="detalles_prestamo_origen",
    )
    ubicacion_al_prestar = models.ForeignKey(
        Ubicacion,
        on_delete=models.PROTECT,
        related_name="detalles_prestamo_origen",
    )
    fecha_devolucion = models.DateTimeField(null=True, blank=True)
    estado_devolucion = models.ForeignKey(
        EstadoActivo,
        on_delete=models.PROTECT,
        related_name="detalles_prestamo_devolucion",
        null=True,
        blank=True,
    )
    ubicacion_devolucion = models.ForeignKey(
        Ubicacion,
        on_delete=models.PROTECT,
        related_name="detalles_prestamo_devolucion",
        null=True,
        blank=True,
    )
    condicion_devolucion = models.CharField(
        max_length=20,
        choices=CondicionDevolucion.choices,
        blank=True,
    )
    observacion_devolucion = models.TextField(blank=True)
    cantidad_recibida = models.PositiveSmallIntegerField(null=True, blank=True)
    devolucion_registrada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="devoluciones_registradas",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "detalles_prestamo"
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["prestamo", "activo"],
                name="activo_unico_por_prestamo",
            )
        ]
        indexes = [
            models.Index(
                fields=["activo", "fecha_devolucion"],
                name="prestamo_activo_abierto_idx",
            )
        ]

    def __str__(self):
        return f"{self.prestamo_id} - {self.activo.codigo_interno}"
