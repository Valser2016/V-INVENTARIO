import { afterEach, describe, expect, it, vi } from "vitest";
import {
    alternarActivoSeleccionado,
    fechaMinimaPrestamo,
} from "./prestamos";

describe("fechaMinimaPrestamo", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("avanza al siguiente mes cuando mañana cambia de mes", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 0, 31, 12));

        expect(fechaMinimaPrestamo()).toBe("2024-02-01");
    });
});

describe("alternarActivoSeleccionado", () => {
    it("agrega el ID numérico y permite quitarlo con un ID de texto", () => {
        expect(alternarActivoSeleccionado([], "8")).toEqual([8]);
        expect(alternarActivoSeleccionado([8], "8")).toEqual([]);
    });
});
