from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import Rol, Usuario
from .permissions import es_administrador


class RolSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rol
        fields = [
            "id",
            "nombre",
            "descripcion",
            "puede_ver_inventario",
            "puede_modificar_inventario",
            "puede_administrar_catalogos",
            "puede_ver_movimientos",
            "puede_ver_reportes",
            "puede_registrar_devoluciones",
            "puede_revisar_solicitudes_prestamo",
            "puede_aprobar_solicitudes_prestamo",
            "activo",
        ]

    def validate(self, attrs):
        nombre = attrs.get("nombre", getattr(self.instance, "nombre", ""))
        nombre_normalizado = nombre.strip()
        roles_existentes = Rol.objects.filter(nombre__iexact=nombre_normalizado)
        if self.instance:
            roles_existentes = roles_existentes.exclude(pk=self.instance.pk)
        if roles_existentes.exists():
            raise serializers.ValidationError({
                "nombre": "Ya existe un rol con ese nombre."
            })

        if "nombre" in attrs:
            attrs["nombre"] = nombre_normalizado
        if nombre.strip().casefold() == "administrador":
            permisos = (
                "puede_ver_inventario",
                "puede_modificar_inventario",
                "puede_administrar_catalogos",
                "puede_ver_movimientos",
                "puede_ver_reportes",
                "puede_registrar_devoluciones",
                "puede_revisar_solicitudes_prestamo",
                "puede_aprobar_solicitudes_prestamo",
            )
            if any(
                not attrs.get(permiso, getattr(self.instance, permiso, True))
                for permiso in permisos
            ):
                raise serializers.ValidationError(
                    "El rol Administrador debe conservar todos los permisos."
                )
            for permiso in permisos:
                attrs.setdefault(permiso, True)
        if self.instance and self.instance.nombre.strip().casefold() == "administrador":
            nuevo_nombre = attrs.get("nombre", self.instance.nombre)
            nuevo_activo = attrs.get("activo", self.instance.activo)
            if nuevo_nombre.strip().casefold() != "administrador" or not nuevo_activo:
                raise serializers.ValidationError(
                    "El rol Administrador no se puede renombrar ni desactivar."
                )
        return attrs


class UsuarioAdminSerializer(serializers.ModelSerializer):
    rol_nombre = serializers.CharField(source="rol.nombre", read_only=True, allow_null=True)
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        trim_whitespace=False,
    )
    rol = serializers.PrimaryKeyRelatedField(
        queryset=Rol.objects.filter(activo=True),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Usuario
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "documento",
            "telefono",
            "cargo",
            "area",
            "rol",
            "rol_nombre",
            "is_active",
            "password",
            "date_joined",
            "last_login",
        ]
        read_only_fields = ["id", "rol_nombre", "date_joined", "last_login"]

    def validate(self, attrs):
        if not self.instance and not attrs.get("password"):
            raise serializers.ValidationError({
                "password": "La contraseña es obligatoria para crear un usuario."
            })

        password = attrs.get("password")
        if password:
            try:
                validate_password(password, user=self.instance)
            except DjangoValidationError as error:
                raise serializers.ValidationError({"password": list(error.messages)}) from error

        if self.instance:
            request_user = self.context["request"].user
            rol = attrs.get("rol", self.instance.rol)
            activo = attrs.get("is_active", self.instance.is_active)
            conserva_admin = (
                (
                    request_user.is_superuser
                    and rol is None
                    and activo
                )
                or (
                    activo
                    and rol
                    and rol.activo
                    and rol.nombre.strip().casefold() == "administrador"
                )
            )
            if self.instance.pk == request_user.pk and not conserva_admin:
                raise serializers.ValidationError(
                    "No puedes quitarte los permisos de administrador ni desactivar tu usuario."
                )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        usuario = Usuario(**validated_data)
        usuario.set_password(password)
        usuario.save()
        return usuario

    def update(self, instance, validated_data):
        password = validated_data.pop("password", "")
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        if password:
            instance.set_password(password)
        instance.save()
        if password:
            for token in OutstandingToken.objects.filter(user=instance):
                BlacklistedToken.objects.get_or_create(token=token)
        return instance


class PerfilSerializer(serializers.ModelSerializer):
    nombre_completo = serializers.SerializerMethodField()
    rol_nombre = serializers.CharField(source="rol.nombre", read_only=True, allow_null=True)
    es_administrador = serializers.SerializerMethodField()
    permisos = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = ["id", "username", "nombre_completo", "rol_nombre", "es_administrador", "permisos"]

    def get_nombre_completo(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip() or obj.username

    def get_es_administrador(self, obj):
        return es_administrador(obj)

    def get_permisos(self, obj):
        if es_administrador(obj):
            return {
                "puede_ver_inventario": True,
                "puede_modificar_inventario": True,
                "puede_administrar_catalogos": True,
                "puede_ver_movimientos": True,
                "puede_ver_reportes": True,
                "puede_registrar_devoluciones": True,
                "puede_revisar_solicitudes_prestamo": True,
                "puede_aprobar_solicitudes_prestamo": True,
            }
        rol = obj.rol
        return {
            "puede_ver_inventario": bool(rol and rol.activo and rol.puede_ver_inventario),
            "puede_modificar_inventario": bool(
                rol and rol.activo and rol.puede_modificar_inventario
            ),
            "puede_administrar_catalogos": bool(
                rol and rol.activo and rol.puede_administrar_catalogos
            ),
            "puede_ver_movimientos": bool(rol and rol.activo and rol.puede_ver_movimientos),
            "puede_ver_reportes": bool(rol and rol.activo and rol.puede_ver_reportes),
            "puede_registrar_devoluciones": bool(
                rol and rol.activo and rol.puede_registrar_devoluciones
            ),
            "puede_revisar_solicitudes_prestamo": bool(
                rol and rol.activo and rol.puede_revisar_solicitudes_prestamo
            ),
            "puede_aprobar_solicitudes_prestamo": bool(
                rol and rol.activo and rol.puede_aprobar_solicitudes_prestamo
            ),
        }
