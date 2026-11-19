import React, { useEffect, useState } from "react";
import api from "../services/api";
import { SessionContext } from "./SessionContext";

function SessionProvider({ children }) {
    const [perfil, setPerfil] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelado = false;
        api.get("/usuarios/perfil/")
            .then(({ data }) => {
                if (!cancelado) {
                    setPerfil(data);
                }
            })
            .catch((requestError) => {
                console.error("Error cargando permisos del usuario:", requestError);
                if (!cancelado) {
                    setError("No fue posible consultar los permisos del usuario.");
                }
            })
            .finally(() => {
                if (!cancelado) {
                    setCargando(false);
                }
            });

        return () => {
            cancelado = true;
        };
    }, []);

    return (
        <SessionContext.Provider value={{ perfil, cargando, error }}>
            {children}
        </SessionContext.Provider>
    );
}

export default SessionProvider;
