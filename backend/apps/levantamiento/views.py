from django.db.models import Count, Q
from rest_framework import generics, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.inventario.models import (
    Activo,
    TipoActivo,
    CategoriaActivo,
    EstadoActivo,
    Ubicacion,
)
from apps.inventario.estados import filtro_estado_prestado
from apps.usuarios.models import Usuario
from apps.usuarios.permissions import (
    PuedeAdministrarConfiguracion,
    PuedeConsultarCatalogosDevolucion,
    PuedeConsultarYCrearActivos,
)

from .serializers import (
    TipoActivoSerializer,
    CategoriaActivoSerializer,
    EstadoActivoSerializer,
    UbicacionSerializer,
    UsuarioLevantamientoSerializer,
    ActivoLevantamientoSerializer,
    TipoActivoConfiguracionSerializer,
    CategoriaActivoConfiguracionSerializer,
    EstadoActivoConfiguracionSerializer,
    UbicacionConfiguracionSerializer,
)


class TiposActivoView(APIView):
    permission_classes = [PuedeConsultarYCrearActivos]

    def get(self, request):

        tipos = TipoActivo.objects.filter(
            activo=True
        )

        serializer = TipoActivoSerializer(
            tipos,
            many=True
        )

        return Response(serializer.data)


class CategoriasActivoView(APIView):
    permission_classes = [PuedeConsultarYCrearActivos]

    def get(self, request):

        tipo_id = request.query_params.get(
            "tipo_activo"
        )

        categorias = CategoriaActivo.objects.filter(
            activo=True
        )

        if tipo_id:
            categorias = categorias.filter(
                tipo_activo_id=tipo_id
            )

        serializer = CategoriaActivoSerializer(
            categorias,
            many=True
        )

        return Response(serializer.data)


class EstadosActivoView(APIView):
    permission_classes = [PuedeConsultarCatalogosDevolucion]

    def get(self, request):

        estados = EstadoActivo.objects.filter(
            activo=True
        )

        serializer = EstadoActivoSerializer(
            estados,
            many=True
        )

        return Response(serializer.data)


class UbicacionesView(APIView):
    permission_classes = [PuedeConsultarCatalogosDevolucion]

    def get(self, request):

        ubicaciones = Ubicacion.objects.filter(
            activo=True
        )

        serializer = UbicacionSerializer(
            ubicaciones,
            many=True
        )

        return Response(serializer.data)


class UsuariosLevantamientoView(APIView):
    permission_classes = [PuedeConsultarYCrearActivos]

    def get(self, request):

        usuarios = Usuario.objects.filter(
            is_active=True
        )

        serializer = UsuarioLevantamientoSerializer(
            usuarios,
            many=True
        )

        return Response(serializer.data)


class ActivosLevantamientoView(generics.ListCreateAPIView):
    permission_classes = [PuedeConsultarYCrearActivos]
    serializer_class = ActivoLevantamientoSerializer
    pagination_class = PageNumberPagination
    queryset = Activo.objects.filter(activo=True).select_related(
        "tipo_activo",
        "categoria",
        "ubicacion",
        "estado",
        "responsable",
    )


class ActivoLevantamientoDetalleView(generics.RetrieveUpdateAPIView):
    permission_classes = [PuedeConsultarYCrearActivos]
    serializer_class = ActivoLevantamientoSerializer
    queryset = Activo.objects.filter(activo=True).select_related(
        "tipo_activo",
        "categoria",
        "ubicacion",
        "estado",
        "responsable",
    )
    http_method_names = ["get", "put", "patch", "head", "options"]


class ResumenActivosLevantamientoView(APIView):
    permission_classes = [PuedeConsultarYCrearActivos]

    def get(self, request):
        resumen = Activo.objects.filter(activo=True).aggregate(
            total=Count("id"),
            disponibles=Count("id", filter=Q(estado__nombre__iexact="Disponible")),
            prestados=Count("id", filter=filtro_estado_prestado("estado__nombre")),
            obsoletos=Count("id", filter=Q(estado__nombre__iexact="Obsoleto")),
        )
        return Response(resumen)


class BaseConfiguracionViewSet(viewsets.ModelViewSet):
    permission_classes = [PuedeAdministrarConfiguracion]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    pagination_class = None


class TipoActivoConfiguracionViewSet(BaseConfiguracionViewSet):
    queryset = TipoActivo.objects.all()
    serializer_class = TipoActivoConfiguracionSerializer


class CategoriaActivoConfiguracionViewSet(BaseConfiguracionViewSet):
    queryset = CategoriaActivo.objects.select_related("tipo_activo").all()
    serializer_class = CategoriaActivoConfiguracionSerializer


class EstadoActivoConfiguracionViewSet(BaseConfiguracionViewSet):
    queryset = EstadoActivo.objects.all()
    serializer_class = EstadoActivoConfiguracionSerializer


class UbicacionConfiguracionViewSet(BaseConfiguracionViewSet):
    queryset = Ubicacion.objects.all()
    serializer_class = UbicacionConfiguracionSerializer