from django.urls import path

from .views import (
    DevolucionesReporteView,
    ExportarReporteView,
    InventarioReporteView,
    PrestamosReporteView,
    VencimientosReporteView,
)


urlpatterns = [
    path("inventario/", InventarioReporteView.as_view(), name="reporte-inventario"),
    path("prestamos/", PrestamosReporteView.as_view(), name="reporte-prestamos"),
    path("vencimientos/", VencimientosReporteView.as_view(), name="reporte-vencimientos"),
    path("devoluciones/", DevolucionesReporteView.as_view(), name="reporte-devoluciones"),
    path(
        "exportar/<str:tipo>/<str:formato>/",
        ExportarReporteView.as_view(),
        name="reporte-exportar",
    ),
]
