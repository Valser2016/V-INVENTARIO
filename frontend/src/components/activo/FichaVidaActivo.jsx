import React from "react";
import EtiquetaQrActivo from "./EtiquetaQrActivo";
import FotoActivo from "./FotoActivo";

const mostrarFecha = (fecha) => {
    if (!fecha) return "No registrada";
    return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO");
};

const mostrarValor = (valor) => {
    if (valor === null || valor === undefined || valor === "") return "No registrado";
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 2,
    }).format(Number(valor));
};

function FichaVidaActivo({
    activo,
    alCerrar,
    alDescargar,
    descargando,
    alImprimirQr,
}) {
    const campos = [
        ["Nombre", activo.nombre],
        ["Tipo de activo", activo.tipo_activo_nombre],
        ["Categoría", activo.categoria_nombre],
        ["Modalidad de control", activo.modalidad_control === "CONJUNTO" ? "Conjunto" : "Individual"],
        ["Marca", activo.marca],
        ["Modelo", activo.modelo],
        ["Serie / código", activo.serie_codigo],
        ["Fecha de adquisición", mostrarFecha(activo.fecha_adquisicion)],
        ["Proveedor", activo.proveedor],
        ["Vida útil", activo.vida_util],
        ["Ubicación", activo.ubicacion_nombre],
        ["Estado", activo.estado_nombre],
        ["Responsable", activo.responsable_nombre],
        ["Cuenta con manual", activo.cuenta_con_manual ? "Sí" : "No"],
        ["Valor", mostrarValor(activo.valor)],
        ["Observaciones", activo.observaciones],
    ];

    return (
        <div className="asset-sheet-backdrop">
            <section
                className="asset-sheet card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="asset-sheet-title"
            >
                <header className="asset-sheet-header">
                    <div>
                        <span className="eyebrow">{activo.codigo_interno}</span>
                        <h2 id="asset-sheet-title">Hoja de vida del activo</h2>
                    </div>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={alCerrar}
                    >
                        Cerrar
                    </button>
                </header>
                <div className="asset-sheet-body">
                    <div className="asset-sheet-photo">
                        <FotoActivo
                            url={activo.foto_url}
                            alt={`Foto de ${activo.codigo_interno}`}
                        />
                    </div>
                    <dl className="asset-sheet-fields">
                        {campos.map(([etiqueta, valor]) => (
                            <div key={etiqueta}>
                                <dt>{etiqueta}</dt>
                                <dd>{valor || "No registrado"}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
                <div className="asset-sheet-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={alImprimirQr}
                    >
                        Imprimir QR
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={descargando}
                        onClick={alDescargar}
                    >
                        {descargando ? "Generando Excel..." : "Descargar OYS-FO-11"}
                    </button>
                </div>
                <div className="asset-qr-print">
                    <EtiquetaQrActivo activo={activo} />
                </div>
            </section>
        </div>
    );
}

export default FichaVidaActivo;
