(function initIridaSiteConfig() {
    const DEFAULT_LOCAL_API_BASE = "http://127.0.0.1:8000";
    const DEFAULT_PRODUCTION_API_BASE = "/api";
    const AUTH_STORAGE_KEY = "irida_auth_session";

    const normalizeApiBase = (value) => {
        const normalized = String(value || "").trim();
        return normalized.replace(/\/$/, "");
    };

    const isLocalEnvironment = () => (
        window.location.protocol === "file:"
        || ["localhost", "127.0.0.1"].includes(window.location.hostname)
    );

    const readConfiguredApiBase = (scopeElement = null) => {
        const fromElement = scopeElement?.dataset?.apiBase?.trim();
        if (fromElement) {
            return fromElement;
        }

        const fromBody = document.body?.dataset?.apiBase?.trim();
        if (fromBody) {
            return fromBody;
        }

        const fromMeta = document
            .querySelector('meta[name="irida-api-base"]')
            ?.getAttribute("content")
            ?.trim();
        if (fromMeta) {
            return fromMeta;
        }

        const fromGlobalConfig = window.IRIDA_CONFIG?.apiBase?.trim();
        if (fromGlobalConfig) {
            return fromGlobalConfig;
        }

        return "";
    };

    const resolveApiBase = (scopeElement = null) => {
        const configuredBase = readConfiguredApiBase(scopeElement);
        if (configuredBase) {
            return normalizeApiBase(configuredBase);
        }

        if (isLocalEnvironment()) {
            return DEFAULT_LOCAL_API_BASE;
        }

        return DEFAULT_PRODUCTION_API_BASE;
    };

    const authStorage = {
        key: AUTH_STORAGE_KEY,
        read() {
            try {
                return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
            } catch (error) {
                localStorage.removeItem(AUTH_STORAGE_KEY);
                return null;
            }
        },
        save(session) {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
        },
        clear() {
            localStorage.removeItem(AUTH_STORAGE_KEY);
        },
    };

    window.IridaSiteConfig = {
        authStorage,
        defaultLocalApiBase: DEFAULT_LOCAL_API_BASE,
        defaultProductionApiBase: DEFAULT_PRODUCTION_API_BASE,
        isLocalEnvironment,
        readConfiguredApiBase,
        resolveApiBase,
    };
}());
