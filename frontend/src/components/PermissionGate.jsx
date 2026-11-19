import React from "react";
import { useSession } from "../context/SessionContext";

function PermissionGate({
    children,
    permiso,
    permisosAlternativos = [],
    administrador = false,
}) {
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

    const permisos = [permiso, ...permisosAlternativos].filter(Boolean);
    const autorizado = administrador
        ? perfil.es_administrador
        : perfil.es_administrador
            || permisos.some((nombre) => perfil.permisos?.[nombre]);

    if (!autorizado) {
        return (
            <section className="page-container">
                <div className="alert alert-error" role="alert">
                    Tu rol no tiene permiso para consultar este módulo.
                </div>
            </section>
        );
    }

    return children;
}

export default PermissionGate;
