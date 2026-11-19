import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Configuracion from "./Configuracion";
import api from "../services/api";

vi.mock("../services/api", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
    },
}));

const mockApi = vi.mocked(api);
const renderConfiguracion = () => render(
    <MemoryRouter>
        <Configuracion />
    </MemoryRouter>
);

beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: [] });
});

afterEach(() => {
    cleanup();
});

describe("Configuración de catálogos", () => {
    it("crea un tipo de activo y lo muestra en el catálogo", async () => {
        const user = userEvent.setup();
        const tipoNuevo = {
            id: 1,
            nombre: "Mobiliario",
            descripcion: "Muebles de oficina",
            activo: true,
        };
        mockApi.post.mockResolvedValue({ data: tipoNuevo });

        renderConfiguracion();

        await user.type(await screen.findByLabelText(/Nombre/), "Mobiliario");
        await user.type(screen.getByLabelText("Descripción"), "Muebles de oficina");
        await user.click(screen.getByRole("button", { name: "Crear tipo" }));

        expect(mockApi.post).toHaveBeenCalledWith(
            "/levantamiento/configuracion/tipos/",
            { nombre: "Mobiliario", descripcion: "Muebles de oficina" }
        );
        expect(await screen.findByText("El registro de tipo se creó correctamente.")).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: "Mobiliario" })).toBeInTheDocument();
    });

    it("desactiva un registro sin borrarlo", async () => {
        const user = userEvent.setup();
        const tipo = { id: 3, nombre: "Computadores", descripcion: "", activo: true };
        mockApi.get.mockResolvedValue({ data: [tipo] });
        mockApi.patch.mockResolvedValue({
            data: { ...tipo, activo: false },
        });

        renderConfiguracion();
        await screen.findByRole("cell", { name: "Computadores" });
        await user.click(screen.getByRole("button", { name: "Desactivar" }));

        expect(mockApi.patch).toHaveBeenCalledWith(
            "/levantamiento/configuracion/tipos/3/",
            { activo: false }
        );
        expect(await screen.findByText("Inactivo")).toBeInTheDocument();
    });

    it("carga los tipos para asociarlos a una categoría", async () => {
        const user = userEvent.setup();
        mockApi.get.mockImplementation((url) => {
            if (url === "/levantamiento/configuracion/categorias/") {
                return Promise.resolve({ data: [] });
            }
            if (url === "/levantamiento/configuracion/tipos/") {
                return Promise.resolve({
                    data: [{ id: 7, nombre: "Herramientas", activo: true }],
                });
            }
            return Promise.reject(new Error(`URL no esperada: ${url}`));
        });

        renderConfiguracion();
        await user.click(screen.getByRole("button", { name: "Categorías" }));

        expect(await screen.findByRole("option", { name: "Herramientas" })).toBeInTheDocument();
        expect(mockApi.get).toHaveBeenCalledWith("/levantamiento/configuracion/categorias/");
        await waitFor(() => {
            expect(mockApi.get).toHaveBeenCalledWith("/levantamiento/configuracion/tipos/");
        });
    });
});
