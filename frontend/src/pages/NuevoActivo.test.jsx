import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NuevoActivo from "./NuevoActivo";
import api from "../services/api";

vi.mock("../services/api", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

const mockApi = vi.mocked(api);

const prepararFormulario = async () => {
    const user = userEvent.setup();

    mockApi.get.mockImplementation((url) => {
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
            return Promise.resolve({ data: [] });
        }
        if (url === "/levantamiento/categorias/?tipo_activo=1") {
            return Promise.resolve({ data: [{ id: 1, nombre: "Informática" }] });
        }
        return Promise.reject(new Error(`URL no esperada: ${url}`));
    });

    const view = render(
        <MemoryRouter>
            <NuevoActivo />
        </MemoryRouter>
    );

    await screen.findByRole("heading", { name: "Nuevo activo" });

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "1");
    await screen.findByRole("option", { name: "Informática" });
    await user.selectOptions(selects[1], "1");
    await user.type(screen.getByPlaceholderText("Ej. Manómetro"), "Equipo de prueba");
    await user.selectOptions(selects[3], "1");
    await user.selectOptions(selects[4], "1");

    return { ...view, user };
};

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

describe("NuevoActivo", () => {
    it("guarda el activo, muestra el código y limpia el formulario", async () => {
        const { user } = await prepararFormulario();
        mockApi.post.mockResolvedValue({
            data: { codigo_interno: "PC-001" },
        });

        await user.click(screen.getByRole("button", { name: "Guardar activo" }));

        expect(await screen.findByText("Activo creado correctamente. Código: PC-001")).toBeInTheDocument();
        expect(mockApi.post).toHaveBeenCalledWith(
            "/levantamiento/activos/",
            expect.objectContaining({
                tipo_activo: 1,
                categoria: 1,
                nombre: "Equipo de prueba",
                ubicacion: 1,
                estado: 1,
                fecha_adquisicion: null,
                responsable: null,
                valor: null,
            })
        );
        expect(screen.getByPlaceholderText("Ej. Manómetro")).toHaveValue("");
    });

    it("envía null cuando la fecha de adquisición está vacía", async () => {
        const { user, container } = await prepararFormulario();
        const fecha = container.querySelector('input[type="date"]');
        expect(fecha.value).toBe("");
        mockApi.post.mockResolvedValue({
            data: { codigo_interno: "VAL-001" },
        });

        await user.click(screen.getByRole("button", { name: "Guardar activo" }));

        await waitFor(() => {
            expect(mockApi.post).toHaveBeenCalledWith(
                "/levantamiento/activos/",
                expect.objectContaining({ fecha_adquisicion: null })
            );
        });
    });

    it("carga la foto seleccionada junto con el activo", async () => {
        const { user } = await prepararFormulario();
        const foto = new File(["foto de prueba"], "activo.png", {
            type: "image/png",
        });
        mockApi.post.mockResolvedValue({
            data: { codigo_interno: "PC-001" },
        });

        await user.upload(screen.getByLabelText("Imagen"), foto);
        await user.click(screen.getByRole("button", { name: "Guardar activo" }));

        await waitFor(() => {
            const datos = mockApi.post.mock.calls[0][1];
            expect(datos).toBeInstanceOf(FormData);
            expect(datos.get("foto")).toBe(foto);
            expect(datos.get("nombre")).toBe("Equipo de prueba");
            expect(datos.get("activo")).toBe("true");
        });
    });

    it("muestra los errores de validación de la API por campo", async () => {
        const { user } = await prepararFormulario();
        mockApi.post.mockRejectedValue({
            response: {
                data: {
                    fecha_adquisicion: ["La fecha no es válida."],
                    nombre: ["Este campo ya existe."],
                },
            },
        });

        await user.click(screen.getByRole("button", { name: "Guardar activo" }));

        expect(await screen.findByText("fecha_adquisicion: La fecha no es válida.")).toBeInTheDocument();
        expect(screen.getByText("nombre: Este campo ya existe.")).toBeInTheDocument();
        expect(screen.queryByText("No fue posible guardar el activo. Revisa la información ingresada.")).not.toBeInTheDocument();
    });
});
