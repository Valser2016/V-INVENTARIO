import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

function Login() {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [enviando, setEnviando] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setEnviando(true);

        try {
            const response = await api.post("/auth/token/", { username, password });
            const { access, refresh } = response.data;

            localStorage.setItem("access_token", access);
            localStorage.setItem("refresh_token", refresh);
            navigate("/");
        } catch {
            setError("Usuario o contraseña incorrectos.");
        } finally {
            setEnviando(false);
        }
    };

    return (
        <main className="login-page">
            <section className="login-showcase" aria-label="VALSER Activos">
                <div className="login-brand">
                    <img
                        src="/valser-logo.png"
                        alt="Válvulas y Servicios Industriales S.A.S."
                    />
                </div>
                <div className="showcase-content">
                    <span className="eyebrow">CONTROL · ORDEN · CONFIANZA</span>
                    <h1>Todo tu inventario, en un solo lugar.</h1>
                    <p>
                        Administra, consulta y mantén el control de los activos
                        de tu organización de forma sencilla.
                    </p>
                    <div className="showcase-decoration" aria-hidden="true">
                        <div className="decoration-orbit orbit-one" />
                        <div className="decoration-orbit orbit-two" />
                        <div className="decoration-card">
                            <span className="decoration-icon">▦</span>
                            <span>
                                <strong>Inventario organizado</strong>
                                <small>Información clara y accesible</small>
                            </span>
                            <span className="decoration-check">✓</span>
                        </div>
                    </div>
                </div>
                <span className="showcase-footer">VALSER · Sistema de gestión</span>
            </section>

            <section className="login-panel">
                <div className="login-form-wrap">
                    <img
                        className="login-mobile-logo"
                        src="/valser-logo.png"
                        alt="Válvulas y Servicios Industriales S.A.S."
                    />
                    <span className="eyebrow login-eyebrow">BIENVENIDO DE NUEVO</span>
                    <h2>Iniciar sesión</h2>
                    <p className="login-intro">
                        Ingresa tus credenciales para acceder a tu espacio de trabajo.
                    </p>

                    <form className="login-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="username">Usuario</label>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                autoComplete="username"
                                placeholder="Escribe tu usuario"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="password">Contraseña</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                placeholder="Escribe tu contraseña"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        {error && (
                            <div className="login-error" role="alert">
                                <span aria-hidden="true">!</span>
                                <p>{error}</p>
                            </div>
                        )}

                        <button className="login-submit" type="submit" disabled={enviando}>
                            {enviando ? "Ingresando..." : "Ingresar"}
                            {!enviando && <span aria-hidden="true">→</span>}
                        </button>
                    </form>

                    <p className="login-note">
                        ¿Problemas para ingresar? Comunícate con el administrador
                        del sistema.
                    </p>
                </div>
                <footer className="login-footer">
                    <span>© {new Date().getFullYear()} VALSER</span>
                    <span>Acceso seguro</span>
                </footer>
            </section>
        </main>
    );
}

export default Login;
