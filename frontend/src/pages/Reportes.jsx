import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";

const reportes = [
    { key: "inventario", titulo: "Inventario", endpoint: "/reportes/inventario/" },
    { key: "prestamos", titulo: "Préstamos", endpoint: "/reportes/prestamos/" },
    { key: "vencimientos", titulo: "Vencimientos", endpoint: "/reportes/vencimientos/" },
    { key: "devoluciones", titulo: "Devoluciones", endpoint: "/reportes/devoluciones/" },
];

const columnas = {
    codigo: "Código",
    activo: "Activo",
    tipo: "Tipo",
    categoria: "Categoría",
    estado: "Estado",
    ubicacion: "Ubicación",
    serie: "Serie",
    valor: "Valor",
    id: "Préstamo",
    prestamo: "Préstamo",
    nombre_receptor: "Receptor",
    receptor: "Receptor",
    documento_receptor: "Documento",
    documento: "Documento",
    fecha_prestamo: "Fecha del préstamo",
    fecha_devolucion_prevista: "Devolución prevista",
    fecha_prevista: "Fecha prevista",
    estado_prestamo: "Estado",
    activos: "Activos",
    total_activos: "Total de activos",
    activos_pendientes: "Pendientes",
    dias_vencido: "Días vencido",
    fecha_devolucion: "Fecha de devolución",
    condicion: "Condición",
    observacion: "Observación",
};

const mensajeDeError = (error) => {
    const data = error.response?.data;
    if (data instanceof Blob) {
        return "No fue posible generar el archivo de reporte.";
    }
    if (!data) {
        return "No fue posible conectar con el servidor. Intenta de nuevo.";
    }
    if (typeof data.detail === "string") {
        return data.detail;
    }
    return Object.entries(data)
        .flatMap(([campo, mensajes]) =>
            (Array.isArray(mensajes) ? mensajes : [mensajes]).map(
                (mensaje) => `${campo}: ${mensaje}`
            )
        )
        .join(" ");
};

function Reportes() {
    const [tipo, setTipo] = useState("inventario");
    const [filtros, setFiltros] = useState({
        busqueda: "",
        estado: "todos",
        desde: "",
        hasta: "",
        condicion: "",
    });
    const [filtrosAplicados, setFiltrosAplicados] = useState({});
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [exportando, setExportando] = useState("");
    const [error, setError] = useState("");
    const reporte = reportes.find((item) => item.key === tipo);

    const parametros = useMemo(() => {
        const resultado = {};
        if (tipo === "inventario" && filtrosAplicados.busqueda) {
            resultado.q = filtrosAplicados.busqueda;
        }
        if (tipo === "prestamos" && filtrosAplicados.estado !== "todos") {
            resultado.estado = filtrosAplicados.estado;
        }
        if (tipo === "devoluciones") {
            if (filtrosAplicados.desde) resultado.desde = filtrosAplicados.desde;
            if (filtrosAplicados.hasta) resultado.hasta = filtrosAplicados.hasta;
            if (filtrosAplicados.condicion) {
                resultado.condicion = filtrosAplicados.condicion;
            }
        }
        return resultado;
    }, [filtrosAplicados, tipo]);

    const cargarReporte = useCallback(async () => {
        setCargando(true);
        setError("");
        try {
            const respuesta = await api.get(reporte.endpoint, { params: parametros });
            setDatos(respuesta.data);
        } catch (requestError) {
            console.error("Error cargando reporte:", requestError);
            setError(mensajeDeError(requestError));
            setDatos(null);
        } finally {
            setCargando(false);
        }
    }, [parametros, reporte.endpoint]);

    useEffect(() => {
        void Promise.resolve().then(cargarReporte);
    }, [cargarReporte]);

    const filas = useMemo(() => {
        if (tipo === "inventario") return datos?.resultados ?? [];
        if (tipo === "prestamos") {
            return (datos ?? []).map((prestamo) => ({
                id: prestamo.id,
                nombre_receptor: prestamo.nombre_receptor,
                documento_receptor: prestamo.documento_receptor,
                fecha_prestamo: prestamo.fecha_prestamo?.slice(0, 10),
                fecha_devolucion_prevista: prestamo.fecha_devolucion_prevista,
                estado_prestamo: prestamo.estado,
                total_activos: prestamo.total_activos,
                activos_pendientes: prestamo.activos_pendientes,
                activos: prestamo.detalles.map((detalle) => detalle.codigo_interno).join(", "),
            }));
        }
        return datos ?? [];
    }, [datos, tipo]);

    const aplicarFiltros = (event) => {
        event.preventDefault();
        setFiltrosAplicados({ ...filtros });
    };

    const exportar = async (formato) => {
        setExportando(formato);
        setError("");
        try {
            const respuesta = await api.get(
                `/reportes/exportar/${tipo}/${formato}/`,
                { params: parametros, responseType: "blob" },
            );
            const blobUrl = URL.createObjectURL(respuesta.data);
            const enlace = document.createElement("a");
            enlace.href = blobUrl;
            enlace.download = `valser-${tipo}.${formato}`;
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();
            URL.revokeObjectURL(blobUrl);
        } catch (requestError) {
            console.error("Error exportando reporte:", requestError);
            setError(mensajeDeError(requestError));
        } finally {
            setExportando("");
        }
    };

    const camposFila = filas.length ? Object.keys(filas[0]) : [];

    return (
        <section className="page-container">
            <header className="page-header">
                <div>
                    <span className="eyebrow">CONSULTA Y ANÁLISIS</span>
                    <h1>Reportes</h1>
                    <p>Consulta inventario, préstamos, vencimientos y devoluciones.</p>
                </div>
                <div className="report-export-actions">
                    <button
                        className="btn btn-secondary"
                        type="button"
                        disabled={Boolean(exportando)}
                        onClick={() => exportar("xlsx")}
                    >
                        {exportando === "xlsx" ? "Generando..." : "Exportar Excel"}
                    </button>
                    <button
                        className="btn btn-secondary"
                        type="button"
                        disabled={Boolean(exportando)}
                        onClick={() => exportar("pdf")}
                    >
                        {exportando === "pdf" ? "Generando..." : "Exportar PDF"}
                    </button>
                </div>
            </header>

            <nav className="module-tabs" aria-label="Tipos de reporte">
                {reportes.map((item) => (
                    <button
                        type="button"
                        key={item.key}
                        className={tipo === item.key ? "active" : ""}
                        onClick={() => setTipo(item.key)}
                    >
                        {item.titulo}
                    </button>
                ))}
            </nav>

            {tipo === "inventario" && (
                <section className="report-distribution" aria-label="Resumen del inventario">
                    {[
                        ["Total de activos", datos?.resumen?.total],
                        ["Disponibles", datos?.resumen?.disponibles],
                        ["Prestados", datos?.resumen?.prestados],
                        ["Obsoletos", datos?.resumen?.obsoletos],
                    ].map(([label, total]) => (
                        <article className="card report-stat" key={label}>
                            <span>{label}</span>
                            <strong>{total ?? "—"}</strong>
                        </article>
                    ))}
                </section>
            )}

            <form className="card report-filters" onSubmit={aplicarFiltros}>
                {tipo === "inventario" && (
                    <label className="form-group">
                        <span>Buscar por código, nombre o serie</span>
                        <input
                            value={filtros.busqueda}
                            onChange={(event) => setFiltros({
                                ...filtros,
                                busqueda: event.target.value,
                            })}
                        />
                    </label>
                )}
                {tipo === "prestamos" && (
                    <label className="form-group">
                        <span>Estado del préstamo</span>
                        <select
                            value={filtros.estado}
                            onChange={(event) => setFiltros({
                                ...filtros,
                                estado: event.target.value,
                            })}
                        >
                            <option value="todos">Todos</option>
                            <option value="vigente">Vigentes</option>
                            <option value="parcial">Parciales</option>
                            <option value="vencido">Vencidos</option>
                            <option value="devuelto">Devueltos</option>
                        </select>
                    </label>
                )}
                {tipo === "devoluciones" && (
                    <>
                        <label className="form-group">
                            <span>Desde</span>
                            <input
                                type="date"
                                value={filtros.desde}
                                onChange={(event) => setFiltros({
                                    ...filtros,
                                    desde: event.target.value,
                                })}
                            />
                        </label>
                        <label className="form-group">
                            <span>Hasta</span>
                            <input
                                type="date"
                                value={filtros.hasta}
                                onChange={(event) => setFiltros({
                                    ...filtros,
                                    hasta: event.target.value,
                                })}
                            />
                        </label>
                        <label className="form-group">
                            <span>Condición</span>
                            <select
                                value={filtros.condicion}
                                onChange={(event) => setFiltros({
                                    ...filtros,
                                    condicion: event.target.value,
                                })}
                            >
                                <option value="">Todas</option>
                                <option value="BUENO">Bueno</option>
                                <option value="CON_NOVEDAD">Con novedad</option>
                                <option value="DANADO">Dañado</option>
                            </select>
                        </label>
                    </>
                )}
                {tipo !== "vencimientos" && (
                    <button className="btn btn-primary" type="submit">Aplicar filtros</button>
                )}
            </form>

            {error && <div className="alert alert-error" role="alert">{error}</div>}

            <section className="card report-table-card" aria-label={reporte.titulo}>
                {cargando ? (
                    <div className="table-loading" role="status">
                        <span className="loading-spinner" />
                        <span>Cargando reporte...</span>
                    </div>
                ) : filas.length ? (
                    <div className="table-responsive">
                        <table>
                            <thead>
                                <tr>{camposFila.map((campo) => (
                                    <th key={campo}>{columnas[campo] ?? campo}</th>
                                ))}</tr>
                            </thead>
                            <tbody>
                                {filas.map((fila, indice) => (
                                    <tr key={fila.codigo ?? fila.id ?? fila.prestamo ?? indice}>
                                        {camposFila.map((campo) => (
                                            <td key={campo}>{fila[campo] ?? "—"}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-state">
                        <h2>Sin resultados</h2>
                        <p>No hay información que coincida con el reporte seleccionado.</p>
                    </div>
                )}
            </section>

            {tipo === "inventario" && datos?.distribucion && (
                <section className="report-distribution report-groups">
                    {[
                        ["Activos por estado", datos.distribucion.estados, "estado__nombre"],
                        ["Activos por categoría", datos.distribucion.categorias, "categoria__nombre"],
                        ["Activos por ubicación", datos.distribucion.ubicaciones, "ubicacion__nombre"],
                    ].map(([titulo, items, campo]) => (
                        <article className="card report-group-card" key={titulo}>
                            <h2>{titulo}</h2>
                            {items.map((item) => (
                                <div key={item[campo]}>
                                    <span>{item[campo]}</span><strong>{item.total}</strong>
                                </div>
                            ))}
                        </article>
                    ))}
                </section>
            )}
        </section>
    );
}

export default Reportes;
