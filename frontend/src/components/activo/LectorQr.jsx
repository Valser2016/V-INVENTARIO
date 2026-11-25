import React, { useEffect, useRef, useState } from "react";

function LectorQr({ alLeerCodigo, alCerrar }) {
    const videoRef = useRef(null);
    const onScanRef = useRef(alLeerCodigo);
    const codigosLeidos = useRef(new Set());
    const [error, setError] = useState("");
    const [ultimoCodigo, setUltimoCodigo] = useState("");
    const [mensajeEscaneo, setMensajeEscaneo] = useState("");

    useEffect(() => {
        onScanRef.current = alLeerCodigo;
    }, [alLeerCodigo]);

    useEffect(() => {
        let cancelado = false;
        let controles;

        const iniciarEscaner = async () => {
            try {
                const { BrowserQRCodeReader } = await import("@zxing/browser");
                if (cancelado) {
                    return;
                }
                const lector = new BrowserQRCodeReader();
                controles = await lector.decodeFromConstraints(
                    { video: { facingMode: { ideal: "environment" } } },
                    videoRef.current,
                    (resultado) => {
                        if (!resultado) {
                            return;
                        }

                        const codigo = resultado.getText().trim();
                        if (!codigo || codigosLeidos.current.has(codigo)) {
                            return;
                        }

                        codigosLeidos.current.add(codigo);
                        setUltimoCodigo(codigo);
                        const mensaje = onScanRef.current(codigo);
                        if (typeof mensaje === "string") {
                            setMensajeEscaneo(mensaje);
                        }
                    },
                );
                if (cancelado) {
                    controles.stop();
                }
            } catch (errorInicio) {
                console.error("Error iniciando lector QR:", errorInicio);
                if (cancelado) {
                    return;
                }
                if (errorInicio.name === "NotAllowedError") {
                    setError("Permite el acceso a la cámara para leer códigos QR.");
                } else if (
                    errorInicio.name === "NotFoundError"
                    || errorInicio.name === "DevicesNotFoundError"
                ) {
                    setError("No se encontró una cámara disponible en este dispositivo.");
                } else {
                    setError(
                        "No se pudo iniciar la cámara. Revisa el permiso y que la aplicación use HTTPS.",
                    );
                }
            }
        };
        void iniciarEscaner();

        return () => {
            cancelado = true;
            controles?.stop();
        };
    }, []);

    return (
        <div className="qr-scanner-backdrop">
            <section
                className="card qr-scanner-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="qr-scanner-title"
            >
                <header className="qr-scanner-header">
                    <div>
                        <span className="eyebrow">ALISTAMIENTO</span>
                        <h2 id="qr-scanner-title">Leer códigos QR</h2>
                    </div>
                    <button className="btn btn-secondary" type="button" onClick={alCerrar}>
                        Cerrar
                    </button>
                </header>
                <p className="form-hint">
                    Apunta la cámara al código de cada herramienta. Los activos disponibles
                    se agregarán automáticamente a la solicitud.
                </p>
                <video
                    ref={videoRef}
                    className="qr-scanner-video"
                    aria-label="Vista de la cámara para leer el código QR"
                    autoPlay
                    muted
                    playsInline
                />
                {error && <p className="alert alert-error" role="alert">{error}</p>}
                {ultimoCodigo && (
                    <p className="qr-scanner-last-code" role="status">
                        {mensajeEscaneo || <>Último código leído: <strong>{ultimoCodigo}</strong></>}
                    </p>
                )}
            </section>
        </div>
    );
}

export default LectorQr;
