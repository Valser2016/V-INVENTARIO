from rest_framework.permissions import BasePermission, SAFE_METHODS


def es_administrador(user):
    if not user or not user.is_authenticated:
        return False
    rol = getattr(user, "rol", None)
    if rol:
        return bool(
            rol.activo
            and rol.nombre.strip().casefold() == "administrador"
        )
    return bool(user.is_superuser)


def puede_consultar(user, permiso):
    if es_administrador(user):
        return True
    rol = getattr(user, "rol", None)
    return bool(rol and rol.activo and getattr(rol, permiso, False))


class SoloAdministrador(BasePermission):
    message = "Solo un administrador puede realizar esta acción."

    def has_permission(self, request, view):
        return es_administrador(request.user)


class PuedeConsultarYCrearActivos(BasePermission):
    message = "Tu rol no tiene permiso para crear o modificar activos."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return puede_consultar(request.user, "puede_ver_inventario")
        return es_administrador(request.user) or puede_consultar(
            request.user,
            "puede_modificar_inventario",
        )


class PuedeAdministrarConfiguracion(BasePermission):
    message = "Tu rol no tiene permiso para administrar los catálogos."

    def has_permission(self, request, view):
        return es_administrador(request.user) or puede_consultar(
            request.user,
            "puede_administrar_catalogos",
        )


class PuedeRegistrarMovimientos(BasePermission):
    message = "Solo un administrador puede registrar o modificar movimientos."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return puede_consultar(request.user, "puede_ver_movimientos")
        return es_administrador(request.user)


class PuedeConsultarDevoluciones(BasePermission):
    message = "Tu rol no tiene permiso para consultar o registrar devoluciones."

    def has_permission(self, request, view):
        action = getattr(view, "action", None)
        if action == "devolver":
            return es_administrador(request.user) or puede_consultar(
                request.user,
                "puede_registrar_devoluciones",
            )
        if request.method in SAFE_METHODS:
            return (
                puede_consultar(request.user, "puede_ver_movimientos")
                or puede_consultar(request.user, "puede_registrar_devoluciones")
            )
        return es_administrador(request.user)


class PuedeConsultarListasHerramientas(BasePermission):
    message = "Tu rol no tiene permiso para administrar listas de herramientas."

    def has_permission(self, request, view):
        puede_administrar = es_administrador(request.user) or puede_consultar(
            request.user,
            "puede_administrar_catalogos",
        )
        if getattr(view, "action", None) == "activos":
            return puede_administrar
        if request.method in SAFE_METHODS:
            return puede_administrar or puede_consultar(
                request.user,
                "puede_ver_movimientos",
            )
        return puede_administrar


class PuedeConsultarCatalogosDevolucion(BasePermission):
    message = "Tu rol no tiene permiso para consultar estos catálogos."

    def has_permission(self, request, view):
        return request.method in SAFE_METHODS and (
            puede_consultar(request.user, "puede_ver_inventario")
            or puede_consultar(request.user, "puede_registrar_devoluciones")
        )


class PuedeSolicitarPrestamo(BasePermission):
    def has_permission(self, request, view):
        action = getattr(view, "action", None)
        if action == "destroy":
            self.message = (
                "Solo un administrador puede eliminar solicitudes."
            )
            return es_administrador(request.user)
        if action in {"aprobar", "rechazar"}:
            self.message = "Tu rol no tiene permiso para aprobar o rechazar solicitudes."
            return es_administrador(request.user) or puede_consultar(
                request.user,
                "puede_aprobar_solicitudes_prestamo",
            )
        if action == "revisar":
            self.message = (
                "Tu rol no tiene permiso para revisar solicitudes de préstamo."
            )
            return es_administrador(request.user) or puede_consultar(
                request.user,
                "puede_revisar_solicitudes_prestamo",
            )
        self.message = "Tu rol no tiene permiso para consultar o solicitar préstamos."
        if request.method in SAFE_METHODS:
            return (
                puede_consultar(request.user, "puede_ver_movimientos")
                or puede_consultar(
                    request.user,
                    "puede_revisar_solicitudes_prestamo",
                )
                or puede_consultar(
                    request.user,
                    "puede_aprobar_solicitudes_prestamo",
                )
            )
        return puede_consultar(request.user, "puede_ver_movimientos")


class PuedeConsultarReportes(BasePermission):
    message = "Tu rol no tiene permiso para consultar reportes."

    def has_permission(self, request, view):
        return (
            request.method in SAFE_METHODS
            and puede_consultar(request.user, "puede_ver_reportes")
        )
