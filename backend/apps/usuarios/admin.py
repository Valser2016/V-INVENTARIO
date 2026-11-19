from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Rol, Usuario


@admin.register(Rol)
class RolAdmin(admin.ModelAdmin):
    list_display = (
        "nombre",
        "descripcion",
        "activo",
        "fecha_creacion",
    )

    list_filter = (
        "activo",
    )

    search_fields = (
        "nombre",
        "descripcion",
    )


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):

    fieldsets = UserAdmin.fieldsets + (
        (
            "Información de VALSER",
            {
                "fields": (
                    "documento",
                    "telefono",
                    "cargo",
                    "area",
                    "rol",
                    "fecha_creacion",
                    "fecha_modificacion",
                )
            },
        ),
    )

    readonly_fields = (
        "fecha_creacion",
        "fecha_modificacion",
    )

    list_display = (
        "username",
        "first_name",
        "last_name",
        "documento",
        "cargo",
        "area",
        "rol",
        "is_active",
    )

    list_filter = (
        "rol",
        "is_active",
        "is_staff",
        "is_superuser",
    )

    search_fields = (
        "username",
        "first_name",
        "last_name",
        "documento",
        "cargo",
        "area",
    )