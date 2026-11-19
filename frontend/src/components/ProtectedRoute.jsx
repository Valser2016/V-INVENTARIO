import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

function ProtectedRoute({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(
        Boolean(localStorage.getItem("access_token"))
    );

    useEffect(() => {
        const handleSessionExpired = () => {
            setIsAuthenticated(false);
        };

        window.addEventListener("auth:expired", handleSessionExpired);

        return () => {
            window.removeEventListener("auth:expired", handleSessionExpired);
        };
    }, []);

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return children;
}

export default ProtectedRoute;