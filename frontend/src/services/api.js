import axios from "axios";

const localApiUrl = "http://127.0.0.1:8000/api";
const apiBaseUrl = import.meta.env.VITE_API_URL ??
    (import.meta.env.DEV ? localApiUrl : "");

const api = axios.create({
    baseURL: apiBaseUrl,
});

let refreshPromise;

const notifySessionExpired = () => {
    const hadTokens = Boolean(
        localStorage.getItem("access_token") ||
        localStorage.getItem("refresh_token")
    );

    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");

    if (hadTokens) {
        window.dispatchEvent(new CustomEvent("auth:expired"));
    }
};

const refreshAccessToken = (refreshToken) => {
    if (!refreshPromise) {
        refreshPromise = axios.post(
            api.getUri({ url: "/auth/token/refresh/" }),
            { refresh: refreshToken }
        ).then(({ data }) => {
            localStorage.setItem("access_token", data.access);
            if (data.refresh) {
                localStorage.setItem("refresh_token", data.refresh);
            }
            return data.access;
        }).finally(() => {
            refreshPromise = null;
        });
    }

    return refreshPromise;
};

export const blacklistRefreshToken = (refreshToken) => axios.post(
    api.getUri({ url: "/auth/token/blacklist/" }),
    { refresh: refreshToken }
);

// Agregar automáticamente el token a cada petición
api.interceptors.request.use(
    (config) => {
        if (typeof window === "undefined") {
            return config;
        }

        const token = localStorage.getItem("access_token");

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Manejar respuestas no autorizadas
api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const request = error.config;
        if (
            error.response?.status !== 401 ||
            !request ||
            typeof window === "undefined" ||
            request._retry ||
            request.url?.includes("/auth/token/")
        ) {
            return Promise.reject(error);
        }

        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) {
            notifySessionExpired();
            return Promise.reject(error);
        }

        request._retry = true;
        const currentAccessToken = localStorage.getItem("access_token");
        const failedAuthorization = request.headers?.Authorization;
        if (
            currentAccessToken &&
            failedAuthorization !== `Bearer ${currentAccessToken}`
        ) {
            request.headers.Authorization = `Bearer ${currentAccessToken}`;
            return api(request);
        }

        try {
            const accessToken = await refreshAccessToken(refreshToken);
            request.headers.Authorization = `Bearer ${accessToken}`;
            return api(request);
        } catch (refreshError) {
            notifySessionExpired();
            return Promise.reject(refreshError);
        }
    }
);

export default api;