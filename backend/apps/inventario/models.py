from django.conf import settings
from django.db import models, transaction


class TipoActivo(models.Model):
    nombre = models.CharField(max_length=100, unique=True)
    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)

    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tipos_activo"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class CategoriaActivo(models.Model):
    tipo_activo = models.ForeignKey(
        TipoActivo,
        on_delete=models.PROTECT,
        related_name="categorias"
    )

    nombre = models.CharField(max_length=100)

    prefijo_codigo = models.CharField(
        max_length=10,
        unique=True
    )

    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)

    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "categorias_activo"
        ordering = ["nombre"]

        constraints = [
            models.UniqueConstraint(
                fields=["tipo_activo", "nombre"],
                name="categoria_unica_por_tipo"
            )
        ]

    def __str__(self):
        return f"{self.tipo_activo.nombre} - {self.nombre}"


class EstadoActivo(models.Model):
    nombre = models.CharField(max_length=50, unique=True)
    descripcion = models.TextField(blank=True)

    permite_prestamo = models.BooleanField(default=False)
    activo = models.BooleanField(default=True)

    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "estados_activo"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Ubicacion(models.Model):
    nombre = models.CharField(max_length=100, unique=True)
    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)

    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ubicaciones"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Activo(models.Model):

    class ModalidadControl(models.TextChoices):
        INDIVIDUAL = "INDIVIDUAL", "Individual"
        CONJUNTO = "CONJUNTO", "Conjunto"

    codigo_interno = models.CharField(
        max_length=30,
        unique=True,
        editable=False
    )

    tipo_activo = models.ForeignKey(
        TipoActivo,
        on_delete=models.PROTECT,
        related_name="activos"
    )

    categoria = models.ForeignKey(
        CategoriaActivo,
        on_delete=models.PROTECT,
        related_name="activos"
    )

    modalidad_control = models.CharField(
        max_length=20,
        choices=ModalidadControl.choices,
        default=ModalidadControl.INDIVIDUAL
    )

    nombre = models.CharField(max_length=200)

    marca = models.CharField(
        max_length=100,
        blank=True
    )

    modelo = models.CharField(
        max_length=100,
        blank=True
    )

    serie_codigo = models.CharField(
        max_length=150,
        blank=True
    )

    fecha_adquisicion = models.DateField(
        null=True,
        blank=True
    )

    proveedor = models.CharField(
        max_length=200,
        blank=True
    )

    vida_util = models.CharField(
        max_length=100,
        blank=True
    )

    ubicacion = models.ForeignKey(
        Ubicacion,
        on_delete=models.PROTECT,
        related_name="activos"
    )

    estado = models.ForeignKey(
        EstadoActivo,
        on_delete=models.PROTECT,
        related_name="activos"
    )

    responsable = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="activos_responsable",
        null=True,
        blank=True
    )

    cuenta_con_manual = models.BooleanField(default=False)

    valor = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True
    )

    observaciones = models.TextField(blank=True)

    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_modificacion = models.DateTimeField(auto_now=True)

    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="activos_creados"
    )

    modificado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="activos_modificados"
    )

    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "activos"
        ordering = ["codigo_interno"]

    def save(self, *args, **kwargs):
        if self.codigo_interno:
            return super().save(*args, **kwargs)

        with transaction.atomic():
            categoria = CategoriaActivo.objects.select_for_update().get(
                pk=self.categoria_id
            )
            codigos = Activo.objects.filter(categoria=categoria).values_list(
                "codigo_interno",
                flat=True,
            )
            numeros = [
                int(sufijo)
                for codigo in codigos
                if (sufijo := codigo.rsplit("-", 1)[-1]).isdigit()
            ]

            self.codigo_interno = (
                f"{categoria.prefijo_codigo}-{max(numeros, default=0) + 1:03d}"
            )
            return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.codigo_interno} - {self.nombre}"