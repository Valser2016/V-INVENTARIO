import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { blacklistRefreshToken } from "../services/api";
import { useSession } from "../context/SessionContext";

const enlaces = [
    { to: "/", icono: "⌂", label: "Panel de control", end: true, permiso: "puede_ver_inventario" },
    { to: "/activos", icono: "▦", label: "Inventario", end: true, permiso: "puede_ver_inventario" },
    {
        to: "/activos/nuevo",
        icono: "+",
        label: "Registrar activo",
        permiso: "puede_modificar_inventario",
    },
    { to: "/movimientos", icono: "↔", label: "Préstamos", end: true, permiso: "puede_ver_movimientos" },
    {
        to: "/movimientos/solicitudes",
        icono: "▣",
        label: "Solicitudes",
        end: true,
        permiso: "puede_ver_movimientos",
        permisoAlternativo: "puede_revisar_solicitudes_prestamo",
        segundoPermisoAlternativo: "puede_aprobar_solicitudes_prestamo",
    },
    {
        to: "/movimientos/devoluciones",
        icono: "↩",
        label: "Devoluciones",
        end: true,
        permiso: "puede_ver_movimientos",
        permisoAlternativo: "puede_registrar_devoluciones",
    },
    { to: "/reportes", icono: "▤", label: "Reportes", permiso: "puede_ver_reportes" },
    {
        to: "/configuracion",
        icono: "⚙",
        label: "Catálogos",
        permiso: "puede_administrar_catalogos",
    },
    { to: "/usuarios", icono: "♙", label: "Usuarios y permisos", admin: true },
];

function Sidebar({ abierta, onNavigate }) {
    const navigate = useNavigate();
    const { perfil } = useSession();
    const administrador = Boolean(perfil?.es_administrador);
    const enlacesPermitidos = enlaces.filter(({
        permiso,
        permisoAlternativo,
        segundoPermisoAlternativo,
        admin,
    }) => {
        if (admin) {
            return administrador;
        }
        return administrador
            || Boolean(perfil?.permisos?.[permiso])
            || Boolean(perfil?.permisos?.[permisoAlternativo])
            || Boolean(perfil?.permisos?.[segundoPermisoAlternativo]);
    });

    const cerrarSesion = async () => {
        const refreshToken = localStorage.getItem("refresh_token");
        try {
            if (refreshToken) {
                await blacklistRefreshToken(refreshToken);
            }
        } catch {
            console.error("No fue posible invalidar el token de sesión en el servidor.");
        } finally {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            navigate("/login");
        }
    };

    return (
        <>
            {abierta && (
                <button
                    type="button"
                    className="sidebar-backdrop"
                    aria-label="Cerrar menú"
                    onClick={onNavigate}
                />
            )}
            <aside className={`sidebar${abierta ? " sidebar-open" : ""}`}>
                <NavLink className="brand" to="/" onClick={onNavigate}>
                    <img
                        className="brand-logo"
                        src="/valser-logo.png"
                        alt="Válvulas y Servicios Industriales S.A.S."
                    />
                </NavLink>

                <div className="sidebar-label">MENÚ PRINCIPAL</div>
                <nav className="sidebar-nav" aria-label="Navegación principal">
                    {enlacesPermitidos.map(({ to, icono, label, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            onClick={onNavigate}
                            className={({ isActive }) =>
                                `nav-item${isActive ? " active" : ""}`
                            }
                        >
                            <span className="nav-icon" aria-hidden="true">{icono}</span>
                            <span>{label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-help">
                    <span className="help-mark" aria-hidden="true">?</span>
                    <div>
                        <strong>¿Necesitas ayuda?</strong>
                        <span>Consulta con el administrador</span>
                    </div>
                </div>
                <div className="sidebar-footer">
                    <div className="user-avatar">U</div>
                    <div className="sidebar-user">
                        <strong>{perfil?.nombre_completo || "Sesión activa"}</strong>
                        <span>{perfil?.rol_nombre || "Usuario del sistema"}</span>
                    </div>
                    <button
                        type="button"
                        className="logout-button"
                        onClick={cerrarSesion}
                        aria-label="Cerrar sesión"
                        title="Cerrar sesión"
                    >
                        ↪
                    </button>
                </div>
            </aside>
        </>
    );
}

export default Sidebar;
