from datetime import datetime
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


def texto(valor):
    """Convierte un valor en texto limpio."""
    if valor is None:
        return ""

    return str(valor).strip()


def normalizar(valor):
    """Normaliza texto para comparaciones."""
    return texto(valor).lower().strip()


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
        for columna in COLUMNAS_ESPERADAS
    }

    # -------------------------------------------------
    # RECORRER FILAS
    # -------------------------------------------------

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
                if indices[columna] < len(fila)
                else None
            )
            for columna in COLUMNAS_ESPERADAS
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

            tipo_activo = (
                TipoActivo.objects
                .filter(
                    activo=True,
                    nombre__iexact=nombre_tipo,
                )
                .first()
            )

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

            categoria = (
                CategoriaActivo.objects
                .filter(
                    activo=True,
                    nombre__iexact=nombre_categoria,
                )
                .first()
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

        modalidad = normalizar(datos["MODALIDAD"])

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

            ubicacion = (
                Ubicacion.objects
                .filter(
                    activo=True,
                    nombre__iexact=nombre_ubicacion,
                )
                .first()
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

            estado = (
                EstadoActivo.objects
                .filter(
                    activo=True,
                    nombre__iexact=nombre_estado,
                )
                .first()
            )

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
            responsable = (
                Usuario.objects
                .filter(
                    is_active=True,
                    username__iexact=nombre_responsable,
                )
                .first()
            )

            # Si no existe, intentar por nombre completo
            if not responsable:

                partes = nombre_responsable.split()

                if len(partes) >= 2:

                    responsable = (
                        Usuario.objects
                        .filter(
                            is_active=True,
                            first_name__iexact=partes[0],
                            last_name__iexact=" ".join(partes[1:]),
                        )
                        .first()
                    )

            if not responsable:

                errores_fila.append(
                    f'No se encontró el responsable '
                    f'"{nombre_responsable}".'
                )

        # -------------------------------------------------
        # MANUAL
        # -------------------------------------------------

        manual = normalizar(
            datos["CUENTA_CON_MANUAL"]
        )

        valores_manual = {
            "si": True,
            "sí": True,
            "s": True,
            "yes": True,
            "1": True,
            "no": False,
            "n": False,
            "0": False,
        }

        if manual not in valores_manual:

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

                valor_decimal = Decimal(
                    str(valor).replace(",", "")
                )

                if valor_decimal < 0:

                    errores_fila.append(
                        "VALOR no puede ser negativo."
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

            if isinstance(
                fecha_adquisicion,
                datetime,
            ):

                fecha_adquisicion = (
                    fecha_adquisicion.date()
                )

            elif not hasattr(
                fecha_adquisicion,
                "year",
            ):

                errores_fila.append(
                    "FECHA_ADQUISICION no tiene "
                    "un formato válido."
                )

        # -------------------------------------------------
        # SERIE / CODIGO
        # -------------------------------------------------

        serie_codigo = texto(
            datos["SERIE_CODIGO"]
        )

        if serie_codigo:

            existe = (
                Activo.objects
                .filter(
                    serie_codigo__iexact=serie_codigo,
                    activo=True,
                )
                .exists()
            )

            if existe:

                errores_fila.append(
                    f'La serie/código "{serie_codigo}" '
                    f'ya existe en el inventario.'
                )

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
            })

    workbook.close()

    return resultado