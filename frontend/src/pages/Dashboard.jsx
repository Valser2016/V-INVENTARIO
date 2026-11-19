import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useSession } from "../context/SessionContext";

const indicadores = [
    { key: "total", label: "Total de activos", icono: "▦", tone: "primary" },
    { key: "disponibles", label: "Disponibles", icono: "✓", tone: "green" },
    { key: "prestados", label: "Prestados", icono: "↗", tone: "amber" },
    { key: "obsoletos", label: "Obsoletos", icono: "!", tone: "slate" },
];

function Dashboard() {
    const { perfil } = useSession();
    const administrador = Boolean(perfil?.es_administrador);
    const puedeVerInventario = administrador ||
        Boolean(perfil?.permisos?.puede_ver_inventario);
    const puedeModificarInventario = administrador ||
        Boolean(perfil?.permisos?.puede_modificar_inventario);
    const puedeAdministrarCatalogos = administrador ||
        Boolean(perfil?.permisos?.puede_administrar_catalogos);
    const puedeVerMovimientos = administrador ||
        Boolean(perfil?.permisos?.puede_ver_movimientos);
    const puedeVerReportes = administrador ||
        Boolean(perfil?.permisos?.puede_ver_reportes);
    const [resumen, setResumen] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!puedeVerInventario) {
            return undefined;
        }
        let cancelado = false;

        const cargarResumen = async () => {
            try {
                const response = await api.get("/levantamiento/activos/resumen/");
                if (!cancelado) {
                    setResumen(response.data);
                }
            } catch (requestError) {
                console.error("Error cargando resumen de activos:", requestError);
                if (!cancelado) {
                    setError("No fue posible cargar el resumen de activos.");
                }
            }
        };

        cargarResumen();
        return () => {
            cancelado = true;
        };
    }, [puedeVerInventario]);

    if (perfil && !puedeVerInventario) {
        return (
            <section className="page-container">
                <div className="alert alert-error" role="alert">
                    Tu rol no tiene permiso para consultar el inventario.
                </div>
            </section>
        );
    }

    return (
        <div className="page-container dashboard-page">
            <header className="page-header dashboard-welcome">
                <div>
                    <span className="eyebrow">RESUMEN GENERAL</span>
                    <h2>Bienvenido a VALSER Activos</h2>
                    <p>Este es el estado actual de los activos de tu organización.</p>
                </div>
                {puedeModificarInventario && (
                    <Link className="btn btn-primary" to="/activos/nuevo">
                        <span aria-hidden="true">＋</span> Registrar activo
                    </Link>
                )}
            </header>

            {error && (
                <div className="alert alert-error" role="alert">
                    <span>!</span>
                    <div>
                        <strong>No se pudo cargar el resumen</strong>
                        <p>{error}</p>
                    </div>
                </div>
            )}

            <section className="stats-grid" aria-label="Resumen de activos">
                {indicadores.map(({ key, label, icono, tone }) => (
                    <article className="stat-card" key={key}>
                        <div className={`stat-icon ${tone}`} aria-hidden="true">
                            {icono}
                        </div>
                        <p>{label}: {resumen ? resumen[key] : "—"}</p>
                        <span className="stat-caption">
                            {resumen ? "Registrados en el sistema" : "Cargando información"}
                        </span>
                    </article>
                ))}
            </section>

            {!resumen && !error && (
                <p className="sr-only" role="status">Cargando resumen...</p>
            )}

            <section className="dashboard-lower">
                <article className="welcome-card">
                    <div className="welcome-card-copy">
                        <span className="eyebrow">GESTIÓN DE INVENTARIO</span>
                        <h3>Tu operación, bajo control.</h3>
                        <p>
                            Mantén la información de tus equipos actualizada y
                            encuentra lo que necesitas en pocos pasos.
                        </p>
                        <Link className="text-link" to="/activos">
                            Explorar inventario <span aria-hidden="true">→</span>
                        </Link>
                    </div>
                    <div className="welcome-illustration" aria-hidden="true">
                        <span className="illustration-square square-back" />
                        <span className="illustration-square square-front">V</span>
                        <span className="illustration-dot" />
                    </div>
                </article>

                <article className="quick-actions card">
                    <div className="card-heading">
                        <div>
                            <span className="eyebrow">ACCESOS DIRECTOS</span>
                            <h3>¿Qué necesitas hacer?</h3>
                        </div>
                    </div>
                    {puedeModificarInventario && (
                        <Link to="/activos/nuevo" className="quick-action">
                            <span className="quick-action-icon">＋</span>
                            <span><strong>Registrar un activo</strong><small>Agregar un equipo al inventario</small></span>
                            <span className="quick-arrow">→</span>
                        </Link>
                    )}
                    {puedeAdministrarCatalogos && <Link to="/configuracion" className="quick-action">
                        <span className="quick-action-icon">⚙</span>
                        <span><strong>Administrar catálogos</strong><small>Gestionar tipos, categorías y ubicaciones</small></span>
                        <span className="quick-arrow">→</span>
                    </Link>}
                    {puedeVerInventario && <Link to="/activos" className="quick-action">
                        <span className="quick-action-icon">▦</span>
                        <span><strong>Consultar inventario</strong><small>Buscar y revisar activos</small></span>
                        <span className="quick-arrow">→</span>
                    </Link>}
                    {puedeVerMovimientos && <Link to="/movimientos" className="quick-action">
                        <span className="quick-action-icon">↔</span>
                        <span><strong>Consultar préstamos</strong><small>Revisar movimientos de equipos</small></span>
                        <span className="quick-arrow">→</span>
                    </Link>}
                    {puedeVerReportes && <Link to="/reportes" className="quick-action">
                        <span className="quick-action-icon">▤</span>
                        <span><strong>Consultar reportes</strong><small>Revisar información del inventario y movimientos</small></span>
                        <span className="quick-arrow">→</span>
                    </Link>}
                </article>
            </section>
        </div>
    );
}

export default Dashboard;
