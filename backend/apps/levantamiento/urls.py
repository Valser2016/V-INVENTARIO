from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    TiposActivoView,
    CategoriasActivoView,
    EstadosActivoView,
    UbicacionesView,
    UsuariosLevantamientoView,
    ActivosLevantamientoView,
    ActivoLevantamientoDetalleView,
    FotoActivoView,
    HojaVidaActivoView,
    ResumenActivosLevantamientoView,
    TipoActivoConfiguracionViewSet,
    CategoriaActivoConfiguracionViewSet,
    EstadoActivoConfiguracionViewSet,
    UbicacionConfiguracionViewSet,
)


router = SimpleRouter()
router.register(
    "configuracion/tipos",
    TipoActivoConfiguracionViewSet,
    basename="configuracion-tipo",
)
router.register(
    "configuracion/categorias",
    CategoriaActivoConfiguracionViewSet,
    basename="configuracion-categoria",
)
router.register(
    "configuracion/estados",
    EstadoActivoConfiguracionViewSet,
    basename="configuracion-estado",
)
router.register(
    "configuracion/ubicaciones",
    UbicacionConfiguracionViewSet,
    basename="configuracion-ubicacion",
)

urlpatterns = [

    path(
        "tipos/",
        TiposActivoView.as_view(),
        name="levantamiento-tipos",
    ),

    path(
        "categorias/",
        CategoriasActivoView.as_view(),
        name="levantamiento-categorias",
    ),

    path(
        "estados/",
        EstadosActivoView.as_view(),
        name="levantamiento-estados",
    ),

    path(
        "ubicaciones/",
        UbicacionesView.as_view(),
        name="levantamiento-ubicaciones",
    ),

    path(
        "usuarios/",
        UsuariosLevantamientoView.as_view(),
        name="levantamiento-usuarios",
    ),

    path(
        "activos/resumen/",
        ResumenActivosLevantamientoView.as_view(),
        name="levantamiento-activos-resumen",
    ),

    path(
        "activos/",
        ActivosLevantamientoView.as_view(),
        name="levantamiento-crear-activo",

    ),
    path(
        "activos/<int:pk>/foto/",
        FotoActivoView.as_view(),
        name="levantamiento-activo-foto",
    ),
    path(
        "activos/<int:pk>/hoja-vida/",
        HojaVidaActivoView.as_view(),
        name="levantamiento-hoja-vida-activo",
    ),

    path(
        "activos/<int:pk>/",
        ActivoLevantamientoDetalleView.as_view(),
        name="levantamiento-detalle-activo",
    ),
] + router.urls