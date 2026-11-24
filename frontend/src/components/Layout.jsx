import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";

const titulos = {
    "/": "Panel de control",
    "/activos": "Inventario",
    "/activos/nuevo": "Registrar activo",
    "/movimientos/solicitudes": "Solicitudes",
    "/movimientos/devoluciones": "Devoluciones",
    "/reportes": "Reportes",
    "/configuracion": "Configuración",
    "/usuarios": "Usuarios y permisos",
};

function Layout() {
    const [menuAbierto, setMenuAbierto] = useState(false);
    const { pathname } = useLocation();

    return (
        <div className={`app-layout${menuAbierto ? " menu-abierto" : ""}`}>
            <Sidebar
                abierta={menuAbierto}
                onNavigate={() => setMenuAbierto(false)}
            />
            <main className="main-content">
                <header className="topbar">
                    <button
                        type="button"
                        className="menu-toggle"
                        aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
                        aria-expanded={menuAbierto}
                        onClick={() => setMenuAbierto((abierto) => !abierto)}
                    >
                        <span />
                        <span />
                        <span />
                    </button>
                    <div className="topbar-heading">
                        <span className="breadcrumb">VALSER / ACTIVOS</span>
                        <h1>{titulos[pathname] || "Gestión de activos"}</h1>
                    </div>
                    <div className="topbar-user">
                        <span className="status-dot" />
                        <span>Sistema operativo</span>
                    </div>
                </header>
                <div className="content-container">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

export default Layout;
