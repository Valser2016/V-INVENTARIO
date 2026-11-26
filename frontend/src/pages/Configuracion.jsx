import React, { useEffect, useState } from "react";
import api from "../services/api";
import { useSession } from "../context/SessionContext";

const catalogos = [
    {
        key: "tipos",
        titulo: "Tipos de activo",
        singular: "tipo",
        nuevo: "Nuevo tipo",
        crear: "Crear tipo",
        endpoint: "/levantamiento/configuracion/tipos/",
        icono: "▦",
    },
    {
        key: "categorias",
        titulo: "Categorías",
        singular: "categoría",
        nuevo: "Nueva categoría",
        crear: "Crear categoría",
        endpoint: "/levantamiento/configuracion/categorias/",
        icono: "▤",
    },
    {
        key: "estados",
        titulo: "Estados",
        singular: "estado",
        nuevo: "Nuevo estado",
        crear: "Crear estado",
        endpoint: "/levantamiento/configuracion/estados/",
        icono: "✓",
    },
    {
        key: "ubicaciones",
        titulo: "Ubicaciones",
        singular: "ubicación",
        nuevo: "Nueva ubicación",
        crear: "Crear ubicación",
        endpoint: "/levantamiento/configuracion/ubicaciones/",
        icono: "⌖",
    },
];

const formularioVacio = () => ({
    tipo_activo: "",
    nombre: "",
    prefijo_codigo: "",
    descripcion: "",
    permite_prestamo: false,
});

const mensajeDeError = (error) => {
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

function Configuracion() {
    const { perfil } = useSession();
    const [seccionKey, setSeccionKey] = useState("tipos");
    const [registros, setRegistros] = useState([]);
    const [tipos, setTipos] = useState([]);
    const [formulario, setFormulario] = useState(formularioVacio);
    const [registroEditado, setRegistroEditado] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [descargandoRespaldo, setDescargandoRespaldo] = useState(false);
    const [error, setError] = useState("");
    const [mensaje, setMensaje] = useState("");

    const seccion = catalogos.find((item) => item.key === seccionKey);

    const descargarRespaldo = async () => {
        setError("");
        setMensaje("");
        setDescargandoRespaldo(true);
        try {
            const respuesta = await api.get("/reportes/respaldo/", {
                responseType: "blob",
            });
            const url = URL.createObjectURL(respuesta.data);
            const enlace = document.createElement("a");
            const nombreArchivo = respuesta.headers?.["content-disposition"]
                ?.match(/filename="?([^";]+)"?/i)?.[1];
            enlace.href = url;
            enlace.download = nombreArchivo
                || `respaldo-valser-${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
        } catch (requestError) {
            console.error("Error descargando respaldo:", requestError);
            setError(
                requestError.response?.status
                    ? `No fue posible descargar el respaldo (error ${requestError.response.status}).`
                    : "No fue posible conectar con el servidor para descargar el respaldo."
            );
        } finally {
            setDescargandoRespaldo(false);
        }
    };

    useEffect(() => {
        let cancelado = false;

        const cargarDatos = async () => {
            setCargando(true);
            setError("");
            setMensaje("");
            setRegistroEditado(null);
            setFormulario(formularioVacio());

            try {
                const requests = [api.get(seccion.endpoint)];
                if (seccionKey === "categorias") {
                    requests.push(api.get("/levantamiento/configuracion/tipos/"));
                }

                const responses = await Promise.all(requests);
                if (cancelado) {
                    return;
                }

                setRegistros(responses[0].data);
                if (seccionKey === "categorias") {
                    setTipos(responses[1].data);
                }
            } catch (requestError) {
                console.error(`Error cargando ${seccion.titulo}:`, requestError);
                if (!cancelado) {
                    setError(mensajeDeError(requestError));
                }
            } finally {
                if (!cancelado) {
                    setCargando(false);
                }
            }
        };

        cargarDatos();
        return () => {
            cancelado = true;
        };
    }, [seccion, seccionKey]);

    const cambiarCampo = (campo, valor) => {
        setFormulario((actual) => ({ ...actual, [campo]: valor }));
    };

    const guardar = async (event) => {
        event.preventDefault();
        setError("");
        setMensaje("");
        setGuardando(true);

        const datos = {
            nombre: formulario.nombre.trim(),
            descripcion: formulario.descripcion.trim(),
        };

        if (seccionKey === "categorias") {
            datos.tipo_activo = Number(formulario.tipo_activo);
            datos.prefijo_codigo = formulario.prefijo_codigo.trim().toUpperCase();
        }
        if (seccionKey === "estados") {
            datos.permite_prestamo = formulario.permite_prestamo;
        }

        try {
            const url = registroEditado
                ? `${seccion.endpoint}${registroEditado.id}/`
                : seccion.endpoint;
            const response = registroEditado
                ? await api.patch(url, datos)
                : await api.post(url, datos);
            const registroGuardado = response.data;
            setRegistros((actuales) => {
                const actualizados = registroEditado
                    ? actuales.map((item) =>
                        item.id === registroEditado.id ? registroGuardado : item
                    )
                    : [...actuales, registroGuardado];
                return actualizados.sort((a, b) =>
                    a.nombre.localeCompare(b.nombre, "es")
                );
            });
            setRegistroEditado(null);
            setFormulario(formularioVacio());
            setMensaje(
                `El registro de ${seccion.singular} se ${registroEditado ? "actualizó" : "creó"} correctamente.`
            );
        } catch (requestError) {
            console.error(`Error guardando ${seccion.singular}:`, requestError);
            setError(mensajeDeError(requestError));
        } finally {
            setGuardando(false);
        }
    };

    const editar = (registro) => {
        setRegistroEditado(registro);
        setFormulario({
            tipo_activo: registro.tipo_activo?.toString() || "",
            nombre: registro.nombre,
            prefijo_codigo: registro.prefijo_codigo || "",
            descripcion: registro.descripcion || "",
            permite_prestamo: Boolean(registro.permite_prestamo),
        });
        setError("");
        setMensaje("");
    };

    const cambiarEstado = async (registro) => {
        setError("");
        setMensaje("");

        try {
            await api.patch(`${seccion.endpoint}${registro.id}/`, {
                activo: !registro.activo,
            });
            setRegistros((actuales) =>
                actuales.map((item) =>
                    item.id === registro.id
                        ? { ...item, activo: !item.activo }
                        : item
                )
            );
            setMensaje(
                `El registro de ${seccion.singular} se ${registro.activo ? "desactivó" : "activó"} correctamente.`
            );
        } catch (requestError) {
            console.error(`Error cambiando estado de ${seccion.singular}:`, requestError);
            setError(mensajeDeError(requestError));
        }
    };

    const cancelarEdicion = () => {
        setRegistroEditado(null);
        setFormulario(formularioVacio());
        setError("");
        setMensaje("");
    };

    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <span className="eyebrow">ADMINISTRACIÓN DEL SISTEMA</span>
                    <h2>Configuración</h2>
                    <p>
                        Mantén los catálogos que usa el inventario actualizados.
                        Los registros se desactivan en lugar de eliminarse.
                    </p>
                </div>
            </header>

            {perfil?.es_administrador && (
                <section className="card backup-card" aria-labelledby="backup-heading">
                    <div>
                        <h2 id="backup-heading">Respaldo de información</h2>
                        <p>
                            Descarga una copia de los registros y archivos del sistema.
                            El archivo contiene datos personales; guárdalo de forma segura.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={descargarRespaldo}
                        disabled={descargandoRespaldo}
                    >
                        {descargandoRespaldo ? "Preparando respaldo..." : "Descargar respaldo"}
                    </button>
                </section>
            )}

            <nav className="config-tabs" aria-label="Catálogos de configuración">
                {catalogos.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        className={`config-tab${seccionKey === item.key ? " active" : ""}`}
                        aria-pressed={seccionKey === item.key}
                        onClick={() => setSeccionKey(item.key)}
                    >
                        <span aria-hidden="true">{item.icono}</span>
                        {item.titulo}
                    </button>
                ))}
            </nav>

            {error && (
                <div className="alert alert-error" role="alert">
                    <span>!</span>
                    <div>
                        <strong>No se pudo completar la operación</strong>
                        <p>{error}</p>
                    </div>
                </div>
            )}
            {mensaje && (
                <div className="alert alert-success" role="status">
                    <span>✓</span>
                    <div>
                        <strong>Configuración actualizada</strong>
                        <p>{mensaje}</p>
                    </div>
                </div>
            )}

            <div className="config-workspace">
                <section className="card">
                    <div className="card-header">
                        <div className="section-icon">{seccion.icono}</div>
                        <div>
                            <h2>{registroEditado ? `Editar ${seccion.singular}` : seccion.nuevo}</h2>
                            <p>
                                {registroEditado
                                    ? "Actualiza la información de este registro."
                                    : "Completa los datos para agregarlo al catálogo."}
                            </p>
                        </div>
                    </div>

                    <form className="config-form" onSubmit={guardar}>
                        <div className="form-grid">
                            {seccionKey === "categorias" && (
                                <div className="form-group config-field-wide">
                                    <label htmlFor="tipo_activo">Tipo de activo<span>*</span></label>
                                    <select
                                        id="tipo_activo"
                                        value={formulario.tipo_activo}
                                        onChange={(event) => cambiarCampo("tipo_activo", event.target.value)}
                                        required
                                    >
                                        <option value="">Selecciona un tipo</option>
                                        {tipos.map((tipo) => (
                                            <option key={tipo.id} value={tipo.id}>
                                                {tipo.nombre}{tipo.activo ? "" : " (inactivo)"}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="form-group config-field-wide">
                                <label htmlFor="nombre">Nombre<span>*</span></label>
                                <input
                                    id="nombre"
                                    value={formulario.nombre}
                                    onChange={(event) => cambiarCampo("nombre", event.target.value)}
                                    maxLength={seccionKey === "estados" ? 50 : 100}
                                    required
                                />
                            </div>

                            {seccionKey === "categorias" && (
                                <div className="form-group config-field-wide">
                                    <label htmlFor="prefijo_codigo">Prefijo para el código<span>*</span></label>
                                    <input
                                        id="prefijo_codigo"
                                        value={formulario.prefijo_codigo}
                                        onChange={(event) => cambiarCampo("prefijo_codigo", event.target.value)}
                                        maxLength={10}
                                        required
                                    />
                                </div>
                            )}

                            {seccionKey === "estados" && (
                                <div className="form-group config-field-wide">
                                    <label className="checkbox-label" htmlFor="permite_prestamo">
                                        <input
                                            id="permite_prestamo"
                                            type="checkbox"
                                            checked={formulario.permite_prestamo}
                                            onChange={(event) => cambiarCampo("permite_prestamo", event.target.checked)}
                                        />
                                        <span>Permite prestar activos en este estado</span>
                                    </label>
                                </div>
                            )}

                            <div className="form-group config-field-wide">
                                <label htmlFor="descripcion">Descripción</label>
                                <textarea
                                    id="descripcion"
                                    rows="3"
                                    value={formulario.descripcion}
                                    onChange={(event) => cambiarCampo("descripcion", event.target.value)}
                                />
                            </div>
                        </div>

                        <div className="config-form-actions">
                            {registroEditado && (
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={cancelarEdicion}
                                >
                                    Cancelar
                                </button>
                            )}
                            <button type="submit" className="btn btn-primary" disabled={guardando}>
                                {guardando ? "Guardando..." : registroEditado ? "Guardar cambios" : seccion.crear}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="card inventory-card" aria-label={seccion.titulo}>
                    <div className="card-header config-list-heading">
                        <div>
                            <h2>{seccion.titulo}</h2>
                            <p>{registros.length} registros configurados</p>
                        </div>
                    </div>
                    {cargando ? (
                        <div className="table-loading" role="status">
                            <span className="loading-spinner" />
                            <span>Cargando configuración...</span>
                        </div>
                    ) : registros.length ? (
                        <div className="table-responsive">
                            <table>
                                <thead>
                                    <tr>
                                        {seccionKey === "categorias" && <th>Tipo</th>}
                                        <th>Nombre</th>
                                        {seccionKey === "categorias" && <th>Prefijo</th>}
                                        {seccionKey === "estados" && <th>Préstamo</th>}
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {registros.map((registro) => (
                                        <tr key={registro.id}>
                                            {seccionKey === "categorias" && (
                                                <td>{registro.tipo_activo_nombre}</td>
                                            )}
                                            <td>{registro.nombre}</td>
                                            {seccionKey === "categorias" && (
                                                <td>{registro.prefijo_codigo}</td>
                                            )}
                                            {seccionKey === "estados" && (
                                                <td>{registro.permite_prestamo ? "Permitido" : "No permitido"}</td>
                                            )}
                                            <td>
                                                <span className={`status-badge${registro.activo ? "" : " status-inactive"}`}>
                                                    <span />
                                                    {registro.activo ? "Activo" : "Inactivo"}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="config-row-actions">
                                                    <button
                                                        type="button"
                                                        className="table-action"
                                                        onClick={() => editar(registro)}
                                                    >
                                                        Editar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="table-action"
                                                        onClick={() => cambiarEstado(registro)}
                                                    >
                                                        {registro.activo ? "Desactivar" : "Activar"}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="config-empty">
                            <span className="module-icon" aria-hidden="true">{seccion.icono}</span>
                            <strong>Aún no hay {seccion.titulo.toLowerCase()}</strong>
                            <p>Usa el formulario para crear el primer registro.</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

export default Configuracion;
