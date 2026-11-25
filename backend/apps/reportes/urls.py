from django.urls import path

from .views import (
    DescargarListadoHerramientasPrestamoView,
    DevolucionesReporteView,
    ExportarReporteView,
    InventarioReporteView,
    PrestamosReporteView,
    VencimientosReporteView,
)


urlpatterns = [
    path("inventario/", InventarioReporteView.as_view(), name="reporte-inventario"),
    path("prestamos/", PrestamosReporteView.as_view(), name="reporte-prestamos"),
    path(
        "prestamos/<int:pk>/listado-herramientas/",
        DescargarListadoHerramientasPrestamoView.as_view(),
        name="reporte-prestamo-listado-herramientas",
    ),
    path("vencimientos/", VencimientosReporteView.as_view(), name="reporte-vencimientos"),
    path("devoluciones/", DevolucionesReporteView.as_view(), name="reporte-devoluciones"),
    path(
        "exportar/<str:tipo>/<str:formato>/",
        ExportarReporteView.as_view(),
        name="reporte-exportar",
    ),
]
