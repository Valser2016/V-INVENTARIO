import React from "react";
import { QRCodeSVG } from "qrcode.react";

function EtiquetaQrActivo({ activo }) {
    return (
        <article className="asset-qr-label">
            <QRCodeSVG
                value={activo.codigo_interno}
                size={180}
                level="M"
                includeMargin
                aria-label={`Código QR ${activo.codigo_interno}`}
            />
            <strong>{activo.codigo_interno}</strong>
            <span>{activo.nombre}</span>
        </article>
    );
}

export default EtiquetaQrActivo;
