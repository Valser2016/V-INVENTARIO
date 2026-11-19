from django.contrib import admin

from .models import (
    Activo,
    CategoriaActivo,
    EstadoActivo,
    TipoActivo,
    Ubicacion,
)


@admin.register(TipoActivo)
class TipoActivoAdmin(admin.ModelAdmin):
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


@admin.register(CategoriaActivo)
class CategoriaActivoAdmin(admin.ModelAdmin):
    list_display = (
        "nombre",
        "tipo_activo",
        "prefijo_codigo",
        "activo",
        "fecha_creacion",
    )

    list_filter = (
        "tipo_activo",
        "activo",
    )

    search_fields = (
        "nombre",
        "prefijo_codigo",
        "descripcion",
    )


@admin.register(EstadoActivo)
class EstadoActivoAdmin(admin.ModelAdmin):
    list_display = (
        "nombre",
        "permite_prestamo",
        "activo",
        "fecha_creacion",
    )

    list_filter = (
        "permite_prestamo",
        "activo",
    )

    search_fields = (
        "nombre",
        "descripcion",
    )


@admin.register(Ubicacion)
class UbicacionAdmin(admin.ModelAdmin):
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


@admin.register(Activo)
class ActivoAdmin(admin.ModelAdmin):
    list_display = (
        "codigo_interno",
        "nombre",
        "categoria",
        "marca",
        "modelo",
        "serie_codigo",
        "ubicacion",
        "estado",
        "responsable",
    )

    list_filter = (
        "tipo_activo",
        "categoria",
        "estado",
        "ubicacion",
        "modalidad_control",
        "activo",
    )

    search_fields = (
        "codigo_interno",
        "nombre",
        "marca",
        "modelo",
        "serie_codigo",
    )

    readonly_fields = (
        "codigo_interno",
        "fecha_creacion",
        "fecha_modificacion",
    )