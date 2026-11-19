import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useSession } from "../context/SessionContext";

import {
    alternarActivoSeleccionado,
    fechaMinimaPrestamo,
} from "../utils/prestamos";

const errorApi = (error) => {
    const data = error.response?.data;
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

function Prestamos({ devoluciones = false }) {
    const { perfil } = useSession();
    const administrador = Boolean(perfil?.es_administrador);
    const puedeVerMovimientos = administrador
        || Boolean(perfil?.permisos?.puede_ver_movimientos);
    const puedeRegistrarDevoluciones = administrador
        || Boolean(perfil?.permisos?.puede_registrar_devoluciones);
    const [prestamos, setPrestamos] = useState([]);
    const [activos, setActivos] = useState([]);
    const [estados, setEstados] = useState([]);
    const [ubicaciones, setUbicaciones] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [eliminandoId, setEliminandoId] = useState(null);
    const [descargandoFormatoRetornoId, setDescargandoFormatoRetornoId] = useState(null);
    const [error, setError] = useState("");
    const [mensaje, setMensaje] = useState("");
    const [formulario, setFormulario] = useState({
        nombre_receptor: "",
        documento_receptor: "",
        fecha_devolucion_prevista: fechaMinimaPrestamo(),
        observaciones: "",
        activos: [],
    });
    const [devolucionesSeleccionadas, setDevolucionesSeleccionadas] = useState({});
    const [devolucionesEnRevision, setDevolucionesEnRevision] = useState({});

    const cargarDatos = useCallback(async () => {
        try {
            const [respuestaPrestamos, respuestaActivos, respuestaEstados, respuestaUbicaciones] =
                await Promise.all([
                    api.get("/movimientos/prestamos/"),
                    devoluciones
                        ? Promise.resolve({ data: [] })
                        : api.get("/movimientos/activos-disponibles/"),
                    api.get("/levantamiento/estados/"),
                    api.get("/levantamiento/ubicaciones/"),
                ]);
            setPrestamos(respuestaPrestamos.data);
            setActivos(respuestaActivos.data);
            setEstados(respuestaEstados.data);
            setUbicaciones(respuestaUbicaciones.data);
        } catch (requestError) {
            console.error("Error cargando préstamos y devoluciones:", requestError);
            setError(errorApi(requestError));
        } finally {
            setCargando(false);
        }
    }, [devoluciones]);

    useEffect(() => {
        void Promise.resolve().then(cargarDatos);
    }, [cargarDatos]);

    const cambiarCampo = (campo, valor) => {
        setFormulario((actual) => ({ ...actual, [campo]: valor }));
    };

    const crearPrestamo = async (event) => {
        event.preventDefault();
        setGuardando(true);
        setError("");
        setMensaje("");
        try {
            await api.post("/movimientos/prestamos/", formulario);
            setFormulario({
                nombre_receptor: "",
                documento_receptor: "",
                fecha_devolucion_prevista: fechaMinimaPrestamo(),
                observaciones: "",
                activos: [],
            });
            setMensaje("El préstamo se registró correctamente.");
            setCargando(true);
            await cargarDatos();
        } catch (requestError) {
            console.error("Error registrando préstamo:", requestError);
            setError(errorApi(requestError));
        } finally {
            setGuardando(false);
        }
    };

    const eliminarPrestamo = async (prestamo) => {
        const confirmacion =
            `¿Eliminar permanentemente el préstamo #${prestamo.id}, sus detalles, ` +
            "la solicitud asociada y sus formatos PDF? Los activos aún prestados " +
            "recuperarán su estado y ubicación anteriores; los ya devueltos no cambiarán.";
        if (!window.confirm(confirmacion)) {
            return;
        }

        setEliminandoId(prestamo.id);
        setError("");
        setMensaje("");
        try {
            await api.delete(`/movimientos/prestamos/${prestamo.id}/`);
            setMensaje("Se eliminó el préstamo y su historial asociado.");
            setCargando(true);
            await cargarDatos();
        } catch (requestError) {
            console.error("Error eliminando préstamo:", requestError);
            setError(errorApi(requestError));
        } finally {
            setEliminandoId(null);
        }
    };

    const seleccionarActivo = (id) => {
        cambiarCampo(
            "activos",
            alternarActivoSeleccionado(formulario.activos, id)
        );
    };

    const cambiarDatoDevolucion = (detalleId, campo, valor) => {
        setDevolucionesSeleccionadas((actual) => ({
            ...actual,
            [detalleId]: {
                ...actual[detalleId],
                [campo]: valor,
            },
        }));
    };

    const prepararDevolucion = (event, prestamo) => {
        event.preventDefault();
        const detalles = prestamo.detalles
            .filter((detalle) =>
                devolucionesSeleccionadas[detalle.id]?.seleccionado !== false
            )
            .map((detalle) => {
                const datos = devolucionesSeleccionadas[detalle.id] ?? {};
                return {
                    detalle_id: detalle.id,
                    estado: Number(datos.estado ?? estadoDisponible?.id),
                    ubicacion: Number(
                        datos.ubicacion ?? detalle.ubicacion_al_prestar,
                    ),
                    condicion: datos.condicion ?? "BUENO",
                    observacion: datos.observacion ?? "",
                };
            });

        if (!detalles.length) {
            setError("Selecciona al menos un activo para registrar la devolución.");
            return;
        }

        setError("");
        setDevolucionesEnRevision((actuales) => ({
            ...actuales,
            [prestamo.id]: detalles,
        }));
    };

    const cancelarRevisionDevolucion = (prestamoId) => {
        setDevolucionesEnRevision((actuales) => {
            const nuevas = { ...actuales };
            delete nuevas[prestamoId];
            return nuevas;
        });
    };

    const descargarFormatoRetorno = async (prestamoId) => {
        const respuesta = await api.get(
            `/movimientos/prestamos/${prestamoId}/formato-retorno/`,
            { responseType: "blob" },
        );
        const url = URL.createObjectURL(respuesta.data);
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = `OYS-FO-09-prestamo-${prestamoId}-retorno.pdf`;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        URL.revokeObjectURL(url);
    };

    const descargarFormatoRetornoHistorico = async (prestamoId) => {
        setDescargandoFormatoRetornoId(prestamoId);
        setError("");
        try {
            await descargarFormatoRetorno(prestamoId);
        } catch (requestError) {
            console.error("Error descargando el PDF de devolución:", requestError);
            setError("No fue posible descargar el PDF de devolución. Intenta de nuevo.");
        } finally {
            setDescargandoFormatoRetornoId(null);
        }
    };

    const confirmarDevolucion = async (prestamo) => {
        const detalles = devolucionesEnRevision[prestamo.id];
        if (!detalles?.length) {
            setError("Revisa los activos antes de confirmar la devolución.");
            return;
        }

        setGuardando(true);
        setError("");
        setMensaje("");
        try {
            const respuesta = await api.post(
                `/movimientos/prestamos/${prestamo.id}/devolver/`,
                { detalles },
            );
            setDevolucionesSeleccionadas((actuales) => {
                const nuevas = { ...actuales };
                detalles.forEach(({ detalle_id }) => {
                    delete nuevas[detalle_id];
                });
                return nuevas;
            });
            cancelarRevisionDevolucion(prestamo.id);
            setCargando(true);
            await cargarDatos();
            if (respuesta.data.formato_retorno_disponible) {
                try {
                    await descargarFormatoRetorno(prestamo.id);
                    setMensaje(
                        "Devolución finalizada. Se descargó el PDF actualizado.",
                    );
                } catch (requestError) {
                    console.error(
                        "Devolución guardada, pero no se pudo descargar el PDF:",
                        requestError,
                    );
                    setError(
                        "La devolución se guardó, pero no se pudo descargar el PDF. "
                        + "Puedes volver a intentarlo en la lista de préstamos recientes.",
                    );
                }
            } else if (respuesta.data.estado === "Devuelto") {
                setMensaje(
                    "La devolución finalizó. Este préstamo no tiene una solicitud "
                    + "asociada para generar el formato OYS-FO-09.",
                );
            } else {
                setMensaje(
                    "La devolución parcial se registró. El PDF estará disponible "
                    + "cuando regresen todos los activos del préstamo.",
                );
            }
        } catch (requestError) {
            console.error("Error registrando devolución:", requestError);
            setError(errorApi(requestError));
        } finally {
            setGuardando(false);
        }
    };

    const estadosDevolucion = estados.filter(
        (estado) => !["prestado", "en servicio"].includes(
            estado.nombre.trim().toLocaleLowerCase(),
        ),
    );
    const estadoDisponible = estadosDevolucion.find(
        (estado) => estado.nombre.toLocaleLowerCase() === "disponible",
    );
    const prestamosPendientes = prestamos.filter(
        (prestamo) => prestamo.activos_pendientes > 0,
    );
    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <span className="eyebrow">GESTIÓN DE ACTIVOS</span>
                    <h1>{devoluciones ? "Devoluciones" : "Préstamos"}</h1>
                    <p>
                        {devoluciones
                            ? "Registra el estado y la ubicación de los activos que regresan."
                            : "Entrega activos a colaboradores y consulta sus fechas de devolución."}
                    </p>
                </div>
            </header>

            <nav className="module-tabs" aria-label="Módulos de movimientos">
                {puedeVerMovimientos && (
                    <Link to="/movimientos" className={!devoluciones ? "active" : ""}>
                        {administrador ? "Registrar préstamos" : "Consultar préstamos"}
                    </Link>
                )}
                {(puedeVerMovimientos || puedeRegistrarDevoluciones) && (
                    <Link
                        to="/movimientos/devoluciones"
                        className={devoluciones ? "active" : ""}
                    >
                        {administrador || puedeRegistrarDevoluciones
                            ? "Registrar devoluciones"
                            : "Historial de devoluciones"}
                    </Link>
                )}
            </nav>

            {error && (
                <div className="alert alert-error" role="alert">
                    <span>!</span>
                    <div><strong>No se pudo completar la operación</strong><p>{error}</p></div>
                </div>
            )}
            {mensaje && (
                <div className="alert alert-success" role="status">{mensaje}</div>
            )}

            {!administrador && !puedeRegistrarDevoluciones ? (
                <section className="card loan-history">
                    <div className="card-header">
                        <h2>{devoluciones ? "Movimientos registrados" : "Préstamos registrados"}</h2>
                        <p>Tu rol permite consultar estos movimientos, pero no modificarlos.</p>
                    </div>
                    {cargando ? (
                        <div className="table-loading" role="status">
                            <span className="loading-spinner" />
                            <span>Cargando movimientos...</span>
                        </div>
                    ) : prestamos.length ? (
                        <div className="loan-history-list">
                            {prestamos.map((prestamo) => (
                                <article className="loan-history-item" key={prestamo.id}>
                                    <div>
                                        <strong>{prestamo.nombre_receptor}</strong>
                                        <span>
                                            {prestamo.total_activos} activo(s) · Vence{" "}
                                            {prestamo.fecha_devolucion_prevista}
                                        </span>
                                    </div>
                                    <span className={`loan-status loan-status-${prestamo.estado.toLocaleLowerCase()}`}>
                                        {prestamo.estado}
                                    </span>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <p className="form-hint">Todavía no se registran préstamos.</p>
                    )}
                </section>
            ) : cargando ? (
                <section className="card table-loading" role="status">
                    <span className="loading-spinner" />
                    <span>Cargando movimientos...</span>
                </section>
            ) : devoluciones ? (
                    <section className="loan-list" aria-label="Préstamos pendientes">
                        {prestamosPendientes.length ? prestamosPendientes.map((prestamo) => (
                        <form
                            className="card loan-card"
                            key={prestamo.id}
                            onSubmit={(event) => prepararDevolucion(event, prestamo)}
                        >
                            <header className="loan-card-header">
                                <div>
                                    <span className="eyebrow">PRÉSTAMO #{prestamo.id}</span>
                                    <h2>{prestamo.nombre_receptor}</h2>
                                    <p>
                                        Documento {prestamo.documento_receptor} · Devolución prevista{" "}
                                        {prestamo.fecha_devolucion_prevista}
                                    </p>
                                </div>
                                <span className="record-count">
                                    {prestamo.activos_pendientes} pendiente(s)
                                </span>
                            </header>
                            {devolucionesEnRevision[prestamo.id] ? (
                                <div className="request-review">
                                    <h3>Revisar devolución</h3>
                                    <div className="asset-review-scroll">
                                        <table className="asset-review-table return-checklist-table">
                                            <thead>
                                                <tr>
                                                    <th scope="col">Herramienta</th>
                                                    <th scope="col">Estado físico</th>
                                                    <th scope="col">Incluir devolución</th>
                                                    <th scope="col">Estado y ubicación</th>
                                                    <th scope="col">Observación</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {devolucionesEnRevision[prestamo.id].map((detalleDevuelto) => {
                                                    const detalle = prestamo.detalles.find(
                                                        (item) => item.id === detalleDevuelto.detalle_id,
                                                    );
                                                    const estado = estados.find(
                                                        (item) => item.id === detalleDevuelto.estado,
                                                    );
                                                    const ubicacion = ubicaciones.find(
                                                        (item) => item.id === detalleDevuelto.ubicacion,
                                                    );
                                                    return (
                                                        <tr key={detalleDevuelto.detalle_id}>
                                                            <th scope="row">
                                                                <strong>{detalle.codigo_interno}</strong>
                                                                <span>{detalle.nombre_activo}</span>
                                                            </th>
                                                            <td>
                                                                {detalleDevuelto.condicion === "BUENO"
                                                                    ? "Bueno"
                                                                    : detalleDevuelto.condicion === "CON_NOVEDAD"
                                                                        ? "Con novedad"
                                                                        : "Dañado"}
                                                            </td>
                                                            <td>Incluido</td>
                                                            <td>
                                                                {estado?.nombre} · {ubicacion?.nombre}
                                                            </td>
                                                            <td>{detalleDevuelto.observacion || "—"}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="request-review-hint">
                                        Confirma que la condición y los datos de recepción sean correctos.
                                    </p>
                                    <div className="admin-form-actions">
                                        <button
                                            className="btn btn-secondary"
                                            type="button"
                                            disabled={guardando}
                                            onClick={() => cancelarRevisionDevolucion(prestamo.id)}
                                        >
                                            Volver al checklist
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            type="button"
                                            disabled={guardando}
                                            onClick={() => confirmarDevolucion(prestamo)}
                                        >
                                            {guardando ? "Guardando..." : "Confirmar y registrar devolución"}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="request-review">
                                        <h3>Checklist de devolución</h3>
                                        <div className="asset-review-scroll">
                                            <table className="asset-review-table return-checklist-table">
                                                <thead>
                                                    <tr>
                                                        <th scope="col">Herramienta</th>
                                                        <th scope="col">Estado físico</th>
                                                        <th scope="col">Incluir devolución</th>
                                                        <th scope="col">Estado y ubicación</th>
                                                        <th scope="col">Observación</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {prestamo.detalles
                                                        .filter((detalle) => !detalle.fecha_devolucion)
                                                        .map((detalle) => {
                                                            const datos = devolucionesSeleccionadas[detalle.id] ?? {};
                                                            const estadoSeleccionado = datos.estado
                                                                ?? estadoDisponible?.id
                                                                ?? "";
                                                            const ubicacionSeleccionada = datos.ubicacion
                                                                ?? detalle.ubicacion_al_prestar
                                                                ?? "";
                                                            return (
                                                                <tr key={detalle.id}>
                                                                    <th scope="row">
                                                                        <strong>{detalle.codigo_interno}</strong>
                                                                        <span>{detalle.nombre_activo}</span>
                                                                    </th>
                                                                    <td>
                                                                        <select
                                                                            aria-label={`Estado físico ${detalle.codigo_interno}`}
                                                                            value={datos.condicion ?? "BUENO"}
                                                                            onChange={(event) => cambiarDatoDevolucion(
                                                                                detalle.id,
                                                                                "condicion",
                                                                                event.target.value,
                                                                            )}
                                                                        >
                                                                            <option value="BUENO">Bueno</option>
                                                                            <option value="CON_NOVEDAD">Con novedad</option>
                                                                            <option value="DANADO">Dañado</option>
                                                                        </select>
                                                                    </td>
                                                                    <td>
                                                                        <input
                                                                            type="checkbox"
                                                                            aria-label={`Incluir devolución ${detalle.codigo_interno}`}
                                                                            checked={datos.seleccionado !== false}
                                                                            onChange={(event) => cambiarDatoDevolucion(
                                                                                detalle.id,
                                                                                "seleccionado",
                                                                                event.target.checked,
                                                                            )}
                                                                        />
                                                                    </td>
                                                                    <td className="return-checklist-location">
                                                                        <label
                                                                            className="sr-only"
                                                                            htmlFor={`estado-${detalle.id}`}
                                                                        >
                                                                            Estado al devolver {detalle.codigo_interno}
                                                                        </label>
                                                                        <select
                                                                            id={`estado-${detalle.id}`}
                                                                            aria-label={`Estado al devolver ${detalle.codigo_interno}`}
                                                                            value={estadoSeleccionado}
                                                                            required={datos.seleccionado !== false}
                                                                            onChange={(event) => cambiarDatoDevolucion(
                                                                                detalle.id,
                                                                                "estado",
                                                                                event.target.value,
                                                                            )}
                                                                        >
                                                                            <option value="">Selecciona un estado</option>
                                                                            {estadosDevolucion.map((estado) => (
                                                                                <option key={estado.id} value={estado.id}>
                                                                                    {estado.nombre}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                        <label
                                                                            className="sr-only"
                                                                            htmlFor={`ubicacion-${detalle.id}`}
                                                                        >
                                                                            Ubicación al devolver {detalle.codigo_interno}
                                                                        </label>
                                                                        <select
                                                                            id={`ubicacion-${detalle.id}`}
                                                                            aria-label={`Ubicación al devolver ${detalle.codigo_interno}`}
                                                                            value={ubicacionSeleccionada}
                                                                            required={datos.seleccionado !== false}
                                                                            onChange={(event) => cambiarDatoDevolucion(
                                                                                detalle.id,
                                                                                "ubicacion",
                                                                                event.target.value,
                                                                            )}
                                                                        >
                                                                            <option value="">Selecciona una ubicación</option>
                                                                            {ubicaciones.map((ubicacion) => (
                                                                                <option key={ubicacion.id} value={ubicacion.id}>
                                                                                    {ubicacion.nombre}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </td>
                                                                    <td>
                                                                        <input
                                                                            type="text"
                                                                            aria-label={`Observación ${detalle.codigo_interno}`}
                                                                            value={datos.observacion ?? ""}
                                                                            onChange={(event) => cambiarDatoDevolucion(
                                                                                detalle.id,
                                                                                "observacion",
                                                                                event.target.value,
                                                                            )}
                                                                            placeholder="Opcional"
                                                                        />
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                </tbody>
                                            </table>
                                        </div>
                                        <p className="request-review-hint">
                                            Todos los activos están seleccionados y en estado Bueno. Desmarca los que no llegaron o cambia la condición si tienen novedades.
                                        </p>
                                    </div>
                                    <button className="btn btn-primary" type="submit" disabled={guardando}>
                                        Revisar devolución
                                    </button>
                                </>
                            )}
                        </form>
                        )) : (
                            <div className="card empty-state">
                                <h2>No hay devoluciones pendientes</h2>
                                <p>Los activos prestados aparecerán aquí para registrar su regreso.</p>
                            </div>
                        )}
                    </section>
            ) : (
                <div className="loan-layout">
                    <form className="card loan-form" onSubmit={crearPrestamo}>
                        <div className="card-header">
                            <h2>Registrar préstamo</h2>
                            <p>Los activos elegidos cambiarán al estado configurado para préstamo.</p>
                        </div>
                        <div className="form-grid">
                            <div className="form-group">
                                <label htmlFor="nombre-receptor">Nombre del colaborador</label>
                                <input
                                    id="nombre-receptor"
                                    value={formulario.nombre_receptor}
                                    onChange={(event) => cambiarCampo("nombre_receptor", event.target.value)}
                                    required
                                    maxLength="150"
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="documento-receptor">Documento</label>
                                <input
                                    id="documento-receptor"
                                    value={formulario.documento_receptor}
                                    onChange={(event) => cambiarCampo("documento_receptor", event.target.value)}
                                    required
                                    maxLength="30"
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="fecha-prevista">Fecha prevista de devolución</label>
                                <input
                                    id="fecha-prevista"
                                    type="date"
                                    min={fechaMinimaPrestamo()}
                                    value={formulario.fecha_devolucion_prevista}
                                    onChange={(event) => cambiarCampo(
                                        "fecha_devolucion_prevista",
                                        event.target.value,
                                    )}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="observaciones-prestamo">Observaciones</label>
                                <textarea
                                    id="observaciones-prestamo"
                                    value={formulario.observaciones}
                                    onChange={(event) => cambiarCampo("observaciones", event.target.value)}
                                    rows="2"
                                />
                            </div>
                        </div>
                        <fieldset className="asset-selection">
                            <legend>Activos disponibles</legend>
                            {activos.length ? activos.map((activo) => (
                                <label className="asset-option" key={activo.id}>
                                    <input
                                        type="checkbox"
                                        checked={formulario.activos.includes(activo.id)}
                                        onChange={() => seleccionarActivo(activo.id)}
                                    />
                                    <span>
                                        <strong>{activo.codigo_interno} — {activo.nombre}</strong>
                                        <small>{activo.estado_nombre} · {activo.ubicacion_nombre}</small>
                                    </span>
                                </label>
                            )) : (
                                <p className="form-hint">No hay activos disponibles para préstamo.</p>
                            )}
                        </fieldset>
                        <button
                            className="btn btn-primary"
                            type="submit"
                            disabled={guardando || !activos.length}
                        >
                            {guardando ? "Guardando..." : "Registrar préstamo"}
                        </button>
                    </form>

                    <section className="card loan-history">
                        <div className="card-header">
                            <h2>Préstamos recientes</h2>
                            <p>Consulta el estado de cada préstamo registrado.</p>
                        </div>
                        {prestamos.length ? (
                            <div className="loan-history-list">
                                {prestamos.map((prestamo) => (
                                    <article className="loan-history-item" key={prestamo.id}>
                                        <div>
                                            <strong>{prestamo.nombre_receptor}</strong>
                                            <span>{prestamo.total_activos} activo(s) · Vence {prestamo.fecha_devolucion_prevista}</span>
                                        </div>
                                        <div className="loan-status-actions">
                                            <span className={`loan-status loan-status-${prestamo.estado.toLocaleLowerCase()}`}>
                                                {prestamo.estado}
                                            </span>
                                            {puedeRegistrarDevoluciones
                                                && prestamo.estado === "Devuelto"
                                                && prestamo.formato_retorno_disponible && (
                                                    <button
                                                        className="btn btn-secondary"
                                                        type="button"
                                                        aria-label={`Descargar PDF de devolución préstamo #${prestamo.id}`}
                                                        disabled={descargandoFormatoRetornoId !== null}
                                                        onClick={() => descargarFormatoRetornoHistorico(prestamo.id)}
                                                    >
                                                        {descargandoFormatoRetornoId === prestamo.id
                                                            ? "..."
                                                            : "PDF"}
                                                    </button>
                                                )}
                                        </div>
                                        {administrador && (
                                            <button
                                                className="btn btn-danger"
                                                type="button"
                                                aria-label={`Eliminar préstamo #${prestamo.id}`}
                                                disabled={eliminandoId !== null}
                                                onClick={() => eliminarPrestamo(prestamo)}
                                            >
                                                {eliminandoId === prestamo.id
                                                    ? "Eliminando..."
                                                    : "Eliminar historial"}
                                            </button>
                                        )}
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <p className="form-hint">Todavía no se registran préstamos.</p>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}

export default Prestamos;
