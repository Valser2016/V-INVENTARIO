import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "../services/api";
import { SessionContext } from "../context/SessionContext";
import ListadoActivos from "./ListadoActivos";

vi.mock("../services/api", () => ({
    default: {
        get: vi.fn(),
        patch: vi.fn(),
    },
}));

const activo = {
    id: 1,
    codigo_interno: "PC-001",
    tipo_activo: 2,
    tipo_activo_nombre: "Computador",
    categoria: 3,
    categoria_nombre: "Portátil",
    modalidad_control: "INDIVIDUAL",
    nombre: "Equipo original",
    marca: "Marca",
    modelo: "Modelo",
    serie_codigo: "SERIE-001",
    fecha_adquisicion: "2025-01-15",
    proveedor: "Proveedor",
    vida_util: "5 años",
    ubicacion: 4,
    ubicacion_nombre: "Bodega",
    estado: 5,
    estado_nombre: "Disponible",
    responsable: null,
    cuenta_con_manual: false,
    valor: "1500.00",
    observaciones: "",
};

const renderPage = (permisos = { puede_modificar_inventario: true }) => render(
    <SessionContext.Provider value={{
        perfil: { es_administrador: false, permisos },
        cargando: false,
        error: "",
    }}>
        <ListadoActivos />
    </SessionContext.Provider>,
);

const prepararRespuestas = () => {
    vi.mocked(api.get).mockImplementation((url) => {
        if (url === "/levantamiento/activos/?page=1") {
            return Promise.resolve({
                data: { count: 1, next: null, previous: null, results: [activo] },
            });
        }
        if (url === "/levantamiento/tipos/") {
            return Promise.resolve({ data: [{ id: 2, nombre: "Computador" }] });
        }
        if (url === "/levantamiento/categorias/?tipo_activo=2") {
            return Promise.resolve({ data: [{ id: 3, nombre: "Portátil" }] });
        }
        if (url === "/levantamiento/estados/") {
            return Promise.resolve({ data: [{ id: 5, nombre: "Disponible" }] });
        }
        if (url === "/levantamiento/ubicaciones/") {
            return Promise.resolve({ data: [{ id: 4, nombre: "Bodega" }] });
        }
        if (url === "/levantamiento/usuarios/") {
            return Promise.resolve({ data: [] });
        }
        return Promise.reject(new Error(`URL no esperada: ${url}`));
    });
};

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.patch).mockReset().mockResolvedValue({ data: {} });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("Edición de inventario", () => {
    it("permite editar datos completos de un activo", async () => {
        prepararRespuestas();
        const actualizado = { ...activo, nombre: "Equipo actualizado" };
        vi.mocked(api.patch).mockResolvedValue({ data: actualizado });
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", { name: "Editar" }));
        const nombre = await screen.findByLabelText(/Nombre/);
        await user.clear(nombre);
        await user.type(nombre, "Equipo actualizado");
        await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

        await waitFor(() => {
            expect(api.patch).toHaveBeenCalledWith(
                "/levantamiento/activos/1/",
                expect.objectContaining({
                    nombre: "Equipo actualizado",
                    tipo_activo: 2,
                    categoria: 3,
                    ubicacion: 4,
                    estado: 5,
                }),
            );
        });
        expect(await screen.findByText("Equipo actualizado")).toBeInTheDocument();
    });

    it("permite agregar una foto al editar el activo", async () => {
        prepararRespuestas();
        const actualizado = { ...activo, foto_url: "/levantamiento/activos/1/foto/" };
        vi.mocked(api.patch).mockResolvedValue({ data: actualizado });
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", { name: "Editar" }));
        const foto = new File(["foto de prueba"], "activo.png", {
            type: "image/png",
        });
        await user.upload(screen.getByLabelText("Imagen"), foto);
        await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

        await waitFor(() => {
            const datos = vi.mocked(api.patch).mock.calls[0][1];
            expect(datos).toBeInstanceOf(FormData);
            expect(datos.get("foto")).toBe(foto);
        });
    });

    it("permite desactivar un activo y oculta sus acciones a roles de solo lectura", async () => {
        prepararRespuestas();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        const user = userEvent.setup();
        const { unmount } = renderPage();

        await user.click(await screen.findByRole("button", { name: "Desactivar" }));
        await waitFor(() => {
            expect(api.patch).toHaveBeenCalledWith(
                "/levantamiento/activos/1/",
                { activo: false },
            );
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Se desactivó el activo PC-001.",
        );

        unmount();
        renderPage({ puede_modificar_inventario: false });
        expect(await screen.findByText("Equipo original")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
    });
});
