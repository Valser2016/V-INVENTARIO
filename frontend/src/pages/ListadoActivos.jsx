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
import FichaVidaActivo from "../components/activo/FichaVidaActivo";
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
    const [filtros, setFiltros] = useState({
        search: "",
        tipo_activo: "",
        categoria: "",
        estado: "",
        ubicacion: "",
    });
    const [activoVisto, setActivoVisto] = useState(null);
    const [activoEditado, setActivoEditado] = useState(null);
    const [formulario, setFormulario] = useState(formularioVacio);
    const [fotoArchivo, setFotoArchivo] = useState(null);
    const [quitarFoto, setQuitarFoto] = useState(false);
    const [tipos, setTipos] = useState([]);
    const [categoriasFiltro, setCategoriasFiltro] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [estados, setEstados] = useState([]);
    const [ubicaciones, setUbicaciones] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [cargandoFormulario, setCargandoFormulario] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [descargandoHoja, setDescargandoHoja] = useState(false);

    useEffect(() => {
        let cancelado = false;

        const cargarActivos = async () => {
            setCargando(true);
            setError("");

            try {
                const parametros = new URLSearchParams({ page: String(numeroPagina) });
                Object.entries(filtros).forEach(([campo, valor]) => {
                    if (valor.trim()) {
                        parametros.set(campo, valor.trim());
                    }
                });
                const response = await api.get(
                    `/levantamiento/activos/?${parametros.toString()}`
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
    }, [filtros, numeroPagina]);

    useEffect(() => {
        let cancelado = false;
        const cargarFiltros = async () => {
            try {
                const [tiposResponse, categoriasResponse, estadosResponse, ubicacionesResponse] =
                    await Promise.all([
                        api.get("/levantamiento/tipos/"),
                        api.get("/levantamiento/categorias/"),
                        api.get("/levantamiento/estados/"),
                        api.get("/levantamiento/ubicaciones/"),
                    ]);
                if (!cancelado) {
                    setTipos(tiposResponse.data);
                    setCategoriasFiltro(categoriasResponse.data);
                    setEstados(estadosResponse.data);
                    setUbicaciones(ubicacionesResponse.data);
                }
            } catch (requestError) {
                console.error("Error cargando filtros de inventario:", requestError);
                if (!cancelado) {
                    setError("No fue posible cargar las opciones de los filtros.");
                }
            }
        };

        void cargarFiltros();
        return () => {
            cancelado = true;
        };
    }, []);

    const cambiarFiltro = (campo, valor) => {
        setFiltros((actuales) => ({
            ...actuales,
            [campo]: valor,
            ...(campo === "tipo_activo" ? { categoria: "" } : {}),
        }));
        setNumeroPagina(1);
    };

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
        setActivoVisto(null);
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

    const verActivo = (activo) => {
        setError("");
        setActivoEditado(null);
        setActivoVisto(activo);
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

    const descargarHojaVida = async (activo) => {
        setError("");
        setDescargandoHoja(true);
        try {
            const response = await api.get(
                `/levantamiento/activos/${activo.id}/hoja-vida/`,
                { responseType: "blob" },
            );
            const objectUrl = URL.createObjectURL(response.data);
            const enlace = document.createElement("a");
            enlace.href = objectUrl;
            enlace.download = `OYS-FO-11-${activo.codigo_interno}.xlsx`;
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        } catch (requestError) {
            console.error("Error descargando hoja de vida:", requestError);
            const estadoHttp = requestError.response?.status;
            setError(
                estadoHttp
                    ? `No fue posible descargar la hoja de vida (error ${estadoHttp}).`
                    : errorApi(requestError),
            );
        } finally {
            setDescargandoHoja(false);
        }
    };

    const eliminarActivo = async (activo) => {
        if (!window.confirm(
            `¿Eliminar permanentemente el activo ${activo.codigo_interno}? Esta acción no se puede deshacer.`,
        )) {
            return;
        }
        setError("");
        setMensaje("");
        setGuardando(true);
        try {
            await api.delete(`/levantamiento/activos/${activo.id}/`);
            const resultados = pagina?.results ?? [];
            setMensaje(`Se eliminó el activo ${activo.codigo_interno}.`);
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
            if (activoVisto?.id === activo.id) {
                setActivoVisto(null);
            }
        } catch (requestError) {
            console.error("Error eliminando activo:", requestError);
            setError(errorApi(requestError));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="page-container">
            {activoVisto && (
                <FichaVidaActivo
                    activo={activoVisto}
                    alCerrar={() => setActivoVisto(null)}
                    alDescargar={() => descargarHojaVida(activoVisto)}
                    descargando={descargandoHoja}
                />
            )}
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

            <section
                className="card inventory-card"
                aria-label="Activos registrados"
                aria-busy={cargando}
            >
                <>
                    <div className="inventory-filters" aria-label="Filtros de inventario">
                        <div className="form-group">
                            <label htmlFor="buscar-activos">Buscar activos</label>
                            <input
                                id="buscar-activos"
                                type="search"
                                value={filtros.search}
                                onChange={(event) => cambiarFiltro("search", event.target.value)}
                                placeholder="Código, nombre, tipo, categoría, estado o ubicación..."
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="filtro-tipo-activo">Tipo</label>
                            <select
                                id="filtro-tipo-activo"
                                value={filtros.tipo_activo}
                                onChange={(event) => cambiarFiltro(
                                    "tipo_activo",
                                    event.target.value,
                                )}
                            >
                                <option value="">Todos los tipos</option>
                                {tipos.map((tipo) => (
                                    <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="filtro-categoria">Categoría</label>
                            <select
                                id="filtro-categoria"
                                value={filtros.categoria}
                                onChange={(event) => cambiarFiltro(
                                    "categoria",
                                    event.target.value,
                                )}
                            >
                                <option value="">Todas las categorías</option>
                                {categoriasFiltro
                                    .filter((categoria) =>
                                        !filtros.tipo_activo
                                        || String(categoria.tipo_activo) === filtros.tipo_activo
                                        || String(categoria.tipo_activo_id) === filtros.tipo_activo
                                    )
                                    .map((categoria) => (
                                        <option key={categoria.id} value={categoria.id}>
                                            {categoria.nombre}
                                        </option>
                                    ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="filtro-estado">Estado</label>
                            <select
                                id="filtro-estado"
                                value={filtros.estado}
                                onChange={(event) => cambiarFiltro(
                                    "estado",
                                    event.target.value,
                                )}
                            >
                                <option value="">Todos los estados</option>
                                {estados.map((estado) => (
                                    <option key={estado.id} value={estado.id}>
                                        {estado.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="filtro-ubicacion">Ubicación</label>
                            <select
                                id="filtro-ubicacion"
                                value={filtros.ubicacion}
                                onChange={(event) => cambiarFiltro(
                                    "ubicacion",
                                    event.target.value,
                                )}
                            >
                                <option value="">Todas las ubicaciones</option>
                                {ubicaciones.map((ubicacion) => (
                                    <option key={ubicacion.id} value={ubicacion.id}>
                                        {ubicacion.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {cargando && (
                    <div className="table-loading" role="status">
                        <span className="loading-spinner" />
                        <span>Cargando activos...</span>
                    </div>
                    )}
                        <div className="table-responsive">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Nombre</th>
                                        <th>Tipo</th>
                                        <th>Categoría</th>
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagina?.results.length ? pagina.results.map((activo) => (
                                        <tr key={activo.id}>
                                            <td>{activo.codigo_interno}</td>
                                            <td>{activo.nombre}</td>
                                            <td>{activo.tipo_activo_nombre}</td>
                                            <td>{activo.categoria_nombre}</td>
                                            <td>
                                                <span className="status-badge">
                                                    <span />
                                                    {activo.estado_nombre}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="config-row-actions">
                                                    <button
                                                        className="table-action"
                                                        type="button"
                                                        onClick={() => verActivo(activo)}
                                                    >
                                                        Ver
                                                    </button>
                                                    {puedeModificar && (
                                                        <>
                                                            <button
                                                                className="table-action"
                                                                type="button"
                                                                disabled={guardando || cargandoFormulario}
                                                                onClick={() => editarActivo(activo)}
                                                            >
                                                                Editar
                                                            </button>
                                                            <button
                                                                className="table-action table-action-danger"
                                                                type="button"
                                                                disabled={guardando}
                                                                onClick={() => eliminarActivo(activo)}
                                                            >
                                                                Eliminar
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={6}>
                                                {Object.values(filtros).some(Boolean)
                                                    ? "No se encontraron activos con esos filtros."
                                                    : "No hay activos registrados."}
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
            </section>
        </div>
    );
}

export default ListadoActivos;
