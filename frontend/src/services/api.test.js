import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "./api";

describe("API JWT refresh", () => {
    let adapter;

    beforeEach(() => {
        localStorage.setItem("access_token", "expired-access");
        localStorage.setItem("refresh_token", "valid-refresh");
        adapter = vi.fn(async (config) => {
            if (config.headers.Authorization === "Bearer expired-access") {
                throw Object.assign(new Error("Unauthorized"), {
                    config,
                    response: { status: 401, config },
                });
            }

            return {
                config,
                data: { ok: true },
                headers: {},
                status: 200,
                statusText: "OK",
            };
        });
        api.defaults.adapter = adapter;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        delete api.defaults.adapter;
    });

    it("refreshes once for concurrent 401 responses and retries both requests", async () => {
        const refresh = vi.spyOn(axios, "post").mockResolvedValue({
            data: { access: "new-access", refresh: "rotated-refresh" },
        });

        const responses = await Promise.all([
            api.get("/resource-a"),
            api.get("/resource-b"),
        ]);

        expect(refresh).toHaveBeenCalledTimes(1);
        expect(responses.map(({ data }) => data)).toEqual([
            { ok: true },
            { ok: true },
        ]);
        expect(localStorage.getItem("access_token")).toBe("new-access");
        expect(localStorage.getItem("refresh_token")).toBe("rotated-refresh");
        expect(adapter).toHaveBeenCalledTimes(4);
    });

    it("clears the session and emits auth:expired when refresh fails", async () => {
        const refresh = vi.spyOn(axios, "post").mockRejectedValue(
            new Error("Refresh expired")
        );
        const expired = vi.fn();
        window.addEventListener("auth:expired", expired);

        await expect(api.get("/protected")).rejects.toThrow("Refresh expired");

        expect(refresh).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem("access_token")).toBeNull();
        expect(localStorage.getItem("refresh_token")).toBeNull();
        expect(expired).toHaveBeenCalledTimes(1);
        window.removeEventListener("auth:expired", expired);
    });
});
