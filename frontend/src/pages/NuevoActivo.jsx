import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import {
    SeccionClasificacion,
    SeccionControl,
    SeccionFotoActivo,
    SeccionInformacion,
    SeccionObservaciones,
} from "../components/activo/FormularioActivo";
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

function NuevoActivo() {
    const navigate = useNavigate();
    const [tipos, setTipos] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [estados, setEstados] = useState([]);
    const [ubicaciones, setUbicaciones] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [formulario, setFormulario] = useState(formularioVacio);
    const [fotoArchivo, setFotoArchivo] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [mensaje, setMensaje] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        const cargarDatos = async () => {
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
            } catch (err) {
                console.error("Error cargando información inicial:", err);
                setError("No fue posible cargar la información inicial.");
            } finally {
                setCargando(false);
            }
        };

        cargarDatos();
    }, []);

    useEffect(() => {
        const cargarCategorias = async () => {
            if (!formulario.tipo_activo) {
                setCategorias([]);
                return;
            }

            try {
                const response = await api.get(
                    `/levantamiento/categorias/?tipo_activo=${formulario.tipo_activo}`
                );
                setCategorias(response.data);
                setFormulario((actual) => ({ ...actual, categoria: "" }));
            } catch (err) {
                console.error("Error cargando categorías:", err);
                setError("No fue posible cargar las categorías.");
            }
        };

        cargarCategorias();
    }, [formulario.tipo_activo]);

    const cambiarCampo = (campo, valor) => {
        setFormulario((actual) => ({ ...actual, [campo]: valor }));
    };

    const guardarActivo = async (e) => {
        e.preventDefault();
        setMensaje("");
        setError("");

        if (
            !formulario.tipo_activo ||
            !formulario.categoria ||
            !formulario.nombre ||
            !formulario.ubicacion ||
            !formulario.estado
        ) {
            setError("Completa todos los campos obligatorios.");
            return;
        }

        try {
            setGuardando(true);
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
                : datos;
            const response = await api.post("/levantamiento/activos/", datosEnvio);

            setMensaje(
                `Activo creado correctamente. Código: ${response.data.codigo_interno}`
            );
            setFormulario(formularioVacio());
            setFotoArchivo(null);
            setCategorias([]);
        } catch (err) {
            console.error("Error creando activo:", err);

            if (err.response?.data) {
                console.error("Respuesta del servidor:", err.response.data);
            }

            const erroresApi = err.response?.data
                ? Object.entries(err.response.data).flatMap(([campo, mensajes]) =>
                    (Array.isArray(mensajes) ? mensajes : [mensajes]).map(
                        (mensaje) => `${campo}: ${mensaje}`
                    )
                )
                : [];

            setError(
                erroresApi.length
                    ? erroresApi
                    : "No fue posible guardar el activo. Revisa la información ingresada."
            );
        } finally {
            setGuardando(false);
        }
    };

    if (cargando) {
        return (
            <div className="page-loading">
                <div className="loading-spinner"></div>
                <p>Cargando información...</p>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <div className="breadcrumb">Activos / Nuevo activo</div>
                    <h1>Nuevo activo</h1>
                    <p>Registra un nuevo activo en el sistema.</p>
                </div>
            </div>

            {mensaje && (
                <div className="alert alert-success">
                    <div className="alert-icon">✓</div>
                    <div>
                        <strong>Operación exitosa</strong>
                        <p>{mensaje}</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="alert alert-error">
                    <div className="alert-icon">!</div>
                    <div>
                        <strong>Ocurrió un problema</strong>
                        {Array.isArray(error)
                            ? error.map((mensajeError) => (
                                <p key={mensajeError}>{mensajeError}</p>
                            ))
                            : <p>{error}</p>}
                    </div>
                </div>
            )}

            <form onSubmit={guardarActivo}>
                <SeccionClasificacion
                    formulario={formulario}
                    tipos={tipos}
                    categorias={categorias}
                    cambiarCampo={cambiarCampo}
                />
                <SeccionInformacion
                    formulario={formulario}
                    cambiarCampo={cambiarCampo}
                />
                <SeccionFotoActivo
                    fotoArchivo={fotoArchivo}
                    cambiarFoto={setFotoArchivo}
                    quitarFotoActivo={() => setFotoArchivo(null)}
                />
                <SeccionControl
                    formulario={formulario}
                    ubicaciones={ubicaciones}
                    estados={estados}
                    usuarios={usuarios}
                    cambiarCampo={cambiarCampo}
                />
                <SeccionObservaciones
                    formulario={formulario}
                    cambiarCampo={cambiarCampo}
                />

                <div className="form-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate("/activos")}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={guardando}
                    >
                        {guardando ? "Guardando..." : "Guardar activo"}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default NuevoActivo;
