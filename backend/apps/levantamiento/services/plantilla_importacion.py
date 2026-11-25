from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

from apps.inventario.models import (
    CategoriaActivo,
    EstadoActivo,
    TipoActivo,
    Ubicacion,
)
from apps.usuarios.models import Usuario

from .importador_excel import COLUMNAS_PLANTILLA


INSTRUCCIONES = [
    ("TIPO_ACTIVO", "Sí", "Nombre existente en la hoja Catalogos."),
    (
        "CATEGORIA",
        "Sí",
        "Categoría que pertenezca al tipo indicado.",
    ),
    (
        "MODALIDAD",
        "No",
        "Individual o Conjunto. Si se deja vacío, será Individual.",
    ),
    ("NOMBRE", "Sí", "Nombre descriptivo del activo."),
    ("MARCA", "No", "Marca del activo."),
    ("MODELO", "No", "Modelo del activo."),
    (
        "SERIE_CODIGO",
        "No",
        "Número de serie; no debe estar repetido en el inventario.",
    ),
    (
        "FECHA_ADQUISICION",
        "No",
        "Fecha en formato AAAA-MM-DD o DD/MM/AAAA.",
    ),
    ("PROVEEDOR", "No", "Proveedor del activo."),
    ("VIDA_UTIL", "No", "Vida útil estimada."),
    ("UBICACION", "Sí", "Ubicación existente en la hoja Catalogos."),
    ("ESTADO", "Sí", "Estado existente en la hoja Catalogos."),
    (
        "RESPONSABLE",
        "No",
        "Nombre de usuario o nombre completo de una cuenta activa.",
    ),
    (
        "CUENTA_CON_MANUAL",
        "No",
        "Sí o No. Si se deja vacío, será No.",
    ),
    (
        "VALOR",
        "No",
        "Valor numérico no negativo; se aceptan decimales.",
    ),
    ("OBSERVACIONES", "No", "Notas adicionales."),
    (
        "FOTO_ARCHIVO",
        "No",
        "Nombre exacto de una foto referenciada en el ZIP opcional.",
    ),
]


def crear_plantilla_importacion():
    libro = Workbook()
    activos = libro.active
    activos.title = "Activos"
    activos.append(COLUMNAS_PLANTILLA)
    activos.freeze_panes = "A2"
    activos.auto_filter.ref = activos.dimensions

    catalogos = libro.create_sheet("Catalogos")
    catalogos.append([
        "TIPO_ACTIVO",
        "CATEGORIA",
        "TIPO_DE_LA_CATEGORIA",
        "ESTADO",
        "UBICACION",
        "USUARIO_RESPONSABLE",
    ])
    tipos = list(TipoActivo.objects.filter(activo=True).order_by("nombre"))
    categorias = list(
        CategoriaActivo.objects.filter(activo=True)
        .select_related("tipo_activo")
        .order_by("tipo_activo__nombre", "nombre")
    )
    estados = list(EstadoActivo.objects.filter(activo=True).order_by("nombre"))
    ubicaciones = list(Ubicacion.objects.filter(activo=True).order_by("nombre"))
    usuarios = list(
        Usuario.objects.filter(is_active=True)
        .order_by("username")
        .values_list("username", flat=True)
    )
    filas = max(
        len(tipos),
        len(categorias),
        len(estados),
        len(ubicaciones),
        len(usuarios),
    )
    for indice in range(filas):
        tipo = tipos[indice] if indice < len(tipos) else None
        categoria = categorias[indice] if indice < len(categorias) else None
        estado = estados[indice] if indice < len(estados) else None
        ubicacion = ubicaciones[indice] if indice < len(ubicaciones) else None
        usuario = usuarios[indice] if indice < len(usuarios) else None
        catalogos.append([
            tipo.nombre if tipo else "",
            categoria.nombre if categoria else "",
            categoria.tipo_activo.nombre if categoria else "",
            estado.nombre if estado else "",
            ubicacion.nombre if ubicacion else "",
            usuario or "",
        ])
    catalogos.freeze_panes = "A2"
    catalogos.auto_filter.ref = catalogos.dimensions

    instrucciones = libro.create_sheet("Instrucciones")
    instrucciones.append(["Columna", "Obligatorio", "Descripción"])
    for fila in INSTRUCCIONES:
        instrucciones.append(fila)
    instrucciones.append([])
    instrucciones.append([
        "Códigos internos",
        "",
        "Se generan automáticamente según el prefijo y la categoría.",
    ])
    instrucciones.append([
        "Fotos",
        "",
        "Adjunta un ZIP opcional con solo las imágenes JPG, PNG o WEBP "
        "referenciadas, directamente en la raíz. Máximo 10 MB por foto y "
        "100 MB en total.",
    ])
    instrucciones.append([
        "Importación",
        "",
        "Se valida el archivo completo antes de guardar. Si hay errores, "
        "no se crea ningún activo.",
    ])
    instrucciones.freeze_panes = "A2"

    encabezado = PatternFill("solid", fgColor="173D2C")
    for hoja in (activos, catalogos, instrucciones):
        for celda in hoja[1]:
            celda.fill = encabezado
            celda.font = Font(color="FFFFFF", bold=True)
            celda.alignment = Alignment(vertical="center")
        hoja.row_dimensions[1].height = 24

    for indice, columna in enumerate(COLUMNAS_PLANTILLA, start=1):
        activos.column_dimensions[activos.cell(1, indice).column_letter].width = (
            max(18, min(len(columna) + 4, 28))
        )
    for letra, ancho in {
        "A": 24,
        "B": 26,
        "C": 28,
        "D": 22,
        "E": 28,
        "F": 28,
    }.items():
        catalogos.column_dimensions[letra].width = ancho
    for letra, ancho in {"A": 26, "B": 18, "C": 100}.items():
        instrucciones.column_dimensions[letra].width = ancho
    for fila in instrucciones.iter_rows(min_row=2, min_col=3, max_col=3):
        fila[0].alignment = Alignment(wrap_text=True, vertical="top")

    salida = BytesIO()
    libro.save(salida)
    libro.close()
    salida.seek(0)
    return salida
