from rest_framework import generics, viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Rol, Usuario
from .permissions import SoloAdministrador
from .serializers import PerfilSerializer, RolSerializer, UsuarioAdminSerializer


class RolViewSet(viewsets.ModelViewSet):
    queryset = Rol.objects.all()
    serializer_class = RolSerializer
    permission_classes = [SoloAdministrador]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]


class UsuarioViewSet(viewsets.ModelViewSet):
    queryset = Usuario.objects.select_related("rol").all()
    serializer_class = UsuarioAdminSerializer
    permission_classes = [SoloAdministrador]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]


class PerfilView(generics.RetrieveAPIView):
    serializer_class = PerfilSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user
