from io import BytesIO
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.drawing.image import Image as SpreadsheetImage
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, OneCellAnchor
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.utils.units import pixels_to_EMU, points_to_pixels
from PIL import Image as PilImage


PLANTILLA_HOJA_VIDA = (
    Path(__file__).resolve().parents[1]
    / "plantillas"
    / "OYS-FO-11 HOJA DE VIDA MAQUINAS.xlsx"
)
FOTO_FILA_INICIO = 6
FOTO_FILA_FIN = 14
FOTO_COLUMNA_INICIO = 15
FOTO_COLUMNA_FIN = 27


def _ancho_columna_px(hoja, columna):
    dimension = next(
        (
            item
            for item in hoja.column_dimensions.values()
            if item.min <= columna <= item.max
        ),
        None,
    )
    ancho = (
        dimension.width
        if dimension and dimension.width is not None
        else hoja.sheet_format.defaultColWidth
    )
    if ancho is None:
        ancho = 8.43
    return int(ancho * 7 + 5)


def _alto_fila_px(hoja, fila):
    dimension = hoja.row_dimensions.get(fila)
    alto = (
        dimension.height
        if dimension and dimension.height is not None
        else hoja.sheet_format.defaultRowHeight
    )
    if alto is None:
        alto = 15
    return points_to_pixels(alto)


def _dimensiones_campo_foto(hoja):
    ancho = sum(
        _ancho_columna_px(hoja, columna)
        for columna in range(FOTO_COLUMNA_INICIO, FOTO_COLUMNA_FIN + 1)
    )
    alto = sum(
        _alto_fila_px(hoja, fila)
        for fila in range(FOTO_FILA_INICIO, FOTO_FILA_FIN + 1)
    )
    return ancho, alto


def _marcador_columna(hoja, desplazamiento):
    for columna in range(FOTO_COLUMNA_INICIO, FOTO_COLUMNA_FIN + 1):
        ancho = _ancho_columna_px(hoja, columna)
        if desplazamiento < ancho:
            return columna - 1, pixels_to_EMU(desplazamiento)
        desplazamiento -= ancho
    raise ValueError("El desplazamiento horizontal excede el campo de foto.")


def _marcador_fila(hoja, desplazamiento):
    for fila in range(FOTO_FILA_INICIO, FOTO_FILA_FIN + 1):
        alto = _alto_fila_px(hoja, fila)
        if desplazamiento < alto:
            return fila - 1, pixels_to_EMU(desplazamiento)
        desplazamiento -= alto
    raise ValueError("El desplazamiento vertical excede el campo de foto.")


def crear_hoja_vida_excel(activo):
    libro = load_workbook(PLANTILLA_HOJA_VIDA)
    hoja = libro["HOJA DE VIDA EQUIPOS"]

    hoja["F5"] = activo.nombre
    hoja["F6"] = activo.marca
    hoja["F7"] = activo.modelo
    hoja["F8"] = activo.serie_codigo
    hoja["F9"] = activo.fecha_adquisicion
    hoja["F10"] = activo.proveedor
    hoja["F11"] = activo.vida_util
    hoja["F12"] = activo.ubicacion.nombre
    hoja["F13"] = "SI" if activo.cuenta_con_manual else "NO"

    if activo.foto:
        ancho_campo, alto_campo = _dimensiones_campo_foto(hoja)
        foto_buffer = BytesIO()
        with activo.foto.open("rb") as archivo_foto:
            with PilImage.open(archivo_foto) as imagen_original:
                modo = "RGBA" if "A" in imagen_original.getbands() else "RGB"
                imagen = imagen_original.convert(modo)
                imagen.thumbnail(
                    (ancho_campo, alto_campo),
                    PilImage.Resampling.LANCZOS,
                )
                imagen.save(foto_buffer, format="PNG")
        foto_buffer.seek(0)
        foto = SpreadsheetImage(foto_buffer)
        desplazamiento_x = (ancho_campo - foto.width) // 2
        desplazamiento_y = (alto_campo - foto.height) // 2
        columna, col_offset = _marcador_columna(hoja, desplazamiento_x)
        fila, row_offset = _marcador_fila(hoja, desplazamiento_y)
        foto.anchor = OneCellAnchor(
            _from=AnchorMarker(
                col=columna,
                colOff=col_offset,
                row=fila,
                rowOff=row_offset,
            ),
            ext=XDRPositiveSize2D(
                cx=pixels_to_EMU(foto.width),
                cy=pixels_to_EMU(foto.height),
            ),
        )
        hoja.add_image(foto)

    archivo = BytesIO()
    libro.save(archivo)
    archivo.seek(0)
    return archivo
