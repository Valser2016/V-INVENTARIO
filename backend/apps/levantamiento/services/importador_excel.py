from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from openpyxl import load_workbook

from apps.inventario.models import (
    Activo,
    CategoriaActivo,
    EstadoActivo,
    TipoActivo,
    Ubicacion,
)
from apps.usuarios.models import Usuario


COLUMNAS_ESPERADAS = [
    "TIPO_ACTIVO",
    "CATEGORIA",
    "MODALIDAD",
    "NOMBRE",
    "MARCA",
    "MODELO",
    "SERIE_CODIGO",
    "FECHA_ADQUISICION",
    "PROVEEDOR",
    "VIDA_UTIL",
    "UBICACION",
    "ESTADO",
    "RESPONSABLE",
    "CUENTA_CON_MANUAL",
    "VALOR",
    "OBSERVACIONES",
]
COLUMNAS_OPCIONALES = ["FOTO_ARCHIVO"]
COLUMNAS_PLANTILLA = COLUMNAS_ESPERADAS + COLUMNAS_OPCIONALES


def texto(valor):
    """Convierte un valor en texto limpio."""
    if valor is None:
        return ""

    return str(valor).strip()


def normalizar(valor):
    """Normaliza texto para comparaciones."""
    return texto(valor).casefold().strip()


def _convertir_valor(valor):
    texto_valor = str(valor).strip()
    if "," in texto_valor and "." in texto_valor:
        if texto_valor.rfind(",") > texto_valor.rfind("."):
            texto_valor = texto_valor.replace(".", "").replace(",", ".")
        else:
            texto_valor = texto_valor.replace(",", "")
    elif "," in texto_valor:
        texto_valor = texto_valor.replace(",", ".")
    return Decimal(texto_valor)


def _convertir_fecha(valor):
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    if isinstance(valor, str):
        for formato in ("%Y-%m-%d", "%d/%m/%Y"):
            try:
                return datetime.strptime(valor.strip(), formato).date()
            except ValueError:
                continue
    raise ValueError("La fecha no tiene un formato válido.")


def validar_excel(ruta_archivo):
    """
    Lee y valida un archivo Excel.

    IMPORTANTE:
    Esta función NO crea ni modifica activos.
    """

    resultado = {
        "valido": True,
        "total_filas": 0,
        "filas_correctas": 0,
        "filas_con_error": 0,
        "errores": [],
        "datos_validos": [],
    }

    # -------------------------------------------------
    # ABRIR EXCEL
    # -------------------------------------------------

    try:
        workbook = load_workbook(
            filename=ruta_archivo,
            read_only=True,
            data_only=True,
        )

    except Exception as error:
        resultado["valido"] = False

        resultado["errores"].append({
            "fila": None,
            "campo": None,
            "mensajes": [
                f"No fue posible abrir el archivo Excel: {error}"
            ],
        })

        return resultado

    worksheet = workbook.active

    filas = worksheet.iter_rows(values_only=True)

    # -------------------------------------------------
    # LEER ENCABEZADOS
    # -------------------------------------------------

    try:
        encabezados = next(filas)

    except StopIteration:

        resultado["valido"] = False

        resultado["errores"].append({
            "fila": 1,
            "campo": None,
            "mensajes": [
                "El archivo Excel está vacío."
            ],
        })

        workbook.close()
        return resultado

    encabezados = [
        texto(encabezado).upper()
        for encabezado in encabezados
    ]

    # -------------------------------------------------
    # VALIDAR COLUMNAS
    # -------------------------------------------------

    columnas_faltantes = [
        columna
        for columna in COLUMNAS_ESPERADAS
        if columna not in encabezados
    ]

    if columnas_faltantes:

        resultado["valido"] = False

        resultado["errores"].append({
            "fila": 1,
            "campo": None,
            "mensajes": [
                "Faltan las siguientes columnas: "
                + ", ".join(columnas_faltantes)
            ],
        })

        workbook.close()

        return resultado

    # -------------------------------------------------
    # INDICES DE COLUMNAS
    # -------------------------------------------------

    indices = {
        columna: encabezados.index(columna)
        for columna in COLUMNAS_PLANTILLA
        if columna in encabezados
    }
    tipos_por_nombre = {
        normalizar(tipo.nombre): tipo
        for tipo in TipoActivo.objects.filter(activo=True)
    }
    categorias_por_nombre = defaultdict(list)
    for categoria in (
        CategoriaActivo.objects.filter(activo=True)
        .select_related("tipo_activo")
    ):
        categorias_por_nombre[normalizar(categoria.nombre)].append(categoria)
    estados_por_nombre = {
        normalizar(estado.nombre): estado
        for estado in EstadoActivo.objects.filter(activo=True)
    }
    ubicaciones_por_nombre = {
        normalizar(ubicacion.nombre): ubicacion
        for ubicacion in Ubicacion.objects.filter(activo=True)
    }
    usuarios_por_username = {}
    usuarios_por_nombre = defaultdict(list)
    for usuario in Usuario.objects.filter(is_active=True):
        usuarios_por_username[normalizar(usuario.username)] = usuario
        nombre_completo = " ".join(
            f"{usuario.first_name} {usuario.last_name}".split()
        )
        if nombre_completo:
            usuarios_por_nombre[normalizar(nombre_completo)].append(usuario)
    series_existentes = {
        serie.casefold()
        for serie in Activo.objects.values_list("serie_codigo", flat=True)
        if serie
    }

    # -------------------------------------------------
    # RECORRER FILAS
    # -------------------------------------------------

    series_importadas = set()

    for numero_fila, fila in enumerate(filas, start=2):

        # Ignorar filas completamente vacías
        if not any(
            valor is not None and texto(valor) != ""
            for valor in fila
        ):
            continue

        resultado["total_filas"] += 1

        errores_fila = []

        # -------------------------------------------------
        # CONSTRUIR DATOS
        # -------------------------------------------------

        datos = {
            columna: (
                fila[indices[columna]]
                if columna in indices and indices[columna] < len(fila)
                else None
            )
            for columna in COLUMNAS_PLANTILLA
        }

        # -------------------------------------------------
        # TIPO DE ACTIVO
        # -------------------------------------------------

        nombre_tipo = texto(datos["TIPO_ACTIVO"])

        if not nombre_tipo:

            errores_fila.append(
                "TIPO_ACTIVO es obligatorio."
            )

            tipo_activo = None

        else:

            tipo_activo = tipos_por_nombre.get(normalizar(nombre_tipo))

            if not tipo_activo:

                errores_fila.append(
                    f'El tipo de activo "{nombre_tipo}" no existe.'
                )

        # -------------------------------------------------
        # CATEGORIA
        # -------------------------------------------------

        nombre_categoria = texto(datos["CATEGORIA"])

        if not nombre_categoria:

            errores_fila.append(
                "CATEGORIA es obligatoria."
            )

            categoria = None

        else:

            categorias_posibles = categorias_por_nombre.get(
                normalizar(nombre_categoria),
                [],
            )
            categoria = next(
                (
                    opcion
                    for opcion in categorias_posibles
                    if not tipo_activo
                    or opcion.tipo_activo_id == tipo_activo.id
                ),
                categorias_posibles[0] if categorias_posibles else None,
            )

            if not categoria:

                errores_fila.append(
                    f'La categoría "{nombre_categoria}" no existe.'
                )

        # -------------------------------------------------
        # RELACION TIPO / CATEGORIA
        # -------------------------------------------------

        if tipo_activo and categoria:

            if categoria.tipo_activo_id != tipo_activo.id:

                errores_fila.append(
                    f'La categoría "{categoria.nombre}" '
                    f'no pertenece al tipo de activo '
                    f'"{tipo_activo.nombre}".'
                )

        # -------------------------------------------------
        # MODALIDAD
        # -------------------------------------------------

        modalidad = normalizar(datos["MODALIDAD"]) or "individual"

        modalidades_validas = {
            "individual": "INDIVIDUAL",
            "conjunto": "CONJUNTO",
        }

        if modalidad not in modalidades_validas:

            errores_fila.append(
                'MODALIDAD debe ser "Individual" o "Conjunto".'
            )

            modalidad_db = None

        else:

            modalidad_db = modalidades_validas[modalidad]

        # -------------------------------------------------
        # NOMBRE
        # -------------------------------------------------

        nombre = texto(datos["NOMBRE"])

        if not nombre:

            errores_fila.append(
                "NOMBRE es obligatorio."
            )

        # -------------------------------------------------
        # UBICACION
        # -------------------------------------------------

        nombre_ubicacion = texto(datos["UBICACION"])

        if not nombre_ubicacion:

            errores_fila.append(
                "UBICACION es obligatoria."
            )

            ubicacion = None

        else:

            ubicacion = ubicaciones_por_nombre.get(
                normalizar(nombre_ubicacion),
            )

            if not ubicacion:

                errores_fila.append(
                    f'La ubicación "{nombre_ubicacion}" no existe.'
                )

        # -------------------------------------------------
        # ESTADO
        # -------------------------------------------------

        nombre_estado = texto(datos["ESTADO"])

        if not nombre_estado:

            errores_fila.append(
                "ESTADO es obligatorio."
            )

            estado = None

        else:

            estado = estados_por_nombre.get(normalizar(nombre_estado))

            if not estado:

                errores_fila.append(
                    f'El estado "{nombre_estado}" no existe.'
                )

        # -------------------------------------------------
        # RESPONSABLE
        # -------------------------------------------------

        responsable = None

        nombre_responsable = texto(
            datos["RESPONSABLE"]
        )

        if nombre_responsable:

            # Intentar primero por username
            responsable = usuarios_por_username.get(
                normalizar(nombre_responsable),
            )

            if not responsable:
                candidatos = usuarios_por_nombre.get(
                    normalizar(nombre_responsable),
                    [],
                )
                if len(candidatos) == 1:
                    responsable = candidatos[0]
                elif len(candidatos) > 1:
                    errores_fila.append(
                        f'El responsable "{nombre_responsable}" es ambiguo; '
                        "indica su nombre de usuario."
                    )
                else:
                    errores_fila.append(
                        f'No se encontró el responsable '
                        f'"{nombre_responsable}".'
                    )


        # -------------------------------------------------
        # MANUAL
        # -------------------------------------------------

        manual = normalizar(datos["CUENTA_CON_MANUAL"])

        valores_manual = {
            "si": True,
            "sí": True,
            "s": True,
            "yes": True,
            "1": True,
            "true": True,
            "no": False,
            "n": False,
            "0": False,
            "false": False,
        }

        if not manual:
            cuenta_con_manual = False

        elif manual not in valores_manual:

            errores_fila.append(
                'CUENTA_CON_MANUAL debe ser "Sí" o "No".'
            )

            cuenta_con_manual = False

        else:

            cuenta_con_manual = valores_manual[manual]

        # -------------------------------------------------
        # VALOR
        # -------------------------------------------------

        valor = datos["VALOR"]

        if valor in (None, ""):

            valor_decimal = None

        else:

            try:

                valor_decimal = _convertir_valor(valor)

                if valor_decimal < 0:

                    errores_fila.append(
                        "VALOR no puede ser negativo."
                    )
                elif valor_decimal >= Decimal("10000000000000"):
                    errores_fila.append(
                        "VALOR admite máximo 13 dígitos enteros."
                    )
                elif valor_decimal != valor_decimal.quantize(Decimal("0.01")):
                    errores_fila.append(
                        "VALOR admite máximo 2 decimales."
                    )

            except (
                InvalidOperation,
                ValueError,
            ):

                errores_fila.append(
                    "VALOR debe ser numérico."
                )

                valor_decimal = None

        # -------------------------------------------------
        # FECHA
        # -------------------------------------------------

        fecha_adquisicion = datos[
            "FECHA_ADQUISICION"
        ]

        if fecha_adquisicion not in (None, ""):
            try:
                fecha_adquisicion = _convertir_fecha(fecha_adquisicion)
            except ValueError:
                errores_fila.append(
                    "FECHA_ADQUISICION debe usar AAAA-MM-DD o DD/MM/AAAA."
                )
                fecha_adquisicion = None

        # -------------------------------------------------
        # SERIE / CODIGO
        # -------------------------------------------------

        serie_codigo = texto(
            datos["SERIE_CODIGO"]
        )

        limites = {
            "NOMBRE": (datos["NOMBRE"], 200),
            "MARCA": (datos["MARCA"], 100),
            "MODELO": (datos["MODELO"], 100),
            "SERIE_CODIGO": (datos["SERIE_CODIGO"], 150),
            "PROVEEDOR": (datos["PROVEEDOR"], 200),
            "VIDA_UTIL": (datos["VIDA_UTIL"], 100),
        }
        for campo, (valor_campo, longitud_maxima) in limites.items():
            if len(texto(valor_campo)) > longitud_maxima:
                errores_fila.append(
                    f"{campo} supera el máximo de {longitud_maxima} caracteres."
                )

        if serie_codigo:

            serie_normalizada = serie_codigo.casefold()
            if (
                serie_normalizada in series_existentes
                or serie_normalizada in series_importadas
            ):

                errores_fila.append(
                    f'La serie/código "{serie_codigo}" '
                    f'ya existe en el inventario.'
                )
            else:
                series_importadas.add(serie_normalizada)

        # -------------------------------------------------
        # RESULTADO
        # -------------------------------------------------

        if errores_fila:

            resultado["valido"] = False

            resultado["filas_con_error"] += 1

            resultado["errores"].append({
                "fila": numero_fila,
                "campo": None,
                "mensajes": errores_fila,
            })

        else:

            resultado["filas_correctas"] += 1

            resultado["datos_validos"].append({

                "fila_excel": numero_fila,

                "tipo_activo": tipo_activo,

                "categoria": categoria,

                "modalidad_control": modalidad_db,

                "nombre": nombre,

                "marca": texto(datos["MARCA"]),

                "modelo": texto(datos["MODELO"]),

                "serie_codigo": serie_codigo,

                "fecha_adquisicion": fecha_adquisicion,

                "proveedor": texto(
                    datos["PROVEEDOR"]
                ),

                "vida_util": texto(
                    datos["VIDA_UTIL"]
                ),

                "ubicacion": ubicacion,

                "estado": estado,

                "responsable": responsable,

                "cuenta_con_manual": cuenta_con_manual,

                "valor": valor_decimal,

                "observaciones": texto(
                    datos["OBSERVACIONES"]
                ),
                "foto_archivo": texto(datos["FOTO_ARCHIVO"]),
            })

    workbook.close()

    if resultado["total_filas"] == 0:
        resultado["valido"] = False
        resultado["errores"].append({
            "fila": None,
            "campo": None,
            "mensajes": ["El archivo no contiene filas de activos."],
        })

    return resultado