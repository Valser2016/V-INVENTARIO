from io import BytesIO
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.drawing.image import Image as SpreadsheetImage
from openpyxl.utils import get_column_letter
from openpyxl.utils.units import points_to_pixels
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
    ancho = sum(
        int(
            (hoja.column_dimensions[get_column_letter(columna)].width or 8.43)
            * 7
            + 5
        )
        for columna in range(FOTO_COLUMNA_INICIO, FOTO_COLUMNA_FIN + 1)
    )
    alto = sum(
        points_to_pixels(hoja.row_dimensions[fila].height or 15)
        for fila in range(FOTO_FILA_INICIO, FOTO_FILA_FIN + 1)
    )
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
        foto_buffer = BytesIO()
        with activo.foto.open("rb") as archivo_foto:
            with PilImage.open(archivo_foto) as imagen_original:
                modo = "RGBA" if "A" in imagen_original.getbands() else "RGB"
                imagen = imagen_original.convert(modo)
                imagen.thumbnail(
                    _dimensiones_campo_foto(hoja),
                    PilImage.Resampling.LANCZOS,
                )
                imagen.save(foto_buffer, format="PNG")
        foto_buffer.seek(0)
        foto = SpreadsheetImage(foto_buffer)
        hoja.add_image(foto, "O6")

    archivo = BytesIO()
    libro.save(archivo)
    archivo.seek(0)
    return archivo
