from rest_framework import serializers

from apps.inventario.models import (
    TipoActivo,
    CategoriaActivo,
    EstadoActivo,
    Ubicacion,
    Activo,
)
from apps.usuarios.models import Usuario


class TipoActivoSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoActivo
        fields = [
            "id",
            "nombre",
            "descripcion",
        ]


class CategoriaActivoSerializer(serializers.ModelSerializer):
    tipo_activo = serializers.IntegerField(
        source="tipo_activo_id"
    )

    class Meta:
        model = CategoriaActivo
        fields = [
            "id",
            "nombre",
            "tipo_activo",
            "descripcion",
        ]


class EstadoActivoSerializer(serializers.ModelSerializer):
    class Meta:
        model = EstadoActivo
        fields = [
            "id",
            "nombre",
            "descripcion",
            "permite_prestamo",
        ]


class UbicacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ubicacion
        fields = [
            "id",
            "nombre",
            "descripcion",
        ]


class TipoActivoConfiguracionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoActivo
        fields = ["id", "nombre", "descripcion", "activo"]


class CategoriaActivoConfiguracionSerializer(serializers.ModelSerializer):
    tipo_activo_nombre = serializers.CharField(
        source="tipo_activo.nombre",
        read_only=True,
    )

    class Meta:
        model = CategoriaActivo
        fields = [
            "id",
            "tipo_activo",
            "tipo_activo_nombre",
            "nombre",
            "prefijo_codigo",
            "descripcion",
            "activo",
        ]


class EstadoActivoConfiguracionSerializer(serializers.ModelSerializer):
    class Meta:
        model = EstadoActivo
        fields = ["id", "nombre", "descripcion", "permite_prestamo", "activo"]


class UbicacionConfiguracionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ubicacion
        fields = ["id", "nombre", "descripcion", "activo"]


class UsuarioLevantamientoSerializer(serializers.ModelSerializer):
    nombre_completo = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = [
            "id",
            "nombre_completo",
        ]

    def get_nombre_completo(self, obj):
        nombre = f"{obj.first_name} {obj.last_name}".strip()
        return nombre or obj.username


class ActivoLevantamientoSerializer(serializers.ModelSerializer):
    foto = serializers.ImageField(
        required=False,
        allow_null=True,
        write_only=True,
    )
    foto_url = serializers.SerializerMethodField()
    tipo_activo_nombre = serializers.CharField(
        source="tipo_activo.nombre",
        read_only=True,
    )
    categoria_nombre = serializers.CharField(
        source="categoria.nombre",
        read_only=True,
    )
    ubicacion_nombre = serializers.CharField(
        source="ubicacion.nombre",
        read_only=True,
    )
    estado_nombre = serializers.CharField(
        source="estado.nombre",
        read_only=True,
    )


    class Meta:
        model = Activo
        fields = [
            "id",
            "codigo_interno",
            "tipo_activo",
            "tipo_activo_nombre",
            "categoria",
            "categoria_nombre",
            "modalidad_control",
            "nombre",
            "marca",
            "modelo",
            "serie_codigo",
            "fecha_adquisicion",
            "proveedor",
            "vida_util",
            "ubicacion",
            "ubicacion_nombre",
            "estado",
            "estado_nombre",
            "responsable",
            "cuenta_con_manual",
            "valor",
            "observaciones",
            "foto",
            "foto_url",
            "activo",
        ]

        read_only_fields = [
            "id",
            "codigo_interno",
            "foto_url",
        ]

    def get_foto_url(self, obj):
        if not obj.foto:
            return None
        return (
            f"/levantamiento/activos/{obj.pk}/foto/"
            f"?v={obj.fecha_modificacion.timestamp()}"
        )

    def validate_foto(self, value):
        if value and value.size > 10 * 1024 * 1024:
            raise serializers.ValidationError(
                "La foto no puede superar los 10 MB."
            )
        return value

    def validate(self, attrs):

        tipo_activo = attrs.get(
            "tipo_activo",
            getattr(self.instance, "tipo_activo", None),
        )
        categoria = attrs.get(
            "categoria",
            getattr(self.instance, "categoria", None),
        )

        if tipo_activo and categoria and categoria.tipo_activo_id != tipo_activo.id:
            raise serializers.ValidationError({
                "categoria": (
                    f'La categoría "{categoria.nombre}" '
                    f'no pertenece al tipo de activo '
                    f'"{tipo_activo.nombre}".'
                )
            })

        return attrs

    def create(self, validated_data):

        usuario = self.context["request"].user

        activo = Activo.objects.create(
            **validated_data,
            creado_por=usuario,
            modificado_por=usuario,
        )

        return activo

    def update(self, instance, validated_data):
        foto_anterior = instance.foto
        nombre_foto_anterior = foto_anterior.name if foto_anterior else ""
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.modificado_por = self.context["request"].user
        instance.save()
        if (
            foto_anterior
            and nombre_foto_anterior != (instance.foto.name if instance.foto else "")
        ):
            foto_anterior.storage.delete(nombre_foto_anterior)
        return instance

    def get_nombre_completo(self, obj):
        nombre = f"{obj.first_name} {obj.last_name}".strip()

        return nombre or obj.username
    