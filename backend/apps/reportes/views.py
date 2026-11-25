from io import BytesIO
from xml.sax.saxutils import escape

from django.db.models import Count, Q
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.text import slugify
from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.inventario.estados import filtro_estado_prestado
from apps.inventario.models import Activo
from apps.movimientos.models import DetallePrestamo, Prestamo, SolicitudPrestamo
from apps.movimientos.serializers import PrestamoSerializer
from apps.usuarios.permissions import (
    PuedeConsultarReportes,
    es_administrador,
    puede_consultar,
)


ETIQUETAS_COLUMNAS = {
    "codigo": "Código",
    "activo": "Activo",
    "tipo": "Tipo",
    "categoria": "Categoría",
    "estado": "Estado",
    "ubicacion": "Ubicación",
    "serie": "Número de serie",
    "valor": "Valor",
    "id": "Préstamo",
    "numero_solicitud": "Solicitud #",
    "prestamo": "Préstamo",
    "nombre_receptor": "Receptor",
    "receptor": "Receptor",
    "documento_receptor": "Documento",
    "documento": "Documento",
    "fecha_prestamo": "Fecha del préstamo",
    "fecha_devolucion_prevista": "Fecha prevista de devolución",
    "fecha_prevista": "Fecha prevista",
    "estado_prestamo": "Estado del préstamo",
    "activos": "Activos",
    "total_activos": "Total de activos",
    "activos_pendientes": "Activos pendientes",
    "dias_vencido": "Días de vencimiento",
    "fecha_devolucion": "Fecha de devolución",
    "condicion": "Condición",
    "observacion": "Observación",
}


def _parametro_id(request, nombre):
    valor = request.query_params.get(nombre)
    if not valor:
        return None
    if not valor.isdigit():
        raise serializers.ValidationError({nombre: "Debe ser un identificador válido."})
    return int(valor)


def _fecha_parametro(request, nombre):
    valor = request.query_params.get(nombre)
    if not valor:
        return None
    fecha = parse_date(valor)
    if not fecha:
        raise serializers.ValidationError({nombre: "Usa el formato AAAA-MM-DD."})
    return fecha


def _filtrar_activos(request):
    activos = Activo.objects.filter(activo=True).select_related(
        "tipo_activo",
        "categoria",
        "ubicacion",
        "estado",
    )
    for parametro, campo in (
        ("estado", "estado_id"),
        ("categoria", "categoria_id"),
        ("ubicacion", "ubicacion_id"),
        ("tipo", "tipo_activo_id"),
    ):
        valor = _parametro_id(request, parametro)
        if valor:
            activos = activos.filter(**{campo: valor})

    busqueda = request.query_params.get("q", "").strip()
    if busqueda:
        activos = activos.filter(
            Q(codigo_interno__icontains=busqueda)
            | Q(nombre__icontains=busqueda)
            | Q(serie_codigo__icontains=busqueda)
        )
    return activos.order_by("codigo_interno")


def _fila_activo(activo):
    return {
        "codigo": activo.codigo_interno,
        "activo": activo.nombre,
        "tipo": activo.tipo_activo.nombre,
        "categoria": activo.categoria.nombre,
        "estado": activo.estado.nombre,
        "ubicacion": activo.ubicacion.nombre,
        "serie": activo.serie_codigo,
        "valor": str(activo.valor) if activo.valor is not None else "",
    }


def _datos_prestamos(request):
    prestamos = list(
        Prestamo.objects.select_related("solicitud").prefetch_related(
            "detalles__activo",
            "detalles__estado_devolucion",
            "detalles__ubicacion_devolucion",
        )
    )
    serializer = PrestamoSerializer(prestamos, many=True)
    resultados = list(serializer.data)
    solicitudes_visibles = SolicitudPrestamo.objects.all()
    puede_ver_todas = (
        es_administrador(request.user)
        or puede_consultar(
            request.user,
            "puede_revisar_solicitudes_prestamo",
        )
        or puede_consultar(
            request.user,
            "puede_aprobar_solicitudes_prestamo",
        )
    )
    if not puede_ver_todas:
        solicitudes_visibles = solicitudes_visibles.filter(
            solicitante=request.user,
        )
    numeros_visibles = {
        solicitud_id: numero
        for numero, solicitud_id in enumerate(
            solicitudes_visibles.order_by("id").values_list("id", flat=True),
            start=1,
        )
    }
    for prestamo, resultado in zip(prestamos, resultados):
        solicitud = getattr(prestamo, "solicitud", None)
        resultado["numero_solicitud"] = (
            numeros_visibles.get(solicitud.pk)
            if solicitud is not None
            else None
        )
    estado = request.query_params.get("estado", "").strip().casefold()
    if estado and estado != "todos":
        resultados = [
            prestamo
            for prestamo in resultados
            if prestamo["estado"].casefold() == estado
        ]
    return resultados


def _datos_vencimientos():
    hoy = timezone.localdate()
    prestamos = Prestamo.objects.filter(
        fecha_devolucion_prevista__lt=hoy,
        detalles__fecha_devolucion__isnull=True,
    ).distinct().prefetch_related("detalles__activo")
    resultados = []
    for prestamo in prestamos:
        pendientes = [
            detalle
            for detalle in prestamo.detalles.all()
            if detalle.fecha_devolucion is None
        ]
        resultados.append({
            "prestamo": prestamo.pk,
            "receptor": prestamo.nombre_receptor,
            "documento": prestamo.documento_receptor,
            "fecha_prevista": prestamo.fecha_devolucion_prevista.isoformat(),
            "dias_vencido": (hoy - prestamo.fecha_devolucion_prevista).days,
            "activos_pendientes": ", ".join(
                detalle.activo.codigo_interno for detalle in pendientes
            ),
        })
    return resultados


def _datos_devoluciones(request):
    desde = _fecha_parametro(request, "desde")
    hasta = _fecha_parametro(request, "hasta")
    if desde and hasta and desde > hasta:
        raise serializers.ValidationError({
            "desde": "La fecha inicial no puede ser posterior a la fecha final."
        })
    devoluciones = DetallePrestamo.objects.filter(
        fecha_devolucion__isnull=False,
    ).select_related(
        "prestamo",
        "activo",
        "estado_devolucion",
        "ubicacion_devolucion",
    )
    if desde:
        devoluciones = devoluciones.filter(fecha_devolucion__date__gte=desde)
    if hasta:
        devoluciones = devoluciones.filter(fecha_devolucion__date__lte=hasta)

    condicion = request.query_params.get("condicion")
    if condicion:
        if condicion not in DetallePrestamo.CondicionDevolucion.values:
            raise serializers.ValidationError({
                "condicion": "Selecciona una condición válida."
            })
        devoluciones = devoluciones.filter(condicion_devolucion=condicion)

    return [{
        "fecha_devolucion": detalle.fecha_devolucion.isoformat(),
        "prestamo": detalle.prestamo_id,
        "receptor": detalle.prestamo.nombre_receptor,
        "documento": detalle.prestamo.documento_receptor,
        "codigo": detalle.activo.codigo_interno,
        "activo": detalle.activo.nombre,
        "condicion": detalle.get_condicion_devolucion_display(),
        "observacion": detalle.observacion_devolucion,
        "estado": detalle.estado_devolucion.nombre,
        "ubicacion": detalle.ubicacion_devolucion.nombre,
    } for detalle in devoluciones.order_by("-fecha_devolucion", "id")]


class InventarioReporteView(APIView):
    permission_classes = [PuedeConsultarReportes]

    def get(self, request):
        activos = _filtrar_activos(request)
        resumen = activos.aggregate(
            total=Count("id"),
            disponibles=Count("id", filter=Q(estado__nombre__iexact="Disponible")),
            prestados=Count("id", filter=filtro_estado_prestado("estado__nombre")),
            obsoletos=Count("id", filter=Q(estado__nombre__iexact="Obsoleto")),
        )
        distribucion = {
            "estados": list(
                activos.values("estado__nombre")
                .annotate(total=Count("id"))
                .order_by("estado__nombre")
            ),
            "categorias": list(
                activos.values("categoria__nombre")
                .annotate(total=Count("id"))
                .order_by("categoria__nombre")
            ),
            "ubicaciones": list(
                activos.values("ubicacion__nombre")
                .annotate(total=Count("id"))
                .order_by("ubicacion__nombre")
            ),
        }
        return Response({
            "resumen": resumen,
            "distribucion": distribucion,
            "resultados": [_fila_activo(activo) for activo in activos],
        })


class PrestamosReporteView(APIView):
    permission_classes = [PuedeConsultarReportes]

    def get(self, request):
        return Response(_datos_prestamos(request))


def _descargar_formato_prestamo(pk, campo_pdf, sufijo):
    solicitud = get_object_or_404(
        SolicitudPrestamo.objects.only("id", "consecutivo", campo_pdf),
        prestamo_id=pk,
    )
    contenido = getattr(solicitud, campo_pdf)
    if not contenido:
        raise Http404("El formato solicitado todavía no está disponible.")

    nombre = slugify(solicitud.consecutivo) or f"prestamo-{pk}"
    response = HttpResponse(bytes(contenido), content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="OYS-FO-09-{nombre}-{sufijo}.pdf"'
    )
    return response


class DescargarListadoHerramientasPrestamoView(APIView):
    permission_classes = [PuedeConsultarReportes]

    def get(self, request, pk):
        return _descargar_formato_prestamo(
            pk,
            "formato_salida_pdf",
            "salida",
        )


class DescargarFormatoRetornoPrestamoView(APIView):
    permission_classes = [PuedeConsultarReportes]

    def get(self, request, pk):
        return _descargar_formato_prestamo(
            pk,
            "formato_retorno_pdf",
            "retorno",
        )


class VencimientosReporteView(APIView):
    permission_classes = [PuedeConsultarReportes]

    def get(self, request):
        return Response(_datos_vencimientos())


class DevolucionesReporteView(APIView):
    permission_classes = [PuedeConsultarReportes]

    def get(self, request):
        return Response(_datos_devoluciones(request))


class ExportarReporteView(APIView):
    permission_classes = [PuedeConsultarReportes]

    def get(self, request, tipo, formato):
        obtener_datos = {
            "inventario": lambda: [
                _fila_activo(activo) for activo in _filtrar_activos(request)
            ],
            "prestamos": lambda: _datos_prestamos(request),
            "vencimientos": _datos_vencimientos,
            "devoluciones": lambda: _datos_devoluciones(request),
        }
        titulos = {
            "inventario": "Inventario de activos",
            "prestamos": "Préstamos",
            "vencimientos": "Préstamos vencidos",
            "devoluciones": "Historial de devoluciones",
        }
        if tipo not in obtener_datos or formato not in {"xlsx", "pdf"}:
            raise serializers.ValidationError("Tipo o formato de reporte no válido.")

        datos = obtener_datos[tipo]()
        columnas = list(datos[0]) if datos else self.columnas_vacias(tipo)
        if tipo == "prestamos":
            columnas = ["numero_solicitud"] + [
                columna
                for columna in columnas
                if columna not in {"id", "numero_solicitud"}
            ]
        nombre_archivo = f"valser-{tipo}-{timezone.localdate().isoformat()}.{formato}"
        if formato == "xlsx":
            return self.exportar_excel(nombre_archivo, titulos[tipo], columnas, datos)
        return self.exportar_pdf(nombre_archivo, titulos[tipo], columnas, datos)

    def columnas_vacias(self, tipo):
        return {
            "inventario": ["codigo", "activo", "tipo", "categoria", "estado", "ubicacion", "serie", "valor"],
            "prestamos": ["numero_solicitud", "nombre_receptor", "documento_receptor", "fecha_prestamo", "fecha_devolucion_prevista", "estado"],
            "vencimientos": ["prestamo", "receptor", "documento", "fecha_prevista", "dias_vencido", "activos_pendientes"],
            "devoluciones": ["fecha_devolucion", "prestamo", "receptor", "documento", "codigo", "activo", "condicion", "observacion", "estado", "ubicacion"],
        }[tipo]

    def exportar_excel(self, nombre, titulo, columnas, datos):
        libro = Workbook()
        hoja = libro.active
        hoja.title = "Reporte"
        hoja.append([titulo])
        hoja.append([ETIQUETAS_COLUMNAS.get(columna, columna) for columna in columnas])
        for fila in datos:
            hoja.append([
                self.valor_excel(fila.get(columna, ""))
                for columna in columnas
            ])
        hoja.freeze_panes = "A3"
        hoja.auto_filter.ref = hoja.dimensions
        for columna in hoja.columns:
            letra = columna[0].column_letter
            ancho = max(
                (len(str(celda.value or "")) for celda in columna),
                default=10,
            )
            hoja.column_dimensions[letra].width = min(max(ancho + 2, 12), 42)

        contenido = BytesIO()
        libro.save(contenido)
        response = HttpResponse(
            contenido.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{nombre}"'
        return response

    def valor_excel(self, valor):
        if isinstance(valor, str) and valor.startswith(("=", "+", "-", "@")):
            return f"'{valor}"
        return valor

    def exportar_pdf(self, nombre, titulo, columnas, datos):
        contenido = BytesIO()
        documento = SimpleDocTemplate(
            contenido,
            pagesize=landscape(A4),
            rightMargin=12 * mm,
            leftMargin=12 * mm,
            topMargin=12 * mm,
            bottomMargin=12 * mm,
        )
        estilos = getSampleStyleSheet()
        filas = [[
            Paragraph(
                f"<b>{escape(ETIQUETAS_COLUMNAS.get(columna, columna))}</b>",
                estilos["BodyText"],
            )
            for columna in columnas
        ]]
        for fila in datos:
            filas.append([
                Paragraph(escape(str(fila.get(columna, "") or "")), estilos["BodyText"])
                for columna in columnas
            ])

        ancho = documento.width / max(len(columnas), 1)
        tabla = Table(
            filas,
            repeatRows=1,
            colWidths=[ancho] * len(columnas),
        )
        tabla.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0D6F0C")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D7DED6")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F7F2")]),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        documento.build([
            Paragraph(escape(titulo), estilos["Title"]),
            Spacer(1, 6 * mm),
            tabla,
        ])
        response = HttpResponse(contenido.getvalue(), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{nombre}"'
        return response
