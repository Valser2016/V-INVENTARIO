import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "../services/api";
import { SessionContext } from "../context/SessionContext";
import SolicitudesPrestamo from "./SolicitudesPrestamo";

vi.mock("../services/api", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock("../components/activo/LectorQr", () => ({
    default: ({ alLeerCodigo, alCerrar }) => (
        <div role="dialog" aria-label="Lector QR de prueba">
            <button type="button" onClick={() => alLeerCodigo("pc-008")}>
                Simular lectura de PC-008
            </button>
            <button type="button" onClick={() => alLeerCodigo("NO-EXISTE")}>
                Simular lectura de un código no disponible
            </button>
            <button type="button" onClick={alCerrar}>Cerrar lector</button>
        </div>
    ),
}));

const activo = {
    id: 8,
    codigo_interno: "PC-008",
    nombre: "Portátil de pruebas",
    tipo_activo_id: 1,
    tipo_activo_nombre: "Herramienta",
    categoria_id: 2,
    categoria_nombre: "Portátiles",
    ubicacion_id: 3,
    estado_nombre: "Disponible",
    ubicacion_nombre: "Bodega",
    activo: true,
};
const activoSecundario = {
    ...activo,
    id: 9,
    codigo_interno: "PC-009",
    nombre: "Portátil adicional",
    tipo_activo_id: 2,
    tipo_activo_nombre: "Instrumento",
    categoria_id: 4,
    categoria_nombre: "Herramientas",
    ubicacion_id: 4,
    ubicacion_nombre: "Taller",
};

const solicitud = {
    id: 12,
    solicitante_nombre: "Técnico de pruebas",
    solicitante_usuario: "tecnico",
    nombre_receptor: "Técnico de pruebas",
    documento_receptor: "654321",
    fecha_devolucion_prevista: "2026-11-25",
    motivo: "Trabajo en planta",
    observaciones: "",
    activos: [{
        id: activo.id,
        codigo_interno: activo.codigo_interno,
        nombre: activo.nombre,
    }],
    estado: "PENDIENTE",
    estado_nombre: "Pendiente",
    fecha_solicitud: "2026-11-17T10:00:00-05:00",
    observaciones_resolucion: "",
    prestamo_id: null,
};

const prepararRespuestas = (
    solicitudes = [],
    listas = [],
    activosDisponibles = [activo],
    activosDeLista = [activo],
) => {
    vi.mocked(api.get).mockImplementation((url) => {
        if (url === "/movimientos/solicitudes-prestamo/") {
            return Promise.resolve({ data: solicitudes });
        }
        if (url === "/movimientos/listas-herramientas/activos/") {
            return Promise.resolve({ data: activosDeLista });
        }
        if (url === "/movimientos/listas-herramientas/") {
            return Promise.resolve({ data: listas });
        }
        if (url === "/movimientos/activos-disponibles/") {
            return Promise.resolve({ data: activosDisponibles });
        }
        return Promise.reject(new Error(`URL no esperada: ${url}`));
    });
};

const renderPage = (administrador = false, permisosAdicionales = {}) => render(
    <SessionContext.Provider value={{
        perfil: {
            es_administrador: administrador,
            nombre_completo: administrador ? "Administración" : "Técnico de pruebas",
            permisos: {
                puede_ver_movimientos: true,
                ...permisosAdicionales,
            },
        },
        cargando: false,
        error: "",
    }}>
        <MemoryRouter>
            <SolicitudesPrestamo />
        </MemoryRouter>
    </SessionContext.Provider>,
);

const abrirSolicitudes = async (user, titulo = "Mis solicitudes") => {
    await user.click(await screen.findByRole("button", { name: titulo }));
};

const completarDatosSolicitud = (datos = {}) => {
    fireEvent.change(screen.getByLabelText("Cliente"), {
        target: { value: datos.cliente || "Acme Industrial" },
    });
    fireEvent.change(screen.getByLabelText("Consecutivo del servicio"), {
        target: { value: datos.consecutivo || "OS-1001" },
    });
    fireEvent.change(screen.getByLabelText("Nombre del colaborador"), {
        target: { value: datos.colaborador || "Técnico de pruebas" },
    });
    fireEvent.change(screen.getByLabelText("Documento"), {
        target: { value: datos.documento || "654321" },
    });
    fireEvent.change(screen.getByLabelText("¿Para qué necesitas los activos?"), {
        target: { value: datos.motivo || "Trabajo en planta" },
    });
};

const avanzarASeleccionHerramientas = async (user) => {
    await user.click(screen.getByRole("button", {
        name: "Continuar a herramientas",
    }));
};

const avanzarAConfirmacion = async (user) => {
    await user.click(screen.getByRole("button", { name: "Revisar solicitud" }));
};

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset().mockResolvedValue({ data: {} });
    vi.mocked(api.patch).mockReset().mockResolvedValue({ data: {} });
    vi.mocked(api.delete).mockReset().mockResolvedValue({ data: {} });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("Solicitudes de préstamo", () => {
    it("mantiene las secciones plegadas hasta que se pulsan sus botones", async () => {
        prepararRespuestas([solicitud]);
        const user = userEvent.setup();
        renderPage();

        const botonNuevaSolicitud = screen.getByRole("button", {
            name: "Nueva solicitud",
        });
        const botonMisSolicitudes = screen.getByRole("button", {
            name: "Mis solicitudes",
        });
        expect(botonNuevaSolicitud).toHaveAttribute("aria-expanded", "false");
        expect(botonMisSolicitudes).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByLabelText("Cliente")).not.toBeInTheDocument();
        expect(screen.queryByText("SOLICITUD #12")).not.toBeInTheDocument();

        await user.click(botonNuevaSolicitud);
        expect(screen.getByLabelText("Cliente")).toBeInTheDocument();
        expect(screen.getByRole("button", {
            name: "Adicionar consumibles",
        })).toBeVisible();
        await user.click(botonMisSolicitudes);
        expect(await screen.findByText("SOLICITUD #12")).toBeInTheDocument();
    });

    it("permite al técnico solicitar activos y consumibles sin registrar un préstamo", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        expect(screen.queryByLabelText("Cliente")).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Nueva solicitud" }));
        completarDatosSolicitud();
        await user.click(screen.getByRole("button", {
            name: "Adicionar consumibles",
        }));
        await user.type(
            screen.getByLabelText("Nombre del consumible"),
            "Cinta aislante",
        );
        await user.clear(screen.getByLabelText("Cantidad solicitada"));
        await user.type(screen.getByLabelText("Cantidad solicitada"), "2");
        await avanzarASeleccionHerramientas(user);
        await user.click(screen.getByLabelText(/PC-008 — Portátil de pruebas/));
        await avanzarAConfirmacion(user);
        expect(screen.getByLabelText("Confirmación de la solicitud")).toHaveTextContent(
            "PC-008 — Portátil de pruebas",
        );
        await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/solicitudes-prestamo/",
                expect.objectContaining({
                    cliente: "Acme Industrial",
                    consecutivo: "OS-1001",
                    nombre_receptor: "Técnico de pruebas",
                    documento_receptor: "654321",
                    motivo: "Trabajo en planta",
                    activos: [8],
                    consumibles: [{
                        nombre: "Cinta aislante",
                        cantidad: "2",
                    }],
                }),
            );
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Tu solicitud fue enviada a revisión.",
        );
        expect(await screen.findByRole("button", {
            name: "Mis solicitudes",
        })).toHaveAttribute("aria-expanded", "true");
    });

    it("requiere una herramienta o consumible antes de confirmar", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await user.click(screen.getByRole("button", { name: "Nueva solicitud" }));
        completarDatosSolicitud();
        await avanzarASeleccionHerramientas(user);
        await avanzarAConfirmacion(user);

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Selecciona al menos una herramienta o agrega un consumible.",
        );
        expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();

        await user.click(screen.getByLabelText(/PC-008 — Portátil de pruebas/));
        await avanzarAConfirmacion(user);
        expect(screen.getByLabelText("Confirmación de la solicitud")).toHaveTextContent(
            "PC-008 — Portátil de pruebas",
        );
    });

    it("agrega a la solicitud la herramienta disponible leída por QR", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await user.click(screen.getByRole("button", { name: "Nueva solicitud" }));
        completarDatosSolicitud();
        await avanzarASeleccionHerramientas(user);
        await user.click(await screen.findByRole("button", {
            name: "Leer QR con cámara",
        }));
        await user.click(screen.getByRole("button", {
            name: "Simular lectura de PC-008",
        }));

        expect(screen.getByLabelText(/PC-008 — Portátil de pruebas/)).toBeChecked();
        expect(screen.getByRole("status")).toHaveTextContent(
            "PC-008 se agregó a la solicitud.",
        );
    });

    it("rechaza códigos QR que no son herramientas disponibles", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await user.click(screen.getByRole("button", { name: "Nueva solicitud" }));
        completarDatosSolicitud();
        await avanzarASeleccionHerramientas(user);
        await user.click(await screen.findByRole("button", {
            name: "Leer QR con cámara",
        }));
        await user.click(screen.getByRole("button", {
            name: "Simular lectura de un código no disponible",
        }));

        expect(screen.getByRole("status")).toHaveTextContent(
            "El código NO-EXISTE no corresponde a una herramienta disponible para préstamo.",
        );
        expect(screen.getByLabelText(/PC-008 — Portátil de pruebas/)).not.toBeChecked();
    });

    it("permite al administrador crear una solicitud para luego revisarla y aprobarla", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage(true);

        await user.click(await screen.findByRole("button", {
            name: "Nueva solicitud",
        }));
        completarDatosSolicitud({
            consecutivo: "OS-1003",
            colaborador: "Administración",
        });
        await user.click(screen.getByRole("button", {
            name: "Adicionar consumibles",
        }));
        await user.type(
            screen.getByLabelText("Nombre del consumible"),
            "Cinta aislante",
        );
        await user.clear(screen.getByLabelText("Cantidad solicitada"));
        await user.type(screen.getByLabelText("Cantidad solicitada"), "2");
        await avanzarASeleccionHerramientas(user);
        await user.click(screen.getByLabelText(/PC-008 — Portátil de pruebas/));
        await avanzarAConfirmacion(user);
        await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/solicitudes-prestamo/",
                expect.objectContaining({
                    cliente: "Acme Industrial",
                    consecutivo: "OS-1003",
                    nombre_receptor: "Administración",
                    activos: [8],
                    consumibles: [{
                        nombre: "Cinta aislante",
                        cantidad: "2",
                    }],
                }),
            );
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "La solicitud se registró. Completa el checklist y apruébala para registrar el préstamo.",
        );
    });

    it("permite enviar una solicitud únicamente con consumibles", async () => {
        prepararRespuestas([], [], [], []);
        const user = userEvent.setup();
        renderPage();

        await user.click(screen.getByRole("button", { name: "Nueva solicitud" }));
        completarDatosSolicitud({
            consecutivo: "OS-1004",
            colaborador: "Técnico",
        });
        await user.click(screen.getByRole("button", {
            name: "Adicionar consumibles",
        }));
        await user.type(
            screen.getByLabelText("Nombre del consumible"),
            "Guantes de nitrilo",
        );
        await user.clear(screen.getByLabelText("Cantidad solicitada"));
        await user.type(screen.getByLabelText("Cantidad solicitada"), "3");
        await avanzarASeleccionHerramientas(user);
        await avanzarAConfirmacion(user);
        await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/solicitudes-prestamo/",
                expect.objectContaining({
                    activos: [],
                    consumibles: [{
                        nombre: "Guantes de nitrilo",
                        cantidad: "3",
                    }],
                }),
            );
        });
    });

    it("preselecciona los activos disponibles de una lista y permite agregar otros", async () => {
        prepararRespuestas(
            [],
            [{ id: 5, nombre: "Válvulas de seguridad", activos: [8, 99] }],
            [activo, activoSecundario],
            [activo, activoSecundario],
        );
        const user = userEvent.setup();
        renderPage();
        await user.click(screen.getByRole("button", { name: "Nueva solicitud" }));
        completarDatosSolicitud({
            consecutivo: "OS-1002",
            colaborador: "Técnico",
        });
        await avanzarASeleccionHerramientas(user);
        await user.click(screen.getByLabelText("Listado predeterminado"));
        await user.selectOptions(
            screen.getByLabelText("Selecciona un listado"),
            "5",
        );

        expect(screen.getByLabelText(/PC-008 — Portátil de pruebas/)).toBeChecked();
        expect(screen.getByRole("status")).toHaveTextContent(
            "1 herramienta(s) de esta lista no están disponibles",
        );
        await user.click(screen.getByLabelText(/PC-009 — Portátil adicional/));
        expect(screen.getByLabelText(/PC-009 — Portátil adicional/)).toBeChecked();
        await avanzarAConfirmacion(user);
        await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/solicitudes-prestamo/",
                expect.objectContaining({ activos: [8, 9] }),
            );
        });
    });

    it("permite buscar y filtrar los activos de selección individual", async () => {
        prepararRespuestas([], [], [activo, activoSecundario]);
        const user = userEvent.setup();
        renderPage();
        await user.click(screen.getByRole("button", { name: "Nueva solicitud" }));

        await user.type(screen.getByLabelText("Buscar por código o nombre"), "PC-009");
        expect(screen.queryByLabelText(/PC-008 — Portátil de pruebas/)).not.toBeInTheDocument();
        expect(screen.getByLabelText(/PC-009 — Portátil adicional/)).toBeInTheDocument();

        await user.clear(screen.getByLabelText("Buscar por código o nombre"));
        await user.selectOptions(screen.getByLabelText("Tipo"), "1");
        expect(screen.getByLabelText(/PC-008 — Portátil de pruebas/)).toBeInTheDocument();
        expect(screen.queryByLabelText(/PC-009 — Portátil adicional/)).not.toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText("Tipo"), "");
        await user.selectOptions(screen.getByLabelText("Ubicación"), "3");
        expect(screen.getByLabelText(/PC-008 — Portátil de pruebas/)).toBeInTheDocument();
        expect(screen.queryByLabelText(/PC-009 — Portátil adicional/)).not.toBeInTheDocument();
    });

    it("permite a Almacén crear listas predeterminadas de herramientas", async () => {
        prepararRespuestas([], [], [activo], [activo]);
        const user = userEvent.setup();
        renderPage(false, { puede_administrar_catalogos: true });

        await user.click(screen.getByRole("button", {
            name: "Administrar listas predeterminadas",
        }));
        await user.type(
            screen.getByLabelText("Nombre de la lista"),
            "Kit de válvulas",
        );
        await user.click(screen.getByLabelText(/PC-008 — Portátil de pruebas/));
        await user.click(screen.getByRole("button", { name: "Crear lista" }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/listas-herramientas/",
                { nombre: "Kit de válvulas", activos: [8] },
            );
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Se creó la lista de herramientas.",
        );
    });

    it("permite al administrador aprobar y convertir la solicitud en préstamo", async () => {
        prepararRespuestas([{
            ...solicitud,
            estado: "REVISADA",
            estado_nombre: "Revisada",
            activos: [{
                ...solicitud.activos[0],
                condicion: "BUENO",
                incluir_en_salida: true,
            }],
        }]);
        const user = userEvent.setup();
        renderPage(true);

        await abrirSolicitudes(user, "Solicitudes por aprobar");
        await user.click(await screen.findByRole("button", {
            name: "Aprobar y registrar préstamo",
        }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/solicitudes-prestamo/12/aprobar/",
                {},
            );
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Solicitud aprobada y préstamo registrado.",
        );
    });

    it("mantiene solo solicitudes pendientes en la cola y separa el historial resuelto", async () => {
        prepararRespuestas([
            {
                ...solicitud,
                id: 21,
                nombre_receptor: "Solicitud pendiente",
            },
            {
                ...solicitud,
                id: 22,
                nombre_receptor: "Solicitud revisada",
                estado: "REVISADA",
                estado_nombre: "Revisada",
            },
            {
                ...solicitud,
                id: 23,
                nombre_receptor: "Solicitud aprobada",
                estado: "APROBADA",
                estado_nombre: "Aprobada",
            },
            {
                ...solicitud,
                id: 24,
                nombre_receptor: "Solicitud rechazada",
                estado: "RECHAZADA",
                estado_nombre: "Rechazada",
            },
        ]);
        const user = userEvent.setup();
        renderPage(true);

        await abrirSolicitudes(user, "Solicitudes por aprobar");

        expect(await screen.findByText("SOLICITUD #21")).toBeInTheDocument();
        expect(screen.getByText("SOLICITUD #22")).toBeInTheDocument();
        expect(screen.queryByText("SOLICITUD #23")).not.toBeInTheDocument();
        expect(screen.queryByText("SOLICITUD #24")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {
            name: "Historial de solicitudes resueltas (2)",
        }));
        expect(screen.getByText("SOLICITUD #23")).toBeInTheDocument();
        expect(screen.getByText("SOLICITUD #24")).toBeInTheDocument();
    });

    it("permite aprobar al rol autorizado sin permitir eliminar solicitudes", async () => {
        prepararRespuestas([{
            ...solicitud,
            estado: "REVISADA",
            estado_nombre: "Revisada",
            activos: [{
                ...solicitud.activos[0],
                condicion: "BUENO",
                incluir_en_salida: true,
            }],
        }]);
        const user = userEvent.setup();
        renderPage(false, {
            puede_ver_movimientos: false,
            puede_aprobar_solicitudes_prestamo: true,
        });

        await abrirSolicitudes(user, "Solicitudes por aprobar");
        await user.click(await screen.findByRole("button", {
            name: "Aprobar y registrar préstamo",
        }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/solicitudes-prestamo/12/aprobar/",
                {},
            );
        });
        expect(screen.queryByRole("button", {
            name: "Eliminar solicitud",
        })).not.toBeInTheDocument();
    });

    it("permite a Almacén aprobar solicitudes revisadas", async () => {
        prepararRespuestas([{
            ...solicitud,
            estado: "REVISADA",
            estado_nombre: "Revisada",
            activos: [{
                ...solicitud.activos[0],
                condicion: "BUENO",
                incluir_en_salida: true,
            }],
        }]);
        const user = userEvent.setup();
        renderPage(false, {
            puede_ver_movimientos: false,
            puede_revisar_solicitudes_prestamo: true,
        });

        await abrirSolicitudes(user, "Solicitudes por aprobar");
        await user.click(await screen.findByRole("button", {
            name: "Aprobar y registrar préstamo",
        }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/solicitudes-prestamo/12/aprobar/",
                {},
            );
        });
        expect(screen.queryByRole("button", {
            name: "Rechazar solicitud",
        })).not.toBeInTheDocument();
    });

    it("permite a Almacén validar y aprobar una solicitud solo de consumibles", async () => {
        let solicitudActual = {
            ...solicitud,
            activos: [],
            consumibles: [{ id: 31, nombre: "Guantes de nitrilo", cantidad: 3 }],
        };
        vi.mocked(api.get).mockImplementation((url) => {
            if (url === "/movimientos/solicitudes-prestamo/") {
                return Promise.resolve({ data: [solicitudActual] });
            }
            return Promise.reject(new Error(`URL no esperada: ${url}`));
        });
        vi.mocked(api.post).mockImplementation((url) => {
            if (url.endsWith("/revisar/")) {
                solicitudActual = {
                    ...solicitudActual,
                    estado: "REVISADA",
                    estado_nombre: "Revisada",
                };
            } else if (url.endsWith("/aprobar/")) {
                solicitudActual = {
                    ...solicitudActual,
                    estado: "APROBADA",
                    estado_nombre: "Aprobada",
                    prestamo_id: 44,
                };
            }
            return Promise.resolve({ data: solicitudActual });
        });
        const user = userEvent.setup();
        renderPage(false, {
            puede_ver_movimientos: false,
            puede_revisar_solicitudes_prestamo: true,
        });

        await abrirSolicitudes(user, "Solicitudes por aprobar");
        expect(await screen.findByText("Guantes de nitrilo (3)")).toBeInTheDocument();
        await user.click(await screen.findByRole("button", {
            name: "Validar y enviar a aprobación",
        }));

        await user.click(await screen.findByRole("button", {
            name: "Aprobar y registrar préstamo",
        }));

        expect(api.post).toHaveBeenNthCalledWith(
            1,
            "/movimientos/solicitudes-prestamo/12/revisar/",
            { detalles: [] },
        );
        expect(api.post).toHaveBeenNthCalledWith(
            2,
            "/movimientos/solicitudes-prestamo/12/aprobar/",
            {},
        );
    });

    it("permite a Almacén completar el checklist y generar el PDF previo", async () => {
        prepararRespuestas([solicitud]);
        const user = userEvent.setup();
        renderPage(false, {
            puede_ver_movimientos: false,
            puede_revisar_solicitudes_prestamo: true,
        });

        await abrirSolicitudes(user, "Solicitudes por aprobar");
        const estado = await screen.findByLabelText("Estado físico PC-008");
        expect(estado).toHaveValue("BUENO");
        await user.click(screen.getByRole("button", {
            name: "Guardar checklist y generar PDF previo",
        }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/solicitudes-prestamo/12/revisar/",
                {
                    detalles: [{
                        activo_id: 8,
                        condicion: "BUENO",
                        observacion: "",
                        incluir_en_salida: true,
                    }],
                },
            );
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Checklist guardado y PDF previo generado.",
        );
    });

    it("permite al administrador eliminar una solicitud y su préstamo vinculado", async () => {
        prepararRespuestas([{
            ...solicitud,
            estado: "APROBADA",
            estado_nombre: "Aprobada",
            prestamo_id: 44,
        }]);
        vi.spyOn(window, "confirm").mockReturnValue(true);
        const user = userEvent.setup();
        renderPage(true);

        await abrirSolicitudes(user, "Solicitudes por aprobar");
        await user.click(await screen.findByRole("button", {
            name: "Historial de solicitudes resueltas (1)",
        }));
        await user.click(await screen.findByRole("button", {
            name: "Eliminar solicitud y préstamo",
        }));

        await waitFor(() => {
            expect(api.delete).toHaveBeenCalledWith(
                "/movimientos/solicitudes-prestamo/12/",
            );
        });
        expect(window.confirm).toHaveBeenCalledWith(
            expect.stringContaining("préstamo #44"),
        );
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Se eliminaron la solicitud y el préstamo asociado.",
        );
    });

    it("no permite a un técnico eliminar una solicitud", async () => {
        prepararRespuestas([solicitud]);
        const user = userEvent.setup();
        renderPage();

        await abrirSolicitudes(user);
        await screen.findByText("SOLICITUD #12");
        expect(screen.queryByRole("button", {
            name: "Eliminar solicitud",
        })).not.toBeInTheDocument();
    });

    it("no muestra eliminación de solicitudes al rol de Almacén", async () => {
        prepararRespuestas([solicitud]);
        const user = userEvent.setup();
        renderPage(false, {
            puede_ver_movimientos: false,
            puede_revisar_solicitudes_prestamo: true,
        });

        await abrirSolicitudes(user, "Solicitudes por aprobar");
        await screen.findByText("SOLICITUD #12");
        expect(screen.getByRole("button", {
            name: "Guardar checklist y generar PDF previo",
        })).toBeInTheDocument();
        expect(screen.queryByRole("button", {
            name: "Eliminar solicitud",
        })).not.toBeInTheDocument();
    });

    it("exige un motivo al administrador para rechazar una solicitud", async () => {
        prepararRespuestas([solicitud]);
        const user = userEvent.setup();
        renderPage(true);

        await abrirSolicitudes(user, "Solicitudes por aprobar");
        await user.click(await screen.findByRole("button", {
            name: "Rechazar solicitud",
        }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Indica el motivo antes de rechazar la solicitud.",
        );
        expect(api.post).not.toHaveBeenCalled();
    });
});
