import React, { useEffect, useState } from "react";
import api from "../../services/api";

function FotoActivo({ url, alt }) {
    const [imagenCargada, setImagenCargada] = useState(null);

    useEffect(() => {
        let cancelado = false;
        let objectUrl = "";

        if (!url) {
            return () => {
                cancelado = true;
            };
        }

        api.get(url, { responseType: "blob" })
            .then(({ data }) => {
                if (!cancelado) {
                    objectUrl = URL.createObjectURL(data);
                    setImagenCargada({ url, src: objectUrl });
                }
            })
            .catch((requestError) => {
                console.error("Error cargando foto del activo:", requestError);
                if (!cancelado) {
                    setImagenCargada({ url, error: true });
                }
            });

        return () => {
            cancelado = true;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [url]);

    if (imagenCargada && imagenCargada.url === url && imagenCargada.src) {
        return <img className="asset-photo" src={imagenCargada.src} alt={alt} />;
    }

    return (
        <span className="asset-photo-placeholder" role="status">
            {!url
                ? "Sin foto"
                : imagenCargada?.url !== url
                    ? "Cargando foto..."
                    : "Foto no disponible"}
        </span>
    );
}

export default FotoActivo;
