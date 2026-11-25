import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "../services/api";
import Reportes from "./Reportes";

vi.mock("../services/api", () => ({
    default: {
        get: vi.fn(),
    },
}));

const inventario = {
    resumen: { total: 1, disponibles: 1, prestados: 0, obsoletos: 0 },
    distribucion: {
        estados: [{ "estado__nombre": "Disponible", total: 1 }],
        categorias: [{ "categoria__nombre": "Portátil", total: 1 }],
        ubicaciones: [{ "ubicacion__nombre": "Bodega", total: 1 }],
    },
    resultados: [{
        codigo: "PC-001",
        activo: "Portátil de pruebas",
        categoria: "Portátil",
        estado: "Disponible",
        ubicacion: "Bodega",
    }],
};

beforeEach(() => {
    vi.mocked(api.get).mockReset().mockImplementation((url) => Promise.resolve({
        data: url === "/reportes/inventario/" ? inventario : [],
    }));
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("Reportes", () => {
    it("muestra el resumen y permite filtrar el inventario", async () => {
        const user = userEvent.setup();
        render(<Reportes />);

        expect(await screen.findByText("Portátil de pruebas")).toBeInTheDocument();
        expect(screen.getByText("Total de activos")).toBeInTheDocument();
        await user.type(
            screen.getByLabelText("Buscar por código, nombre o serie"),
            "PC-001",
        );
        await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

        await waitFor(() => {
            expect(api.get).toHaveBeenLastCalledWith(
                "/reportes/inventario/",
                { params: { q: "PC-001" } },
            );
        });
    });

    it("cambia al reporte de vencimientos", async () => {
        const user = userEvent.setup();
        render(<Reportes />);

        await user.click(await screen.findByRole("button", { name: "Vencimientos" }));

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith("/reportes/vencimientos/", { params: {} });
        });
    });

    it("muestra préstamos y descarga los formatos de salida y devolución", async () => {
        const pdfSalida = new Blob(["pdf salida"], { type: "application/pdf" });
        const pdfRetorno = new Blob(["pdf retorno"], { type: "application/pdf" });
        vi.stubGlobal("URL", {
            createObjectURL: vi.fn(() => "blob:prestamo"),
            revokeObjectURL: vi.fn(),
        });
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        vi.mocked(api.get).mockImplementation((url) => Promise.resolve({
            data: url === "/reportes/prestamos/" ? {
                count: 1,
                next: null,
                previous: null,
                results: [{
                    id: 12,
                    nombre_receptor: "Ana Pérez",
                    documento_receptor: "12345",
                    fecha_prestamo: "2026-11-20",
                    fecha_devolucion_prevista: "2026-11-30",
                    estado: "Vigente",
                    total_activos: 1,
                    activos_pendientes: 1,
                    formato_salida_disponible: true,
                    formato_retorno_disponible: true,
                    detalles: [{ codigo_interno: "PC-001" }],
                }],
            } : url === "/reportes/prestamos/12/listado-herramientas/"
                ? pdfSalida
                : url === "/reportes/prestamos/12/formato-retorno/"
                    ? pdfRetorno
                    : [],
        }));
        const user = userEvent.setup();
        render(<Reportes />);

        await user.click(await screen.findByRole("button", { name: "Préstamos" }));

        expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
        expect(screen.getByText("PC-001")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {
            name: "Descargar listado de herramientas del préstamo 12",
        }));

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(
                "/reportes/prestamos/12/listado-herramientas/",
                { responseType: "blob" },
            );
        });
        expect(click).toHaveBeenCalled();

        await user.click(screen.getByRole("button", {
            name: "Descargar formato de devolución del préstamo 12",
        }));

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(
                "/reportes/prestamos/12/formato-retorno/",
                { responseType: "blob" },
            );
        });
    });

    it("solicita y descarga el reporte en Excel", async () => {
        vi.stubGlobal("URL", {
            createObjectURL: vi.fn(() => "blob:reporte"),
            revokeObjectURL: vi.fn(),
        });
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        const user = userEvent.setup();
        render(<Reportes />);

        await user.click(await screen.findByRole("button", { name: "Exportar Excel" }));

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(
                "/reportes/exportar/inventario/xlsx/",
                { params: {}, responseType: "blob" },
            );
        });
        expect(click).toHaveBeenCalled();
    });
});
