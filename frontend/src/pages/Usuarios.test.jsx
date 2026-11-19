import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "../services/api";
import { SessionContext } from "../context/SessionContext";
import Usuarios from "./Usuarios";

vi.mock("../services/api", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
    },
}));

const roles = [{
    id: 1,
    nombre: "Inventario",
    descripcion: "",
    puede_ver_inventario: true,
    puede_modificar_inventario: false,
    puede_administrar_catalogos: false,
    puede_ver_movimientos: true,
    puede_ver_reportes: false,
    puede_registrar_devoluciones: false,
    puede_revisar_solicitudes_prestamo: false,
    puede_aprobar_solicitudes_prestamo: false,
    activo: true,
}];
const usuarios = [{
    id: 2,
    username: "inventario",
    first_name: "Usuario",
    last_name: "Inventario",
    email: "",
    documento: "",
    telefono: "",
    cargo: "",
    area: "",
    rol: 1,
    rol_nombre: "Inventario",
    is_active: true,
}];

const prepararRespuestas = () => {
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({
        data: url === "/usuarios/roles/" ? roles : usuarios,
    }));
};

const renderPage = () => render(
    <SessionContext.Provider value={{
        perfil: { id: 1, es_administrador: true },
        cargando: false,
        error: "",
    }}>
        <Usuarios />
    </SessionContext.Provider>,
);

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset().mockResolvedValue({ data: {} });
    vi.mocked(api.patch).mockReset().mockResolvedValue({ data: {} });
});

afterEach(() => cleanup());

describe("Administración de usuarios y permisos", () => {
    it("crea usuarios desde el módulo de administración", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await user.type(await screen.findByLabelText("Usuario"), "nuevo");
        await user.type(screen.getByLabelText("Contraseña inicial"), "Xy9#jLm5!Qa");
        await user.click(screen.getByRole("button", { name: "Crear usuario" }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                "/usuarios/usuarios/",
                expect.objectContaining({
                    username: "nuevo",
                    password: "Xy9#jLm5!Qa",
                }),
            );
        });
    });

    it("permite delegar consulta de reportes por rol", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", { name: "Roles y permisos" }));
        await user.click(await screen.findByRole("button", { name: "Editar" }));
        await user.click(screen.getByLabelText("Consultar reportes y exportaciones"));
        await user.click(screen.getByRole("button", { name: "Guardar permisos" }));

        await waitFor(() => {
            expect(api.patch).toHaveBeenCalledWith(
                "/usuarios/roles/1/",
                expect.objectContaining({ puede_ver_reportes: true }),
            );
        });
    });

    it("permite asignar al rol el registro de devoluciones", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", { name: "Roles y permisos" }));
        await user.click(await screen.findByRole("button", { name: "Editar" }));
        await user.click(screen.getByLabelText("Registrar devoluciones de herramientas"));
        await user.click(screen.getByRole("button", { name: "Guardar permisos" }));

        await waitFor(() => {
            expect(api.patch).toHaveBeenCalledWith(
                "/usuarios/roles/1/",
                expect.objectContaining({ puede_registrar_devoluciones: true }),
            );
        });
    });

    it("permite asignar al rol la revisión de solicitudes", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", { name: "Roles y permisos" }));
        await user.click(await screen.findByRole("button", { name: "Editar" }));
        await user.click(screen.getByLabelText(
            "Revisar checklist y generar PDF previo de solicitudes",
        ));
        await user.click(screen.getByRole("button", { name: "Guardar permisos" }));

        await waitFor(() => {
            expect(api.patch).toHaveBeenCalledWith(
                "/usuarios/roles/1/",
                expect.objectContaining({
                    puede_revisar_solicitudes_prestamo: true,
                }),
            );
        });
    });

    it("permite delegar edición, catálogos y aprobación por separado", async () => {
        prepararRespuestas();
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", { name: "Roles y permisos" }));
        await user.click(await screen.findByRole("button", { name: "Editar" }));
        await user.click(screen.getByLabelText("Crear, editar y desactivar activos"));
        await user.click(screen.getByLabelText("Administrar catálogos de inventario"));
        await user.click(screen.getByLabelText("Aprobar o rechazar solicitudes revisadas"));
        await user.click(screen.getByRole("button", { name: "Guardar permisos" }));

        await waitFor(() => {
            expect(api.patch).toHaveBeenCalledWith(
                "/usuarios/roles/1/",
                expect.objectContaining({
                    puede_modificar_inventario: true,
                    puede_administrar_catalogos: true,
                    puede_aprobar_solicitudes_prestamo: true,
                }),
            );
        });
    });
});
