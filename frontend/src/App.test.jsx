import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import App from "./App";
import api, { blacklistRefreshToken } from "./services/api";

vi.mock("./services/api", () => ({
    blacklistRefreshToken: vi.fn(),
    default: {
        post: vi.fn(),
        get: vi.fn(),
    },
}));

const mockApi = vi.mocked(api);
const perfilAdmin = {
    id: 1,
    username: "admin",
    nombre_completo: "Admin de prueba",
    rol_nombre: "Administrador",
    es_administrador: true,
    permisos: {
        puede_ver_inventario: true,
        puede_ver_movimientos: true,
        puede_ver_reportes: true,
        puede_registrar_devoluciones: true,
    },
};
const conPerfil = (resolver) => (url, ...args) => {
    if (url === "/usuarios/perfil/") {
        return Promise.resolve({ data: perfilAdmin });
    }
    return resolver(url, ...args);
};

const renderApp = (initialEntries = ["/"]) => render(
    <MemoryRouter initialEntries={initialEntries}>
        <App />
    </MemoryRouter>
);

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockApi.get.mockReset().mockImplementation(conPerfil(() => Promise.resolve({
        data: { total: 0, disponibles: 0, prestados: 0, obsoletos: 0 },
    })));
    mockApi.post.mockReset();
    vi.mocked(blacklistRefreshToken).mockReset();
});

afterEach(() => {
    cleanup();
});

describe("Autenticación y navegación", () => {
    it("inicia sesión y redirige al dashboard", async () => {
        const user = userEvent.setup();
        mockApi.post.mockResolvedValue({
            data: { access: "access-token", refresh: "refresh-token" },
        });

        renderApp(["/login"]);

        await user.type(screen.getByLabelText("Usuario"), "admin");
        await user.type(screen.getByLabelText("Contraseña"), "Password123!");
        await user.click(screen.getByRole("button", { name: "Ingresar" }));

        await waitFor(() => {
            expect(localStorage.getItem("access_token")).toBe("access-token");
            expect(localStorage.getItem("refresh_token")).toBe("refresh-token");
        });

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "Bienvenido a VALSER Activos" })).toBeInTheDocument();
        });
    });

    it("redirige a login cuando el usuario no está autenticado", () => {
        renderApp(["/"]);

        expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    });

    it("mantiene al usuario autenticado en una ruta protegida", async () => {
        localStorage.setItem("access_token", "token-valido");

        renderApp(["/"]);

        expect(await screen.findByRole("heading", {
            name: "Bienvenido a VALSER Activos",
        })).toBeInTheDocument();
    });

    it("muestra el panel a usuarios con permiso de inventario y movimientos", async () => {
        localStorage.setItem("access_token", "token-valido");
        mockApi.get.mockImplementation((url) => {
            if (url === "/usuarios/perfil/") {
                return Promise.resolve({
                    data: {
                        ...perfilAdmin,
                        es_administrador: false,
                        rol_nombre: "Técnico",
                        permisos: {
                            puede_ver_inventario: true,
                            puede_ver_movimientos: true,
                            puede_ver_reportes: false,
                        },
                    },
                });
            }
            if (url === "/levantamiento/activos/resumen/") {
                return Promise.resolve({
                    data: { total: 0, disponibles: 0, prestados: 0, obsoletos: 0 },
                });
            }
            return Promise.reject(new Error(`URL no esperada: ${url}`));
        });

        renderApp(["/"]);

        expect(await screen.findByRole("heading", {
            name: "Bienvenido a VALSER Activos",
        })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Solicitudes" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Inventario" })).toBeInTheDocument();
    });

    it("muestra al rol Inventario los accesos operativos sin Usuarios y permisos", async () => {
        localStorage.setItem("access_token", "token-valido");
        mockApi.get.mockImplementation((url) => {
            if (url === "/usuarios/perfil/") {
                return Promise.resolve({
                    data: {
                        ...perfilAdmin,
                        es_administrador: false,
                        rol_nombre: "Inventario",
                        permisos: {
                            puede_ver_inventario: true,
                            puede_ver_movimientos: true,
                            puede_modificar_inventario: true,
                            puede_administrar_catalogos: true,
                            puede_aprobar_solicitudes_prestamo: true,
                        },
                    },
                });
            }
            if (url === "/levantamiento/activos/resumen/") {
                return Promise.resolve({
                    data: { total: 0, disponibles: 0, prestados: 0, obsoletos: 0 },
                });
            }
            return Promise.reject(new Error(`URL no esperada: ${url}`));
        });

        renderApp(["/"]);

        expect(await screen.findByRole("heading", {
            name: "Bienvenido a VALSER Activos",
        })).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: /Registrar activo/ })).not.toHaveLength(0);
        expect(screen.getByRole("link", { name: "Catálogos" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Usuarios y permisos" })).not.toBeInTheDocument();
    });

    it("dirige a Almacén al checklist y no habilita nuevas solicitudes de préstamo", async () => {
        localStorage.setItem("access_token", "token-valido");
        const user = userEvent.setup();
        mockApi.get.mockImplementation((url) => {
            if (url === "/usuarios/perfil/") {
                return Promise.resolve({
                    data: {
                        ...perfilAdmin,
                        es_administrador: false,
                        rol_nombre: "Almacén",
                        permisos: {
                            puede_ver_inventario: false,
                            puede_ver_movimientos: false,
                            puede_ver_reportes: false,
                            puede_registrar_devoluciones: true,
                            puede_revisar_solicitudes_prestamo: true,
                        },
                    },
                });
            }
            if (url === "/movimientos/solicitudes-prestamo/") {
                return Promise.resolve({ data: [] });
            }
            return Promise.reject(new Error(`URL no esperada: ${url}`));
        });

        renderApp(["/"]);

        expect(await screen.findByRole("heading", {
            name: "Solicitudes de préstamo",
        })).toBeInTheDocument();
        await user.click(screen.getByRole("button", {
            name: "Solicitudes por aprobar",
        }));
        expect(screen.getByRole("heading", {
            name: "Solicitudes por aprobar",
        })).toBeInTheDocument();
        expect(screen.queryByRole("button", {
            name: "Enviar solicitud",
        })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Solicitudes" })).toBeInTheDocument();
    });

    it("dirige a devoluciones al inicio para el rol de almacén", async () => {
        localStorage.setItem("access_token", "token-valido");
        mockApi.get.mockImplementation((url) => {
            if (url === "/usuarios/perfil/") {
                return Promise.resolve({
                    data: {
                        ...perfilAdmin,
                        es_administrador: false,
                        rol_nombre: "Almacén",
                        permisos: {
                            puede_ver_inventario: false,
                            puede_ver_movimientos: false,
                            puede_ver_reportes: false,
                            puede_registrar_devoluciones: true,
                        },
                    },
                });
            }
            if (url === "/movimientos/prestamos/") {
                return Promise.resolve({
                    data: [{
                        id: 12,
                        nombre_receptor: "Ana Colaboradora",
                        documento_receptor: "123456",
                        fecha_devolucion_prevista: "2026-11-20",
                        activos_pendientes: 1,
                        detalles: [{
                            id: 30,
                            activo_id: 8,
                            codigo_interno: "PC-008",
                            nombre_activo: "Portátil de pruebas",
                            ubicacion_al_prestar: 4,
                            fecha_devolucion: null,
                        }],
                    }],
                });
            }
            if (url === "/levantamiento/estados/") {
                return Promise.resolve({ data: [{ id: 1, nombre: "Disponible" }] });
            }
            if (url === "/levantamiento/ubicaciones/") {
                return Promise.resolve({ data: [{ id: 4, nombre: "Bodega" }] });
            }
            return Promise.reject(new Error(`URL no esperada: ${url}`));
        });

        renderApp(["/"]);

        expect(await screen.findByRole("button", {
            name: "Revisar devolución",
        })).toBeInTheDocument();
        expect(screen.getByRole("link", {
            name: "Devoluciones",
        })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Solicitudes" })).not.toBeInTheDocument();
    });

    it("muestra cifras reales del resumen en el dashboard", async () => {
        localStorage.setItem("access_token", "token-valido");
        mockApi.get.mockImplementation(conPerfil(() => Promise.resolve({
            data: { total: 12, disponibles: 8, prestados: 3, obsoletos: 1 },
        })));

        renderApp(["/"]);

        expect(await screen.findByText("Total de activos: 12")).toBeInTheDocument();
        expect(screen.getByText("Disponibles: 8")).toBeInTheDocument();
        expect(screen.getByText("Prestados: 3")).toBeInTheDocument();
        expect(screen.getByText("Obsoletos: 1")).toBeInTheDocument();
        expect(mockApi.get).toHaveBeenCalledWith(
            "/levantamiento/activos/resumen/"
        );
    });

    it("muestra los activos y permite paginar el listado", async () => {
        localStorage.setItem("access_token", "token-valido");
        mockApi.get.mockImplementation(conPerfil((url) => {
            if (url === "/levantamiento/activos/?page=1") {
                return Promise.resolve({
                    data: {
                        count: 26,
                        next: "http://testserver/levantamiento/activos/?page=2",
                        previous: null,
                        results: [{
                            id: 1,
                            codigo_interno: "PC-001",
                            nombre: "Computador de prueba",
                            tipo_activo_nombre: "Computador",
                            categoria_nombre: "Portátil",
                            ubicacion_nombre: "Oficina",
                            estado_nombre: "Disponible",
                        }],
                    },
                });
            }
            if (url === "/levantamiento/activos/?page=2") {
                return Promise.resolve({
                    data: {
                        count: 26,
                        next: null,
                        previous: "http://testserver/levantamiento/activos/?page=1",
                        results: [],
                    },
                });
            }
            return Promise.reject(new Error(`URL no esperada: ${url}`));
        }));

        const user = userEvent.setup();
        renderApp(["/activos"]);

        expect(await screen.findByText("Computador de prueba")).toBeInTheDocument();
        expect(screen.getByText("PC-001")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Siguiente" }));

        await waitFor(() => {
            expect(mockApi.get).toHaveBeenCalledWith(
                "/levantamiento/activos/?page=2"
            );
        });
        expect(await screen.findByText("Página 2 de 2")).toBeInTheDocument();
    });

    it("muestra un error cuando las credenciales son incorrectas", async () => {
        const user = userEvent.setup();
        mockApi.post.mockRejectedValue({
            response: { status: 401 },
        });

        renderApp(["/login"]);

        await user.type(screen.getByLabelText("Usuario"), "admin");
        await user.type(screen.getByLabelText("Contraseña"), "password-incorrecta");
        await user.click(screen.getByRole("button", { name: "Ingresar" }));

        expect(await screen.findByText("Usuario o contraseña incorrectos.")).toBeInTheDocument();
    });

    it("carga los datos iniciales de NuevoActivo desde la API", async () => {
        const _user = userEvent.setup();
        localStorage.setItem("access_token", "token-valido");
        mockApi.get.mockImplementation(conPerfil((url) => {
            if (url === "/levantamiento/tipos/") {
                return Promise.resolve({ data: [{ id: 1, nombre: "Computador" }] });
            }
            if (url === "/levantamiento/estados/") {
                return Promise.resolve({ data: [{ id: 1, nombre: "Disponible" }] });
            }
            if (url === "/levantamiento/ubicaciones/") {
                return Promise.resolve({ data: [{ id: 1, nombre: "Oficina" }] });
            }
            if (url === "/levantamiento/usuarios/") {
                return Promise.resolve({ data: [{ id: 1, username: "responsable" }] });
            }
            return Promise.reject(new Error(`URL no esperada: ${url}`));
        }));

        renderApp(["/activos/nuevo"]);

        await waitFor(() => {
            expect(mockApi.get).toHaveBeenCalledWith("/levantamiento/tipos/");
        });

        expect(await screen.findByRole("heading", { name: "Nuevo activo" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Guardar activo" })).toBeInTheDocument();
    });

    it("cierra sesión y redirige al login", async () => {
        const _user = userEvent.setup();
        localStorage.setItem("access_token", "token-valido");
        localStorage.setItem("refresh_token", "refresh-token");
        vi.mocked(blacklistRefreshToken).mockResolvedValue({});

        renderApp(["/"]);

        await _user.click(screen.getByRole("button", { name: /cerrar sesión/i }));

        await waitFor(() => {
            expect(blacklistRefreshToken).toHaveBeenCalledWith("refresh-token");
        });
        expect(localStorage.getItem("access_token")).toBeNull();
        expect(localStorage.getItem("refresh_token")).toBeNull();
        expect(await screen.findByRole("heading", {
            name: "Iniciar sesión",
        })).toBeInTheDocument();
    });

    it("redirige al login cuando el token expira", async () => {
        localStorage.setItem("access_token", "token-expirado");

        renderApp(["/activos/nuevo"]);

        window.dispatchEvent(new CustomEvent("auth:expired"));

        await waitFor(() => {
            expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
        });
    });
});
