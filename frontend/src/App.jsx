import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ListadoActivos from "./pages/ListadoActivos";
import NuevoActivo from "./pages/NuevoActivo";
import Configuracion from "./pages/Configuracion";
import Prestamos from "./pages/Prestamos";
import SolicitudesPrestamo from "./pages/SolicitudesPrestamo";
import Usuarios from "./pages/Usuarios";
import Reportes from "./pages/Reportes";

import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import PermissionGate from "./components/PermissionGate";
import SessionProvider from "./context/SessionProvider";
import { useSession } from "./context/SessionContext";

function Inicio() {
    const { perfil, cargando, error } = useSession();

    if (cargando) {
        return (
            <section className="page-container">
                <div className="table-loading" role="status">
                    <span className="loading-spinner" />
                    <span>Verificando permisos...</span>
                </div>
            </section>
        );
    }

    if (error || !perfil) {
        return (
            <section className="page-container">
                <div className="alert alert-error" role="alert">
                    {error || "No fue posible verificar los permisos del usuario."}
                </div>
            </section>
        );
    }

    if (perfil.es_administrador || perfil.permisos?.puede_ver_inventario) {
        return <Dashboard />;
    }

    if (
        perfil.permisos?.puede_ver_movimientos
        || perfil.permisos?.puede_revisar_solicitudes_prestamo
        || perfil.permisos?.puede_aprobar_solicitudes_prestamo
    ) {
        return <Navigate to="/movimientos/solicitudes" replace />;
    }

    if (perfil.permisos?.puede_registrar_devoluciones) {
        return <Navigate to="/movimientos/devoluciones" replace />;
    }

    if (perfil.permisos?.puede_ver_reportes) {
        return <Navigate to="/reportes" replace />;
    }

    return (
        <section className="page-container">
            <div className="alert alert-error" role="alert">
                Tu rol no tiene permisos para acceder a los módulos del sistema.
            </div>
        </section>
    );
}

function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route
                element={
                    <ProtectedRoute>
                        <SessionProvider>
                            <Layout />
                        </SessionProvider>
                    </ProtectedRoute>
                }
            >
                <Route
                    path="/"
                    element={<Inicio />}
                />
                <Route
                    path="/activos/nuevo"
                    element={
                        <PermissionGate permiso="puede_modificar_inventario">
                            <NuevoActivo />
                        </PermissionGate>
                    }
                />
                <Route
                    path="/activos"
                    element={<PermissionGate permiso="puede_ver_inventario"><ListadoActivos /></PermissionGate>}
                />
                <Route
                    path="/movimientos"
                    element={<Navigate to="/movimientos/solicitudes" replace />}
                />
                <Route
                    path="/movimientos/devoluciones"
                    element={
                        <PermissionGate
                            permiso="puede_ver_movimientos"
                            permisosAlternativos={["puede_registrar_devoluciones"]}
                        >
                            <Prestamos devoluciones />
                        </PermissionGate>
                    }
                />
                <Route
                    path="/movimientos/solicitudes"
                    element={
                        <PermissionGate
                            permiso="puede_ver_movimientos"
                            permisosAlternativos={[
                                "puede_revisar_solicitudes_prestamo",
                                "puede_aprobar_solicitudes_prestamo",
                            ]}
                        >
                            <SolicitudesPrestamo />
                        </PermissionGate>
                    }
                />
                <Route
                    path="/reportes"
                    element={<PermissionGate permiso="puede_ver_reportes"><Reportes /></PermissionGate>}
                />
                <Route
                    path="/usuarios"
                    element={<PermissionGate administrador><Usuarios /></PermissionGate>}
                />
                <Route
                    path="/configuracion"
                    element={
                        <PermissionGate permiso="puede_administrar_catalogos">
                            <Configuracion />
                        </PermissionGate>
                    }
                />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;