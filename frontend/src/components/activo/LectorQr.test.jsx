import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LectorQr from "./LectorQr";

const { decodeFromConstraints, stopScanner } = vi.hoisted(() => ({
    decodeFromConstraints: vi.fn(),
    stopScanner: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
    BrowserQRCodeReader: class {
        decodeFromConstraints(...args) {
            return decodeFromConstraints(...args);
        }
    },
}));

beforeEach(() => {
    decodeFromConstraints.mockReset();
    stopScanner.mockReset();
    decodeFromConstraints.mockResolvedValue({ stop: stopScanner });
});

afterEach(() => {
    cleanup();
});

describe("LectorQr", () => {
    it("lee el código con la cámara trasera y detiene el escáner al cerrar", async () => {
        const alLeerCodigo = vi.fn();
        const { unmount } = render(
            <LectorQr alLeerCodigo={alLeerCodigo} alCerrar={vi.fn()} />,
        );

        await waitFor(() => {
            expect(decodeFromConstraints).toHaveBeenCalledOnce();
        });
        expect(decodeFromConstraints).toHaveBeenCalledWith(
            { video: { facingMode: { ideal: "environment" } } },
            expect.any(HTMLVideoElement),
            expect.any(Function),
        );

        const callback = decodeFromConstraints.mock.calls[0][2];
        callback({ getText: () => " CEC-001 " });
        expect(alLeerCodigo).toHaveBeenCalledWith("CEC-001");
        expect(await screen.findByText("Último código leído:")).toBeInTheDocument();
        callback({ getText: () => "CEC-001" });
        expect(alLeerCodigo).toHaveBeenCalledOnce();

        unmount();
        expect(stopScanner).toHaveBeenCalledOnce();
    });

    it("explica cuando la persona no concede acceso a la cámara", async () => {
        decodeFromConstraints.mockRejectedValue(
            Object.assign(new Error("Permiso denegado"), { name: "NotAllowedError" }),
        );
        render(<LectorQr alLeerCodigo={vi.fn()} alCerrar={vi.fn()} />);

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Permite el acceso a la cámara para leer códigos QR.",
        );
    });
});
