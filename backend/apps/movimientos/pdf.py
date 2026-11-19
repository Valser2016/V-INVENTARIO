import logging
import os
import shutil
import subprocess
import sys
import tempfile
import warnings
from copy import copy
from datetime import date, datetime
from pathlib import Path

from django.utils import timezone
from openpyxl.drawing.image import Image as ExcelImage
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, OneCellAnchor
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl import load_workbook
from openpyxl.worksheet.cell_range import CellRange
from rest_framework import status
from rest_framework.exceptions import APIException

from .models import DetallePrestamo


LOGGER = logging.getLogger(__name__)
PLANTILLA_OYS_EMPAQUETADA = Path(__file__).with_name("OYS-FO-09.xlsx")
PLANTILLA_OYS_PROYECTO = (
    Path(__file__).resolve().parents[3]
    / "OYS-FO-09 LISTADO DE HERRAMIENTAS PARA SERVICIOS (8).xlsx"
)
PLANTILLA_OYS_CONFIGURADA = os.environ.get("OYS_TEMPLATE_PATH")
PLANTILLA_OYS = (
    Path(PLANTILLA_OYS_CONFIGURADA).expanduser()
    if PLANTILLA_OYS_CONFIGURADA
    else PLANTILLA_OYS_PROYECTO
    if PLANTILLA_OYS_PROYECTO.is_file()
    else PLANTILLA_OYS_EMPAQUETADA
)
LOGO_OYS = Path(__file__).with_name("logo_oys.png")
HOJA_OYS = "LISTADO"
FILA_ACTIVOS_INICIO = 10
FILAS_ACTIVOS_PLANTILLA = 30
FILA_ACTIVOS_FIN = FILA_ACTIVOS_INICIO + FILAS_ACTIVOS_PLANTILLA - 1
FILA_FIRMAS = 43
FILA_OBSERVACIONES = 46


class ConversorNoDisponible(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = (
        "No está disponible LibreOffice para convertir el formato OYS-FO-09 "
        "a PDF. Instálalo en el servidor o configura LIBREOFFICE_PATH."
    )
    default_code = "conversor_excel_pdf_no_disponible"


def _agregar_logo_oys(hoja):
    if not LOGO_OYS.is_file():
        raise ConversorNoDisponible(
            f"No se encontró la imagen del logotipo OYS-FO-09: {LOGO_OYS.name}."
        )

    ancho_emu = 2675467
    alto_emu = 916657
    imagen = ExcelImage(str(LOGO_OYS))
    imagen.width = ancho_emu / 9525
    imagen.height = alto_emu / 9525
    imagen.anchor = OneCellAnchor(
        _from=AnchorMarker(
            col=0,
            colOff=160866,
            row=0,
            rowOff=183614,
        ),
        ext=XDRPositiveSize2D(cx=ancho_emu, cy=alto_emu),
    )
    hoja.add_image(imagen)


def _nombre_usuario(usuario):
    if not usuario:
        return ""
    nombre = f"{usuario.first_name} {usuario.last_name}".strip()
    return nombre or usuario.username


def _establecer_texto(hoja, referencia, valor):
    celda = hoja[referencia]
    celda.value = str(valor or "")
    celda.data_type = "s"


def _establecer_fecha(hoja, referencia, valor):
    if not valor:
        return
    if isinstance(valor, datetime):
        if timezone.is_aware(valor):
            valor = timezone.localtime(valor)
        valor = valor.date()
    if isinstance(valor, date):
        celda = hoja[referencia]
        celda.value = valor
        celda.number_format = "yyyy-mm-dd"


def _extender_filas_activos(hoja, cantidad):
    extras = max(0, cantidad - FILAS_ACTIVOS_PLANTILLA)
    if not extras:
        return 0

    fila_modelo = FILA_ACTIVOS_FIN
    estilos_fila = [
        copy(hoja.cell(fila_modelo, columna)._style)
        for columna in range(1, 18)
    ]
    alto_fila = hoja.row_dimensions[fila_modelo].height

    rangos_pie = [
        CellRange(str(rango))
        for rango in hoja.merged_cells.ranges
        if rango.min_row >= FILA_ACTIVOS_FIN + 1
    ]
    estilos_pie = {}
    for rango in rangos_pie:
        for fila in range(rango.min_row, rango.max_row + 1):
            for columna in range(rango.min_col, rango.max_col + 1):
                estilos_pie[(fila, columna)] = copy(
                    hoja.cell(fila, columna)._style
                )
        hoja.unmerge_cells(str(rango))

    dimensiones_pie = {
        fila: copy(hoja.row_dimensions[fila])
        for fila in range(FILA_ACTIVOS_FIN + 1, 48)
        if fila in hoja.row_dimensions
    }
    for fila in range(FILA_ACTIVOS_FIN + 1, 48):
        hoja.row_dimensions.pop(fila, None)

    hoja.insert_rows(FILA_ACTIVOS_FIN + 1, extras)

    for indice, fila in enumerate(
        range(FILA_ACTIVOS_FIN + 1, FILA_ACTIVOS_FIN + extras + 1),
        start=FILAS_ACTIVOS_PLANTILLA + 1,
    ):
        for columna, estilo in enumerate(estilos_fila, start=1):
            hoja.cell(fila, columna)._style = copy(estilo)
        hoja.row_dimensions[fila].height = alto_fila
        hoja.cell(fila, 1).value = indice
        hoja.merge_cells(start_row=fila, start_column=2, end_row=fila, end_column=9)
        hoja.merge_cells(start_row=fila, start_column=10, end_row=fila, end_column=11)
        hoja.merge_cells(start_row=fila, start_column=12, end_row=fila, end_column=13)

    for (fila, columna), estilo in estilos_pie.items():
        hoja.cell(fila + extras, columna)._style = copy(estilo)
    for rango in rangos_pie:
        hoja.merge_cells(
            start_row=rango.min_row + extras,
            start_column=rango.min_col,
            end_row=rango.max_row + extras,
            end_column=rango.max_col,
        )
    for fila, dimension in dimensiones_pie.items():
        dimension.index = fila + extras
        hoja.row_dimensions[fila + extras] = dimension

    hoja.print_area = f"A1:Q{47 + extras}"
    hoja.print_title_rows = "9:9"
    return extras


def _rellenar_plantilla(
    solicitud,
    incluir_retorno,
    archivo_excel,
    previsualizacion=False,
):
    if not PLANTILLA_OYS.is_file():
        raise ConversorNoDisponible(
            f"No se encontró la plantilla OYS-FO-09: {PLANTILLA_OYS.name}."
        )

    prestamo = solicitud.prestamo if solicitud.prestamo_id else None
    revisiones = list(
        solicitud.revision_activos.select_related("activo").order_by(
            "activo__codigo_interno"
        )
    )
    condiciones = {
        revision.activo_id: revision.condicion
        for revision in revisiones
    }
    if prestamo:
        detalles = list(
            prestamo.detalles.select_related(
                "activo",
                "estado_al_prestar",
                "estado_devolucion",
                "devolucion_registrada_por",
            ).order_by("activo__codigo_interno")
        )
    else:
        detalles = [
            revision
            for revision in revisiones
            if revision.incluir_en_salida
        ]
    if incluir_retorno and not prestamo:
        raise ValueError("No se puede generar un formato de retorno sin préstamo.")
    if not detalles:
        raise ValueError("No se puede generar OYS-FO-09 sin activos.")

    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="wmf image format is not supported",
            category=UserWarning,
        )
        libro = load_workbook(PLANTILLA_OYS)

    try:
        if HOJA_OYS not in libro.sheetnames:
            raise ConversorNoDisponible(
                f"La plantilla OYS-FO-09 no contiene la hoja {HOJA_OYS}."
            )
        hoja = libro[HOJA_OYS]
        for otra_hoja in libro.worksheets:
            otra_hoja.sheet_state = (
                "visible" if otra_hoja.title == HOJA_OYS else "hidden"
            )
        libro.active = libro.sheetnames.index(HOJA_OYS)
        _agregar_logo_oys(hoja)

        extras = _extender_filas_activos(hoja, len(detalles))

        _establecer_texto(hoja, "D5", solicitud.cliente)
        _establecer_texto(hoja, "M5", _nombre_usuario(solicitud.solicitante))
        _establecer_texto(hoja, "D7", solicitud.consecutivo)
        _establecer_fecha(hoja, "M7", solicitud.fecha_solicitud)
        if prestamo and not previsualizacion:
            _establecer_fecha(hoja, f"D{41 + extras}", prestamo.fecha_prestamo)
        _establecer_texto(
            hoja,
            f"C{FILA_FIRMAS + extras}",
            _nombre_usuario(
                solicitud.revisado_por if previsualizacion else solicitud.resuelto_por
            ),
        )
        _establecer_texto(
            hoja,
            f"G{FILA_FIRMAS + extras}",
            prestamo.nombre_receptor if prestamo else solicitud.nombre_receptor,
        )
        hoja[f"G{FILA_FIRMAS + extras}"].font = copy(
            hoja[f"C{FILA_FIRMAS + extras}"].font
        )

        if incluir_retorno:
            fechas_devolucion = [
                detalle.fecha_devolucion
                for detalle in detalles
                if detalle.fecha_devolucion
            ]
            _establecer_fecha(
                hoja,
                f"L{41 + extras}",
                max(fechas_devolucion, default=None),
            )
            _establecer_texto(
                hoja,
                f"K{FILA_FIRMAS + extras}",
                prestamo.nombre_receptor,
            )
            usuarios_devolucion = sorted({
                _nombre_usuario(detalle.devolucion_registrada_por)
                for detalle in detalles
                if detalle.devolucion_registrada_por_id
            })
            _establecer_texto(
                hoja,
                f"O{FILA_FIRMAS + extras}",
                ", ".join(usuarios_devolucion),
            )

        observaciones = []
        if solicitud.motivo:
            observaciones.append(f"Motivo: {solicitud.motivo}")
        if solicitud.observaciones:
            observaciones.append(f"Observaciones: {solicitud.observaciones}")
        if previsualizacion:
            observaciones.append(
                "PREVISUALIZACIÓN DE SALIDA: pendiente de aprobación administrativa."
            )
            for revision in revisiones:
                if not revision.incluir_en_salida:
                    comentario = f" — {revision.observacion}" if revision.observacion else ""
                    observaciones.append(
                        f"No se entrega: {revision.activo.codigo_interno} "
                        f"(excluido de la salida){comentario}"
                    )
        if incluir_retorno:
            for detalle in detalles:
                if detalle.observacion_devolucion:
                    observaciones.append(
                        f"{detalle.activo.codigo_interno}: "
                        f"{detalle.observacion_devolucion}"
                    )
        _establecer_texto(
            hoja,
            f"A{FILA_OBSERVACIONES + extras}",
            "\n".join(observaciones),
        )

        for indice, detalle in enumerate(detalles):
            fila = FILA_ACTIVOS_INICIO + indice
            activo = detalle.activo
            _establecer_texto(
                hoja,
                f"B{fila}",
                f"{activo.codigo_interno} - {activo.nombre}",
            )
            _establecer_texto(hoja, f"J{fila}", activo.marca)
            _establecer_texto(hoja, f"L{fila}", activo.serie_codigo)
            hoja[f"N{fila}"] = 1
            hoja[f"O{fila}"] = 1
            if incluir_retorno:
                hoja[f"P{fila}"] = detalle.cantidad_recibida or 0
                estado = (
                    "Bueno"
                    if detalle.condicion_devolucion
                    == DetallePrestamo.CondicionDevolucion.BUENO
                    else "Malo"
                    if detalle.condicion_devolucion
                    in {
                        DetallePrestamo.CondicionDevolucion.CON_NOVEDAD,
                        DetallePrestamo.CondicionDevolucion.DANADO,
                    }
                    else ""
                )
            else:
                hoja[f"P{fila}"] = None
                condicion = condiciones.get(activo.pk, "")
                estado = {
                    "BUENO": "Bueno",
                    "MALO": "Malo",
                }.get(condicion, "")
            _establecer_texto(hoja, f"Q{fila}", estado)

        if extras:
            hoja.print_area = f"A1:Q{47 + extras}"
        libro.save(archivo_excel)
    finally:
        libro.close()


def _buscar_libreoffice():
    configurado = os.environ.get("LIBREOFFICE_PATH")
    if configurado:
        ruta = Path(configurado).expanduser()
        if ruta.is_file():
            return str(ruta)
        ejecutable = shutil.which(configurado)
        if ejecutable:
            return ejecutable
        raise ConversorNoDisponible(
            "LIBREOFFICE_PATH no apunta a un ejecutable de LibreOffice válido."
        )

    for nombre in ("soffice", "soffice.exe", "libreoffice"):
        ejecutable = shutil.which(nombre)
        if ejecutable:
            return ejecutable

    if sys.platform == "win32":
        for variable in ("ProgramFiles", "ProgramFiles(x86)"):
            directorio = os.environ.get(variable)
            if not directorio:
                continue
            ruta = (
                Path(directorio)
                / "LibreOffice"
                / "program"
                / "soffice.exe"
            )
            if ruta.is_file():
                return str(ruta)
    return None


def _convertir_excel_a_pdf(archivo_excel, carpeta_salida):
    ejecutable = _buscar_libreoffice()
    if not ejecutable:
        raise ConversorNoDisponible()

    archivo_excel = Path(archivo_excel)
    carpeta_salida = Path(carpeta_salida)
    perfil = carpeta_salida / "perfil-libreoffice"
    perfil.mkdir()
    comando = [
        ejecutable,
        "--headless",
        f"-env:UserInstallation={perfil.as_uri()}",
        "--convert-to",
        "pdf",
        "--outdir",
        str(carpeta_salida),
        str(archivo_excel),
    ]
    try:
        subprocess.run(
            comando,
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired as error:
        LOGGER.error("LibreOffice excedió el tiempo límite al generar OYS-FO-09.")
        raise ConversorNoDisponible(
            "LibreOffice tardó demasiado al convertir el formato OYS-FO-09."
        ) from error
    except subprocess.CalledProcessError as error:
        detalle = (error.stderr or error.stdout or "").strip()
        LOGGER.error("Falló la conversión de OYS-FO-09: %s", detalle)
        raise ConversorNoDisponible(
            "LibreOffice no pudo convertir la plantilla OYS-FO-09 a PDF."
        ) from error

    archivo_pdf = carpeta_salida / f"{archivo_excel.stem}.pdf"
    if not archivo_pdf.is_file() or archivo_pdf.stat().st_size == 0:
        raise ConversorNoDisponible(
            "LibreOffice finalizó sin generar el PDF OYS-FO-09."
        )
    with archivo_pdf.open("rb") as pdf:
        if pdf.read(5) != b"%PDF-":
            raise ConversorNoDisponible(
                "LibreOffice generó un archivo OYS-FO-09 que no es un PDF válido."
            )
    return archivo_pdf


def generar_formato_oys(
    solicitud,
    incluir_retorno=False,
    previsualizacion=False,
):
    with tempfile.TemporaryDirectory(prefix="valser-oys-") as carpeta_temporal:
        carpeta = Path(carpeta_temporal)
        archivo_excel = carpeta / "OYS-FO-09.xlsx"
        _rellenar_plantilla(
            solicitud,
            incluir_retorno,
            archivo_excel,
            previsualizacion=previsualizacion,
        )
        archivo_pdf = _convertir_excel_a_pdf(archivo_excel, carpeta)
        return archivo_pdf.read_bytes()
