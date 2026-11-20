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


def _dimensiones_campo_foto(hoja):
    ancho = 0
    for columna in range(FOTO_COLUMNA_INICIO, FOTO_COLUMNA_FIN + 1):
        dimension = next(
            (
                item
                for item in hoja.column_dimensions.values()
                if item.min <= columna <= item.max
            ),
            None,
        )
        ancho_columna = (
            dimension.width
            if dimension and dimension.width is not None
            else hoja.sheet_format.defaultColWidth
        )
        if ancho_columna is None:
            ancho_columna = 8.43
        ancho += int(ancho_columna * 7 + 5)

    alto = 0
    for fila in range(FOTO_FILA_INICIO, FOTO_FILA_FIN + 1):
        dimension = hoja.row_dimensions.get(fila)
        alto_fila = (
            dimension.height
            if dimension and dimension.height is not None
            else hoja.sheet_format.defaultRowHeight
        )
        if alto_fila is None:
            alto_fila = 15
        alto += points_to_pixels(alto_fila)

    return ancho, alto


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
        foto.anchor = OneCellAnchor(
            _from=AnchorMarker(
                col=FOTO_COLUMNA_INICIO - 1,
                colOff=pixels_to_EMU(desplazamiento_x),
                row=FOTO_FILA_INICIO - 1,
                rowOff=pixels_to_EMU(desplazamiento_y),
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
