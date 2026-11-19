from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ActivosPrestamoView,
    ListaHerramientasPrestamoViewSet,
    PrestamoViewSet,
    SolicitudPrestamoViewSet,
)


router = DefaultRouter()
router.register("prestamos", PrestamoViewSet, basename="prestamo")
router.register(
    "solicitudes-prestamo",
    SolicitudPrestamoViewSet,
    basename="solicitud-prestamo",
)
router.register(
    "listas-herramientas",
    ListaHerramientasPrestamoViewSet,
    basename="lista-herramientas",
)

urlpatterns = router.urls
urlpatterns += [
    path("activos-disponibles/", ActivosPrestamoView.as_view(), name="activos-disponibles"),
]
