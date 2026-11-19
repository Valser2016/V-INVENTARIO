import React, { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { useSession } from "../context/SessionContext";

const nuevoUsuario = () => ({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    documento: "",
    telefono: "",
    cargo: "",
    area: "",
    rol: "",
    password: "",
    is_active: true,
});

const nuevoRol = () => ({
    nombre: "",
    descripcion: "",
    puede_ver_inventario: true,
    puede_modificar_inventario: false,
    puede_administrar_catalogos: false,
    puede_ver_movimientos: false,
    puede_ver_reportes: false,
    puede_registrar_devoluciones: false,
    puede_revisar_solicitudes_prestamo: false,
    puede_aprobar_solicitudes_prestamo: false,
    activo: true,
});

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

function Usuarios() {
    const { perfil } = useSession();
    const [seccion, setSeccion] = useState("usuarios");
    const [usuarios, setUsuarios] = useState([]);
    const [roles, setRoles] = useState([]);
    const [usuarioFormulario, setUsuarioFormulario] = useState(nuevoUsuario);
    const [rolFormulario, setRolFormulario] = useState(nuevoRol);
    const [usuarioEditado, setUsuarioEditado] = useState(null);
    const [rolEditado, setRolEditado] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState("");
    const [mensaje, setMensaje] = useState("");

    const cargarDatos = useCallback(async () => {
        try {
            const [respuestaUsuarios, respuestaRoles] = await Promise.all([
                api.get("/usuarios/usuarios/"),
                api.get("/usuarios/roles/"),
            ]);
            setUsuarios(respuestaUsuarios.data);
            setRoles(respuestaRoles.data);
        } catch (requestError) {
            console.error("Error cargando usuarios y roles:", requestError);
            setError(errorApi(requestError));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void Promise.resolve().then(cargarDatos);
    }, [cargarDatos]);

    const guardarUsuario = async (event) => {
        event.preventDefault();
        setGuardando(true);
        setError("");
        setMensaje("");
        const datos = {
            ...usuarioFormulario,
            rol: usuarioFormulario.rol ? Number(usuarioFormulario.rol) : null,
        };
        if (!datos.password) {
            delete datos.password;
        }
        try {
            if (usuarioEditado) {
                await api.patch(`/usuarios/usuarios/${usuarioEditado.id}/`, datos);
            } else {
                await api.post("/usuarios/usuarios/", datos);
            }
            setUsuarioFormulario(nuevoUsuario());
            setUsuarioEditado(null);
            setMensaje(usuarioEditado ? "Usuario actualizado." : "Usuario creado.");
            setCargando(true);
            await cargarDatos();
        } catch (requestError) {
            console.error("Error guardando usuario:", requestError);
            setError(errorApi(requestError));
        } finally {
            setGuardando(false);
        }
    };

    const guardarRol = async (event) => {
        event.preventDefault();
        setGuardando(true);
        setError("");
        setMensaje("");
        try {
            if (rolEditado) {
                await api.patch(`/usuarios/roles/${rolEditado.id}/`, rolFormulario);
            } else {
                await api.post("/usuarios/roles/", rolFormulario);
            }
            setRolFormulario(nuevoRol());
            setRolEditado(null);
            setMensaje(rolEditado ? "Permisos del rol actualizados." : "Rol creado.");
            setCargando(true);
            await cargarDatos();
        } catch (requestError) {
            console.error("Error guardando rol:", requestError);
            setError(errorApi(requestError));
        } finally {
            setGuardando(false);
        }
    };

    const editarUsuario = (usuario) => {
        setUsuarioEditado(usuario);
        setUsuarioFormulario({
            username: usuario.username,
            first_name: usuario.first_name,
            last_name: usuario.last_name,
            email: usuario.email,
            documento: usuario.documento ?? "",
            telefono: usuario.telefono ?? "",
            cargo: usuario.cargo ?? "",
            area: usuario.area ?? "",
            rol: usuario.rol ?? "",
            password: "",
            is_active: usuario.is_active,
        });
        setMensaje("");
        setError("");
    };

    const editarRol = (rol) => {
        setRolEditado(rol);
        setRolFormulario({
            nombre: rol.nombre,
            descripcion: rol.descripcion,
            puede_ver_inventario: rol.puede_ver_inventario,
            puede_modificar_inventario: rol.puede_modificar_inventario,
            puede_administrar_catalogos: rol.puede_administrar_catalogos,
            puede_ver_movimientos: rol.puede_ver_movimientos,
            puede_ver_reportes: rol.puede_ver_reportes,
            puede_registrar_devoluciones: rol.puede_registrar_devoluciones,
            puede_revisar_solicitudes_prestamo: rol.puede_revisar_solicitudes_prestamo,
            puede_aprobar_solicitudes_prestamo: rol.puede_aprobar_solicitudes_prestamo,
            activo: rol.activo,
        });
        setMensaje("");
        setError("");
    };

    const cambiarEstadoUsuario = async (usuario) => {
        setGuardando(true);
        setError("");
        setMensaje("");
        try {
            await api.patch(`/usuarios/usuarios/${usuario.id}/`, {
                is_active: !usuario.is_active,
            });
            setMensaje(usuario.is_active ? "Usuario desactivado." : "Usuario activado.");
            setCargando(true);
            await cargarDatos();
        } catch (requestError) {
            console.error("Error cambiando estado del usuario:", requestError);
            setError(errorApi(requestError));
        } finally {
            setGuardando(false);
        }
    };

    const cambiarEstadoRol = async (rol) => {
        setGuardando(true);
        setError("");
        setMensaje("");
        try {
            await api.patch(`/usuarios/roles/${rol.id}/`, { activo: !rol.activo });
            setMensaje(rol.activo ? "Rol desactivado." : "Rol activado.");
            setCargando(true);
            await cargarDatos();
        } catch (requestError) {
            console.error("Error cambiando estado del rol:", requestError);
            setError(errorApi(requestError));
        } finally {
            setGuardando(false);
        }
    };

    if (!perfil?.es_administrador) {
        return (
            <section className="page-container">
                <div className="alert alert-error" role="alert">
                    Solo un administrador puede gestionar usuarios y permisos.
                </div>
            </section>
        );
    }

    return (
        <section className="page-container">
            <header className="page-header">
                <div>
                    <span className="eyebrow">ADMINISTRACIÓN</span>
                    <h1>Usuarios y permisos</h1>
                    <p>Crea usuarios y asigna los módulos que cada rol puede consultar.</p>
                </div>
            </header>

            <nav className="module-tabs" aria-label="Administración de usuarios">
                <button
                    type="button"
                    className={seccion === "usuarios" ? "active" : ""}
                    onClick={() => setSeccion("usuarios")}
                >
                    Usuarios
                </button>
                <button
                    type="button"
                    className={seccion === "roles" ? "active" : ""}
                    onClick={() => setSeccion("roles")}
                >
                    Roles y permisos
                </button>
            </nav>

            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {mensaje && <div className="alert alert-success" role="status">{mensaje}</div>}

            {seccion === "usuarios" ? (
                <div className="user-admin-layout">
                    <form className="card admin-form" onSubmit={guardarUsuario}>
                        <div className="card-header">
                            <h2>{usuarioEditado ? "Editar usuario" : "Crear usuario"}</h2>
                            <p>La contraseña se guarda de forma segura y no se muestra después.</p>
                        </div>
                        <div className="form-grid">
                            <label className="form-group">
                                <span>Usuario</span>
                                <input
                                    value={usuarioFormulario.username}
                                    onChange={(event) => setUsuarioFormulario({
                                        ...usuarioFormulario,
                                        username: event.target.value,
                                    })}
                                    required
                                    maxLength="150"
                                    autoComplete="off"
                                />
                            </label>
                            <label className="form-group">
                                <span>Nombres</span>
                                <input
                                    value={usuarioFormulario.first_name}
                                    onChange={(event) => setUsuarioFormulario({
                                        ...usuarioFormulario,
                                        first_name: event.target.value,
                                    })}
                                />
                            </label>
                            <label className="form-group">
                                <span>Apellidos</span>
                                <input
                                    value={usuarioFormulario.last_name}
                                    onChange={(event) => setUsuarioFormulario({
                                        ...usuarioFormulario,
                                        last_name: event.target.value,
                                    })}
                                />
                            </label>
                            <label className="form-group">
                                <span>Correo</span>
                                <input
                                    type="email"
                                    value={usuarioFormulario.email}
                                    onChange={(event) => setUsuarioFormulario({
                                        ...usuarioFormulario,
                                        email: event.target.value,
                                    })}
                                />
                            </label>
                            <label className="form-group">
                                <span>Documento</span>
                                <input
                                    value={usuarioFormulario.documento}
                                    onChange={(event) => setUsuarioFormulario({
                                        ...usuarioFormulario,
                                        documento: event.target.value,
                                    })}
                                    maxLength="30"
                                />
                            </label>
                            <label className="form-group">
                                <span>Teléfono</span>
                                <input
                                    value={usuarioFormulario.telefono}
                                    onChange={(event) => setUsuarioFormulario({
                                        ...usuarioFormulario,
                                        telefono: event.target.value,
                                    })}
                                    maxLength="30"
                                />
                            </label>
                            <label className="form-group">
                                <span>Cargo</span>
                                <input
                                    value={usuarioFormulario.cargo}
                                    onChange={(event) => setUsuarioFormulario({
                                        ...usuarioFormulario,
                                        cargo: event.target.value,
                                    })}
                                    maxLength="100"
                                />
                            </label>
                            <label className="form-group">
                                <span>Área</span>
                                <input
                                    value={usuarioFormulario.area}
                                    onChange={(event) => setUsuarioFormulario({
                                        ...usuarioFormulario,
                                        area: event.target.value,
                                    })}
                                    maxLength="100"
                                />
                            </label>
                            <label className="form-group">
                                <span>Rol</span>
                                <select
                                    value={usuarioFormulario.rol}
                                    onChange={(event) => setUsuarioFormulario({
                                        ...usuarioFormulario,
                                        rol: event.target.value,
                                    })}
                                >
                                    <option value="">Sin rol</option>
                                    {roles.filter((rol) => rol.activo).map((rol) => (
                                        <option key={rol.id} value={rol.id}>{rol.nombre}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="form-group">
                                <span>{usuarioEditado ? "Nueva contraseña (opcional)" : "Contraseña inicial"}</span>
                                <input
                                    type="password"
                                    value={usuarioFormulario.password}
                                    onChange={(event) => setUsuarioFormulario({
                                        ...usuarioFormulario,
                                        password: event.target.value,
                                    })}
                                    required={!usuarioEditado}
                                    autoComplete="new-password"
                                />
                            </label>
                            {usuarioEditado && (
                                <label className="checkbox-label user-active-toggle">
                                    <input
                                        type="checkbox"
                                        checked={usuarioFormulario.is_active}
                                        onChange={(event) => setUsuarioFormulario({
                                            ...usuarioFormulario,
                                            is_active: event.target.checked,
                                        })}
                                    />
                                    <span>Usuario activo</span>
                                </label>
                            )}
                        </div>
                        <div className="admin-form-actions">
                            <button className="btn btn-primary" type="submit" disabled={guardando}>
                                {guardando ? "Guardando..." : usuarioEditado ? "Guardar cambios" : "Crear usuario"}
                            </button>
                            {usuarioEditado && (
                                <button
                                    className="btn btn-secondary"
                                    type="button"
                                    onClick={() => {
                                        setUsuarioEditado(null);
                                        setUsuarioFormulario(nuevoUsuario());
                                    }}
                                >
                                    Cancelar
                                </button>
                            )}
                        </div>
                    </form>

                    <section className="card admin-table-card">
                        <div className="card-header">
                            <h2>Usuarios del sistema</h2>
                            <p>Desactiva cuentas para retirarles el acceso sin borrar su historial.</p>
                        </div>
                        {cargando ? (
                            <div className="table-loading" role="status">
                                <span className="loading-spinner" />
                                <span>Cargando usuarios...</span>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Usuario</th>
                                            <th>Nombre</th>
                                            <th>Rol</th>
                                            <th>Estado</th>
                                            <th>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {usuarios.map((usuario) => (
                                            <tr key={usuario.id}>
                                                <td>{usuario.username}</td>
                                                <td>{`${usuario.first_name} ${usuario.last_name}`.trim() || "—"}</td>
                                                <td>{usuario.rol_nombre || "Sin rol"}</td>
                                                <td>{usuario.is_active ? "Activo" : "Inactivo"}</td>
                                                <td>
                                                    <div className="config-row-actions">
                                                        <button
                                                            className="text-button"
                                                            type="button"
                                                            onClick={() => editarUsuario(usuario)}
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            className="text-button"
                                                            type="button"
                                                            disabled={guardando || usuario.id === perfil.id}
                                                            onClick={() => cambiarEstadoUsuario(usuario)}
                                                        >
                                                            {usuario.is_active ? "Desactivar" : "Activar"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {!usuarios.length && (
                                            <tr><td colSpan="5">No hay usuarios registrados.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            ) : (
                <div className="user-admin-layout">
                    <form className="card admin-form" onSubmit={guardarRol}>
                        <div className="card-header">
                            <h2>{rolEditado ? "Editar rol" : "Crear rol"}</h2>
                            <p>Asigna permisos operativos por separado. La gestión de usuarios y roles permanece exclusiva de Administración.</p>
                        </div>
                        <div className="form-grid">
                            <label className="form-group">
                                <span>Nombre del rol</span>
                                <input
                                    value={rolFormulario.nombre}
                                    onChange={(event) => setRolFormulario({
                                        ...rolFormulario,
                                        nombre: event.target.value,
                                    })}
                                    required
                                    maxLength="50"
                                />
                            </label>
                            <label className="form-group">
                                <span>Descripción</span>
                                <input
                                    value={rolFormulario.descripcion}
                                    onChange={(event) => setRolFormulario({
                                        ...rolFormulario,
                                        descripcion: event.target.value,
                                    })}
                                />
                            </label>
                            {[
                                ["puede_ver_inventario", "Consultar inventario y panel"],
                                ["puede_modificar_inventario", "Crear, editar y desactivar activos"],
                                ["puede_administrar_catalogos", "Administrar catálogos de inventario"],
                                ["puede_ver_movimientos", "Consultar movimientos y solicitar préstamos"],
                                ["puede_ver_reportes", "Consultar reportes y exportaciones"],
                                ["puede_registrar_devoluciones", "Registrar devoluciones de herramientas"],
                                ["puede_revisar_solicitudes_prestamo", "Revisar checklist y generar PDF previo de solicitudes"],
                                ["puede_aprobar_solicitudes_prestamo", "Aprobar o rechazar solicitudes revisadas"],
                            ].map(([campo, etiqueta]) => (
                                <label className="checkbox-label permission-option" key={campo}>
                                    <input
                                        type="checkbox"
                                        checked={rolFormulario[campo]}
                                        disabled={rolFormulario.nombre.toLocaleLowerCase() === "administrador"}
                                        onChange={(event) => setRolFormulario({
                                            ...rolFormulario,
                                            [campo]: event.target.checked,
                                        })}
                                    />
                                    <span>{etiqueta}</span>
                                </label>
                            ))}
                        </div>
                        <div className="admin-form-actions">
                            <button className="btn btn-primary" type="submit" disabled={guardando}>
                                {guardando ? "Guardando..." : rolEditado ? "Guardar permisos" : "Crear rol"}
                            </button>
                            {rolEditado && (
                                <button
                                    className="btn btn-secondary"
                                    type="button"
                                    onClick={() => {
                                        setRolEditado(null);
                                        setRolFormulario(nuevoRol());
                                    }}
                                >
                                    Cancelar
                                </button>
                            )}
                        </div>
                    </form>

                    <section className="card admin-table-card">
                        <div className="card-header">
                            <h2>Roles y acceso de consulta</h2>
                            <p>El rol Administrador conserva siempre acceso completo.</p>
                        </div>
                        {cargando ? (
                            <div className="table-loading" role="status">
                                <span className="loading-spinner" />
                                <span>Cargando roles...</span>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Rol</th>
                                            <th>Inventario</th>
                                            <th>Movimientos</th>
                                            <th>Reportes</th>
                                            <th>Estado</th>
                                            <th>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {roles.map((rol) => (
                                            <tr key={rol.id}>
                                                <td>{rol.nombre}</td>
                                                <td>{rol.puede_ver_inventario ? "Sí" : "No"}</td>
                                                <td>{rol.puede_ver_movimientos ? "Sí" : "No"}</td>
                                                <td>{rol.puede_ver_reportes ? "Sí" : "No"}</td>
                                                <td>{rol.activo ? "Activo" : "Inactivo"}</td>
                                                <td>
                                                    <div className="config-row-actions">
                                                        <button
                                                            className="text-button"
                                                            type="button"
                                                            onClick={() => editarRol(rol)}
                                                        >
                                                            Editar
                                                        </button>
                                                        {rol.nombre.toLocaleLowerCase() !== "administrador" && (
                                                            <button
                                                                className="text-button"
                                                                type="button"
                                                                disabled={guardando}
                                                                onClick={() => cambiarEstadoRol(rol)}
                                                            >
                                                                {rol.activo ? "Desactivar" : "Activar"}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {!roles.length && (
                                            <tr><td colSpan="6">No hay roles configurados.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </section>
    );
}

export default Usuarios;
