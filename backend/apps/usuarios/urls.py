from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .api import PerfilView, RolViewSet, UsuarioViewSet


router = DefaultRouter()
router.register("roles", RolViewSet, basename="rol")
router.register("usuarios", UsuarioViewSet, basename="usuario")

urlpatterns = [
    path("perfil/", PerfilView.as_view(), name="perfil-usuario"),
    path("", include(router.urls)),
]
