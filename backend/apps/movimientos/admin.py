from django.contrib import admin

from .models import DetallePrestamo, Prestamo


class DetallePrestamoInline(admin.TabularInline):
    model = DetallePrestamo
    extra = 0
    readonly_fields = (
        "activo",
        "estado_al_prestar",
        "ubicacion_al_prestar",
        "fecha_devolucion",
        "estado_devolucion",
        "ubicacion_devolucion",
        "condicion_devolucion",
        "observacion_devolucion",
    )
    can_delete = False


@admin.register(Prestamo)
class PrestamoAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "cliente",
        "consecutivo",
        "nombre_receptor",
        "documento_receptor",
        "fecha_prestamo",
        "fecha_devolucion_prevista",
        "creado_por",
    )
    search_fields = (
        "cliente",
        "consecutivo",
        "nombre_receptor",
        "documento_receptor",
    )
    list_filter = ("fecha_prestamo", "fecha_devolucion_prevista")
    readonly_fields = (
        "cliente",
        "consecutivo",
        "nombre_receptor",
        "documento_receptor",
        "fecha_devolucion_prevista",
        "observaciones",
        "fecha_prestamo",
        "creado_por",
    )
    inlines = [DetallePrestamoInline]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
