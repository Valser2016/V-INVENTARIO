import React from "react";

export function CampoFormulario({ id, label, required = false, children }) {
    return (
        <div className="form-group">
            <label htmlFor={id}>
                {label}
                {required && <span>*</span>}
            </label>
            {children}
        </div>
    );
}

function SeccionFormulario({ icono, titulo, descripcion, children, grid = true }) {
    return (
        <section className="card">
            <div className="card-header">
                <div className="section-icon">{icono}</div>
                <div>
                    <h2>{titulo}</h2>
                    <p>{descripcion}</p>
                </div>
            </div>
            <div className={grid ? "form-grid" : undefined}>{children}</div>
        </section>
    );
}

export function SeccionClasificacion({ formulario, tipos, categorias, cambiarCampo }) {
    return (
        <SeccionFormulario
            icono="▦"
            titulo="Clasificación"
            descripcion="Define el tipo y categoría del activo."
        >
            <CampoFormulario id="tipo_activo" label="Tipo de activo" required>
                <select
                    id="tipo_activo"
                    value={formulario.tipo_activo}
                    onChange={(e) => cambiarCampo("tipo_activo", e.target.value)}
                >
                    <option value="">Selecciona un tipo</option>
                    {tipos.map((tipo) => (
                        <option key={tipo.id} value={tipo.id}>
                            {tipo.nombre}
                        </option>
                    ))}
                </select>
            </CampoFormulario>

            <CampoFormulario id="categoria" label="Categoría" required>
                <select
                    id="categoria"
                    value={formulario.categoria}
                    onChange={(e) => cambiarCampo("categoria", e.target.value)}
                    disabled={!formulario.tipo_activo}
                >
                    <option value="">
                        {formulario.tipo_activo
                            ? "Selecciona una categoría"
                            : "Selecciona primero el tipo"}
                    </option>
                    {categorias.map((categoria) => (
                        <option key={categoria.id} value={categoria.id}>
                            {categoria.nombre}
                        </option>
                    ))}
                </select>
            </CampoFormulario>

            <CampoFormulario
                id="modalidad_control"
                label="Modalidad de control"
                required
            >
                <select
                    id="modalidad_control"
                    value={formulario.modalidad_control}
                    onChange={(e) =>
                        cambiarCampo("modalidad_control", e.target.value)
                    }
                >
                    <option value="INDIVIDUAL">Individual</option>
                    <option value="CONJUNTO">Conjunto</option>
                </select>
            </CampoFormulario>
        </SeccionFormulario>
    );
}

export function SeccionInformacion({ formulario, cambiarCampo }) {
    const campos = [
        {
            id: "nombre",
            label: "Nombre",
            required: true,
            placeholder: "Ej. Manómetro",
        },
        { id: "marca", label: "Marca", placeholder: "Ej. WIKA" },
        { id: "modelo", label: "Modelo", placeholder: "Ej. 232.50" },
        {
            id: "serie_codigo",
            label: "Serie / código del fabricante",
            placeholder: "Ej. ABC-001",
        },
        {
            id: "fecha_adquisicion",
            label: "Fecha de adquisición",
            type: "date",
        },
        {
            id: "proveedor",
            label: "Proveedor",
            placeholder: "Nombre del proveedor",
        },
        {
            id: "vida_util",
            label: "Vida útil",
            placeholder: "Ej. 10 años",
        },
        {
            id: "valor",
            label: "Valor",
            type: "number",
            min: "0",
            placeholder: "Ej. 1500000",
        },
    ];

    return (
        <SeccionFormulario
            icono="◉"
            titulo="Información del activo"
            descripcion="Ingresa los datos de identificación del equipo."
        >
            {campos.map(({ id, label, required, ...inputProps }) => (
                <CampoFormulario
                    key={id}
                    id={id}
                    label={label}
                    required={required}
                >
                    <input
                        id={id}
                        {...inputProps}
                        value={formulario[id]}
                        onChange={(e) => cambiarCampo(id, e.target.value)}
                    />
                </CampoFormulario>
            ))}
        </SeccionFormulario>
    );
}

export function SeccionControl({
    formulario,
    ubicaciones,
    estados,
    usuarios,
    cambiarCampo,
}) {
    return (
        <SeccionFormulario
            icono="⚙"
            titulo="Control del activo"
            descripcion="Define dónde se encuentra y quién es responsable."
        >
            <CampoFormulario id="ubicacion" label="Ubicación" required>
                <select
                    id="ubicacion"
                    value={formulario.ubicacion}
                    onChange={(e) => cambiarCampo("ubicacion", e.target.value)}
                >
                    <option value="">Selecciona una ubicación</option>
                    {ubicaciones.map((ubicacion) => (
                        <option key={ubicacion.id} value={ubicacion.id}>
                            {ubicacion.nombre}
                        </option>
                    ))}
                </select>
            </CampoFormulario>

            <CampoFormulario id="estado" label="Estado" required>
                <select
                    id="estado"
                    value={formulario.estado}
                    onChange={(e) => cambiarCampo("estado", e.target.value)}
                >
                    <option value="">Selecciona un estado</option>
                    {estados.map((estado) => (
                        <option key={estado.id} value={estado.id}>
                            {estado.nombre}
                        </option>
                    ))}
                </select>
            </CampoFormulario>

            <CampoFormulario id="responsable" label="Responsable">
                <select
                    id="responsable"
                    value={formulario.responsable}
                    onChange={(e) => cambiarCampo("responsable", e.target.value)}
                >
                    <option value="">Sin responsable</option>
                    {usuarios.map((usuario) => (
                        <option key={usuario.id} value={usuario.id}>
                            {usuario.nombre_completo}
                        </option>
                    ))}
                </select>
            </CampoFormulario>

            <div className="form-group checkbox-group">
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={formulario.cuenta_con_manual}
                        onChange={(e) =>
                            cambiarCampo("cuenta_con_manual", e.target.checked)
                        }
                    />
                    <span>El activo cuenta con manual</span>
                </label>
            </div>
        </SeccionFormulario>
    );
}

export function SeccionObservaciones({ formulario, cambiarCampo }) {
    return (
        <SeccionFormulario
            icono="✧"
            titulo="Observaciones"
            descripcion="Información adicional del activo."
            grid={false}
        >
            <CampoFormulario id="observaciones" label="Observaciones">
                <textarea
                    id="observaciones"
                    rows="4"
                    placeholder="Escribe aquí cualquier información adicional..."
                    value={formulario.observaciones}
                    onChange={(e) =>
                        cambiarCampo("observaciones", e.target.value)
                    }
                />
            </CampoFormulario>
        </SeccionFormulario>
    );
}
