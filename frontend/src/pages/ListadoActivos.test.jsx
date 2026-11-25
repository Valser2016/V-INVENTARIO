import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "../services/api";
import { SessionContext } from "../context/SessionContext";
import ListadoActivos from "./ListadoActivos";

vi.mock("../services/api", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
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
    responsable_nombre: "",
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
        if (url.startsWith("/levantamiento/activos/?page=1")) {
            return Promise.resolve({
                data: url.includes("search=no+existe")
                    ? { count: 0, next: null, previous: null, results: [] }
                    : { count: 1, next: null, previous: null, results: [activo] },
            });
        }
        if (url === "/levantamiento/tipos/") {
            return Promise.resolve({ data: [{ id: 2, nombre: "Computador" }] });
        }
        if (url === "/levantamiento/categorias/?tipo_activo=2") {
            return Promise.resolve({ data: [{ id: 3, nombre: "Portátil" }] });
        }
        if (url === "/levantamiento/categorias/") {
            return Promise.resolve({
                data: [{ id: 3, nombre: "Portátil", tipo_activo: 2 }],
            });
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
    vi.mocked(api.post).mockReset().mockResolvedValue({ data: {} });
    vi.mocked(api.patch).mockReset().mockResolvedValue({ data: {} });
    vi.mocked(api.delete).mockReset().mockResolvedValue({ data: {} });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("Edición de inventario", () => {
    it("importa activos desde Excel y adjunta opcionalmente un ZIP de fotos", async () => {
        prepararRespuestas();
        vi.mocked(api.post).mockResolvedValue({
            data: { creados: 2, fotos_cargadas: 1 },
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", {
            name: "Importar desde Excel",
        }));
        const excel = new File(["excel"], "activos.xlsx", {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const zip = new File(["fotos"], "fotos.zip", {
            type: "application/zip",
        });
        await user.upload(screen.getByLabelText("Archivo Excel (.xlsx)"), excel);
        await user.upload(screen.getByLabelText("ZIP de fotos (opcional)"), zip);
        await user.click(screen.getByRole("button", { name: "Importar activos" }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/levantamiento/activos/importar/",
                expect.any(FormData),
            );
        });
        const formData = vi.mocked(api.post).mock.calls[0][1];
        expect(formData.get("archivo")).toBe(excel);
        expect(formData.get("fotos")).toBe(zip);
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Se importaron 2 activos y 1 foto correctamente.",
        );
    });

    it("muestra los errores de fila y no pierde la selección para corregir el Excel", async () => {
        prepararRespuestas();
        vi.mocked(api.post).mockRejectedValue({
            response: {
                data: {
                    detail: "No se importó ningún activo.",
                    errores: [{
                        fila: 2,
                        campo: "CATEGORIA",
                        mensajes: ["La categoría no existe."],
                    }],
                },
            },
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", {
            name: "Importar desde Excel",
        }));
        await user.upload(
            screen.getByLabelText("Archivo Excel (.xlsx)"),
            new File(["excel"], "activos.xlsx", { type: "application/octet-stream" }),
        );
        await user.click(screen.getByRole("button", { name: "Importar activos" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Fila 2: CATEGORIA: La categoría no existe.",
        );
        expect(screen.getByLabelText("Archivo Excel (.xlsx)").files).toHaveLength(1);
    });

    it("filtra en cada cambio de la búsqueda y permite combinar filtros", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await screen.findByText("PC-001");
        await user.type(screen.getByRole("searchbox", { name: "Buscar activos" }), "no existe");

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(
                expect.stringContaining("search=no+existe"),
            );
        });
        expect(await screen.findByText(
            "No se encontraron activos con esos filtros.",
        )).toBeInTheDocument();

        await user.selectOptions(screen.getByLabelText("Estado"), "5");
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(
                expect.stringContaining("estado=5"),
            );
        });
    });

    it("muestra solo las columnas solicitadas y abre la hoja de vida completa", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await screen.findByText("PC-001");
        const encabezados = screen.getAllByRole("columnheader").map((nodo) => nodo.textContent);
        expect(encabezados).toEqual([
            "Código",
            "Nombre",
            "Tipo",
            "Categoría",
            "Estado",
            "Acciones",
        ]);
        await user.click(await screen.findByRole("button", { name: "Ver" }));

        const ficha = await screen.findByRole("dialog");
        expect(ficha).toBeInTheDocument();
        expect(within(ficha).getByText("Hoja de vida del activo")).toBeInTheDocument();
        expect(within(ficha).getByText(
            "Equipo original",
            { selector: "dd" },
        )).toBeInTheDocument();
        expect(within(ficha).getByText("Marca", { selector: "dd" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Descargar OYS-FO-11" })).toBeInTheDocument();
    });

    it("imprime el código QR del activo desde su hoja de vida", async () => {
        prepararRespuestas();
        const imprimir = vi.fn();
        vi.stubGlobal("print", imprimir);
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", { name: "Ver" }));
        const ficha = await screen.findByRole("dialog");
        expect(within(ficha).getByLabelText("Código QR PC-001")).toBeInTheDocument();
        await user.click(within(ficha).getByRole("button", { name: "Imprimir QR" }));

        await waitFor(() => expect(imprimir).toHaveBeenCalledOnce());
    });

    it("imprime los códigos QR de los activos de la página actual", async () => {
        prepararRespuestas();
        const imprimir = vi.fn();
        vi.stubGlobal("print", imprimir);
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", {
            name: "Imprimir QRs de esta página (1)",
        }));

        await waitFor(() => expect(imprimir).toHaveBeenCalledOnce());
    });

    it("descarga la hoja de vida en formato OYS-FO-11", async () => {
        prepararRespuestas();
        vi.mocked(api.get).mockImplementation((url) => {
            if (url === "/levantamiento/activos/?page=1") {
                return Promise.resolve({
                    data: { count: 1, next: null, previous: null, results: [activo] },
                });
            }
            if (url === "/levantamiento/activos/1/hoja-vida/") {
                return Promise.resolve({ data: new Blob(["excel"]) });
            }
            return Promise.reject(new Error(`URL no esperada: ${url}`));
        });
        vi.stubGlobal("URL", {
            createObjectURL: vi.fn(() => "blob:hoja-vida"),
            revokeObjectURL: vi.fn(),
        });
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", { name: "Ver" }));
        await user.click(screen.getByRole("button", { name: "Descargar OYS-FO-11" }));

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(
                "/levantamiento/activos/1/hoja-vida/",
                { responseType: "blob" },
            );
        });
        expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });

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

    it("elimina permanentemente un activo y conserva solo Ver para roles de solo lectura", async () => {
        prepararRespuestas();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        const user = userEvent.setup();
        const { unmount } = renderPage();

        await user.click(await screen.findByRole("button", { name: "Eliminar" }));
        await waitFor(() => {
            expect(api.delete).toHaveBeenCalledWith("/levantamiento/activos/1/");
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Se eliminó el activo PC-001.",
        );

        unmount();
        renderPage({ puede_modificar_inventario: false });
        expect(await screen.findByText("Equipo original")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Ver" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {
            name: "Importar desde Excel",
        })).not.toBeInTheDocument();
    });

    it("muestra el motivo y conserva el activo si el servidor impide eliminarlo", async () => {
        prepararRespuestas();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        vi.mocked(api.delete).mockRejectedValue({
            response: {
                data: {
                    detail: "No se puede eliminar este activo porque tiene solicitudes, listas, movimientos o historial relacionado.",
                },
            },
        });
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", { name: "Eliminar" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "No se puede eliminar este activo porque tiene solicitudes, listas, movimientos o historial relacionado.",
        );
        expect(screen.getByText("Equipo original")).toBeInTheDocument();
    });
});
