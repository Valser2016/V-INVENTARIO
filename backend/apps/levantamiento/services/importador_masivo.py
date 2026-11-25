import warnings
from io import BytesIO
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

from django.core.files.base import ContentFile
from django.db import transaction
from PIL import Image, UnidentifiedImageError

from apps.inventario.models import Activo

from .importador_excel import validar_excel


MAX_FOTO_BYTES = 10 * 1024 * 1024
MAX_FOTOS_ZIP_BYTES = 100 * 1024 * 1024
FORMATOS_FOTO = {".jpg", ".jpeg", ".png", ".webp"}
FORMATO_POR_EXTENSION = {
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".png": "PNG",
    ".webp": "WEBP",
}


def _cargar_fotos(archivo_zip):
    fotos = {}
    errores = []
    peso_total = 0

    try:
        with ZipFile(archivo_zip) as zip_fotos:
            for entrada in zip_fotos.infolist():
                if entrada.is_dir():
                    continue

                nombre = entrada.filename
                ruta = PurePosixPath(nombre)
                if (
                    ruta.name != nombre
                    or nombre in {".", ".."}
                    or "\\" in nombre
                ):
                    errores.append({
                        "fila": None,
                        "campo": "fotos",
                        "mensajes": [
                            f'La ruta "{nombre}" debe estar en la raíz del ZIP.',
                        ],
                    })
                    continue

                nombre_normalizado = nombre.casefold()
                if nombre_normalizado in fotos:
                    errores.append({
                        "fila": None,
                        "campo": "fotos",
                        "mensajes": [
                            f'El ZIP contiene nombres repetidos: "{nombre}".',
                        ],
                    })
                    continue

                if PurePosixPath(nombre).suffix.lower() not in FORMATOS_FOTO:
                    errores.append({
                        "fila": None,
                        "campo": "fotos",
                        "mensajes": [
                            f'"{nombre}" no tiene un formato de imagen permitido '
                            "(JPG, PNG o WEBP).",
                        ],
                    })
                    continue

                if entrada.file_size > MAX_FOTO_BYTES:
                    errores.append({
                        "fila": None,
                        "campo": "fotos",
                        "mensajes": [
                            f'"{nombre}" supera el límite de 10 MB por foto.',
                        ],
                    })
                    continue

                peso_total += entrada.file_size
                if peso_total > MAX_FOTOS_ZIP_BYTES:
                    errores.append({
                        "fila": None,
                        "campo": "fotos",
                        "mensajes": [
                            "El tamaño total descomprimido de las fotos "
                            "no puede superar 100 MB.",
                        ],
                    })
                    break

                contenido = zip_fotos.read(entrada)
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter(
                            "error",
                            Image.DecompressionBombWarning,
                        )
                        imagen = Image.open(BytesIO(contenido))
                        extension = PurePosixPath(nombre).suffix.lower()
                        if imagen.format != FORMATO_POR_EXTENSION[extension]:
                            raise ValueError("Formato de imagen no permitido.")
                        if imagen.width * imagen.height > 50_000_000:
                            raise ValueError(
                                "La imagen supera el límite de resolución.",
                            )
                        imagen.verify()
                except (
                    Image.DecompressionBombError,
                    Image.DecompressionBombWarning,
                    UnidentifiedImageError,
                    OSError,
                    ValueError,
                ):
                    errores.append({
                        "fila": None,
                        "campo": "fotos",
                        "mensajes": [
                            f'"{nombre}" no es una imagen JPG, PNG o WEBP válida.',
                        ],
                    })
                    continue

                fotos[nombre_normalizado] = {
                    "nombre": nombre,
                    "contenido": contenido,
                }
    except (BadZipFile, OSError, RuntimeError):
        return {}, [{
            "fila": None,
            "campo": "fotos",
            "mensajes": ["No fue posible leer el archivo ZIP de fotos."],
        }]

    return fotos, errores


def _validar_referencias_foto(datos_validos, fotos, archivo_zip):
    errores = []
    referencias = set()
    archivos_usados = set()

    for datos in datos_validos:
        nombre = datos["foto_archivo"].strip()
        if not nombre:
            continue

        fila = datos["fila_excel"]
        if PurePosixPath(nombre).name != nombre or "\\" in nombre:
            errores.append({
                "fila": fila,
                "campo": "FOTO_ARCHIVO",
                "mensajes": [
                    "Indica solo el nombre del archivo, sin carpetas.",
                ],
            })
            continue

        clave = nombre.casefold()
        if clave in referencias:
            errores.append({
                "fila": fila,
                "campo": "FOTO_ARCHIVO",
                "mensajes": [
                    f'La foto "{nombre}" está asignada a más de un activo.',
                ],
            })
            continue
        referencias.add(clave)

        if not archivo_zip:
            errores.append({
                "fila": fila,
                "campo": "FOTO_ARCHIVO",
                "mensajes": [
                    f'Se indicó "{nombre}", pero no se adjuntó el ZIP de fotos.',
                ],
            })
        elif clave not in fotos:
            errores.append({
                "fila": fila,
                "campo": "FOTO_ARCHIVO",
                "mensajes": [
                    f'La foto "{nombre}" no se encontró dentro del ZIP.',
                ],
            })
        else:
            archivos_usados.add(clave)

    if archivo_zip:
        for clave, foto in fotos.items():
            if clave not in archivos_usados:
                errores.append({
                    "fila": None,
                    "campo": "fotos",
                    "mensajes": [
                        f'La foto "{foto["nombre"]}" no está referenciada '
                        "en la columna FOTO_ARCHIVO.",
                    ],
                })

    return errores


def importar_activos(archivo_excel, archivo_zip, usuario):
    resultado = validar_excel(archivo_excel)
    if not resultado["valido"]:
        return resultado

    fotos, errores_fotos = _cargar_fotos(archivo_zip) if archivo_zip else ({}, [])
    errores_fotos.extend(
        _validar_referencias_foto(
            resultado["datos_validos"],
            fotos,
            archivo_zip,
        ),
    )
    if errores_fotos:
        resultado["valido"] = False
        resultado["errores"].extend(errores_fotos)
        return resultado

    archivos_guardados = []
    codigos = []
    try:
        with transaction.atomic():
            for datos in resultado["datos_validos"]:
                foto = fotos.get(datos["foto_archivo"].casefold())
                activo = Activo.objects.create(
                    tipo_activo=datos["tipo_activo"],
                    categoria=datos["categoria"],
                    modalidad_control=datos["modalidad_control"],
                    nombre=datos["nombre"],
                    marca=datos["marca"],
                    modelo=datos["modelo"],
                    serie_codigo=datos["serie_codigo"],
                    fecha_adquisicion=datos["fecha_adquisicion"],
                    proveedor=datos["proveedor"],
                    vida_util=datos["vida_util"],
                    ubicacion=datos["ubicacion"],
                    estado=datos["estado"],
                    responsable=datos["responsable"],
                    cuenta_con_manual=datos["cuenta_con_manual"],
                    valor=datos["valor"],
                    observaciones=datos["observaciones"],
                    creado_por=usuario,
                    modificado_por=usuario,
                )
                if foto:
                    activo.foto.save(
                        foto["nombre"],
                        ContentFile(foto["contenido"]),
                        save=False,
                    )
                    archivos_guardados.append(
                        (activo.foto.storage, activo.foto.name),
                    )
                    activo.save(update_fields=["foto", "fecha_modificacion"])
                codigos.append(activo.codigo_interno)
    except Exception:
        for almacenamiento, nombre in archivos_guardados:
            almacenamiento.delete(nombre)
        raise

    return {
        "valido": True,
        "total_filas": resultado["total_filas"],
        "filas_correctas": resultado["filas_correctas"],
        "filas_con_error": 0,
        "errores": [],
        "codigos": codigos,
        "fotos_cargadas": sum(
            bool(datos["foto_archivo"])
            for datos in resultado["datos_validos"]
        ),
    }
