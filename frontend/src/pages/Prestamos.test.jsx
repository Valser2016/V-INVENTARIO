import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "../services/api";
import Prestamos from "./Prestamos";
import { SessionContext } from "../context/SessionContext";

vi.mock("../services/api", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
    },
}));

const activos = [{
    id: 8,
    codigo_interno: "PC-008",
    nombre: "Portátil de pruebas",
    estado_nombre: "Disponible",
    ubicacion_nombre: "Bodega",
}];
const estados = [
    { id: 1, nombre: "Disponible" },
    { id: 2, nombre: "Prestado" },
    { id: 3, nombre: "En reparación" },
    { id: 6, nombre: "En servicio" },
];
const ubicaciones = [
    { id: 4, nombre: "Bodega" },
    { id: 5, nombre: "Taller" },
];

const prepararRespuestas = (prestamos = []) => {
    vi.mocked(api.get).mockImplementation((url) => {
        if (url === "/movimientos/prestamos/") {
            return Promise.resolve({ data: prestamos });
        }
        if (url === "/movimientos/activos-disponibles/") {
            return Promise.resolve({ data: activos });
        }
        if (url === "/levantamiento/estados/") {
            return Promise.resolve({ data: estados });
        }
        if (url === "/levantamiento/ubicaciones/") {
            return Promise.resolve({ data: ubicaciones });
        }
        if (url.endsWith("/formato-retorno/")) {
            return Promise.resolve({ data: new Blob(["%PDF-test"]) });
        }
        return Promise.reject(new Error(`URL no esperada: ${url}`));
    });
};

const renderPage = (props = {}, perfil = { es_administrador: true }) => render(
    <SessionContext.Provider value={{
        perfil,
        cargando: false,
        error: "",
    }}>
        <MemoryRouter>
            <Prestamos {...props} />
        </MemoryRouter>
    </SessionContext.Provider>,
);

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset().mockResolvedValue({ data: {} });
    vi.mocked(api.delete).mockReset().mockResolvedValue({ data: {} });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("Préstamos y devoluciones", () => {
    it("envía una solicitud solo de consumibles sin registrar el préstamo todavía", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await user.type(await screen.findByLabelText("Nombre del colaborador"), "Ana");
        await user.type(screen.getByLabelText("Cliente"), "Acme Industrial");
        await user.type(screen.getByLabelText("Consecutivo del servicio"), "OS-1002");
        await user.type(screen.getByLabelText("Documento"), "123456");
        await user.type(
            screen.getByLabelText("¿Para qué necesitas los activos o consumibles?"),
            "Trabajo en planta",
        );
        await user.click(screen.getByRole("button", { name: "Adicionar consumibles" }));
        await user.type(screen.getByLabelText("Nombre del consumible"), "Cinta aislante");
        await user.clear(screen.getByLabelText("Cantidad solicitada"));
        await user.type(screen.getByLabelText("Cantidad solicitada"), "5");
        await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/solicitudes-prestamo/",
                expect.objectContaining({
                    cliente: "Acme Industrial",
                    consecutivo: "OS-1002",
                    nombre_receptor: "Ana",
                    documento_receptor: "123456",
                    motivo: "Trabajo en planta",
                    activos: [],
                    consumibles: [{ nombre: "Cinta aislante", cantidad: "5" }],
                }),
            );
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "La solicitud quedó pendiente de checklist y aprobación.",
        );
    });

    it("registra la cantidad recibida de los consumibles en la devolución", async () => {
        prepararRespuestas([{
            id: 20,
            nombre_receptor: "Ana Colaboradora",
            estado: "Vigente",
            total_activos: 0,
            activos_pendientes: 0,
            total_herramientas: 1,
            items_pendientes: 1,
            detalles: [],
            consumibles: [{
                id: 45,
                nombre: "Cinta aislante",
                cantidad: 5,
                cantidad_recibida: null,
            }],
        }]);
        const user = userEvent.setup();
        renderPage({ devoluciones: true });

        await user.type(
            await screen.findByLabelText("Cantidad recibida Cinta aislante"),
            "3",
        );
        await user.click(screen.getByRole("button", { name: "Revisar devolución" }));
        expect(await screen.findByText("Revisar devolución")).toBeInTheDocument();
        expect(screen.getByText("Cinta aislante")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {
            name: "Confirmar y registrar devolución",
        }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/prestamos/20/devolver/",
                {
                    detalles: [],
                    consumibles: [{
                        consumible_id: 45,
                        cantidad_recibida: 3,
                    }],
                },
            );
        });
    });

    it("envía los activos como solicitud pendiente de aprobación", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await user.type(
            await screen.findByLabelText("Nombre del colaborador"),
            "Ana Colaboradora",
        );
        await user.type(screen.getByLabelText("Cliente"), "Acme Industrial");
        await user.type(
            screen.getByLabelText("Consecutivo del servicio"),
            "OS-1001",
        );
        await user.type(screen.getByLabelText("Documento"), "123456");
        await user.type(
            screen.getByLabelText("¿Para qué necesitas los activos o consumibles?"),
            "Trabajo en planta",
        );
        await user.click(screen.getByLabelText(/PC-008 — Portátil de pruebas/));
        await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/solicitudes-prestamo/",
                expect.objectContaining({
                    cliente: "Acme Industrial",
                    consecutivo: "OS-1001",
                    nombre_receptor: "Ana Colaboradora",
                    documento_receptor: "123456",
                    motivo: "Trabajo en planta",
                    activos: [8],
                }),
            );
        });
    });

    it("permite al administrador eliminar el historial de un préstamo", async () => {
        prepararRespuestas([{
            id: 12,
            nombre_receptor: "Ana Colaboradora",
            documento_receptor: "123456",
            fecha_devolucion_prevista: "2026-11-20",
            estado: "Vigente",
            total_activos: 1,
            activos_pendientes: 1,
            detalles: [],
        }]);
        vi.spyOn(window, "confirm").mockReturnValue(true);
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", {
            name: "Eliminar préstamo #12",
        }));

        await waitFor(() => {
            expect(api.delete).toHaveBeenCalledWith("/movimientos/prestamos/12/");
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Se eliminó el préstamo y su historial asociado.",
        );
    });

    it("no muestra eliminación de préstamos al rol de Almacén", async () => {
        prepararRespuestas([{
            id: 12,
            nombre_receptor: "Ana Colaboradora",
            documento_receptor: "123456",
            fecha_devolucion_prevista: "2026-11-20",
            estado: "Vigente",
            total_activos: 1,
            activos_pendientes: 1,
            detalles: [],
        }]);
        renderPage(
            {},
            {
                es_administrador: false,
                permisos: {
                    puede_ver_movimientos: true,
                    puede_registrar_devoluciones: true,
                    puede_revisar_solicitudes_prestamo: true,
                },
            },
        );

        await screen.findByText("Ana Colaboradora");
        expect(screen.queryByRole("button", {
            name: "Eliminar préstamo #12",
        })).not.toBeInTheDocument();
    });

    it("permite devolver un activo y excluye ambos estados de préstamo", async () => {
        prepararRespuestas([{
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
        }]);
        const user = userEvent.setup();
        renderPage({ devoluciones: true });

        const casillaDevolucion = await screen.findByLabelText(
            "Incluir devolución PC-008",
        );
        expect(casillaDevolucion).toBeChecked();
        expect(screen.getByLabelText("Estado físico PC-008")).toHaveValue("BUENO");
        await user.selectOptions(
            screen.getByLabelText("Estado físico PC-008"),
            "CON_NOVEDAD",
        );
        await user.selectOptions(
            screen.getByLabelText("Estado al devolver PC-008"),
            "3",
        );
        await user.selectOptions(
            screen.getByLabelText("Ubicación al devolver PC-008"),
            "5",
        );
        await user.type(
            screen.getByLabelText("Observación PC-008"),
            "Rayón en la carcasa",
        );
        expect(screen.getByRole("columnheader", { name: "Estado físico" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Incluir devolución" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Observación" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Prestado" })).not.toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "En servicio" })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Revisar devolución" }));
        expect(api.post).not.toHaveBeenCalled();
        expect(await screen.findByRole("heading", {
            name: "Revisar devolución",
        })).toBeInTheDocument();
        expect(screen.getByText("Con novedad")).toBeInTheDocument();
        expect(screen.getByText("En reparación · Taller")).toBeInTheDocument();
        expect(screen.getByText("Rayón en la carcasa")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {
            name: "Confirmar y registrar devolución",
        }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/prestamos/12/devolver/",
                {
                    detalles: [{
                        detalle_id: 30,
                        estado: 3,
                        ubicacion: 5,
                        condicion: "CON_NOVEDAD",
                        observacion: "Rayón en la carcasa",
                    }],
                },
            );
        });
    });

    it("permite al rol de almacén registrar devoluciones sin crear préstamos", async () => {
        prepararRespuestas([{
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
        }]);
        const user = userEvent.setup();
        renderPage(
            { devoluciones: true },
            {
                es_administrador: false,
                permisos: {
                    puede_ver_movimientos: false,
                    puede_registrar_devoluciones: true,
                },
            },
        );

        expect(await screen.findByRole("link", {
            name: "Registrar devoluciones",
        })).toBeInTheDocument();
        expect(await screen.findByLabelText(
            "Incluir devolución PC-008",
        )).toBeChecked();
        await user.click(screen.getByRole("button", { name: "Revisar devolución" }));
        await user.click(screen.getByRole("button", {
            name: "Confirmar y registrar devolución",
        }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/movimientos/prestamos/12/devolver/",
                {
                    detalles: [{
                        detalle_id: 30,
                        estado: 1,
                        ubicacion: 4,
                        condicion: "BUENO",
                        observacion: "",
                    }],
                },
            );
        });
    });

    it("descarga el PDF actualizado al devolver el último activo", async () => {
        prepararRespuestas([{
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
        }]);
        vi.mocked(api.post).mockResolvedValueOnce({
            data: {
                estado: "Devuelto",
                formato_retorno_disponible: true,
            },
        });
        vi.stubGlobal("URL", {
            createObjectURL: vi.fn(() => "blob:retorno"),
            revokeObjectURL: vi.fn(),
        });
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        const user = userEvent.setup();
        renderPage({ devoluciones: true });

        expect(await screen.findByLabelText(
            "Incluir devolución PC-008",
        )).toBeChecked();
        await user.click(screen.getByRole("button", { name: "Revisar devolución" }));
        await user.click(screen.getByRole("button", {
            name: "Confirmar y registrar devolución",
        }));

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(
                "/movimientos/prestamos/12/formato-retorno/",
                { responseType: "blob" },
            );
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Se descargó el PDF actualizado.",
        );
    });

    it("permite a Almacén descargar el PDF desde préstamos recientes", async () => {
        prepararRespuestas([{
            id: 12,
            nombre_receptor: "Ana Colaboradora",
            estado: "Devuelto",
            total_activos: 1,
            activos_pendientes: 0,
            formato_retorno_disponible: true,
            detalles: [],
        }]);
        vi.stubGlobal("URL", {
            createObjectURL: vi.fn(() => "blob:retorno"),
            revokeObjectURL: vi.fn(),
        });
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        const user = userEvent.setup();
        renderPage({}, {
            es_administrador: false,
            permisos: {
                puede_ver_movimientos: true,
                puede_registrar_devoluciones: true,
            },
        });

        await user.click(await screen.findByRole("button", {
            name: "Descargar PDF de devolución préstamo #12",
        }));

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(
                "/movimientos/prestamos/12/formato-retorno/",
                { responseType: "blob" },
            );
        });
    });

    it("no muestra préstamos devueltos en la ventana de Devoluciones", async () => {
        prepararRespuestas([{
            id: 12,
            nombre_receptor: "Ana Colaboradora",
            estado: "Devuelto",
            total_activos: 1,
            activos_pendientes: 0,
            formato_retorno_disponible: true,
            detalles: [],
        }]);
        renderPage(
            { devoluciones: true },
            {
                es_administrador: false,
                permisos: {
                    puede_ver_movimientos: false,
                    puede_registrar_devoluciones: true,
                },
            },
        );

        expect(await screen.findByText("No hay devoluciones pendientes")).toBeInTheDocument();
        expect(screen.queryByRole("heading", {
            name: "Préstamos devueltos",
        })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {
            name: "Descargar PDF de devolución préstamo #12",
        })).not.toBeInTheDocument();
    });
});
