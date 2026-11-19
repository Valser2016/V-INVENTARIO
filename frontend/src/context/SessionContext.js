import { createContext, useContext } from "react";

export const SessionContext = createContext({
    perfil: null,
    cargando: true,
    error: "",
});

export function useSession() {
    return useContext(SessionContext);
}
