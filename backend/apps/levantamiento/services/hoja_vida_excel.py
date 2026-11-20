from io import BytesIO
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.drawing.image import Image as SpreadsheetImage
from openpyxl.styles import Alignment, Font, PatternFill
from PIL import Image as PilImage


PLANTILLA_HOJA_VIDA = (
    Path(__file__).resolve().parents[1]
    / "plantillas"
    / "OYS-FO-11 HOJA DE VIDA MAQUINAS.xlsx"
)


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
                imagen_original.convert(modo).save(foto_buffer, format="PNG")
        foto_buffer.seek(0)
        foto = SpreadsheetImage(foto_buffer)
        escala = min(360 / foto.width, 190 / foto.height, 1)
        foto.width *= escala
        foto.height *= escala
        hoja.add_image(foto, "O6")

    hoja_extra = libro.create_sheet("DATOS COMPLEMENTARIOS")
    hoja_extra.append(["Dato del inventario", "Valor"])
    datos_adicionales = [
        ("Código interno", activo.codigo_interno),
        ("Tipo de activo", activo.tipo_activo.nombre),
        ("Categoría", activo.categoria.nombre),
        ("Estado", activo.estado.nombre),
        ("Modalidad de control", activo.get_modalidad_control_display()),
        (
            "Responsable",
            str(activo.responsable) if activo.responsable else "Sin responsable",
        ),
        ("Valor", activo.valor),
        ("Observaciones", activo.observaciones),
    ]
    for etiqueta, valor in datos_adicionales:
        hoja_extra.append([etiqueta, valor])

    hoja_extra.column_dimensions["A"].width = 28
    hoja_extra.column_dimensions["B"].width = 72
    for celda in hoja_extra[1]:
        celda.font = Font(bold=True, color="FFFFFF")
        celda.fill = PatternFill("solid", fgColor="0D6F0C")
        celda.alignment = Alignment(vertical="center")
    for fila in hoja_extra.iter_rows(min_row=2, min_col=2, max_col=2):
        fila[0].alignment = Alignment(wrap_text=True, vertical="top")

    archivo = BytesIO()
    libro.save(archivo)
    archivo.seek(0)
    return archivo
