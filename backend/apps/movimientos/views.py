from django.db import IntegrityError, models, transaction
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import generics, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.inventario.estados import (
    es_estado_prestado,
    filtro_estado_prestado,
    obtener_estado_prestado,
)
from apps.inventario.models import Activo, EstadoActivo
from apps.usuarios.permissions import (
    PuedeRegistrarMovimientos,
    PuedeConsultarDevoluciones,
    PuedeConsultarListasHerramientas,
    PuedeSolicitarPrestamo,
    es_administrador,
    puede_consultar,
)

from .models import (
    ConsumiblePrestamo,
    DetallePrestamo,
    ListaHerramientasPrestamo,
    Prestamo,
    RevisionActivoSolicitud,
    SolicitudPrestamo,
)
from .pdf import generar_formato_oys
from .serializers import (
    ActivoPrestamoSerializer,
    CrearPrestamoSerializer,
    CrearSolicitudPrestamoSerializer,
    ListaHerramientasPrestamoSerializer,
    PrestamoSerializer,
    RechazarSolicitudPrestamoSerializer,
    RegistrarDevolucionSerializer,
    RevisarSolicitudPrestamoSerializer,
    SolicitudPrestamoSerializer,
)


def _eliminar_prestamo_y_historial(prestamo, usuario):
    detalles = list(
        DetallePrestamo.objects.select_for_update()
        .filter(prestamo=prestamo)
        .select_related("estado_al_prestar", "ubicacion_al_prestar")
        .order_by("activo_id", "pk")
    )
    activos = {
        activo.pk: activo
        for activo in Activo.objects.select_for_update()
        .filter(pk__in={detalle.activo_id for detalle in detalles})
        .select_related("estado")
        .order_by("pk")
    }

    for detalle in detalles:
        activo = activos[detalle.activo_id]
        if (
            detalle.fecha_devolucion
            or not es_estado_prestado(activo.estado.nombre)
        ):
            continue
        otro_prestamo_pendiente = DetallePrestamo.objects.filter(
            activo_id=activo.pk,
            fecha_devolucion__isnull=True,
        ).exclude(prestamo_id=prestamo.pk).exists()
        if otro_prestamo_pendiente:
            continue

        activo.estado = detalle.estado_al_prestar
        activo.ubicacion = detalle.ubicacion_al_prestar
        activo.modificado_por = usuario
        activo.save(update_fields=[
            "estado",
            "ubicacion",
            "modificado_por",
            "fecha_modificacion",
        ])

    solicitudes = list(
        SolicitudPrestamo.objects.select_for_update().filter(prestamo=prestamo)
    )
    for solicitud in solicitudes:
        solicitud.delete()
    DetallePrestamo.objects.filter(prestamo=prestamo).delete()
    prestamo.delete()


def _respuesta_formato_oys(solicitud, campo, sufijo):
    archivo = getattr(solicitud, campo)
    if not archivo:
        raise Http404("El formato solicitado todavía no está disponible.")
    consecutivo = slugify(solicitud.consecutivo) or f"solicitud-{solicitud.pk}"
    response = HttpResponse(bytes(archivo), content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="OYS-FO-09-{consecutivo}-{sufijo}.pdf"'
    )
    return response


class SolicitudPrestamoViewSet(viewsets.ModelViewSet):
    queryset = SolicitudPrestamo.objects.select_related(
        "solicitante",
        "resuelto_por",
        "revisado_por",
        "prestamo",
    ).prefetch_related("activos", "revision_activos")
    serializer_class = SolicitudPrestamoSerializer
    permission_classes = [PuedeSolicitarPrestamo]
    pagination_class = None
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if (
            es_administrador(self.request.user)
            or puede_consultar(
                self.request.user,
                "puede_revisar_solicitudes_prestamo",
            )
            or puede_consultar(
                self.request.user,
                "puede_aprobar_solicitudes_prestamo",
            )
        ):
            return queryset
        return queryset.filter(solicitante=self.request.user)

    def get_serializer_class(self):
        if self.action == "create":
            return CrearSolicitudPrestamoSerializer
        if self.action == "rechazar":
            return RechazarSolicitudPrestamoSerializer
        if self.action == "revisar":
            return RevisarSolicitudPrestamoSerializer
        return SolicitudPrestamoSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                solicitud = serializer.save()
        except IntegrityError as error:
            consecutivo = serializer.validated_data["consecutivo"]
            if SolicitudPrestamo.objects.filter(
                consecutivo__iexact=consecutivo,
            ).exclude(consecutivo="").exists():
                raise serializers.ValidationError({
                    "consecutivo": "Ya existe una solicitud con ese consecutivo."
                }) from error
            raise
        return Response(
            SolicitudPrestamoSerializer(solicitud).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        pk = kwargs.get(self.lookup_field)
        prestamo_id = SolicitudPrestamo.objects.filter(
            pk=pk,
        ).values_list("prestamo_id", flat=True).first()

        if prestamo_id:
            with transaction.atomic():
                prestamo = get_object_or_404(
                    Prestamo.objects.select_for_update(),
                    pk=prestamo_id,
                )
                solicitud = get_object_or_404(
                    SolicitudPrestamo.objects,
                    pk=pk,
                )
                if solicitud.prestamo_id != prestamo.pk:
                    raise serializers.ValidationError({
                        "detail": (
                            "La solicitud cambió mientras se intentaba eliminar. "
                            "Actualiza la página e inténtalo de nuevo."
                        )
                    })
                _eliminar_prestamo_y_historial(prestamo, request.user)
        else:
            with transaction.atomic():
                solicitud = get_object_or_404(
                    SolicitudPrestamo.objects.select_for_update(),
                    pk=pk,
                )
                if solicitud.prestamo_id:
                    raise serializers.ValidationError({
                        "detail": (
                            "La solicitud acaba de aprobarse. Actualiza la página "
                            "antes de eliminarla."
                        )
                    })
                solicitud.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def aprobar(self, request, pk=None):
        with transaction.atomic():
            solicitud = get_object_or_404(
                SolicitudPrestamo.objects.select_for_update(),
                pk=pk,
            )
            if solicitud.estado != SolicitudPrestamo.Estado.REVISADA:
                raise serializers.ValidationError({
                    "estado": "Almacén debe revisar la solicitud antes de aprobarla."
                })

            revisiones = list(
                RevisionActivoSolicitud.objects.select_for_update()
                .filter(solicitud=solicitud)
                .order_by("activo_id")
            )
            activos_solicitados = set(
                solicitud.activos.values_list("pk", flat=True)
            )
            if (
                len(revisiones) != len(activos_solicitados)
                or {revision.activo_id for revision in revisiones}
                != activos_solicitados
                or any(not revision.condicion for revision in revisiones)
            ):
                raise serializers.ValidationError({
                    "revision": "Completa el checklist de todos los activos antes de aprobar."
                })
            activos_a_prestar = [
                revision.activo_id
                for revision in revisiones
                if revision.incluir_en_salida
            ]
            if not activos_a_prestar:
                raise serializers.ValidationError({
                    "activos": "Debe quedar al menos un activo incluido en la salida."
                })
            if any(
                revision.incluir_en_salida
                and revision.condicion != RevisionActivoSolicitud.Condicion.BUENO
                for revision in revisiones
            ):
                raise serializers.ValidationError({
                    "revision": (
                        "No se puede aprobar: corrige o excluye los activos "
                        "marcados como malos."
                    )
                })

            serializer = CrearPrestamoSerializer(
                data={
                    "cliente": solicitud.cliente,
                    "consecutivo": solicitud.consecutivo,
                    "nombre_receptor": solicitud.nombre_receptor,
                    "documento_receptor": solicitud.documento_receptor,
                    "fecha_devolucion_prevista": solicitud.fecha_devolucion_prevista,
                    "observaciones": "\n".join(
                        valor
                        for valor in (
                            f"Motivo de solicitud: {solicitud.motivo}",
                            solicitud.observaciones.strip(),
                        )
                        if valor
                    ),
                    "activos": activos_a_prestar,
                },
                context={
                    "request": request,
                    "solicitud": solicitud,
                },
            )
            serializer.is_valid(raise_exception=True)
            prestamo = serializer.save()

            solicitud.estado = SolicitudPrestamo.Estado.APROBADA
            solicitud.resuelto_por = request.user
            solicitud.fecha_resolucion = timezone.now()
            solicitud.prestamo = prestamo
            solicitud.save(update_fields=[
                "estado",
                "resuelto_por",
                "fecha_resolucion",
                "prestamo",
            ])
            solicitud.formato_salida_pdf = generar_formato_oys(solicitud)
            solicitud.save(update_fields=["formato_salida_pdf"])

        return Response(SolicitudPrestamoSerializer(solicitud).data)

    @action(detail=True, methods=["post"])
    def revisar(self, request, pk=None):
        with transaction.atomic():
            solicitud = get_object_or_404(
                SolicitudPrestamo.objects.select_for_update(),
                pk=pk,
            )
            if solicitud.estado not in {
                SolicitudPrestamo.Estado.PENDIENTE,
                SolicitudPrestamo.Estado.REVISADA,
            }:
                raise serializers.ValidationError({
                    "estado": "Solo se pueden revisar solicitudes sin resolver."
                })

            serializer = self.get_serializer(
                data=request.data,
                context={
                    **self.get_serializer_context(),
                    "solicitud": solicitud,
                },
            )
            serializer.is_valid(raise_exception=True)
            for detalle in serializer.validated_data["detalles"]:
                RevisionActivoSolicitud.objects.filter(
                    solicitud=solicitud,
                    activo_id=detalle["activo_id"],
                ).update(
                    condicion=detalle["condicion"],
                    observacion=detalle.get("observacion", ""),
                    incluir_en_salida=detalle["incluir_en_salida"],
                )

            solicitud.estado = SolicitudPrestamo.Estado.REVISADA
            solicitud.revisado_por = request.user
            solicitud.fecha_revision = timezone.now()
            if any(
                detalle["incluir_en_salida"]
                for detalle in serializer.validated_data["detalles"]
            ):
                solicitud.formato_salida_pdf = generar_formato_oys(
                    solicitud,
                    previsualizacion=True,
                )
            else:
                solicitud.formato_salida_pdf = None
            solicitud.save(update_fields=[
                "estado",
                "revisado_por",
                "fecha_revision",
                "formato_salida_pdf",
            ])

        solicitud = self.get_queryset().get(pk=pk)
        return Response(SolicitudPrestamoSerializer(solicitud).data)

    @action(detail=True, methods=["post"])
    def rechazar(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            solicitud = get_object_or_404(
                SolicitudPrestamo.objects.select_for_update(),
                pk=pk,
            )
            if solicitud.estado not in {
                SolicitudPrestamo.Estado.PENDIENTE,
                SolicitudPrestamo.Estado.REVISADA,
            }:
                raise serializers.ValidationError({
                    "estado": "Solo se pueden rechazar solicitudes sin resolver."
                })

            solicitud.estado = SolicitudPrestamo.Estado.RECHAZADA
            solicitud.resuelto_por = request.user
            solicitud.fecha_resolucion = timezone.now()
            solicitud.observaciones_resolucion = (
                serializer.validated_data["observaciones_resolucion"]
            )
            solicitud.save(update_fields=[
                "estado",
                "resuelto_por",
                "fecha_resolucion",
                "observaciones_resolucion",
            ])

        return Response(SolicitudPrestamoSerializer(solicitud).data)

    def _descargar_formato(self, solicitud, campo, sufijo):
        return _respuesta_formato_oys(solicitud, campo, sufijo)

    @action(detail=True, methods=["get"], url_path="formato-salida")
    def formato_salida(self, request, pk=None):
        solicitud = self.get_object()
        return self._descargar_formato(
            solicitud,
            "formato_salida_pdf",
            "salida",
        )

    @action(detail=True, methods=["get"], url_path="formato-retorno")
    def formato_retorno(self, request, pk=None):
        solicitud = self.get_object()
        return self._descargar_formato(
            solicitud,
            "formato_retorno_pdf",
            "retorno",
        )


class ActivosPrestamoView(generics.ListAPIView):
    serializer_class = ActivoPrestamoSerializer
    permission_classes = [PuedeRegistrarMovimientos]
    pagination_class = None

    def get_queryset(self):
        activos_prestados = DetallePrestamo.objects.filter(
            activo_id=models.OuterRef("pk"),
            fecha_devolucion__isnull=True,
        )
        return (
            Activo.objects.filter(
                activo=True,
                estado__permite_prestamo=True,
            )
            .exclude(filtro_estado_prestado("estado__nombre"))
            .filter(~models.Exists(activos_prestados))
            .select_related(
                "estado",
                "ubicacion",
                "tipo_activo",
                "categoria",
            )
            .order_by("codigo_interno")
        )


class ListaHerramientasPrestamoViewSet(viewsets.ModelViewSet):
    queryset = ListaHerramientasPrestamo.objects.prefetch_related("activos")
    serializer_class = ListaHerramientasPrestamoSerializer
    permission_classes = [PuedeConsultarListasHerramientas]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def perform_create(self, serializer):
        serializer.save(creado_por=self.request.user)

    @action(detail=False, methods=["get"], url_path="activos")
    def activos(self, request):
        queryset = Activo.objects.all().select_related(
            "tipo_activo",
            "categoria",
            "ubicacion",
            "estado",
        )
        return Response(ActivoPrestamoSerializer(queryset, many=True).data)


class PrestamoViewSet(viewsets.ModelViewSet):
    queryset = Prestamo.objects.select_related("solicitud").prefetch_related(
        "detalles__activo",
        "detalles__estado_devolucion",
        "detalles__ubicacion_devolucion",
        "detalles__devolucion_registrada_por",
        "consumibles",
    )
    permission_classes = [PuedeConsultarDevoluciones]
    pagination_class = None
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return CrearPrestamoSerializer
        return PrestamoSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if (
            not es_administrador(self.request.user)
            and not puede_consultar(
                self.request.user,
                "puede_ver_movimientos",
            )
        ):
            return queryset.filter(
                models.Q(detalles__fecha_devolucion__isnull=True)
                | models.Q(solicitud__formato_retorno_pdf__isnull=False),
            ).distinct()
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        prestamo = serializer.save()
        response_data = PrestamoSerializer(
            prestamo,
            context=self.get_serializer_context(),
        ).data
        return Response(response_data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            prestamo = get_object_or_404(
                Prestamo.objects.select_for_update(),
                pk=kwargs.get(self.lookup_field),
            )
            _eliminar_prestamo_y_historial(prestamo, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="devolver")
    def devolver(self, request, pk=None):
        serializer = RegistrarDevolucionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos_devolucion = serializer.validated_data.get("detalles", [])

        with transaction.atomic():
            prestamo = get_object_or_404(
                Prestamo.objects.select_for_update(),
                pk=pk,
            )
            ids = [detalle["detalle_id"] for detalle in datos_devolucion]
            detalles = list(
                DetallePrestamo.objects.select_for_update()
                .filter(prestamo=prestamo, pk__in=ids)
                .select_related("activo", "activo__estado")
                .order_by("pk")
            )
            if len(detalles) != len(ids):
                raise serializers.ValidationError({
                    "detalles": "Uno o más activos no pertenecen a este préstamo."
                })

            consumibles_devolucion = serializer.validated_data.get(
                "consumibles",
                [],
            )
            ids_consumibles = [
                consumible["consumible_id"]
                for consumible in consumibles_devolucion
            ]
            consumibles = list(
                ConsumiblePrestamo.objects.select_for_update()
                .filter(prestamo=prestamo, pk__in=ids_consumibles)
                .order_by("pk")
            )
            if len(consumibles) != len(ids_consumibles):
                raise serializers.ValidationError({
                    "consumibles": "Uno o más consumibles no pertenecen a este préstamo."
                })

            estado_prestado = None
            if detalles:
                estado_prestado = obtener_estado_prestado()
                if not estado_prestado:
                    raise serializers.ValidationError({
                        "detalles": (
                            "El estado 'En servicio' o 'Prestado' ya no está disponible."
                        )
                    })

            por_id = {detalle.pk: detalle for detalle in detalles}
            consumibles_por_id = {
                consumible.pk: consumible for consumible in consumibles
            }
            ahora = timezone.now()
            for datos in datos_devolucion:
                if es_estado_prestado(datos["estado"].nombre):
                    raise serializers.ValidationError({
                        "detalles": (
                            "El estado de devolución no puede ser 'En servicio' "
                            "ni 'Prestado'."
                        )
                    })
                detalle = por_id[datos["detalle_id"]]
                if detalle.fecha_devolucion:
                    raise serializers.ValidationError({
                        "detalles": (
                            f"El activo {detalle.activo.codigo_interno} "
                            "ya fue devuelto."
                        )
                    })

                activo = Activo.objects.select_for_update().get(pk=detalle.activo_id)
                if not es_estado_prestado(activo.estado.nombre):
                    raise serializers.ValidationError({
                        "detalles": (
                            f"El activo {activo.codigo_interno} ya no figura "
                            "como prestado."
                        )
                    })

                activo.estado = datos["estado"]
                activo.ubicacion = datos["ubicacion"]
                activo.modificado_por = request.user
                activo.save(
                    update_fields=[
                        "estado",
                        "ubicacion",
                        "modificado_por",
                        "fecha_modificacion",
                    ]
                )

                detalle.fecha_devolucion = ahora
                detalle.estado_devolucion = datos["estado"]
                detalle.ubicacion_devolucion = datos["ubicacion"]
                detalle.condicion_devolucion = datos["condicion"]
                detalle.observacion_devolucion = datos.get("observacion", "")
                detalle.cantidad_recibida = 1
                detalle.devolucion_registrada_por = request.user
                detalle.save(update_fields=[
                    "fecha_devolucion",
                    "estado_devolucion",
                    "ubicacion_devolucion",
                    "condicion_devolucion",
                    "observacion_devolucion",
                    "cantidad_recibida",
                    "devolucion_registrada_por",
                ])
            for datos in consumibles_devolucion:
                consumible = consumibles_por_id[datos["consumible_id"]]
                if consumible.cantidad_recibida is not None:
                    raise serializers.ValidationError({
                        "consumibles": (
                            f"El consumible {consumible.nombre} ya tiene una "
                            "devolución registrada."
                        )
                    })
                if datos["cantidad_recibida"] > consumible.cantidad:
                    raise serializers.ValidationError({
                        "consumibles": (
                            f"La cantidad recibida de {consumible.nombre} no puede "
                            "ser mayor a la cantidad entregada."
                        )
                    })
                consumible.cantidad_recibida = datos["cantidad_recibida"]
                consumible.save(update_fields=["cantidad_recibida"])

            solicitud = SolicitudPrestamo.objects.filter(
                prestamo=prestamo,
            ).select_related(
                "solicitante",
                "prestamo",
            ).first()
            if (
                solicitud
                and not prestamo.detalles.filter(
                    fecha_devolucion__isnull=True,
                ).exists()
                and not prestamo.consumibles.filter(
                    cantidad_recibida__isnull=True,
                ).exists()
            ):
                solicitud.formato_retorno_pdf = generar_formato_oys(
                    solicitud,
                    incluir_retorno=True,
                )
                solicitud.save(update_fields=["formato_retorno_pdf"])

        prestamo_actualizado = Prestamo.objects.select_related(
            "solicitud",
        ).prefetch_related(
            "detalles__activo",
            "detalles__estado_devolucion",
            "detalles__ubicacion_devolucion",
            "detalles__devolucion_registrada_por",
            "consumibles",
        ).get(pk=pk)
        return Response(PrestamoSerializer(
            prestamo_actualizado,
            context=self.get_serializer_context(),
        ).data)

    @action(detail=True, methods=["get"], url_path="formato-retorno")
    def formato_retorno(self, request, pk=None):
        prestamo = get_object_or_404(
            Prestamo.objects.select_related("solicitud"),
            pk=pk,
        )
        if (
            not es_administrador(request.user)
            and not puede_consultar(request.user, "puede_ver_movimientos")
            and not puede_consultar(request.user, "puede_registrar_devoluciones")
            and not DetallePrestamo.objects.filter(
                prestamo=prestamo,
                devolucion_registrada_por=request.user,
            ).exists()
        ):
            raise Http404("El formato solicitado no está disponible.")

        solicitud = getattr(prestamo, "solicitud", None)
        if not solicitud:
            raise Http404("El formato de retorno todavía no está disponible.")
        return _respuesta_formato_oys(
            solicitud,
            "formato_retorno_pdf",
            "retorno",
        )
