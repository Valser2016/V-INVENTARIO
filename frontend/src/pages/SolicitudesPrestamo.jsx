import React, { useCallback, useEffect, useState } from "react";
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

const opcionesUnicas = (activos, campoId, campoNombre) => {
    const opciones = new Map();
    activos.forEach((activo) => {
        if (activo[campoId] != null && activo[campoNombre]) {
            opciones.set(activo[campoId], activo[campoNombre]);
        }
    });
    return [...opciones.entries()].map(([id, nombre]) => ({ id, nombre }));
};

function SolicitudesPrestamo() {
    const { perfil } = useSession();
    const administrador = Boolean(perfil?.es_administrador);
    const puedeRevisar = administrador || Boolean(
        perfil?.permisos?.puede_revisar_solicitudes_prestamo,
    );
    const puedeAprobar = puedeRevisar || Boolean(
        perfil?.permisos?.puede_aprobar_solicitudes_prestamo,
    );
    const puedeRechazar = administrador || Boolean(
        perfil?.permisos?.puede_aprobar_solicitudes_prestamo,
    );
    const puedeAdministrarListas = administrador || Boolean(
        perfil?.permisos?.puede_administrar_catalogos,
    );
    const puedeGestionarSolicitudes = puedeRevisar || puedeAprobar;
    const puedeSolicitar = administrador || Boolean(
        perfil?.permisos?.puede_ver_movimientos,
    );
    const esTecnicoSolicitante = puedeSolicitar && !puedeGestionarSolicitudes;
    const [solicitudes, setSolicitudes] = useState([]);
    const [activos, setActivos] = useState([]);
    const [listasHerramientas, setListasHerramientas] = useState([]);
    const [activosParaListas, setActivosParaListas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [guardandoLista, setGuardandoLista] = useState(false);
    const [resolviendoId, setResolviendoId] = useState(null);
    const [eliminandoId, setEliminandoId] = useState(null);
    const [descargandoFormato, setDescargandoFormato] = useState("");
    const [rechazos, setRechazos] = useState({});
    const [revisiones, setRevisiones] = useState({});
    const [error, setError] = useState("");
    const [mensaje, setMensaje] = useState("");
    const [formularioAbierto, setFormularioAbierto] = useState(false);
    const [solicitudesAbiertas, setSolicitudesAbiertas] = useState(false);
    const [listasAbiertas, setListasAbiertas] = useState(false);
    const [modoSeleccion, setModoSeleccion] = useState("individual");
    const [listaSeleccionadaId, setListaSeleccionadaId] = useState("");
    const [avisoLista, setAvisoLista] = useState("");
    const [busquedaActivos, setBusquedaActivos] = useState("");
    const [filtrosActivos, setFiltrosActivos] = useState({
        tipo: "",
        categoria: "",
        ubicacion: "",
    });
    const [busquedaActivosLista, setBusquedaActivosLista] = useState("");
    const [listaEditada, setListaEditada] = useState({
        id: null,
        nombre: "",
        activos: [],
    });
    const [formulario, setFormulario] = useState({
        cliente: "",
        consecutivo: "",
        nombre_receptor: "",
        documento_receptor: "",
        fecha_devolucion_prevista: fechaMinimaPrestamo(),
        motivo: "",
        observaciones: "",
        activos: [],
        consumibles: [],
    });

    const cargarDatos = useCallback(async () => {
        try {
            const solicitudesRequest = api.get("/movimientos/solicitudes-prestamo/");
            const activosRequest = !puedeSolicitar
                ? Promise.resolve({ data: [] })
                : api.get("/movimientos/activos-disponibles/");
            const listasRequest = puedeSolicitar || puedeAdministrarListas
                ? api.get("/movimientos/listas-herramientas/")
                : Promise.resolve({ data: [] });
            const activosParaListasRequest = puedeAdministrarListas
                ? api.get("/movimientos/listas-herramientas/activos/")
                : Promise.resolve({ data: [] });
            const [
                respuestaSolicitudes,
                respuestaActivos,
                respuestaListas,
                respuestaActivosParaListas,
            ] = await Promise.all([
                solicitudesRequest,
                activosRequest,
                listasRequest,
                activosParaListasRequest,
            ]);
            setSolicitudes(respuestaSolicitudes.data);
            setActivos(respuestaActivos.data);
            setListasHerramientas(respuestaListas.data);
            setActivosParaListas(respuestaActivosParaListas.data);
            setError("");
        } catch (requestError) {
            console.error("Error cargando solicitudes de préstamo:", requestError);
            setError(errorApi(requestError));
        } finally {
            setCargando(false);
        }
    }, [puedeAdministrarListas, puedeSolicitar]);

    useEffect(() => {
        void Promise.resolve().then(cargarDatos);
    }, [cargarDatos]);

    const cambiarCampo = (campo, valor) => {
        setFormulario((actual) => ({ ...actual, [campo]: valor }));
    };

    const seleccionarActivo = (id) => {
        cambiarCampo(
            "activos",
            alternarActivoSeleccionado(formulario.activos, id)
        );
    };

    const agregarConsumible = () => {
        cambiarCampo("consumibles", [
            ...formulario.consumibles,
            { nombre: "", cantidad: "1" },
        ]);
    };

    const cambiarConsumible = (indice, campo, valor) => {
        cambiarCampo(
            "consumibles",
            formulario.consumibles.map((consumible, actual) =>
                actual === indice
                    ? { ...consumible, [campo]: valor }
                    : consumible
            ),
        );
    };

    const quitarConsumible = (indice) => {
        cambiarCampo(
            "consumibles",
            formulario.consumibles.filter((_, actual) => actual !== indice),
        );
    };

    const seleccionarModo = (modo) => {
        setModoSeleccion(modo);
        if (modo === "individual") {
            setListaSeleccionadaId("");
            setAvisoLista("");
        }
    };

    const seleccionarLista = (listaId) => {
        setListaSeleccionadaId(listaId);
        setAvisoLista("");
        if (!listaId) {
            cambiarCampo("activos", []);
            return;
        }

        const lista = listasHerramientas.find(
            (item) => String(item.id) === String(listaId),
        );
        if (!lista) {
            cambiarCampo("activos", []);
            return;
        }

        const disponibles = new Set(activos.map((activo) => activo.id));
        const seleccionados = lista.activos.filter((id) => disponibles.has(id));
        const noDisponibles = lista.activos.length - seleccionados.length;
        cambiarCampo("activos", seleccionados);
        if (noDisponibles > 0) {
            setAvisoLista(
                `${noDisponibles} herramienta(s) de esta lista no están disponibles y no se seleccionaron.`,
            );
        } else {
            setAvisoLista(
                `${seleccionados.length} herramienta(s) de la lista seleccionadas. Puedes agregar o quitar antes de enviar.`,
            );
        }
    };

    const cambiarActivoLista = (activoId) => {
        setListaEditada((actual) => ({
            ...actual,
            activos: actual.activos.includes(activoId)
                ? actual.activos.filter((id) => id !== activoId)
                : [...actual.activos, activoId],
        }));
    };

    const iniciarEdicionLista = (lista = null) => {
        setListaEditada(lista
            ? {
                id: lista.id,
                nombre: lista.nombre,
                activos: [...lista.activos],
            }
            : { id: null, nombre: "", activos: [] });
    };

    const guardarLista = async (event) => {
        event.preventDefault();
        if (!listaEditada.activos.length) {
            setError("Selecciona al menos una herramienta para la lista.");
            return;
        }

        setGuardandoLista(true);
        setError("");
        setMensaje("");
        const datosLista = {
            nombre: listaEditada.nombre,
            activos: listaEditada.activos,
        };
        try {
            if (listaEditada.id) {
                await api.patch(
                    `/movimientos/listas-herramientas/${listaEditada.id}/`,
                    datosLista,
                );
                setMensaje("Se actualizó la lista de herramientas.");
            } else {
                await api.post("/movimientos/listas-herramientas/", datosLista);
                setMensaje("Se creó la lista de herramientas.");
            }
            iniciarEdicionLista();
            await cargarDatos();
        } catch (requestError) {
            console.error("Error guardando la lista de herramientas:", requestError);
            setError(errorApi(requestError));
        } finally {
            setGuardandoLista(false);
        }
    };

    const eliminarLista = async (lista) => {
        if (!window.confirm(`¿Eliminar la lista "${lista.nombre}"?`)) {
            return;
        }
        setError("");
        setMensaje("");
        try {
            await api.delete(`/movimientos/listas-herramientas/${lista.id}/`);
            setMensaje("Se eliminó la lista de herramientas.");
            await cargarDatos();
        } catch (requestError) {
            console.error("Error eliminando la lista de herramientas:", requestError);
            setError(errorApi(requestError));
        }
    };

    const enviarSolicitud = async (event) => {
        event.preventDefault();
        setGuardando(true);
        setError("");
        setMensaje("");
        try {
            await api.post("/movimientos/solicitudes-prestamo/", formulario);
            setFormulario({
                cliente: "",
                consecutivo: "",
                nombre_receptor: "",
                documento_receptor: "",
                fecha_devolucion_prevista: fechaMinimaPrestamo(),
                motivo: "",
                observaciones: "",
                activos: [],
                consumibles: [],
            });
            setModoSeleccion("individual");
            setListaSeleccionadaId("");
            setAvisoLista("");
            const requiereChecklist = formulario.activos.length > 0;
            setMensaje(administrador
                ? requiereChecklist
                    ? "La solicitud se registró. Completa el checklist y apruébala para registrar el préstamo."
                    : "La solicitud se registró. Valídala y apruébala para registrar el préstamo."
                : "Tu solicitud fue enviada a revisión.");
            setFormularioAbierto(false);
            setSolicitudesAbiertas(true);
            await cargarDatos();
        } catch (requestError) {
            console.error("Error enviando solicitud de préstamo:", requestError);
            setError(errorApi(requestError));
        } finally {
            setGuardando(false);
        }
    };

    const actualizarRevision = (solicitudId, activo, cambios) => {
        setRevisiones((actuales) => ({
            ...actuales,
            [solicitudId]: {
                ...actuales[solicitudId],
                [activo.id]: {
                    condicion: activo.condicion || "BUENO",
                    observacion: activo.observacion_revision || "",
                    incluir_en_salida: activo.incluir_en_salida !== false,
                    ...actuales[solicitudId]?.[activo.id],
                    ...cambios,
                },
            },
        }));
    };

    const guardarRevision = async (solicitud) => {
        const detalles = solicitud.activos.map((activo) => {
            const revision = revisiones[solicitud.id]?.[activo.id] ?? {
                condicion: activo.condicion || "BUENO",
                observacion: activo.observacion_revision || "",
                incluir_en_salida: activo.incluir_en_salida !== false,
            };
            return {
                activo_id: activo.id,
                condicion: revision.condicion,
                observacion: revision.observacion,
                incluir_en_salida: revision.incluir_en_salida,
            };
        });
        if (detalles.some(({ condicion }) => !condicion)) {
            setError("Indica si cada activo está Bueno o Malo antes de guardar el checklist.");
            return;
        }

        setResolviendoId(solicitud.id);
        setError("");
        setMensaje("");
        try {
            await api.post(
                `/movimientos/solicitudes-prestamo/${solicitud.id}/revisar/`,
                { detalles },
            );
            setMensaje("Checklist guardado y PDF previo generado.");
            await cargarDatos();
        } catch (requestError) {
            console.error("Error guardando el checklist de la solicitud:", requestError);
            setError(errorApi(requestError));
        } finally {
            setResolviendoId(null);
        }
    };

    const resolverSolicitud = async (solicitud, accion) => {
        const observacionesResolucion = rechazos[solicitud.id]?.trim() ?? "";
        if (accion === "rechazar" && !observacionesResolucion) {
            setError("Indica el motivo antes de rechazar la solicitud.");
            return;
        }

        setResolviendoId(solicitud.id);
        setError("");
        setMensaje("");
        try {
            await api.post(
                `/movimientos/solicitudes-prestamo/${solicitud.id}/${accion}/`,
                accion === "rechazar"
                    ? { observaciones_resolucion: observacionesResolucion }
                    : {},
            );
            setMensaje(
                accion === "aprobar"
                    ? "Solicitud aprobada y préstamo registrado."
                    : "Solicitud rechazada.",
            );
            setRechazos((actuales) => {
                const nuevos = { ...actuales };
                delete nuevos[solicitud.id];
                return nuevos;
            });
            await cargarDatos();
        } catch (requestError) {
            console.error(`Error al ${accion} solicitud de préstamo:`, requestError);
            setError(errorApi(requestError));
        } finally {
            setResolviendoId(null);
        }
    };

    const eliminarSolicitud = async (solicitud) => {
        const tienePrestamo = Boolean(solicitud.prestamo_id);
        const confirmacion = tienePrestamo
            ? `¿Eliminar permanentemente la solicitud #${solicitud.id} y el préstamo #${solicitud.prestamo_id}? También se borrarán sus detalles y formatos PDF. Los activos aún prestados recuperarán su estado y ubicación anteriores; los ya devueltos no cambiarán.`
            : `¿Eliminar permanentemente la solicitud #${solicitud.id}?`;
        if (!window.confirm(confirmacion)) {
            return;
        }

        setEliminandoId(solicitud.id);
        setError("");
        setMensaje("");
        try {
            await api.delete(`/movimientos/solicitudes-prestamo/${solicitud.id}/`);
            setMensaje(
                tienePrestamo
                    ? "Se eliminaron la solicitud y el préstamo asociado."
                    : "Se eliminó la solicitud.",
            );
            await cargarDatos();
        } catch (requestError) {
            console.error("Error eliminando solicitud de préstamo:", requestError);
            setError(errorApi(requestError));
        } finally {
            setEliminandoId(null);
        }
    };

    const descargarFormato = async (solicitud, tipo) => {
        const clave = `${solicitud.id}-${tipo}`;
        setDescargandoFormato(clave);
        setError("");
        try {
            const respuesta = await api.get(
                `/movimientos/solicitudes-prestamo/${solicitud.id}/formato-${tipo}/`,
                { responseType: "blob" },
            );
            const url = URL.createObjectURL(respuesta.data);
            const enlace = document.createElement("a");
            enlace.href = url;
            enlace.download = `OYS-FO-09-${solicitud.id}-${tipo}.pdf`;
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();
            URL.revokeObjectURL(url);
        } catch (requestError) {
            console.error("Error descargando formato OYS-FO-09:", requestError);
            setError(errorApi(requestError));
        } finally {
            setDescargandoFormato("");
        }
    };

    const textoBusqueda = busquedaActivos.trim().toLocaleLowerCase();
    const activosFiltrados = activos.filter((activo) => {
        const coincideTexto = !textoBusqueda
            || `${activo.codigo_interno} ${activo.nombre}`
                .toLocaleLowerCase()
                .includes(textoBusqueda);
        return coincideTexto
            && (!filtrosActivos.tipo
                || String(activo.tipo_activo_id) === filtrosActivos.tipo)
            && (!filtrosActivos.categoria
                || String(activo.categoria_id) === filtrosActivos.categoria)
            && (!filtrosActivos.ubicacion
                || String(activo.ubicacion_id) === filtrosActivos.ubicacion);
    });
    const activosListaFiltrados = activosParaListas.filter((activo) =>
        `${activo.codigo_interno} ${activo.nombre}`
            .toLocaleLowerCase()
            .includes(busquedaActivosLista.trim().toLocaleLowerCase()),
    );
    const tiposDisponibles = opcionesUnicas(
        activos,
        "tipo_activo_id",
        "tipo_activo_nombre",
    );
    const tieneConsumiblesValidos = formulario.consumibles.some(
        (consumible) => consumible.nombre.trim()
            && Number.isInteger(Number(consumible.cantidad))
            && Number(consumible.cantidad) > 0,
    );
    const categoriasDisponibles = opcionesUnicas(
        activos,
        "categoria_id",
        "categoria_nombre",
    );
    const ubicacionesDisponibles = opcionesUnicas(
        activos,
        "ubicacion_id",
        "ubicacion_nombre",
    );

    return (
        <div className={`page-container requests-page${esTecnicoSolicitante
            ? " requests-page-technician"
            : ""}`}
        >
            <header className="page-header">
                <div>
                    <span className="eyebrow">GESTIÓN DE ACTIVOS</span>
                    <h1>Solicitudes de préstamo</h1>
                    <p>
                        {puedeGestionarSolicitudes
                            ? puedeAprobar
                                ? "Revisa el checklist y gestiona las aprobaciones permitidas para tu rol."
                                : "Completa el checklist y genera el PDF previo para la aprobación."
                            : "Solicita los activos que necesitas y consulta el estado de tus solicitudes."}
                    </p>
                </div>
            </header>

            {error && (
                <div className="alert alert-error" role="alert">
                    <span>!</span>
                    <div><strong>No se pudo completar la operación</strong><p>{error}</p></div>
                </div>
            )}
            {mensaje && (
                <div className="alert alert-success" role="status">{mensaje}</div>
            )}

            <div className="request-sections">
                {puedeAdministrarListas && (
                    <div className="request-section">
                        <button
                            className={`request-section-toggle${esTecnicoSolicitante
                                ? " request-section-toggle-primary"
                                : ""}`}
                            type="button"
                            aria-expanded={listasAbiertas}
                            aria-controls="administrar-listas-herramientas"
                            onClick={() => setListasAbiertas((abierto) => !abierto)}
                        >
                            <span>Administrar listas predeterminadas</span>
                            <span className="request-section-indicator" aria-hidden="true">
                                {listasAbiertas ? "−" : "+"}
                            </span>
                        </button>
                        {listasAbiertas && (
                            <section
                                className="card loan-history request-section-content"
                                id="administrar-listas-herramientas"
                            >
                                <div className="card-header">
                                    <h2>Listas predeterminadas de herramientas</h2>
                                    <p>
                                        Selecciona los activos que se marcarán automáticamente
                                        cuando alguien elija esta lista.
                                    </p>
                                </div>
                                <form className="loan-form" onSubmit={guardarLista}>
                                    <div className="form-group">
                                        <label htmlFor="nombre-lista-herramientas">
                                            Nombre de la lista
                                        </label>
                                        <input
                                            id="nombre-lista-herramientas"
                                            value={listaEditada.nombre}
                                            onChange={(event) => setListaEditada((actual) => ({
                                                ...actual,
                                                nombre: event.target.value,
                                            }))}
                                            maxLength={100}
                                            required
                                        />
                                    </div>
                                    <fieldset className="asset-selection">
                                        <legend>Herramientas incluidas</legend>
                                        <label htmlFor="buscar-activo-lista">
                                            Buscar por código o nombre
                                        </label>
                                        <input
                                            id="buscar-activo-lista"
                                            type="search"
                                            value={busquedaActivosLista}
                                            onChange={(event) => setBusquedaActivosLista(
                                                event.target.value,
                                            )}
                                        />
                                        {activosListaFiltrados.length ? (
                                            activosListaFiltrados.map((activo) => (
                                                <label className="asset-option" key={activo.id}>
                                                    <input
                                                        type="checkbox"
                                                        checked={listaEditada.activos.includes(activo.id)}
                                                        disabled={
                                                            !activo.activo
                                                            && !listaEditada.activos.includes(activo.id)
                                                        }
                                                        onChange={() => cambiarActivoLista(activo.id)}
                                                    />
                                                    <span>
                                                        <strong>
                                                            {activo.codigo_interno} — {activo.nombre}
                                                        </strong>
                                                        <small>
                                                            {[
                                                                activo.tipo_activo_nombre,
                                                                activo.categoria_nombre,
                                                                activo.estado_nombre,
                                                                activo.ubicacion_nombre,
                                                                activo.activo ? "" : "Inactivo",
                                                            ].filter(Boolean).join(" · ")}
                                                        </small>
                                                    </span>
                                                </label>
                                            ))
                                        ) : (
                                            <p className="form-hint">
                                                No hay herramientas que coincidan con la búsqueda.
                                            </p>
                                        )}
                                    </fieldset>
                                    <div className="request-action-buttons">
                                        <button
                                            className="btn btn-primary"
                                            type="submit"
                                            disabled={guardandoLista}
                                        >
                                            {guardandoLista
                                                ? "Guardando..."
                                                : listaEditada.id
                                                    ? "Guardar cambios"
                                                    : "Crear lista"}
                                        </button>
                                        {listaEditada.id && (
                                            <button
                                                className="btn btn-secondary"
                                                type="button"
                                                onClick={() => iniciarEdicionLista()}
                                            >
                                                Cancelar edición
                                            </button>
                                        )}
                                        {!listaEditada.id && (
                                            <button
                                                className="btn btn-secondary"
                                                type="button"
                                                onClick={() => iniciarEdicionLista()}
                                            >
                                                Limpiar selección
                                            </button>
                                        )}
                                    </div>
                                </form>
                                {listasHerramientas.length ? (
                                    <div className="loan-history-list">
                                        {listasHerramientas.map((lista) => (
                                            <article
                                                className="loan-history-item"
                                                key={lista.id}
                                            >
                                                <div>
                                                    <strong>{lista.nombre}</strong>
                                                    <span>
                                                        {lista.activos.length} herramienta(s)
                                                    </span>
                                                </div>
                                                <div className="request-action-buttons">
                                                    <button
                                                        className="btn btn-secondary"
                                                        type="button"
                                                        onClick={() => iniciarEdicionLista(lista)}
                                                    >
                                                        Editar
                                                    </button>
                                                    <button
                                                        className="btn btn-danger"
                                                        type="button"
                                                        onClick={() => eliminarLista(lista)}
                                                    >
                                                        Eliminar
                                                    </button>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="form-hint">
                                        Todavía no hay listas predeterminadas.
                                    </p>
                                )}
                            </section>
                        )}
                    </div>
                )}
                {puedeSolicitar && (
                    <div className="request-section">
                        <button
                            className="request-section-toggle"
                            type="button"
                            aria-expanded={formularioAbierto}
                            aria-controls="formulario-nueva-solicitud"
                            onClick={() => setFormularioAbierto((abierto) => !abierto)}
                        >
                            <span>Nueva solicitud</span>
                            <span className="request-section-indicator" aria-hidden="true">
                                {formularioAbierto ? "−" : "+"}
                            </span>
                        </button>
                        {formularioAbierto && (
                            <form
                                className="card loan-form request-section-content"
                                id="formulario-nueva-solicitud"
                                onSubmit={enviarSolicitud}
                            >
                                <div className="card-header">
                                    <h2>Nueva solicitud</h2>
                                    <p>
                                        {administrador
                                            ? "Completa el checklist y aprueba la solicitud para registrar el préstamo."
                                            : "El préstamo solo se registra cuando Administración o Almacén lo aprueba."}
                                    </p>
                                </div>
                                <div className="form-grid">
                            <div className="form-group">
                                <label htmlFor="solicitud-cliente">Cliente</label>
                                <input
                                    id="solicitud-cliente"
                                    value={formulario.cliente}
                                    onChange={(event) => cambiarCampo("cliente", event.target.value)}
                                    maxLength={150}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="solicitud-consecutivo">Consecutivo del servicio</label>
                                <input
                                    id="solicitud-consecutivo"
                                    value={formulario.consecutivo}
                                    onChange={(event) => cambiarCampo(
                                        "consecutivo",
                                        event.target.value,
                                    )}
                                    maxLength={50}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="solicitud-receptor">Nombre del colaborador</label>
                                <input
                                    id="solicitud-receptor"
                                    value={formulario.nombre_receptor}
                                    onChange={(event) => cambiarCampo(
                                        "nombre_receptor",
                                        event.target.value,
                                    )}
                                    maxLength={150}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="solicitud-documento">Documento</label>
                                <input
                                    id="solicitud-documento"
                                    value={formulario.documento_receptor}
                                    onChange={(event) => cambiarCampo(
                                        "documento_receptor",
                                        event.target.value,
                                    )}
                                    maxLength={30}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="solicitud-fecha">Fecha prevista de devolución</label>
                                <input
                                    id="solicitud-fecha"
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
                                <label htmlFor="solicitud-motivo">¿Para qué necesitas los activos?</label>
                                <textarea
                                    id="solicitud-motivo"
                                    value={formulario.motivo}
                                    onChange={(event) => cambiarCampo("motivo", event.target.value)}
                                    rows={3}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="solicitud-observaciones">Observaciones adicionales</label>
                                <textarea
                                    id="solicitud-observaciones"
                                    value={formulario.observaciones}
                                    onChange={(event) => cambiarCampo(
                                        "observaciones",
                                        event.target.value,
                                    )}
                                    rows={2}
                                />
                            </div>
                                </div>

                                <fieldset className="asset-selection">
                                    <legend>Modo de selección</legend>
                                    <label className="asset-option">
                                        <input
                                            type="radio"
                                            name="modo-seleccion-activos"
                                            value="individual"
                                            checked={modoSeleccion === "individual"}
                                            onChange={() => seleccionarModo("individual")}
                                        />
                                        <span><strong>Individual</strong></span>
                                    </label>
                                    <label className="asset-option">
                                        <input
                                            type="radio"
                                            name="modo-seleccion-activos"
                                            value="listado"
                                            checked={modoSeleccion === "listado"}
                                            onChange={() => seleccionarModo("listado")}
                                        />
                                        <span><strong>Listado predeterminado</strong></span>
                                    </label>
                                    {modoSeleccion === "listado" && (
                                        <div className="form-group">
                                            <label htmlFor="lista-herramientas">
                                                Selecciona un listado
                                            </label>
                                            <select
                                                id="lista-herramientas"
                                                value={listaSeleccionadaId}
                                                onChange={(event) => seleccionarLista(event.target.value)}
                                            >
                                                <option value="">Selecciona un listado</option>
                                                {listasHerramientas.map((lista) => (
                                                    <option key={lista.id} value={lista.id}>
                                                        {lista.nombre}
                                                    </option>
                                                ))}
                                            </select>
                                            {!listasHerramientas.length && (
                                                <p className="form-hint">
                                                    Almacén todavía no ha creado listas predeterminadas.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </fieldset>

                                <fieldset className="asset-selection">
                                    <legend>Selecciona las herramientas requeridas</legend>
                                    <div className="asset-search-controls">
                                        <p className="asset-selection-count" aria-live="polite">
                                            {formulario.activos.length} herramienta(s) seleccionadas
                                        </p>
                                        <div className="form-grid asset-search-filters">
                                            <div className="form-group">
                                                <label htmlFor="buscar-activo-solicitud">
                                                    Buscar por código o nombre
                                                </label>
                                                <input
                                                    id="buscar-activo-solicitud"
                                                    type="search"
                                                    value={busquedaActivos}
                                                    onChange={(event) => setBusquedaActivos(
                                                        event.target.value,
                                                    )}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label htmlFor="filtro-tipo-activo">Tipo</label>
                                                <select
                                                    id="filtro-tipo-activo"
                                                    value={filtrosActivos.tipo}
                                                    onChange={(event) => setFiltrosActivos((actual) => ({
                                                        ...actual,
                                                        tipo: event.target.value,
                                                    }))}
                                                >
                                                    <option value="">Todos</option>
                                                    {tiposDisponibles.map((tipo) => (
                                                        <option key={tipo.id} value={tipo.id}>
                                                            {tipo.nombre}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label htmlFor="filtro-categoria-activo">
                                                    Categoría
                                                </label>
                                                <select
                                                    id="filtro-categoria-activo"
                                                    value={filtrosActivos.categoria}
                                                    onChange={(event) => setFiltrosActivos((actual) => ({
                                                        ...actual,
                                                        categoria: event.target.value,
                                                    }))}
                                                >
                                                    <option value="">Todas</option>
                                                    {categoriasDisponibles.map((categoria) => (
                                                        <option key={categoria.id} value={categoria.id}>
                                                            {categoria.nombre}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label htmlFor="filtro-ubicacion-activo">
                                                    Ubicación
                                                </label>
                                                <select
                                                    id="filtro-ubicacion-activo"
                                                    value={filtrosActivos.ubicacion}
                                                    onChange={(event) => setFiltrosActivos((actual) => ({
                                                        ...actual,
                                                        ubicacion: event.target.value,
                                                    }))}
                                                >
                                                    <option value="">Todas</option>
                                                    {ubicacionesDisponibles.map((ubicacion) => (
                                                        <option key={ubicacion.id} value={ubicacion.id}>
                                                            {ubicacion.nombre}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        {avisoLista && (
                                            <p className="form-hint" role="status">{avisoLista}</p>
                                        )}
                                    </div>
                                    {activosFiltrados.length ? activosFiltrados.map((activo) => (
                                        <label className="asset-option" key={activo.id}>
                                            <input
                                                type="checkbox"
                                                checked={formulario.activos.includes(activo.id)}
                                                disabled={
                                                    modoSeleccion === "listado"
                                                    && !listaSeleccionadaId
                                                }
                                                onChange={() => seleccionarActivo(activo.id)}
                                            />
                                            <span>
                                                <strong>
                                                    {activo.codigo_interno} — {activo.nombre}
                                                </strong>
                                                <small>
                                                    {[
                                                        activo.tipo_activo_nombre,
                                                        activo.categoria_nombre,
                                                        activo.estado_nombre,
                                                        activo.ubicacion_nombre,
                                                    ].filter(Boolean).join(" · ")}
                                                </small>
                                            </span>
                                        </label>
                                    )) : (
                                        <p className="form-hint">
                                            {activos.length
                                                ? "No hay herramientas que coincidan con la búsqueda o los filtros."
                                                : "No hay activos disponibles para préstamo."}
                                        </p>
                                    )}
                                </fieldset>

                                <section
                                    className="loan-consumables"
                                    aria-label="Consumibles de la solicitud"
                                >
                                    <div className="loan-consumables-header">
                                        <div>
                                            <h3>Consumibles</h3>
                                            <p className="form-hint">
                                                Agrega elementos que no están registrados en el inventario.
                                            </p>
                                        </div>
                                        <button
                                            className="btn btn-secondary"
                                            type="button"
                                            onClick={agregarConsumible}
                                        >
                                            Adicionar consumibles
                                        </button>
                                    </div>
                                    {formulario.consumibles.map((consumible, indice) => (
                                        <div
                                            className="loan-consumable-row"
                                            key={`solicitud-consumible-${indice}`}
                                        >
                                            <div className="form-group">
                                                <label htmlFor={`solicitud-consumible-nombre-${indice}`}>
                                                    Nombre del consumible
                                                </label>
                                                <input
                                                    id={`solicitud-consumible-nombre-${indice}`}
                                                    value={consumible.nombre}
                                                    onChange={(event) => cambiarConsumible(
                                                        indice,
                                                        "nombre",
                                                        event.target.value,
                                                    )}
                                                    maxLength={200}
                                                    required
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label htmlFor={`solicitud-consumible-cantidad-${indice}`}>
                                                    Cantidad solicitada
                                                </label>
                                                <input
                                                    id={`solicitud-consumible-cantidad-${indice}`}
                                                    type="number"
                                                    min="1"
                                                    step="1"
                                                    value={consumible.cantidad}
                                                    onChange={(event) => cambiarConsumible(
                                                        indice,
                                                        "cantidad",
                                                        event.target.value,
                                                    )}
                                                    required
                                                />
                                            </div>
                                            <button
                                                className="table-action table-action-danger"
                                                type="button"
                                                aria-label={`Quitar consumible de solicitud ${indice + 1}`}
                                                onClick={() => quitarConsumible(indice)}
                                            >
                                                Quitar
                                            </button>
                                        </div>
                                    ))}
                                </section>

                                <div className="request-submit-actions">
                                    <button
                                        className="btn btn-primary"
                                        type="submit"
                                        disabled={
                                            guardando
                                            || cargando
                                            || (
                                                formulario.activos.length === 0
                                                && !tieneConsumiblesValidos
                                            )
                                        }
                                    >
                                        {guardando ? "Enviando..." : "Enviar solicitud"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}

                <div className="request-section">
                    <button
                        className="request-section-toggle"
                        type="button"
                        aria-expanded={solicitudesAbiertas}
                        aria-controls="lista-solicitudes"
                        onClick={() => setSolicitudesAbiertas((abierto) => !abierto)}
                    >
                        <span>
                            {puedeAprobar
                                ? "Solicitudes por aprobar"
                                : puedeRevisar
                                    ? "Solicitudes para revisar"
                                    : "Mis solicitudes"}
                        </span>
                        <span className="request-section-indicator" aria-hidden="true">
                            {solicitudesAbiertas ? "−" : "+"}
                        </span>
                    </button>
                    {solicitudesAbiertas && (
                        <section
                            className="card loan-history request-section-content"
                            id="lista-solicitudes"
                        >
                            <div className="card-header">
                                <h2>
                                    {puedeAprobar
                                        ? "Solicitudes por aprobar"
                                        : puedeRevisar
                                            ? "Solicitudes para revisar"
                                            : "Mis solicitudes"}
                                </h2>
                                <p>
                                    {puedeAprobar
                                        ? "Las solicitudes deben tener checklist completo antes de aprobarse."
                                        : puedeRevisar
                                            ? "Completa el checklist y descarga el PDF antes de la aprobación."
                                            : "El estado cambiará cuando Almacén revise tu solicitud."}
                                </p>
                            </div>
                            {cargando ? (
                        <div className="table-loading" role="status">
                            <span className="loading-spinner" />
                            <span>Cargando solicitudes...</span>
                        </div>
                            ) : solicitudes.length ? (
                        <div className="request-list">
                            {solicitudes.map((solicitud) => (
                                <article className="request-card" key={solicitud.id}>
                                    <header className="loan-card-header">
                                        <div>
                                            <span className="eyebrow">SOLICITUD #{solicitud.id}</span>
                                            <h2>{solicitud.nombre_receptor}</h2>
                                            <p>
                                                {(puedeGestionarSolicitudes || administrador) && (
                                                    <>Solicitante: {solicitud.solicitante_nombre} · </>
                                                )}
                                                Documento {solicitud.documento_receptor} · Devuelve{" "}
                                                {solicitud.fecha_devolucion_prevista}
                                            </p>
                                        </div>
                                        <span className={`loan-status loan-status-${solicitud.estado.toLowerCase()}`}>
                                            {solicitud.estado_nombre}
                                        </span>
                                    </header>

                                    <div className="request-details">
                                        <p><strong>Motivo:</strong> {solicitud.motivo}</p>
                                        {!puedeRevisar && solicitud.activos.length > 0 && (
                                            <p>
                                                <strong>Activos:</strong>{" "}
                                                {solicitud.activos.map((activo) =>
                                                    `${activo.codigo_interno} — ${activo.nombre}`
                                                ).join(", ")}
                                            </p>
                                        )}
                                        {solicitud.consumibles?.length > 0 && (
                                            <p>
                                                <strong>Consumibles:</strong>{" "}
                                                {solicitud.consumibles.map((consumible) =>
                                                    `${consumible.nombre} (${consumible.cantidad})`
                                                ).join(", ")}
                                            </p>
                                        )}
                                        {solicitud.revisado_por_nombre && (
                                            <p>
                                                <strong>Revisado por:</strong>{" "}
                                                {solicitud.revisado_por_nombre}
                                            </p>
                                        )}
                                        {solicitud.observaciones && (
                                            <p><strong>Observaciones:</strong> {solicitud.observaciones}</p>
                                        )}
                                        {solicitud.observaciones_resolucion && (
                                            <p><strong>Respuesta:</strong> {solicitud.observaciones_resolucion}</p>
                                        )}
                                        {solicitud.prestamo_id && (
                                            <p><strong>Préstamo registrado:</strong> #{solicitud.prestamo_id}</p>
                                        )}
                                        {solicitud.cliente && (
                                            <p><strong>Cliente:</strong> {solicitud.cliente}</p>
                                        )}
                                        {solicitud.consecutivo && (
                                            <p><strong>Consecutivo:</strong> {solicitud.consecutivo}</p>
                                        )}
                                    </div>

                                    {puedeRevisar
                                        && solicitud.activos.length > 0
                                        && ["PENDIENTE", "REVISADA"].includes(solicitud.estado) && (
                                        <div className="request-review">
                                            <h3>Checklist de Almacén</h3>
                                            <div className="asset-review-scroll">
                                                <table className="asset-review-table">
                                                    <thead>
                                                        <tr>
                                                            <th scope="col">Herramienta</th>
                                                            <th scope="col">Estado físico</th>
                                                            <th scope="col">Incluir</th>
                                                            <th scope="col">Observación</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {solicitud.activos.map((activo) => {
                                                            const revision = revisiones[solicitud.id]?.[activo.id] ?? {
                                                                condicion: activo.condicion || "BUENO",
                                                                observacion: activo.observacion_revision || "",
                                                                incluir_en_salida: activo.incluir_en_salida !== false,
                                                            };
                                                            return (
                                                                <tr key={activo.id}>
                                                                    <th scope="row">
                                                                        <strong>{activo.codigo_interno}</strong>
                                                                        <span>{activo.nombre}</span>
                                                                    </th>
                                                                    <td>
                                                                        <select
                                                                            aria-label={`Estado físico ${activo.codigo_interno}`}
                                                                            value={revision.condicion}
                                                                            onChange={(event) => actualizarRevision(
                                                                                solicitud.id,
                                                                                activo,
                                                                                { condicion: event.target.value },
                                                                            )}
                                                                        >
                                                                            <option value="BUENO">Bueno</option>
                                                                            <option value="MALO">Malo</option>
                                                                        </select>
                                                                    </td>
                                                                    <td>
                                                                        <input
                                                                            type="checkbox"
                                                                            aria-label={`Incluir ${activo.codigo_interno} en la salida`}
                                                                            checked={revision.incluir_en_salida}
                                                                            onChange={(event) => actualizarRevision(
                                                                                solicitud.id,
                                                                                activo,
                                                                                { incluir_en_salida: event.target.checked },
                                                                            )}
                                                                        />
                                                                    </td>
                                                                    <td>
                                                                        <input
                                                                            type="text"
                                                                            aria-label={`Observación ${activo.codigo_interno}`}
                                                                            placeholder="Opcional"
                                                                            value={revision.observacion}
                                                                            onChange={(event) => actualizarRevision(
                                                                                solicitud.id,
                                                                                activo,
                                                                                { observacion: event.target.value },
                                                                            )}
                                                                        />
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <p className="request-review-hint">
                                                Todas las herramientas empiezan como Bueno. Cambia solo las que estén Malas.
                                            </p>
                                            <button
                                                className="btn btn-primary"
                                                type="button"
                                                disabled={
                                                    resolviendoId !== null
                                                    || eliminandoId !== null
                                                }
                                                onClick={() => guardarRevision(solicitud)}
                                            >
                                                {resolviendoId === solicitud.id
                                                    ? "Guardando..."
                                                    : "Guardar checklist y generar PDF previo"}
                                            </button>
                                        </div>
                                    )}

                                    {puedeRevisar
                                        && solicitud.activos.length === 0
                                        && solicitud.estado === "PENDIENTE" && (
                                        <div className="request-review">
                                            <h3>Validar solicitud</h3>
                                            <p className="request-review-hint">
                                                Esta solicitud no tiene activos de inventario. Revisa los consumibles y envíala a aprobación.
                                            </p>
                                            <button
                                                className="btn btn-primary"
                                                type="button"
                                                disabled={
                                                    resolviendoId !== null
                                                    || eliminandoId !== null
                                                }
                                                onClick={() => guardarRevision(solicitud)}
                                            >
                                                {resolviendoId === solicitud.id
                                                    ? "Guardando..."
                                                    : "Validar y enviar a aprobación"}
                                            </button>
                                        </div>
                                    )}

                                    {puedeRevisar
                                        && solicitud.activos.length > 0
                                        && solicitud.estado === "REVISADA" && (
                                        <div className="request-details">
                                            {solicitud.activos.map((activo) => (
                                                <p key={activo.id}>
                                                    <strong>{activo.codigo_interno}:</strong>{" "}
                                                    {activo.condicion === "BUENO" ? "Bueno" : "Malo"}
                                                    {activo.incluir_en_salida ? " · Incluido en salida" : " · Excluido"}
                                                </p>
                                            ))}
                                        </div>
                                    )}

                                    {(solicitud.formato_salida_disponible
                                        || solicitud.formato_retorno_disponible) && (
                                        <div className="request-action-buttons">
                                            {solicitud.formato_salida_disponible && (
                                                <button
                                                    className="btn btn-secondary"
                                                    type="button"
                                                    disabled={Boolean(descargandoFormato)}
                                                    onClick={() => descargarFormato(solicitud, "salida")}
                                                >
                                                    {descargandoFormato === `${solicitud.id}-salida`
                                                        ? "Descargando..."
                                                        : "Descargar formato de salida"}
                                                </button>
                                            )}
                                            {solicitud.formato_retorno_disponible && (
                                                <button
                                                    className="btn btn-secondary"
                                                    type="button"
                                                    disabled={Boolean(descargandoFormato)}
                                                    onClick={() => descargarFormato(solicitud, "retorno")}
                                                >
                                                    {descargandoFormato === `${solicitud.id}-retorno`
                                                        ? "Descargando..."
                                                        : "Descargar formato de retorno"}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {puedeAprobar && ["PENDIENTE", "REVISADA"].includes(solicitud.estado) && (
                                        <div className="request-actions">
                                            {puedeRechazar && (
                                                <div className="form-group">
                                                    <label htmlFor={`rechazo-${solicitud.id}`}>
                                                        Motivo del rechazo (requerido para rechazar)
                                                    </label>
                                                    <textarea
                                                        id={`rechazo-${solicitud.id}`}
                                                        value={rechazos[solicitud.id] ?? ""}
                                                        onChange={(event) => setRechazos((actuales) => ({
                                                            ...actuales,
                                                            [solicitud.id]: event.target.value,
                                                        }))}
                                                        rows={2}
                                                    />
                                                </div>
                                            )}
                                            {solicitud.estado !== "REVISADA" && (
                                                <p className="form-hint">
                                                    {solicitud.activos.length > 0
                                                        ? "Completa el checklist antes de aprobar."
                                                        : "Valida la solicitud antes de aprobar."}
                                                </p>
                                            )}
                                            {solicitud.activos.some(
                                                (activo) => activo.incluir_en_salida
                                                    && activo.condicion === "MALO",
                                            ) && (
                                                <p className="alert alert-error" role="alert">
                                                    No se puede aprobar: corrige el estado o excluye los activos marcados como Malo.
                                                </p>
                                            )}
                                            {!solicitud.activos.some(
                                                (activo) => activo.incluir_en_salida,
                                            ) && !solicitud.consumibles?.length
                                                && solicitud.estado === "REVISADA" && (
                                                <p className="alert alert-error" role="alert">
                                                    Incluye al menos un activo o consumible en la salida antes de aprobar.
                                                </p>
                                            )}
                                            <div className="request-action-buttons">
                                                <button
                                                    className="btn btn-primary"
                                                    type="button"
                                                    disabled={
                                                        resolviendoId !== null
                                                        || eliminandoId !== null
                                                        || solicitud.estado !== "REVISADA"
                                                        || solicitud.activos.some(
                                                            (activo) => activo.incluir_en_salida
                                                                && activo.condicion === "MALO",
                                                        )
                                                        || (
                                                            !solicitud.activos.some(
                                                                (activo) => activo.incluir_en_salida,
                                                            )
                                                            && !solicitud.consumibles?.length
                                                        )
                                                    }
                                                    onClick={() => resolverSolicitud(solicitud, "aprobar")}
                                                >
                                                    {resolviendoId === solicitud.id ? "Procesando..." : "Aprobar y registrar préstamo"}
                                                </button>
                                                {puedeRechazar && (
                                                    <button
                                                        className="btn btn-secondary"
                                                        type="button"
                                                        disabled={
                                                            resolviendoId !== null
                                                            || eliminandoId !== null
                                                        }
                                                        onClick={() => resolverSolicitud(solicitud, "rechazar")}
                                                    >
                                                        Rechazar solicitud
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {administrador && (
                                        <div className="request-action-buttons">
                                            <button
                                                className="btn btn-danger"
                                                type="button"
                                                disabled={
                                                    resolviendoId !== null
                                                    || eliminandoId !== null
                                                }
                                                onClick={() => eliminarSolicitud(solicitud)}
                                            >
                                                {eliminandoId === solicitud.id
                                                    ? "Eliminando..."
                                                    : solicitud.prestamo_id
                                                        ? "Eliminar solicitud y préstamo"
                                                        : "Eliminar solicitud"}
                                            </button>
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                            ) : (
                                <p className="form-hint">
                                    {puedeRevisar
                                        ? "Todavía no hay solicitudes para revisar."
                                        : "Todavía no has enviado solicitudes de préstamo."}
                                </p>
                            )}
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SolicitudesPrestamo;
