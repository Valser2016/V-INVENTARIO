from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.inventario.estados import (
    es_estado_prestado,
    filtro_estado_prestado,
    obtener_estado_prestado,
)
from apps.inventario.models import Activo, EstadoActivo, Ubicacion

from .models import (
    ConsumiblePrestamo,
    ConsumibleSolicitud,
    DetallePrestamo,
    ListaHerramientasPrestamo,
    Prestamo,
    RevisionActivoSolicitud,
    SolicitudPrestamo,
)


class ActivoPrestamoSerializer(serializers.ModelSerializer):
    estado_nombre = serializers.CharField(source="estado.nombre", read_only=True)
    ubicacion_nombre = serializers.CharField(source="ubicacion.nombre", read_only=True)
    tipo_activo_id = serializers.IntegerField(read_only=True)
    tipo_activo_nombre = serializers.CharField(
        source="tipo_activo.nombre",
        read_only=True,
    )
    categoria_id = serializers.IntegerField(read_only=True)
    categoria_nombre = serializers.CharField(
        source="categoria.nombre",
        read_only=True,
    )
    ubicacion_id = serializers.IntegerField(read_only=True)
    activo = serializers.BooleanField(read_only=True)

    class Meta:
        model = Activo
        fields = [
            "id",
            "codigo_interno",
            "nombre",
            "tipo_activo_id",
            "tipo_activo_nombre",
            "categoria_id",
            "categoria_nombre",
            "ubicacion_id",
            "estado_nombre",
            "ubicacion_nombre",
            "activo",
        ]


class ListaHerramientasPrestamoSerializer(serializers.ModelSerializer):
    activos = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Activo.objects.all(),
    )

    class Meta:
        model = ListaHerramientasPrestamo
        fields = ["id", "nombre", "activos", "creado_por", "fecha_creacion"]
        read_only_fields = ["id", "creado_por", "fecha_creacion"]

    def validate_nombre(self, value):
        nombre = value.strip()
        if not nombre:
            raise serializers.ValidationError(
                "Indica el nombre de la lista."
            )
        existentes = ListaHerramientasPrestamo.objects.filter(
            nombre__iexact=nombre,
        )
        if self.instance:
            existentes = existentes.exclude(pk=self.instance.pk)
        if existentes.exists():
            raise serializers.ValidationError(
                "Ya existe una lista con ese nombre."
            )
        return nombre

    def validate_activos(self, activos):
        if not activos:
            raise serializers.ValidationError(
                "Selecciona al menos una herramienta para la lista."
            )
        ids = [activo.pk for activo in activos]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError(
                "No puedes incluir la misma herramienta más de una vez."
            )
        return activos


class DetallePrestamoSerializer(serializers.ModelSerializer):
    activo_id = serializers.IntegerField(read_only=True)
    codigo_interno = serializers.CharField(source="activo.codigo_interno", read_only=True)
    nombre_activo = serializers.CharField(source="activo.nombre", read_only=True)
    ubicacion_al_prestar = serializers.IntegerField(
        source="ubicacion_al_prestar_id",
        read_only=True,
    )
    estado_devolucion_nombre = serializers.CharField(
        source="estado_devolucion.nombre",
        read_only=True,
        allow_null=True,
    )
    ubicacion_devolucion_nombre = serializers.CharField(
        source="ubicacion_devolucion.nombre",
        read_only=True,
        allow_null=True,
    )
    condicion_devolucion_display = serializers.CharField(
        source="get_condicion_devolucion_display",
        read_only=True,
    )
    devolucion_registrada_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = DetallePrestamo
        fields = [
            "id",
            "activo_id",
            "codigo_interno",
            "nombre_activo",
            "ubicacion_al_prestar",
            "fecha_devolucion",
            "estado_devolucion",
            "estado_devolucion_nombre",
            "ubicacion_devolucion",
            "ubicacion_devolucion_nombre",
            "condicion_devolucion",
            "condicion_devolucion_display",
            "observacion_devolucion",
            "cantidad_recibida",
            "devolucion_registrada_por_nombre",
        ]

    def get_devolucion_registrada_por_nombre(self, obj):
        if not obj.devolucion_registrada_por:
            return ""
        return str(obj.devolucion_registrada_por)


class ConsumiblePrestamoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsumiblePrestamo
        fields = ["id", "nombre", "cantidad", "cantidad_recibida"]


class ConsumibleSolicitudSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsumibleSolicitud
        fields = ["id", "nombre", "cantidad"]


class PrestamoSerializer(serializers.ModelSerializer):
    detalles = DetallePrestamoSerializer(many=True, read_only=True)
    consumibles = ConsumiblePrestamoSerializer(many=True, read_only=True)
    estado = serializers.SerializerMethodField()
    total_activos = serializers.SerializerMethodField()
    activos_pendientes = serializers.SerializerMethodField()
    total_herramientas = serializers.SerializerMethodField()
    items_pendientes = serializers.SerializerMethodField()
    formato_retorno_disponible = serializers.SerializerMethodField()

    class Meta:
        model = Prestamo
        fields = [
            "id",
            "cliente",
            "consecutivo",
            "nombre_receptor",
            "documento_receptor",
            "fecha_prestamo",
            "fecha_devolucion_prevista",
            "observaciones",
            "estado",
            "total_activos",
            "activos_pendientes",
            "total_herramientas",
            "items_pendientes",
            "formato_retorno_disponible",
            "detalles",
            "consumibles",
        ]

    def get_estado(self, obj):
        detalles = list(obj.detalles.all())
        consumibles = list(obj.consumibles.all())
        total_items = len(detalles) + len(consumibles)
        pendientes = sum(detalle.fecha_devolucion is None for detalle in detalles)
        pendientes += sum(
            consumible.cantidad_recibida is None for consumible in consumibles
        )
        devueltos = total_items - pendientes

        if total_items and not pendientes:
            return "Devuelto"
        if obj.fecha_devolucion_prevista < timezone.localdate():
            return "Vencido"
        if devueltos:
            return "Parcial"
        return "Vigente"

    def get_total_activos(self, obj):
        return len(obj.detalles.all())

    def get_activos_pendientes(self, obj):
        return sum(
            detalle.fecha_devolucion is None
            for detalle in obj.detalles.all()
        )

    def get_total_herramientas(self, obj):
        return obj.detalles.count() + obj.consumibles.count()

    def get_items_pendientes(self, obj):
        return self.get_activos_pendientes(obj) + sum(
            consumible.cantidad_recibida is None
            for consumible in obj.consumibles.all()
        )

    def get_formato_retorno_disponible(self, obj):
        solicitud = getattr(obj, "solicitud", None)
        return bool(solicitud and solicitud.formato_retorno_pdf)


class ConsumiblePrestamoEntradaSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=200, trim_whitespace=True)
    cantidad = serializers.IntegerField(min_value=1)

    def validate_nombre(self, value):
        if not value:
            raise serializers.ValidationError("Indica el nombre del consumible.")
        return value


def _validar_fecha_devolucion_futura(value):
    if value <= timezone.localdate():
        raise serializers.ValidationError(
            "La fecha prevista debe ser futura."
        )
    return value


class CrearPrestamoSerializer(serializers.ModelSerializer):
    cliente = serializers.CharField(
        max_length=150,
        trim_whitespace=True,
        allow_blank=False,
    )
    consecutivo = serializers.CharField(
        max_length=50,
        trim_whitespace=True,
        allow_blank=False,
    )
    activos = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Activo.objects.filter(activo=True),
        write_only=True,
        required=False,
    )
    consumibles = ConsumiblePrestamoEntradaSerializer(
        many=True,
        required=False,
        write_only=True,
    )

    class Meta:
        model = Prestamo
        fields = [
            "cliente",
            "consecutivo",
            "nombre_receptor",
            "documento_receptor",
            "fecha_devolucion_prevista",
            "observaciones",
            "activos",
            "consumibles",
        ]

    def validate_fecha_devolucion_prevista(self, value):
        return _validar_fecha_devolucion_futura(value)

    def validate_cliente(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Indica el cliente del servicio.")
        return value

    def validate_consecutivo(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Indica el consecutivo del servicio.")
        if Prestamo.objects.filter(consecutivo__iexact=value).exclude(
            consecutivo="",
        ).exists():
            raise serializers.ValidationError(
                "Ya existe un préstamo con ese consecutivo."
            )
        solicitudes = SolicitudPrestamo.objects.filter(
            consecutivo__iexact=value,
        ).exclude(consecutivo="")
        solicitud_actual = self.context.get("solicitud")
        if solicitud_actual:
            solicitudes = solicitudes.exclude(pk=solicitud_actual.pk)
        if solicitudes.exists():
            raise serializers.ValidationError(
                "Ya existe una solicitud con ese consecutivo."
            )
        return value

    def validate_activos(self, activos):
        ids = [activo.pk for activo in activos]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError(
                "No puedes incluir el mismo activo más de una vez."
            )
        return activos

    def validate(self, attrs):
        if not attrs.get("activos") and not attrs.get("consumibles"):
            raise serializers.ValidationError(
                "Selecciona al menos un activo o agrega un consumible."
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        activos_solicitados = validated_data.pop("activos", [])
        consumibles = validated_data.pop("consumibles", [])
        ids = [activo.pk for activo in activos_solicitados]
        activos = (
            list(
                Activo.objects.select_for_update()
                .filter(pk__in=ids, activo=True)
                .select_related("estado", "ubicacion")
                .order_by("pk")
            )
            if ids
            else []
        )
        if len(activos) != len(ids):
            raise serializers.ValidationError({
                "activos": "Uno o más activos ya no están disponibles."
            })

        estado_prestado = None
        if activos:
            estado_prestado = obtener_estado_prestado()
            if not estado_prestado:
                raise serializers.ValidationError({
                    "activos": (
                        "Configura un estado activo llamado 'En servicio' o 'Prestado' "
                        "antes de registrar préstamos."
                    )
                })

            for activo in activos:
                if (
                    not activo.estado.permite_prestamo
                    or es_estado_prestado(activo.estado.nombre)
                ):
                    raise serializers.ValidationError({
                        "activos": (
                            f'El activo {activo.codigo_interno} no se puede prestar '
                            "porque su estado actual no lo permite."
                        )
                    })

            if DetallePrestamo.objects.filter(
                activo_id__in=ids,
                fecha_devolucion__isnull=True,
            ).exists():
                raise serializers.ValidationError({
                    "activos": "Uno o más activos ya tienen un préstamo pendiente."
                })

        prestamo = Prestamo.objects.create(
            **validated_data,
            creado_por=self.context["request"].user,
        )
        for activo in activos:
            DetallePrestamo.objects.create(
                prestamo=prestamo,
                activo=activo,
                estado_al_prestar=activo.estado,
                ubicacion_al_prestar=activo.ubicacion,
            )
            activo.estado = estado_prestado
            activo.modificado_por = self.context["request"].user
            activo.save(update_fields=["estado", "modificado_por", "fecha_modificacion"])

        ConsumiblePrestamo.objects.bulk_create([
            ConsumiblePrestamo(prestamo=prestamo, **consumible)
            for consumible in consumibles
        ])
        return prestamo


class SolicitudPrestamoSerializer(serializers.ModelSerializer):
    activos = serializers.SerializerMethodField()
    consumibles = ConsumibleSolicitudSerializer(many=True, read_only=True)
    solicitante_nombre = serializers.SerializerMethodField()
    solicitante_usuario = serializers.CharField(
        source="solicitante.username",
        read_only=True,
    )
    estado_nombre = serializers.CharField(source="get_estado_display", read_only=True)
    prestamo_id = serializers.IntegerField(read_only=True)
    revisado_por_nombre = serializers.SerializerMethodField()
    formato_salida_disponible = serializers.SerializerMethodField()
    formato_retorno_disponible = serializers.SerializerMethodField()

    class Meta:
        model = SolicitudPrestamo
        fields = [
            "id",
            "solicitante_nombre",
            "solicitante_usuario",
            "cliente",
            "consecutivo",
            "nombre_receptor",
            "documento_receptor",
            "fecha_devolucion_prevista",
            "motivo",
            "observaciones",
            "activos",
            "consumibles",
            "estado",
            "estado_nombre",
            "fecha_solicitud",
            "resuelto_por",
            "fecha_resolucion",
            "observaciones_resolucion",
            "revisado_por_nombre",
            "fecha_revision",
            "prestamo_id",
            "formato_salida_disponible",
            "formato_retorno_disponible",
        ]
        read_only_fields = fields

    def get_activos(self, obj):
        revisiones = {
            revision.activo_id: revision
            for revision in obj.revision_activos.all()
        }
        return [
            {
                "id": activo.pk,
                "codigo_interno": activo.codigo_interno,
                "nombre": activo.nombre,
                "condicion": (
                    revisiones[activo.pk].condicion
                    if activo.pk in revisiones
                    else ""
                ),
                "observacion_revision": (
                    revisiones[activo.pk].observacion
                    if activo.pk in revisiones
                    else ""
                ),
                "incluir_en_salida": (
                    revisiones[activo.pk].incluir_en_salida
                    if activo.pk in revisiones
                    else True
                ),
            }
            for activo in obj.activos.all()
        ]

    def get_solicitante_nombre(self, obj):
        return str(obj.solicitante)

    def get_revisado_por_nombre(self, obj):
        return str(obj.revisado_por) if obj.revisado_por else ""

    def get_formato_salida_disponible(self, obj):
        return obj.formato_salida_pdf is not None

    def get_formato_retorno_disponible(self, obj):
        return obj.formato_retorno_pdf is not None


class CrearSolicitudPrestamoSerializer(serializers.ModelSerializer):
    cliente = serializers.CharField(
        max_length=150,
        trim_whitespace=True,
        allow_blank=False,
    )
    consecutivo = serializers.CharField(
        max_length=50,
        trim_whitespace=True,
        allow_blank=False,
    )
    activos = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Activo.objects.filter(activo=True),
        write_only=True,
        required=False,
    )
    consumibles = ConsumiblePrestamoEntradaSerializer(
        many=True,
        required=False,
        write_only=True,
    )

    class Meta:
        model = SolicitudPrestamo
        fields = [
            "cliente",
            "consecutivo",
            "nombre_receptor",
            "documento_receptor",
            "fecha_devolucion_prevista",
            "motivo",
            "observaciones",
            "activos",
            "consumibles",
        ]

    def validate_fecha_devolucion_prevista(self, value):
        return _validar_fecha_devolucion_futura(value)

    def validate_motivo(self, value):
        if not value.strip():
            raise serializers.ValidationError(
                "Indica para qué necesitas los activos."
            )
        return value.strip()

    def validate_cliente(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Indica el cliente del servicio.")
        return value

    def validate_consecutivo(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Indica el consecutivo del servicio.")
        if SolicitudPrestamo.objects.filter(
            consecutivo__iexact=value,
        ).exclude(consecutivo="").exists():
            raise serializers.ValidationError(
                "Ya existe una solicitud con ese consecutivo."
            )
        if Prestamo.objects.filter(
            consecutivo__iexact=value,
        ).exclude(consecutivo="").exists():
            raise serializers.ValidationError(
                "Ya existe un préstamo con ese consecutivo."
            )
        return value

    def validate_activos(self, activos):
        ids = [activo.pk for activo in activos]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError(
                "No puedes incluir el mismo activo más de una vez."
            )

        activos_disponibles = set(
            Activo.objects.filter(
                pk__in=ids,
                activo=True,
                estado__permite_prestamo=True,
            )
            .exclude(filtro_estado_prestado("estado__nombre"))
            .exclude(
                pk__in=DetallePrestamo.objects.filter(
                    fecha_devolucion__isnull=True,
                ).values("activo_id")
            )
            .values_list("pk", flat=True)
        )
        if activos_disponibles != set(ids):
            raise serializers.ValidationError(
                "Uno o más activos ya no están disponibles para préstamo."
            )
        return activos

    def validate(self, attrs):
        if not attrs.get("activos") and not attrs.get("consumibles"):
            raise serializers.ValidationError(
                "Selecciona al menos un activo o agrega un consumible."
            )
        return attrs

    def create(self, validated_data):
        activos = validated_data.pop("activos", [])
        consumibles = validated_data.pop("consumibles", [])
        solicitud = SolicitudPrestamo.objects.create(
            **validated_data,
            solicitante=self.context["request"].user,
        )
        solicitud.activos.set(activos)
        RevisionActivoSolicitud.objects.bulk_create([
            RevisionActivoSolicitud(solicitud=solicitud, activo=activo)
            for activo in activos
        ])
        ConsumibleSolicitud.objects.bulk_create([
            ConsumibleSolicitud(solicitud=solicitud, **consumible)
            for consumible in consumibles
        ])
        return solicitud


class RevisionActivoSolicitudDetalleSerializer(serializers.Serializer):
    activo_id = serializers.IntegerField(min_value=1)
    condicion = serializers.ChoiceField(choices=RevisionActivoSolicitud.Condicion.choices)
    observacion = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    incluir_en_salida = serializers.BooleanField(default=True)


class RevisarSolicitudPrestamoSerializer(serializers.Serializer):
    detalles = RevisionActivoSolicitudDetalleSerializer(
        many=True,
        allow_empty=True,
    )

    def validate_detalles(self, detalles):
        solicitud = self.context["solicitud"]
        ids = [detalle["activo_id"] for detalle in detalles]
        esperados = set(solicitud.activos.values_list("pk", flat=True))
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError(
                "No puedes revisar dos veces el mismo activo."
            )
        if set(ids) != esperados:
            raise serializers.ValidationError(
                "Debes revisar todos los activos solicitados, sin agregar ni omitir ninguno."
            )
        return detalles


class RechazarSolicitudPrestamoSerializer(serializers.Serializer):
    observaciones_resolucion = serializers.CharField(
        trim_whitespace=True,
        allow_blank=False,
    )


class DevolucionDetalleSerializer(serializers.Serializer):
    detalle_id = serializers.IntegerField(min_value=1)
    estado = serializers.PrimaryKeyRelatedField(
        queryset=EstadoActivo.objects.filter(activo=True)
    )
    ubicacion = serializers.PrimaryKeyRelatedField(
        queryset=Ubicacion.objects.filter(activo=True)
    )
    condicion = serializers.ChoiceField(choices=DetallePrestamo.CondicionDevolucion.choices)
    observacion = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)


class DevolucionConsumibleSerializer(serializers.Serializer):
    consumible_id = serializers.IntegerField(min_value=1)
    cantidad_recibida = serializers.IntegerField(min_value=0)


class RegistrarDevolucionSerializer(serializers.Serializer):
    detalles = DevolucionDetalleSerializer(many=True, required=False)
    consumibles = DevolucionConsumibleSerializer(many=True, required=False)

    def validate(self, attrs):
        detalles = attrs.get("detalles", [])
        consumibles = attrs.get("consumibles", [])
        if not detalles and not consumibles:
            raise serializers.ValidationError(
                "Selecciona al menos un activo o consumible para registrar la devolución."
            )
        ids = [detalle["detalle_id"] for detalle in detalles]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError({
                "detalles": "No puedes seleccionar dos veces el mismo activo."
            })
        ids_consumibles = [
            consumible["consumible_id"] for consumible in consumibles
        ]
        if len(ids_consumibles) != len(set(ids_consumibles)):
            raise serializers.ValidationError({
                "consumibles": "No puedes seleccionar dos veces el mismo consumible."
            })
        return attrs
