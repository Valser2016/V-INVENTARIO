import React, { useEffect, useState } from "react";
import api from "../services/api";
import { useSession } from "../context/SessionContext";
import {
    SeccionClasificacion,
    SeccionControl,
    SeccionFotoActivo,
    SeccionInformacion,
    SeccionObservaciones,
} from "../components/activo/FormularioActivo";
import FotoActivo from "../components/activo/FotoActivo";
import { crearFormDataActivo } from "../utils/activoFormData";

const formularioVacio = () => ({
    tipo_activo: "",
    categoria: "",
    modalidad_control: "INDIVIDUAL",
    nombre: "",
    marca: "",
    modelo: "",
    serie_codigo: "",
    fecha_adquisicion: "",
    proveedor: "",
    vida_util: "",
    ubicacion: "",
    estado: "",
    responsable: "",
    cuenta_con_manual: false,
    valor: "",
    observaciones: "",
});

const errorApi = (error) => {
    const data = error.response?.data;
    if (!data) {
        return "No fue posible conectar con el servidor. Intenta de nuevo.";
    }
    return Object.entries(data)
        .flatMap(([campo, mensajes]) =>
            (Array.isArray(mensajes) ? mensajes : [mensajes]).map(
                (mensaje) => `${campo}: ${mensaje}`
            )
        )
        .join(" ");
};

function ListadoActivos() {
    const { perfil } = useSession();
    const administrador = Boolean(perfil?.es_administrador);
    const puedeModificar = administrador || Boolean(
        perfil?.permisos?.puede_modificar_inventario,
    );
    const [pagina, setPagina] = useState(null);
    const [numeroPagina, setNumeroPagina] = useState(1);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");
    const [mensaje, setMensaje] = useState("");
    const [activoEditado, setActivoEditado] = useState(null);
    const [formulario, setFormulario] = useState(formularioVacio);
    const [fotoArchivo, setFotoArchivo] = useState(null);
    const [quitarFoto, setQuitarFoto] = useState(false);
    const [tipos, setTipos] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [estados, setEstados] = useState([]);
    const [ubicaciones, setUbicaciones] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [cargandoFormulario, setCargandoFormulario] = useState(false);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        let cancelado = false;

        const cargarActivos = async () => {
            setCargando(true);
            setError("");

            try {
                const response = await api.get(
                    `/levantamiento/activos/?page=${numeroPagina}`
                );
                if (!cancelado) {
                    setPagina(response.data);
                }
            } catch (requestError) {
                console.error("Error cargando activos:", requestError);
                if (!cancelado) {
                    setError("No fue posible cargar el listado de activos.");
                }
            } finally {
                if (!cancelado) {
                    setCargando(false);
                }
            }
        };

        cargarActivos();
        return () => {
            cancelado = true;
        };
    }, [numeroPagina]);

    useEffect(() => {
        let cancelado = false;
        const cargarCategorias = async () => {
            if (!activoEditado || !formulario.tipo_activo) {
                setCategorias([]);
                return;
            }

            try {
                const response = await api.get(
                    `/levantamiento/categorias/?tipo_activo=${formulario.tipo_activo}`
                );
                if (!cancelado) {
                    setCategorias(response.data);
                }
            } catch (requestError) {
                console.error("Error cargando categorías:", requestError);
                if (!cancelado) {
                    setError("No fue posible cargar las categorías del activo.");
                }
            }
        };

        cargarCategorias();
        return () => {
            cancelado = true;
        };
    }, [activoEditado, formulario.tipo_activo]);

    const editarActivo = async (activo) => {
        setError("");
        setMensaje("");
        setCargandoFormulario(true);
        try {
            const [
                tiposResponse,
                estadosResponse,
                ubicacionesResponse,
                usuariosResponse,
            ] = await Promise.all([
                api.get("/levantamiento/tipos/"),
                api.get("/levantamiento/estados/"),
                api.get("/levantamiento/ubicaciones/"),
                api.get("/levantamiento/usuarios/"),
            ]);
            setTipos(tiposResponse.data);
            setEstados(estadosResponse.data);
            setUbicaciones(ubicacionesResponse.data);
            setUsuarios(usuariosResponse.data);
            setFormulario({
                tipo_activo: String(activo.tipo_activo),
                categoria: String(activo.categoria),
                modalidad_control: activo.modalidad_control,
                nombre: activo.nombre,
                marca: activo.marca ?? "",
                modelo: activo.modelo ?? "",
                serie_codigo: activo.serie_codigo ?? "",
                fecha_adquisicion: activo.fecha_adquisicion ?? "",
                proveedor: activo.proveedor ?? "",
                vida_util: activo.vida_util ?? "",
                ubicacion: String(activo.ubicacion),
                estado: String(activo.estado),
                responsable: activo.responsable ? String(activo.responsable) : "",
                cuenta_con_manual: activo.cuenta_con_manual,
                valor: activo.valor ?? "",
                observaciones: activo.observaciones ?? "",
            });
            setFotoArchivo(null);
            setQuitarFoto(false);
            setActivoEditado(activo);
        } catch (requestError) {
            console.error("Error cargando datos para editar activo:", requestError);
            setError("No fue posible cargar los datos necesarios para editar el activo.");
        } finally {
            setCargandoFormulario(false);
        }
    };

    const cambiarCampo = (campo, valor) => {
        setFormulario((actual) => ({
            ...actual,
            [campo]: valor,
            ...(campo === "tipo_activo" ? { categoria: "" } : {}),
        }));
    };

    const cambiarFoto = (archivo) => {
        setFotoArchivo(archivo);
        setQuitarFoto(false);
    };

    const marcarFotoParaQuitar = () => {
        setFotoArchivo(null);
        setQuitarFoto(Boolean(activoEditado?.foto_url));
    };

    const cancelarEdicion = () => {
        setActivoEditado(null);
        setFormulario(formularioVacio());
        setFotoArchivo(null);
        setQuitarFoto(false);
        setCategorias([]);
        setError("");
    };

    const guardarCambios = async (event) => {
        event.preventDefault();
        if (!activoEditado) {
            return;
        }
        setGuardando(true);
        setError("");
        setMensaje("");
        try {
            const datos = {
                ...formulario,
                tipo_activo: Number(formulario.tipo_activo),
                categoria: Number(formulario.categoria),
                ubicacion: Number(formulario.ubicacion),
                estado: Number(formulario.estado),
                responsable: formulario.responsable
                    ? Number(formulario.responsable)
                    : null,
                fecha_adquisicion: formulario.fecha_adquisicion || null,
                valor: formulario.valor ? Number(formulario.valor) : null,
            };
            const datosEnvio = fotoArchivo
                ? crearFormDataActivo(datos, fotoArchivo)
                : quitarFoto
                    ? { ...datos, foto: null }
                    : datos;
            const response = await api.patch(
                `/levantamiento/activos/${activoEditado.id}/`,
                datosEnvio,
            );
            setPagina((actual) => ({
                ...actual,
                results: actual.results.map((activo) =>
                    activo.id === response.data.id ? response.data : activo
                ),
            }));
            setMensaje(`Se actualizaron los datos de ${response.data.codigo_interno}.`);
            cancelarEdicion();
        } catch (requestError) {
            console.error("Error actualizando activo:", requestError);
            setError(errorApi(requestError));
        } finally {
            setGuardando(false);
        }
    };

    const desactivarActivo = async (activo) => {
        if (!window.confirm(`¿Desactivar el activo ${activo.codigo_interno}?`)) {
            return;
        }
        setError("");
        setMensaje("");
        setGuardando(true);
        try {
            await api.patch(`/levantamiento/activos/${activo.id}/`, { activo: false });
            const resultados = pagina?.results ?? [];
            setMensaje(`Se desactivó el activo ${activo.codigo_interno}.`);
            if (resultados.length === 1 && numeroPagina > 1) {
                setNumeroPagina((actual) => actual - 1);
            } else {
                setPagina((actual) => ({
                    ...actual,
                    count: actual.count - 1,
                    results: actual.results.filter((item) => item.id !== activo.id),
                }));
            }
            if (activoEditado?.id === activo.id) {
                cancelarEdicion();
            }
        } catch (requestError) {
            console.error("Error desactivando activo:", requestError);
            setError(errorApi(requestError));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <span className="eyebrow">GESTIÓN DE INVENTARIO</span>
                    <h1>Listado de activos</h1>
                    <p>Consulta y administra los activos registrados en el inventario.</p>
                </div>
                <span className="record-count">
                    {pagina ? `${pagina.count} registros` : "Inventario"}
                </span>
            </header>

            {error && (
                <div className="alert alert-error" role="alert">
                    <span>!</span>
                    <div><strong>No se pudo completar la operación</strong><p>{error}</p></div>
                </div>
            )}
            {mensaje && <div className="alert alert-success" role="status">{mensaje}</div>}

            {cargandoFormulario && (
                <div className="table-loading" role="status">
                    <span className="loading-spinner" />
                    <span>Cargando datos del activo...</span>
                </div>
            )}

            {activoEditado && (
                <form className="active-edit-form" onSubmit={guardarCambios}>
                    <div className="page-header">
                        <div>
                            <span className="eyebrow">{activoEditado.codigo_interno}</span>
                            <h2>Editar activo</h2>
                        </div>
                    </div>
                    <SeccionClasificacion
                        formulario={formulario}
                        tipos={tipos}
                        categorias={categorias}
                        cambiarCampo={cambiarCampo}
                    />
                    <SeccionInformacion formulario={formulario} cambiarCampo={cambiarCampo} />
                    <SeccionFotoActivo
                        fotoUrl={activoEditado.foto_url}
                        fotoArchivo={fotoArchivo}
                        quitarFoto={quitarFoto}
                        cambiarFoto={cambiarFoto}
                        quitarFotoActivo={marcarFotoParaQuitar}
                        restaurarFoto={() => setQuitarFoto(false)}
                    />
                    <SeccionControl
                        formulario={formulario}
                        ubicaciones={ubicaciones}
                        estados={estados}
                        usuarios={usuarios}
                        cambiarCampo={cambiarCampo}
                    />
                    <SeccionObservaciones formulario={formulario} cambiarCampo={cambiarCampo} />
                    <div className="form-actions">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={guardando}
                            onClick={cancelarEdicion}
                        >
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={guardando}>
                            {guardando ? "Guardando..." : "Guardar cambios"}
                        </button>
                    </div>
                </form>
            )}

            <section className="card inventory-card" aria-label="Activos registrados">
                {cargando ? (
                    <div className="table-loading" role="status">
                        <span className="loading-spinner" />
                        <span>Cargando activos...</span>
                    </div>
                ) : (
                    <>
                        <div className="table-responsive">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Foto</th>
                                        <th>Nombre</th>
                                        <th>Tipo</th>
                                        <th>Categoría</th>
                                        <th>Ubicación</th>
                                        <th>Estado</th>
                                        {puedeModificar && <th>Acciones</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagina?.results.length ? pagina.results.map((activo) => (
                                        <tr key={activo.id}>
                                            <td>{activo.codigo_interno}</td>
                                            <td>
                                                <FotoActivo
                                                    url={activo.foto_url}
                                                    alt={`Foto de ${activo.codigo_interno}`}
                                                />
                                            </td>
                                            <td>{activo.nombre}</td>
                                            <td>{activo.tipo_activo_nombre}</td>
                                            <td>{activo.categoria_nombre}</td>
                                            <td>{activo.ubicacion_nombre}</td>
                                            <td>
                                                <span className="status-badge">
                                                    <span />
                                                    {activo.estado_nombre}
                                                </span>
                                            </td>
                                            {puedeModificar && (
                                                <td>
                                                    <div className="config-row-actions">
                                                        <button
                                                            className="text-button"
                                                            type="button"
                                                            disabled={guardando || cargandoFormulario}
                                                            onClick={() => editarActivo(activo)}
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            className="text-button"
                                                            type="button"
                                                            disabled={guardando}
                                                            onClick={() => desactivarActivo(activo)}
                                                        >
                                                            Desactivar
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={puedeModificar ? 8 : 7}>
                                                No hay activos registrados.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <nav className="pagination" aria-label="Paginación de activos">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={!pagina?.previous}
                                onClick={() => setNumeroPagina((actual) => actual - 1)}
                            >
                                Anterior
                            </button>
                            <span>
                                Página {numeroPagina} de {Math.max(
                                    1,
                                    Math.ceil((pagina?.count ?? 0) / 25)
                                )}
                            </span>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={!pagina?.next}
                                onClick={() => setNumeroPagina((actual) => actual + 1)}
                            >
                                Siguiente
                            </button>
                        </nav>
                    </>
                )}
            </section>
        </div>
    );
}

export default ListadoActivos;
