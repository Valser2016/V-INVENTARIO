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
