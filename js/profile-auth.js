const authRoot = document.querySelector("[data-auth-root]");

if (authRoot) {
    const authModal = document.querySelector("#auth-modal");
    const profileDashboard = document.querySelector("#profile-dashboard");
    const registerForm = document.querySelector("#register-form");
    const loginForm = document.querySelector("#login-form");
    const authStatus = document.querySelector("#auth-status");
    const accountCard = document.querySelector("#account-card");
    const logoutButton = document.querySelector("#logout-button");
    const accountName = document.querySelector("#account-name");
    const accountEmail = document.querySelector("#account-email");
    const accountPhone = document.querySelector("#account-phone");
    const accountRole = document.querySelector("#account-role");
    const accountAvatarMedia = document.querySelector("#account-avatar-media");
    const accountAvatarImage = document.querySelector("#account-avatar-image");
    const accountAvatarInitials = document.querySelector("#account-avatar-initials");
    const accountAvatarInput = document.querySelector("#account-avatar-input");
    const accountAvatarUploadTrigger = document.querySelector("#account-avatar-upload-trigger");
    const accountAvatarRemove = document.querySelector("#account-avatar-remove");
    const accountAvatarStatus = document.querySelector("#account-avatar-status");
    const profileCompletionCard = document.querySelector("#profile-completion-card");
    const profileCompletionKicker = document.querySelector("#profile-completion-kicker");
    const profileCompletionTitle = document.querySelector("#profile-completion-title");
    const profileCompletionCopy = document.querySelector("#profile-completion-copy");
    const profileCompletionSubmit = document.querySelector("#profile-completion-submit");
    const profileCompletionForm = document.querySelector("#profile-completion-form");
    const profileCompletionStatus = document.querySelector("#profile-completion-status");
    const ordersHistoryCard = document.querySelector("#orders-history-card");
    const ordersActiveCount = document.querySelector("#orders-active-count");
    const ordersRecentCount = document.querySelector("#orders-recent-count");
    const ordersActiveList = document.querySelector("#orders-active-list");
    const ordersRecentList = document.querySelector("#orders-recent-list");
    const adminDashboardCard = document.querySelector("#admin-dashboard-card");
    const adminDashboardHeadingKicker = adminDashboardCard?.querySelector(".auth-kicker") || null;
    const adminDashboardHeadingTitle = adminDashboardCard?.querySelector(".admin-dashboard-card__heading h3") || null;
    const adminDashboardSummary = adminDashboardCard?.querySelector(".admin-dashboard-summary") || null;
    const adminDashboardGrid = adminDashboardCard?.querySelector(".admin-dashboard-grid") || null;
    const adminDashboardColumns = adminDashboardGrid
        ? Array.from(adminDashboardGrid.querySelectorAll(".admin-dashboard-column"))
        : [];
    const adminServiceColumn = adminDashboardCard?.querySelector("#admin-service-column") || adminDashboardColumns[0] || null;
    const adminContactColumn = adminDashboardCard?.querySelector("#admin-contact-column") || adminDashboardColumns[1] || null;
    const adminServiceNewCount = document.querySelector("#admin-service-new-count");
    const adminServiceTotalCount = document.querySelector("#admin-service-total-count");
    const adminContactNewCount = document.querySelector("#admin-contact-new-count");
    const adminContactTotalCount = document.querySelector("#admin-contact-total-count");
    const adminServiceRequestsList = document.querySelector("#admin-service-requests-list");
    const adminContactRequestsList = document.querySelector("#admin-contact-requests-list");
    const oauthButtons = document.querySelectorAll("[data-oauth-provider]");
    const authTabButtons = document.querySelectorAll("[data-auth-tab]");
    const authTabPanels = document.querySelectorAll("[data-auth-panel]");
    const siteConfig = window.IridaSiteConfig || null;
    const authStorage = siteConfig?.authStorage || {
        read() {
            try {
                return JSON.parse(localStorage.getItem("irida_auth_session") || "null");
            } catch (error) {
                localStorage.removeItem("irida_auth_session");
                return null;
            }
        },
        save(session) {
            localStorage.setItem("irida_auth_session", JSON.stringify(session));
        },
        clear() {
            localStorage.removeItem("irida_auth_session");
        },
    };
    const apiBase = siteConfig?.resolveApiBase(authRoot) || "/api";
    const orderDateFormatter = new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
    const ACTIVE_REQUEST_STATUSES = new Set([
        "new",
        "pending",
        "confirmed",
        "scheduled",
        "in_progress",
        "processing",
        "accepted",
    ]);
    const FINISHED_REQUEST_STATUSES = new Set([
        "completed",
        "done",
        "finished",
        "closed",
        "cancelled",
        "canceled",
        "archived",
    ]);
    const ADMIN_SERVICE_REQUEST_STATUS_OPTIONS = [
        { value: "new", label: "Новая" },
        { value: "pending", label: "Ожидает" },
        { value: "confirmed", label: "Подтверждена" },
        { value: "scheduled", label: "Запланирована" },
        { value: "in_progress", label: "В работе" },
        { value: "completed", label: "Завершена" },
        { value: "closed", label: "Закрыта" },
        { value: "cancelled", label: "Отменена" },
    ];
    const ADMIN_CONTACT_REQUEST_STATUS_OPTIONS = [
        { value: "new", label: "Новое" },
        { value: "pending", label: "Ожидает" },
        { value: "processed", label: "Обработано" },
        { value: "closed", label: "Закрыто" },
        { value: "archived", label: "В архиве" },
    ];
    const AVATAR_MAX_SIZE_BYTES = 3 * 1024 * 1024;
    const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
    const ALLOWED_AVATAR_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
    let isAvatarSubmitting = false;
    let currentAdminDashboardView = "";

    const escapeHtml = (value) => String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const setStatus = (element, message = "", tone = "") => {
        if (!element) {
            return;
        }

        if (!element.dataset.baseClass) {
            element.dataset.baseClass = element.className.trim() || "auth-status";
        }

        element.textContent = message;
        element.className = element.dataset.baseClass;

        if (tone) {
            element.classList.add(`is-${tone}`);
        }
    };

    const setMainStatus = (message = "", tone = "") => {
        setStatus(authStatus, message, tone);
    };

    const setCompletionStatus = (message = "", tone = "") => {
        setStatus(profileCompletionStatus, message, tone);
    };

    const setAvatarStatus = (message = "", tone = "") => {
        setStatus(accountAvatarStatus, message, tone);
    };

    const saveSession = (session) => {
        authStorage.save(session);
    };

    const readSession = () => authStorage.read();

    const clearSession = () => {
        authStorage.clear();
    };

    const getApiOrigin = () => {
        if (/^https?:\/\//i.test(apiBase)) {
            return new URL(apiBase, window.location.origin).origin;
        }

        return window.location.origin;
    };

    const resolveAssetUrl = (value = "") => {
        const normalized = String(value || "").trim();
        if (!normalized) {
            return "";
        }

        if (/^https?:\/\//i.test(normalized)) {
            return normalized;
        }

        if (
            normalized.startsWith("/uploads/")
            && !/^https?:\/\//i.test(apiBase)
            && apiBase.startsWith("/")
        ) {
            return `${apiBase.replace(/\/+$/, "")}${normalized}`;
        }

        if (normalized.startsWith("/")) {
            return `${getApiOrigin()}${normalized}`;
        }

        return `${getApiOrigin()}/${normalized.replace(/^\/+/, "")}`;
    };

    const splitFullName = (fullName = "") => {
        const parts = String(fullName).trim().split(/\s+/).filter(Boolean);

        return {
            firstName: parts[0] || "",
            lastName: parts.slice(1).join(" "),
        };
    };

    const shouldShowProfileCompletion = (user) => Boolean(
        user?.has_oauth_account && user?.needs_profile_completion,
    );

    const shouldShowOrdersHistory = (user) => user?.role !== "admin";

    const applyProfileCompletionContent = (user) => {
        const needsCompletion = shouldShowProfileCompletion(user);

        if (profileCompletionKicker) {
            profileCompletionKicker.textContent = needsCompletion ? "Заверши профиль" : "Данные профиля";
        }
        if (profileCompletionTitle) {
            profileCompletionTitle.textContent = needsCompletion
                ? "Добавь имя, фамилию и телефон"
                : "Проверь и обнови контактные данные";
        }
        if (profileCompletionCopy) {
            profileCompletionCopy.textContent = needsCompletion
                ? "Если Яндекс ID не передал полные данные, заполни их здесь. Эти данные нужны, чтобы менеджер мог связаться с тобой по заявкам."
                : "Здесь можно в любой момент обновить имя, фамилию и телефон для связи по заявкам.";
        }
        if (profileCompletionSubmit) {
            profileCompletionSubmit.textContent = needsCompletion ? "Сохранить данные" : "Обновить данные";
        }
    };

    const hasStructuredFullName = (fullName = "") => (
        String(fullName)
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .length >= 2
    );

    const hasLetterAndDigit = (value = "") => (
        /\p{L}/u.test(String(value))
        && /\d/.test(String(value))
    );

    const isLikelyRussianPhone = (value = "") => {
        const digits = String(value).replace(/\D/g, "");

        if (digits.length === 10) {
            return true;
        }

        if (digits.length === 11 && ["7", "8"].includes(digits[0])) {
            return true;
        }

        return false;
    };

    const switchAuthTab = (tabName = "login") => {
        authTabButtons.forEach((button) => {
            const isActive = button.dataset.authTab === tabName;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-selected", isActive ? "true" : "false");
        });

        authTabPanels.forEach((panel) => {
            const isActive = panel.dataset.authPanel === tabName;
            panel.hidden = !isActive;
            panel.classList.toggle("is-active", isActive);
        });
    };

    const validateRegisterPayload = (payload) => {
        const fullName = String(payload.full_name || "").trim();
        const phone = String(payload.phone || "").trim();
        const email = String(payload.email || "").trim();
        const password = String(payload.password || "");
        const passwordConfirm = String(payload.password_confirm || "");

        if (!hasStructuredFullName(fullName)) {
            return "Укажи имя и фамилию через пробел.";
        }

        if (fullName.length > 80) {
            return "Имя и фамилия не должны превышать 80 символов.";
        }

        if (email.length > 254) {
            return "Email не должен превышать 254 символа.";
        }

        if (!isLikelyRussianPhone(phone)) {
            return "Укажи корректный номер телефона в российском формате.";
        }

        if (password.length < 8) {
            return "Пароль должен содержать минимум 8 символов.";
        }

        if (!hasLetterAndDigit(password)) {
            return "Пароль должен содержать и буквы, и цифры.";
        }

        if (password !== passwordConfirm) {
            return "Пароли не совпадают.";
        }

        return "";
    };

    const validateLoginPayload = (payload) => {
        const email = String(payload.email || "").trim();
        const password = String(payload.password || "");

        if (!email) {
            return "Укажи email.";
        }

        if (email.length > 254) {
            return "Email не должен превышать 254 символа.";
        }

        if (!password) {
            return "Укажи пароль.";
        }

        if (password.length > 128) {
            return "Пароль не должен превышать 128 символов.";
        }

        return "";
    };

    const validateProfileCompletionPayload = (payload) => {
        const firstName = String(payload.first_name || "").trim();
        const lastName = String(payload.last_name || "").trim();
        const phone = String(payload.phone || "").trim();

        if (firstName.length < 2 || lastName.length < 2) {
            return "Имя и фамилия должны содержать минимум 2 символа.";
        }

        if (firstName.length > 40 || lastName.length > 40) {
            return "Имя и фамилия не должны превышать 40 символов.";
        }

        if (!isLikelyRussianPhone(phone)) {
            return "Укажи корректный номер телефона в российском формате.";
        }

        return "";
    };

    const validateAvatarFile = (file) => {
        if (!file) {
            return "Выбери изображение для аватарки.";
        }

        const fileName = String(file.name || "").trim().toLowerCase();
        const extension = fileName.includes(".")
            ? fileName.slice(fileName.lastIndexOf("."))
            : "";

        if (!ALLOWED_AVATAR_EXTENSIONS.has(extension)) {
            return "Подходят только файлы JPG, PNG или WEBP.";
        }

        if (file.type && !ALLOWED_AVATAR_TYPES.has(file.type)) {
            return "Файл должен быть изображением JPG, PNG или WEBP.";
        }

        if (file.size > AVATAR_MAX_SIZE_BYTES) {
            return "Аватарка должна быть не больше 3 МБ.";
        }

        return "";
    };

    const setAvatarSubmittingState = (value) => {
        isAvatarSubmitting = value;

        if (accountAvatarInput) {
            accountAvatarInput.disabled = value;
        }

        if (accountAvatarUploadTrigger) {
            accountAvatarUploadTrigger.classList.toggle("is-disabled", value);
            accountAvatarUploadTrigger.setAttribute("aria-disabled", value ? "true" : "false");
        }

        if (accountAvatarRemove) {
            accountAvatarRemove.disabled = value;
            accountAvatarRemove.classList.toggle("is-disabled", value);
        }
    };

    const renderAccountAvatar = (user) => {
        if (!accountAvatarMedia || !accountAvatarInitials || !accountAvatarImage) {
            return;
        }

        const resolvedAvatarUrl = resolveAssetUrl(user?.avatar_url || "");
        const hasAvatar = Boolean(resolvedAvatarUrl);

        accountAvatarMedia.classList.toggle("has-image", hasAvatar);
        accountAvatarInitials.hidden = true;
        accountAvatarImage.hidden = !hasAvatar;

        if (hasAvatar) {
            accountAvatarImage.src = resolvedAvatarUrl;
        } else {
            accountAvatarImage.removeAttribute("src");
        }

        if (accountAvatarRemove) {
            accountAvatarRemove.hidden = !hasAvatar;
        }
    };

    const clearOrdersUi = () => {
        if (ordersActiveCount) {
            ordersActiveCount.textContent = "0";
        }
        if (ordersRecentCount) {
            ordersRecentCount.textContent = "0";
        }
        if (ordersActiveList) {
            ordersActiveList.innerHTML = "";
        }
        if (ordersRecentList) {
            ordersRecentList.innerHTML = "";
        }
    };

    const clearAdminDashboardUi = () => {
        if (adminServiceNewCount) {
            adminServiceNewCount.textContent = "0";
        }
        if (adminServiceTotalCount) {
            adminServiceTotalCount.textContent = "0";
        }
        if (adminContactNewCount) {
            adminContactNewCount.textContent = "0";
        }
        if (adminContactTotalCount) {
            adminContactTotalCount.textContent = "0";
        }
        if (adminServiceRequestsList) {
            adminServiceRequestsList.innerHTML = "";
        }
        if (adminContactRequestsList) {
            adminContactRequestsList.innerHTML = "";
        }
    };

    const renderGuestState = () => {
        document.body.classList.remove("profile-role-admin");
        if (authModal) {
            authModal.hidden = false;
        }
        if (profileDashboard) {
            profileDashboard.hidden = true;
        }
        if (accountCard) {
            accountCard.hidden = true;
        }
        if (profileCompletionCard) {
            profileCompletionCard.hidden = true;
        }
        if (ordersHistoryCard) {
            ordersHistoryCard.hidden = true;
        }
        if (adminDashboardCard) {
            adminDashboardCard.hidden = true;
        }
        clearOrdersUi();
        clearAdminDashboardUi();
        setCompletionStatus("");
        setAvatarStatus("");
        setAvatarSubmittingState(false);
        if (accountAvatarInput) {
            accountAvatarInput.value = "";
        }
    };

    const renderAccountState = (user) => {
        document.body.classList.toggle("profile-role-admin", user.role === "admin");
        if (authModal) {
            authModal.hidden = true;
        }
        if (profileDashboard) {
            profileDashboard.hidden = false;
        }
        if (accountCard) {
            accountCard.hidden = false;
        }
        if (ordersHistoryCard) {
            ordersHistoryCard.hidden = !shouldShowOrdersHistory(user);
        }
        if (adminDashboardCard) {
            adminDashboardCard.hidden = user.role !== "admin";
        }

        accountName.textContent = user.full_name;
        accountEmail.textContent = user.email;
        accountPhone.textContent = user.phone || "Не указан";
        accountRole.textContent = user.role;
        renderAccountAvatar(user);
        setAvatarStatus("");
        setAvatarSubmittingState(false);

        if (profileCompletionCard) {
            profileCompletionCard.hidden = false;
        }
        applyProfileCompletionContent(user);

        if (profileCompletionForm) {
            const nameParts = splitFullName(user.full_name);
            profileCompletionForm.elements.first_name.value = nameParts.firstName;
            profileCompletionForm.elements.last_name.value = nameParts.lastName;
            profileCompletionForm.elements.phone.value = user.phone || "";
        }
        setCompletionStatus("");
    };

    const buildHeaders = (token = "") => {
        const headers = {
            "Content-Type": "application/json",
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        return headers;
    };

    const extractErrorMessage = async (response) => {
        try {
            const payload = await response.json();
            return payload.detail || "Запрос не выполнен.";
        } catch (error) {
            return "Запрос не выполнен.";
        }
    };

    const requestJson = async (path, options = {}) => {
        const response = await fetch(`${apiBase}${path}`, options);

        if (!response.ok) {
            throw new Error(await extractErrorMessage(response));
        }

        return response.json();
    };

    const requestMultipartJson = async (path, { method = "POST", token = "", body } = {}) => {
        const headers = {};

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`${apiBase}${path}`, {
            method,
            headers,
            body,
        });

        if (!response.ok) {
            throw new Error(await extractErrorMessage(response));
        }

        return response.json();
    };

    const providerLabels = {
        yandex: "Яндекс ID",
    };
    const oauthAvailability = {
        yandex: true,
    };

    const clearAuthHash = () => {
        const url = new URL(window.location.href);
        url.hash = "";
        window.history.replaceState({}, document.title, url.toString());
    };

    const isHttpEnvironment = () => ["http:", "https:"].includes(window.location.protocol);

    const normalizeRequestStatus = (status) => String(status || "").trim().toLowerCase();

    const isActiveRequest = (request) => {
        const normalizedStatus = normalizeRequestStatus(request.status);
        if (FINISHED_REQUEST_STATUSES.has(normalizedStatus)) {
            return false;
        }
        return ACTIVE_REQUEST_STATUSES.has(normalizedStatus) || !normalizedStatus;
    };

    const getRequestStatusLabel = (status) => {
        const normalizedStatus = normalizeRequestStatus(status);

        switch (normalizedStatus) {
        case "new":
            return "Новая";
        case "pending":
            return "Ожидает";
        case "confirmed":
            return "Подтверждена";
        case "scheduled":
            return "Запланирована";
        case "in_progress":
            return "В работе";
        case "processing":
            return "Обрабатывается";
        case "accepted":
            return "Принята";
        case "completed":
        case "done":
        case "finished":
            return "Завершена";
        case "closed":
            return "Закрыта";
        case "cancelled":
        case "canceled":
            return "Отменена";
        case "archived":
            return "В архиве";
        default:
            return normalizedStatus
                ? normalizedStatus.replaceAll("_", " ")
                : "Без статуса";
        }
    };

    const getRequestDate = (request) => request.updated_at || request.created_at || "";

    const formatRequestDate = (value) => {
        if (!value) {
            return "Дата уточняется";
        }

        const parsedDate = new Date(value);
        if (Number.isNaN(parsedDate.getTime())) {
            return "Дата уточняется";
        }

        return orderDateFormatter.format(parsedDate);
    };

    const formatRequestServices = (request) => {
        const items = Array.isArray(request.items) ? request.items : [];
        if (items.length === 0) {
            return "Список услуг уточняется менеджером.";
        }

        return items
            .map((item) => `${item.service} / ${item.class_label}`)
            .join(", ");
    };

    const renderRequestCard = (request, { finished = false } = {}) => `
        <article class="orders-history-item">
            <div class="orders-history-item__top">
                <div class="orders-history-item__title">
                    <strong>Заявка №${escapeHtml(request.id)}</strong>
                    <span class="orders-history-item__date">${escapeHtml(formatRequestDate(getRequestDate(request)))}</span>
                </div>
                <span class="orders-history-item__status${finished ? " is-finished" : ""}">
                    ${escapeHtml(getRequestStatusLabel(request.status))}
                </span>
            </div>
            <p class="orders-history-item__services">${escapeHtml(formatRequestServices(request))}</p>
            <div class="orders-history-item__meta">
                <span>Услуги: ${escapeHtml(request.total_items || 0)}</span>
                <span>Контакт: ${escapeHtml(request.customer_phone || "Не указан")}</span>
            </div>
            <div class="orders-history-item__actions">
                <button class="orders-history-item__delete" type="button" data-order-delete="${escapeHtml(request.id)}">
                    Удалить
                </button>
            </div>
        </article>
    `;

    const renderOrdersList = (element, requests, emptyMessage, { finished = false } = {}) => {
        if (!element) {
            return;
        }

        if (!requests.length) {
            element.innerHTML = `<div class="orders-history-empty">${escapeHtml(emptyMessage)}</div>`;
            return;
        }

        element.innerHTML = requests.map((request) => renderRequestCard(request, { finished })).join("");
    };

    const renderOrdersHistory = (requests) => {
        if (!ordersHistoryCard) {
            return;
        }

        const sortedRequests = [...requests].sort((left, right) => (
            new Date(getRequestDate(right)).getTime() - new Date(getRequestDate(left)).getTime()
        ));

        const activeRequests = sortedRequests.filter(isActiveRequest);
        const recentRequests = sortedRequests.filter((request) => !isActiveRequest(request)).slice(0, 6);

        ordersHistoryCard.hidden = false;
        if (ordersActiveCount) {
            ordersActiveCount.textContent = String(activeRequests.length);
        }
        if (ordersRecentCount) {
            ordersRecentCount.textContent = String(recentRequests.length);
        }

        renderOrdersList(
            ordersActiveList,
            activeRequests,
            "Здесь появятся заявки, которые сейчас в работе или ожидают подтверждения.",
            { finished: false },
        );
        renderOrdersList(
            ordersRecentList,
            recentRequests,
            "Здесь появятся недавно завершённые или закрытые заявки.",
            { finished: true },
        );
    };

    const renderOrdersUnavailable = (message = "Историю заявок пока не удалось загрузить. Попробуй обновить страницу позже.") => {
        if (!ordersHistoryCard) {
            return;
        }

        ordersHistoryCard.hidden = false;
        if (ordersActiveCount) {
            ordersActiveCount.textContent = "0";
        }
        if (ordersRecentCount) {
            ordersRecentCount.textContent = "0";
        }

        renderOrdersList(ordersActiveList, [], message, { finished: false });
        renderOrdersList(ordersRecentList, [], message, { finished: true });
    };

    const getContactRequestStatusLabel = (status) => {
        const normalizedStatus = normalizeRequestStatus(status);
        switch (normalizedStatus) {
        case "new":
            return "Новое";
        case "pending":
            return "Ожидает";
        case "processed":
            return "Обработано";
        case "closed":
            return "Закрыто";
        case "archived":
            return "В архиве";
        default:
            return normalizedStatus || "Без статуса";
        }
    };

    const getStatusOptionLabel = (options, currentStatus) => {
        const normalizedStatus = normalizeRequestStatus(currentStatus);
        return options.find((option) => option.value === normalizedStatus)?.label || normalizedStatus || "Выбери статус";
    };

    const buildCustomStatusSelectMarkup = (options, currentStatus, extraClass = "") => {
        const normalizedStatus = normalizeRequestStatus(currentStatus);
        const selectClass = extraClass
            ? `admin-status-select ${extraClass}`.trim()
            : "admin-status-select";
        return `
            <div class="${selectClass}" data-admin-status-select>
                <input type="hidden" name="status" value="${escapeHtml(normalizedStatus)}">
                <button class="admin-status-select__trigger" type="button" data-admin-status-trigger aria-expanded="false">
                    <span class="admin-status-select__label" data-admin-status-label>
                        ${escapeHtml(getStatusOptionLabel(options, normalizedStatus))}
                    </span>
                    <span class="admin-status-select__icon" aria-hidden="true"></span>
                </button>
                <div class="admin-status-select__menu" data-admin-status-menu hidden>
                    ${options.map((option) => `
                        <button
                            class="admin-status-select__option${option.value === normalizedStatus ? " is-selected" : ""}"
                            type="button"
                            data-admin-status-option="${escapeHtml(option.value)}"
                        >
                            ${escapeHtml(option.label)}
                        </button>
                    `).join("")}
                </div>
            </div>
        `;
    };

    const closeAdminStatusSelect = (select) => {
        if (!select) {
            return;
        }

        select.classList.remove("is-open");
        const trigger = select.querySelector("[data-admin-status-trigger]");
        const menu = select.querySelector("[data-admin-status-menu]");
        if (trigger) {
            trigger.setAttribute("aria-expanded", "false");
        }
        if (menu) {
            menu.hidden = true;
        }
    };

    const openAdminStatusSelect = (select) => {
        if (!select) {
            return;
        }

        select.classList.add("is-open");
        const trigger = select.querySelector("[data-admin-status-trigger]");
        const menu = select.querySelector("[data-admin-status-menu]");
        if (trigger) {
            trigger.setAttribute("aria-expanded", "true");
        }
        if (menu) {
            menu.hidden = false;
        }
    };

    const closeAllAdminStatusSelects = (exceptSelect = null) => {
        document.querySelectorAll("[data-admin-status-select]").forEach((select) => {
            if (exceptSelect && select === exceptSelect) {
                return;
            }
            closeAdminStatusSelect(select);
        });
    };

    const ensureAdminDashboardSwitches = () => {
        if (!adminDashboardCard || !adminDashboardSummary) {
            return;
        }

        adminDashboardCard.classList.add("has-switches");

        if (adminDashboardHeadingKicker) {
            adminDashboardHeadingKicker.textContent = "Панель администратора";
        }
        if (adminDashboardHeadingTitle) {
            adminDashboardHeadingTitle.textContent = "Заявки и обращения клиентов";
        }

        const summaryLabels = adminDashboardSummary.querySelectorAll(".admin-dashboard-summary__item span");
        if (summaryLabels[0]) {
            summaryLabels[0].textContent = "Новые заявки";
        }
        if (summaryLabels[1]) {
            summaryLabels[1].textContent = "Всего заявок";
        }
        if (summaryLabels[2]) {
            summaryLabels[2].textContent = "Новые обращения";
        }
        if (summaryLabels[3]) {
            summaryLabels[3].textContent = "Всего обращений";
        }

        const columnHeadings = adminDashboardCard.querySelectorAll(".admin-dashboard-column__head h4");
        if (columnHeadings[0]) {
            columnHeadings[0].textContent = "Заявки на услуги";
        }
        if (columnHeadings[1]) {
            columnHeadings[1].textContent = "Контактные обращения";
        }

        if (adminServiceColumn) {
            adminServiceColumn.id = "admin-service-column";
        }
        if (adminContactColumn) {
            adminContactColumn.id = "admin-contact-column";
        }

        if (adminDashboardCard.querySelector(".admin-dashboard-switches")) {
            return;
        }

        const switches = document.createElement("div");
        switches.className = "admin-dashboard-switches";
        switches.setAttribute("role", "tablist");
        switches.setAttribute("aria-label", "Разделы панели администратора");
        switches.innerHTML = `
            <button
                class="admin-dashboard-switch"
                type="button"
                data-admin-view="service"
                aria-selected="false"
            >
                Заявки на услуги
            </button>
            <button
                class="admin-dashboard-switch"
                type="button"
                data-admin-view="contact"
                aria-selected="false"
            >
                Контактные обращения
            </button>
        `;
        adminDashboardSummary.insertAdjacentElement("afterend", switches);
    };

    const setAdminDashboardView = (view = "") => {
        currentAdminDashboardView = view === "contact"
            ? "contact"
            : view === "service"
                ? "service"
                : "";

        if (adminDashboardGrid) {
            adminDashboardGrid.dataset.activeView = currentAdminDashboardView || "none";
        }

        if (adminServiceColumn) {
            adminServiceColumn.hidden = currentAdminDashboardView !== "service";
        }
        if (adminContactColumn) {
            adminContactColumn.hidden = currentAdminDashboardView !== "contact";
        }
        if (adminServiceRequestsList) {
            adminServiceRequestsList.hidden = currentAdminDashboardView !== "service";
        }
        if (adminContactRequestsList) {
            adminContactRequestsList.hidden = currentAdminDashboardView !== "contact";
        }

        adminDashboardCard?.querySelectorAll("[data-admin-view]").forEach((button) => {
            const isActive = button.dataset.adminView === currentAdminDashboardView;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-selected", isActive ? "true" : "false");
        });
    };

    const renderAdminDashboardEmptyState = (element, message) => {
        if (!element) {
            return;
        }
        element.innerHTML = `<div class="admin-dashboard-empty">${escapeHtml(message)}</div>`;
    };

    const renderAdminDashboardLoading = () => {
        if (adminDashboardCard) {
            adminDashboardCard.hidden = false;
        }
        ensureAdminDashboardSwitches();
        setAdminDashboardView(currentAdminDashboardView);
        clearAdminDashboardUi();
        renderAdminDashboardEmptyState(adminServiceRequestsList, "Загружаем заявки...");
        renderAdminDashboardEmptyState(adminContactRequestsList, "Загружаем обращения...");
    };

    const renderAdminDashboardUnavailable = (message = "Не удалось загрузить данные администратора.") => {
        if (adminDashboardCard) {
            adminDashboardCard.hidden = false;
        }
        ensureAdminDashboardSwitches();
        setAdminDashboardView(currentAdminDashboardView);
        clearAdminDashboardUi();
        renderAdminDashboardEmptyState(adminServiceRequestsList, message);
        renderAdminDashboardEmptyState(adminContactRequestsList, message);
    };

    const buildAdminServiceRequestItemRowMarkup = (item = {}) => `
        <div class="admin-dashboard-request-row" data-admin-service-item>
            <label class="admin-dashboard-field">
                <span>Раздел</span>
                <input type="text" name="section" value="${escapeHtml(item.section || "")}" placeholder="Например: полировка" required>
            </label>
            <label class="admin-dashboard-field">
                <span>Услуга</span>
                <input type="text" name="service" value="${escapeHtml(item.service || "")}" placeholder="Название услуги" required>
            </label>
            <label class="admin-dashboard-field">
                <span>Класс авто</span>
                <input type="text" name="class_label" value="${escapeHtml(item.class_label || "")}" placeholder="S / M / L" required>
            </label>
            <label class="admin-dashboard-field">
                <span>Цена</span>
                <input type="text" name="price" value="${escapeHtml(item.price || "")}" placeholder="От 15 000 ₽" required>
            </label>
            <label class="admin-dashboard-field admin-dashboard-field--compact">
                <span>Кол-во</span>
                <input type="number" name="quantity" min="1" step="1" value="${escapeHtml(item.quantity || 1)}" required>
            </label>
            <button class="admin-dashboard-row-remove" type="button" data-admin-service-item-remove>
                Удалить
            </button>
        </div>
    `;

    const buildAdminServiceRequestItemsMarkup = (items) => {
        const safeItems = Array.isArray(items) && items.length ? items : [{}];
        return safeItems.map((item) => buildAdminServiceRequestItemRowMarkup(item)).join("");
    };

    const renderAdminServiceRequestItem = (request) => {
        const normalizedStatus = normalizeRequestStatus(request.status);
        const isFinished = FINISHED_REQUEST_STATUSES.has(normalizedStatus);
        const commentMarkup = request.comment
            ? `<div class="admin-dashboard-item__comment">${escapeHtml(request.comment)}</div>`
            : "";

        return `
            <article class="admin-dashboard-item" data-admin-service-request-id="${request.id}">
                <form class="admin-dashboard-edit-form" data-admin-service-edit-form="${request.id}">
                <div class="admin-dashboard-item__top">
                    <div class="admin-dashboard-item__title">
                        <strong>Заявка №${escapeHtml(request.id)}</strong>
                        <span>${escapeHtml(request.customer_full_name)}</span>
                    </div>
                    ${buildCustomStatusSelectMarkup(
        ADMIN_SERVICE_REQUEST_STATUS_OPTIONS,
        normalizedStatus,
        `admin-status-select--summary${isFinished ? " admin-status-select--finished" : ""}`,
    )}
                </div>
                <div class="admin-dashboard-item__meta">
                    <span>${escapeHtml(formatRequestDate(request.updated_at || request.created_at))}</span>
                    <span>${escapeHtml(request.customer_phone || "Телефон не указан")}</span>
                    <span>${escapeHtml(request.customer_email || "Email не указан")}</span>
                </div>
                <div class="admin-dashboard-item__body">${escapeHtml(formatRequestServices(request))}</div>
                ${commentMarkup}
                    <div class="admin-dashboard-form-grid">
                        <label class="admin-dashboard-field">
                            <span>ФИО клиента</span>
                            <input type="text" name="customer_full_name" value="${escapeHtml(request.customer_full_name || "")}" required>
                        </label>
                        <label class="admin-dashboard-field">
                            <span>Телефон</span>
                            <input type="text" name="customer_phone" value="${escapeHtml(request.customer_phone || "")}" required>
                        </label>
                        <label class="admin-dashboard-field">
                            <span>Email</span>
                            <input type="email" name="customer_email" value="${escapeHtml(request.customer_email || "")}" placeholder="client@example.com">
                        </label>
                        <label class="admin-dashboard-field">
                            <span>Комментарий</span>
                            <textarea name="comment" rows="3" placeholder="Напиши заметку для менеджера...">${escapeHtml(request.comment || "")}</textarea>
                        </label>
                    </div>
                    <div class="admin-dashboard-editor">
                        <div class="admin-dashboard-editor__head">
                            <strong>Состав заявки</strong>
                            <button class="admin-dashboard-add-item" type="button" data-admin-service-item-add="${request.id}">
                                Добавить услугу
                            </button>
                        </div>
                        <div class="admin-dashboard-editor__list" data-admin-service-items="${request.id}">
                            ${buildAdminServiceRequestItemsMarkup(request.items)}
                        </div>
                    </div>
                    <div class="admin-dashboard-edit-actions">
                        <button class="admin-dashboard-save-button" type="submit">Сохранить</button>
                        <button class="admin-dashboard-delete-button" type="button" data-admin-service-delete="${request.id}">
                            Удалить заявку
                        </button>
                    </div>
                </form>
                <div class="admin-dashboard-status-message" data-admin-service-status-message="${request.id}"></div>
            </article>
        `;
    };

    const renderAdminContactRequestItem = (request) => {
        const normalizedStatus = normalizeRequestStatus(request.status);
        const messageMarkup = request.message
            ? `<div class="admin-dashboard-item__comment">${escapeHtml(request.message)}</div>`
            : "";

        return `
            <article class="admin-dashboard-item">
                <div class="admin-dashboard-item__top">
                    <div class="admin-dashboard-item__title">
                        <strong>Обращение №${escapeHtml(request.id)}</strong>
                        <span>${escapeHtml(request.customer_name)}</span>
                    </div>
                    <span class="admin-dashboard-item__status">
                        ${escapeHtml(getContactRequestStatusLabel(request.status))}
                    </span>
                </div>
                <div class="admin-dashboard-item__meta">
                    <span>${escapeHtml(formatRequestDate(request.updated_at || request.created_at))}</span>
                    <span>${escapeHtml(request.customer_phone || "Телефон не указан")}</span>
                    <span>${escapeHtml(request.customer_email || "Email не указан")}</span>
                </div>
                <div class="admin-dashboard-item__body">Источник: ${escapeHtml(request.source_page || "website")}</div>
                ${messageMarkup}
                <form class="admin-dashboard-status-form" data-admin-contact-status-form="${request.id}">
                    ${buildCustomStatusSelectMarkup(ADMIN_CONTACT_REQUEST_STATUS_OPTIONS, normalizedStatus)}
                    <button class="admin-dashboard-save-button" type="submit">Сохранить</button>
                    <button class="admin-dashboard-delete-button" type="button" data-admin-contact-delete="${request.id}">
                        Удалить обращение
                    </button>
                </form>
                <div class="admin-dashboard-status-message" data-admin-contact-status-message="${request.id}"></div>
            </article>
        `;
    };

    const renderAdminDashboard = (serviceRequests, contactRequests) => {
        if (!adminDashboardCard) {
            return;
        }

        adminDashboardCard.hidden = false;
        ensureAdminDashboardSwitches();
        if (adminServiceTotalCount) {
            adminServiceTotalCount.textContent = String(serviceRequests.length);
        }
        if (adminContactTotalCount) {
            adminContactTotalCount.textContent = String(contactRequests.length);
        }
        if (adminServiceNewCount) {
            adminServiceNewCount.textContent = String(
                serviceRequests.filter((request) => ["new", "pending"].includes(normalizeRequestStatus(request.status))).length,
            );
        }
        if (adminContactNewCount) {
            adminContactNewCount.textContent = String(
                contactRequests.filter((request) => ["new", "pending"].includes(normalizeRequestStatus(request.status))).length,
            );
        }

        if (adminServiceRequestsList) {
            if (!serviceRequests.length) {
                renderAdminDashboardEmptyState(adminServiceRequestsList, "Заявок на услуги пока нет.");
            } else {
                adminServiceRequestsList.innerHTML = serviceRequests.map(renderAdminServiceRequestItem).join("");
            }
        }

        if (adminContactRequestsList) {
            if (!contactRequests.length) {
                renderAdminDashboardEmptyState(adminContactRequestsList, "Контактных обращений пока нет.");
            } else {
                adminContactRequestsList.innerHTML = contactRequests.map(renderAdminContactRequestItem).join("");
            }
        }

        setAdminDashboardView(currentAdminDashboardView);
    };

    const loadAdminDashboardSafely = async (token, user) => {
        if (!adminDashboardCard) {
            return { ok: true, message: "" };
        }

        if (!token || user?.role !== "admin") {
            adminDashboardCard.hidden = true;
            clearAdminDashboardUi();
            return { ok: true, message: "" };
        }

        renderAdminDashboardLoading();

        try {
            const [serviceRequests, contactRequests] = await Promise.all([
                requestJson("/service-requests/", {
                    method: "GET",
                    headers: buildHeaders(token),
                }),
                requestJson("/contact-requests/", {
                    method: "GET",
                    headers: buildHeaders(token),
                }),
            ]);

            renderAdminDashboard(
                Array.isArray(serviceRequests) ? serviceRequests : [],
                Array.isArray(contactRequests) ? contactRequests : [],
            );
            return { ok: true, message: "" };
        } catch (error) {
            renderAdminDashboardUnavailable(error.message || "Не удалось загрузить панель администратора.");
            return { ok: false, message: error.message || "Не удалось загрузить панель администратора." };
        }
    };

    const setAdminStatusMessage = (selector, id, message = "", tone = "") => {
        const element = document.querySelector(`[${selector}="${id}"]`);
        if (!element) {
            return;
        }

        element.textContent = message;
        element.className = "admin-dashboard-status-message";
        if (tone) {
            element.classList.add(`is-${tone}`);
        }
    };

    const submitAdminServiceRequestStatus = async (requestId, form) => {
        const session = readSession();
        if (!session?.access_token || session.user?.role !== "admin") {
            setAdminStatusMessage("data-admin-service-status-message", requestId, "Войди как администратор.", "error");
            return;
        }

        const payload = {
            status: String(new FormData(form).get("status") || "").trim(),
        };
        setAdminStatusMessage("data-admin-service-status-message", requestId, "Сохраняем статус...", "");

        try {
            await requestJson(`/service-requests/${requestId}/status`, {
                method: "PUT",
                headers: buildHeaders(session.access_token),
                body: JSON.stringify(payload),
            });
            await loadAdminDashboardSafely(session.access_token, session.user);
            setAdminStatusMessage("data-admin-service-status-message", requestId, "Статус заявки обновлён.", "success");
        } catch (error) {
            setAdminStatusMessage("data-admin-service-status-message", requestId, error.message, "error");
        }
    };

    const collectAdminServiceRequestItems = (form) => {
        const itemRows = Array.from(form.querySelectorAll("[data-admin-service-item]"));
        return itemRows.map((row) => {
            const getValue = (selector) => row.querySelector(`[name="${selector}"]`)?.value?.trim() || "";
            return {
                section: getValue("section"),
                service: getValue("service"),
                class_label: getValue("class_label"),
                price: getValue("price"),
                quantity: Number.parseInt(getValue("quantity"), 10) || 1,
            };
        });
    };

    const submitAdminServiceRequestEdit = async (requestId, form) => {
        const session = readSession();
        if (!session?.access_token || session.user?.role !== "admin") {
            setAdminStatusMessage("data-admin-service-status-message", requestId, "Войди как администратор.", "error");
            return;
        }

        const formData = new FormData(form);
        const payload = {
            customer_full_name: String(formData.get("customer_full_name") || "").trim(),
            customer_phone: String(formData.get("customer_phone") || "").trim(),
            customer_email: String(formData.get("customer_email") || "").trim() || null,
            comment: String(formData.get("comment") || "").trim(),
            status: String(formData.get("status") || "").trim(),
            items: collectAdminServiceRequestItems(form),
        };

        if (!payload.items.length) {
            setAdminStatusMessage("data-admin-service-status-message", requestId, "Добавь хотя бы одну услугу.", "error");
            return;
        }

        setAdminStatusMessage("data-admin-service-status-message", requestId, "Сохраняем заявку...", "");

        try {
            await requestJson(`/service-requests/${requestId}`, {
                method: "PUT",
                headers: buildHeaders(session.access_token),
                body: JSON.stringify(payload),
            });
            await loadAdminDashboardSafely(session.access_token, session.user);
            setAdminStatusMessage("data-admin-service-status-message", requestId, "Заявка обновлена.", "success");
        } catch (error) {
            setAdminStatusMessage("data-admin-service-status-message", requestId, error.message, "error");
        }
    };

    const deleteAdminServiceRequest = async (requestId) => {
        const session = readSession();
        if (!session?.access_token || session.user?.role !== "admin") {
            setAdminStatusMessage("data-admin-service-status-message", requestId, "Войди как администратор.", "error");
            return;
        }

        const confirmed = window.confirm("Удалить заявку полностью? Это действие нельзя отменить.");
        if (!confirmed) {
            return;
        }

        setAdminStatusMessage("data-admin-service-status-message", requestId, "Удаляем заявку...", "");

        try {
            await requestJson(`/service-requests/${requestId}`, {
                method: "DELETE",
                headers: buildHeaders(session.access_token),
            });
            await loadAdminDashboardSafely(session.access_token, session.user);
        } catch (error) {
            setAdminStatusMessage("data-admin-service-status-message", requestId, error.message, "error");
        }
    };

    const submitAdminContactRequestStatus = async (requestId, form) => {
        const session = readSession();
        if (!session?.access_token || session.user?.role !== "admin") {
            setAdminStatusMessage("data-admin-contact-status-message", requestId, "Войди как администратор.", "error");
            return;
        }

        const payload = {
            status: String(new FormData(form).get("status") || "").trim(),
        };
        setAdminStatusMessage("data-admin-contact-status-message", requestId, "Сохраняем статус...", "");

        try {
            await requestJson(`/contact-requests/${requestId}/status`, {
                method: "PUT",
                headers: buildHeaders(session.access_token),
                body: JSON.stringify(payload),
            });
            await loadAdminDashboardSafely(session.access_token, session.user);
            setAdminStatusMessage("data-admin-contact-status-message", requestId, "Статус обращения обновлён.", "success");
        } catch (error) {
            setAdminStatusMessage("data-admin-contact-status-message", requestId, error.message, "error");
        }
    };

    const deleteAdminContactRequest = async (requestId) => {
        const session = readSession();
        if (!session?.access_token || session.user?.role !== "admin") {
            setAdminStatusMessage("data-admin-contact-status-message", requestId, "Войди как администратор.", "error");
            return;
        }

        const confirmed = window.confirm("Удалить обращение полностью? Это действие нельзя отменить.");
        if (!confirmed) {
            return;
        }

        setAdminStatusMessage("data-admin-contact-status-message", requestId, "Удаляем обращение...", "");

        try {
            await requestJson(`/contact-requests/${requestId}`, {
                method: "DELETE",
                headers: buildHeaders(session.access_token),
            });
            await loadAdminDashboardSafely(session.access_token, session.user);
        } catch (error) {
            setAdminStatusMessage("data-admin-contact-status-message", requestId, error.message, "error");
        }
    };

    const loadOrdersHistorySafely = async (token, user = null) => {
        if (!shouldShowOrdersHistory(user)) {
            if (ordersHistoryCard) {
                ordersHistoryCard.hidden = true;
            }
            clearOrdersUi();
            return {
                ok: true,
                message: "",
            };
        }

        try {
            await loadOrdersHistory(token);
            return {
                ok: true,
                message: "",
            };
        } catch (error) {
            renderOrdersUnavailable();
            return {
                ok: false,
                message: error.message || "Историю заявок пока не удалось загрузить.",
            };
        }
    };

    const mergeOrdersHistoryNotice = (message, ordersHistoryState) => {
        if (ordersHistoryState?.ok !== false) {
            return message;
        }

        return `${message} Историю заявок пока не удалось загрузить.`;
    };

    const loadOrdersHistory = async (token) => {
        if (!token) {
            if (ordersHistoryCard) {
                ordersHistoryCard.hidden = true;
            }
            clearOrdersUi();
            return;
        }

        const requests = await requestJson("/service-requests/my", {
            method: "GET",
            headers: buildHeaders(token),
        });

        renderOrdersHistory(Array.isArray(requests) ? requests : []);
    };

    const deleteOwnServiceRequest = async (requestId) => {
        const session = readSession();
        if (!session?.access_token) {
            renderGuestState();
            switchAuthTab("login");
            setMainStatus("Сессия истекла. Войди снова.", "error");
            return;
        }

        const confirmed = window.confirm("Удалить эту заявку? Это действие нельзя отменить.");
        if (!confirmed) {
            return;
        }

        setMainStatus("Удаляем заявку...", "");

        try {
            await requestJson(`/service-requests/my/${requestId}`, {
                method: "DELETE",
                headers: buildHeaders(session.access_token),
            });
            const ordersHistoryState = await loadOrdersHistorySafely(session.access_token, session.user);
            setMainStatus(
                mergeOrdersHistoryNotice("Заявка удалена.", ordersHistoryState),
                "success",
            );
        } catch (error) {
            setMainStatus(error.message, "error");
        }
    };

    const applyUpdatedSessionUser = async (user) => {
        const session = readSession();
        if (!session?.access_token) {
            return;
        }

        saveSession({
            access_token: session.access_token,
            token_type: session.token_type || "bearer",
            user,
        });
        renderAccountState(user);
        await loadOrdersHistorySafely(session.access_token, user);
        await loadAdminDashboardSafely(session.access_token, user);
    };

    const uploadAvatar = async (file) => {
        const session = readSession();
        if (!session?.access_token) {
            renderGuestState();
            switchAuthTab("login");
            setMainStatus("Сессия истекла. Войди снова.", "error");
            return;
        }

        const validationError = validateAvatarFile(file);
        if (validationError) {
            setAvatarStatus(validationError, "error");
            if (accountAvatarInput) {
                accountAvatarInput.value = "";
            }
            return;
        }

        const formData = new FormData();
        formData.append("avatar", file);
        setAvatarStatus("Загружаем аватарку...", "");
        setAvatarSubmittingState(true);

        try {
            const user = await requestMultipartJson("/users/me/avatar", {
                method: "POST",
                token: session.access_token,
                body: formData,
            });

            await applyUpdatedSessionUser(user);
            setAvatarStatus("Аватарка обновлена.", "success");
        } catch (error) {
            setAvatarStatus(error.message, "error");
        } finally {
            setAvatarSubmittingState(false);
            if (accountAvatarInput) {
                accountAvatarInput.value = "";
            }
        }
    };

    const removeAvatar = async () => {
        const session = readSession();
        if (!session?.access_token) {
            renderGuestState();
            switchAuthTab("login");
            setMainStatus("Сессия истекла. Войди снова.", "error");
            return;
        }

        setAvatarStatus("Удаляем аватарку...", "");
        setAvatarSubmittingState(true);

        try {
            const user = await requestJson("/users/me/avatar", {
                method: "DELETE",
                headers: buildHeaders(session.access_token),
            });

            await applyUpdatedSessionUser(user);
            setAvatarStatus("Аватарка удалена.", "success");
        } catch (error) {
            setAvatarStatus(error.message, "error");
        } finally {
            setAvatarSubmittingState(false);
            if (accountAvatarInput) {
                accountAvatarInput.value = "";
            }
        }
    };

    const applyOAuthButtonsState = () => {
        oauthButtons.forEach((button) => {
            const provider = button.dataset.oauthProvider?.trim().toLowerCase();
            const isAvailable = provider ? oauthAvailability[provider] !== false : true;

            button.classList.toggle("is-disabled", !isAvailable);
            button.setAttribute("aria-disabled", isAvailable ? "false" : "true");
        });
    };

    const loadOAuthAvailability = async () => {
        try {
            const providers = await requestJson("/users/oauth/providers", {
                method: "GET",
                headers: buildHeaders(),
            });

            oauthAvailability.yandex = providers?.yandex !== false;
        } catch (error) {
            oauthAvailability.yandex = true;
        }

        applyOAuthButtonsState();
    };

    const handleOAuthReturn = async () => {
        const hash = window.location.hash.startsWith("#")
            ? new URLSearchParams(window.location.hash.slice(1))
            : new URLSearchParams();

        if (!hash.size) {
            return false;
        }

        const accessToken = hash.get("access_token");
        const tokenType = hash.get("token_type") || "bearer";
        const provider = hash.get("provider") || "";
        const oauthError = hash.get("oauth_error");

        clearAuthHash();

        if (oauthError) {
            renderGuestState();
            switchAuthTab("login");
            setMainStatus(oauthError, "error");
            return true;
        }

        if (!accessToken) {
            return false;
        }

        try {
            const user = await requestJson("/users/me", {
                method: "GET",
                headers: buildHeaders(accessToken),
            });

            saveSession({
                access_token: accessToken,
                token_type: tokenType,
                user,
            });
            renderAccountState(user);
            const ordersHistoryState = await loadOrdersHistorySafely(accessToken, user);
            await loadAdminDashboardSafely(accessToken, user);
            registerForm?.reset();
            loginForm?.reset();

            if (shouldShowProfileCompletion(user)) {
                setMainStatus(
                    mergeOrdersHistoryNotice(
                        `Вход через ${providerLabels[provider] || "OAuth"} выполнен. Заполни недостающие данные профиля, чтобы менеджер мог связаться с тобой.`,
                        ordersHistoryState,
                    ),
                    "success",
                );
            } else {
                setMainStatus(
                    mergeOrdersHistoryNotice(
                        `Вход через ${providerLabels[provider] || "OAuth"} выполнен успешно.`,
                        ordersHistoryState,
                    ),
                    "success",
                );
            }
        } catch (error) {
            clearSession();
            renderGuestState();
            switchAuthTab("login");
            setMainStatus(error.message, "error");
        }

        return true;
    };

    const loadCurrentUser = async () => {
        const session = readSession();
        if (!session?.access_token) {
            renderGuestState();
            switchAuthTab("login");
            return;
        }

        try {
            const user = await requestJson("/users/me", {
                method: "GET",
                headers: buildHeaders(session.access_token),
            });

            saveSession({
                access_token: session.access_token,
                token_type: session.token_type || "bearer",
                user,
            });
            renderAccountState(user);
            const ordersHistoryState = await loadOrdersHistorySafely(session.access_token, user);
            await loadAdminDashboardSafely(session.access_token, user);

            if (shouldShowProfileCompletion(user)) {
                setMainStatus(
                    mergeOrdersHistoryNotice(
                        "Профиль неполный. Добавь имя, фамилию и телефон для связи по заявкам.",
                        ordersHistoryState,
                    ),
                    "error",
                );
            } else {
                setMainStatus(
                    mergeOrdersHistoryNotice("Ты уже вошёл в аккаунт.", ordersHistoryState),
                    "success",
                );
            }
        } catch (error) {
            clearSession();
            renderGuestState();
            switchAuthTab("login");
            setMainStatus("Сессия истекла. Войди снова.", "error");
        }
    };

    const configureAuthTabs = () => {
        authTabButtons.forEach((button) => {
            button.addEventListener("click", () => {
                switchAuthTab(button.dataset.authTab || "login");
                setMainStatus("");
            });
        });
    };

    const configureOAuthButtons = () => {
        oauthButtons.forEach((button) => {
            const provider = button.dataset.oauthProvider?.trim().toLowerCase();
            if (!provider) {
                return;
            }

            if (isHttpEnvironment()) {
                const nextUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
                button.href = `${apiBase}/users/oauth/${provider}/start?next=${encodeURIComponent(nextUrl)}`;
            }

            button.addEventListener("click", (event) => {
                if (!isHttpEnvironment()) {
                    event.preventDefault();
                    setMainStatus(
                        "Для входа через Яндекс ID открой сайт через локальный сервер или домен, а не через file://.",
                        "error",
                    );
                    return;
                }

                if (oauthAvailability[provider] === false) {
                    event.preventDefault();
                    setMainStatus(
                        `${providerLabels[provider] || "OAuth"} пока не настроен на сервере. Добавь CLIENT_ID, CLIENT_SECRET и REDIRECT_URI в backend/.env.`,
                        "error",
                    );
                    return;
                }

                setMainStatus(`Переходим к авторизации через ${providerLabels[provider] || "OAuth"}...`, "");
            });
        });
    };

    registerForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!registerForm.reportValidity()) {
            return;
        }
        const formData = new FormData(registerForm);
        const payload = Object.fromEntries(formData.entries());
        payload.full_name = String(payload.full_name || "").trim();
        payload.email = String(payload.email || "").trim();
        payload.phone = String(payload.phone || "").trim();

        switchAuthTab("register");
        setMainStatus("Регистрируем аккаунт...", "");

        const registerValidationError = validateRegisterPayload(payload);
        if (registerValidationError) {
            setMainStatus(registerValidationError, "error");
            return;
        }

        try {
            const session = await requestJson("/users/register", {
                method: "POST",
                headers: buildHeaders(),
                body: JSON.stringify(payload),
            });

            saveSession(session);
            renderAccountState(session.user);
            const ordersHistoryState = await loadOrdersHistorySafely(session.access_token, session.user);
            await loadAdminDashboardSafely(session.access_token, session.user);
            registerForm.reset();
            loginForm?.reset();
            setMainStatus(
                mergeOrdersHistoryNotice(
                    "Регистрация прошла успешно. Аккаунт уже авторизован.",
                    ordersHistoryState,
                ),
                "success",
            );
        } catch (error) {
            setMainStatus(error.message, "error");
        }
    });

    loginForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!loginForm.reportValidity()) {
            return;
        }
        const formData = new FormData(loginForm);
        const payload = Object.fromEntries(formData.entries());
        payload.email = String(payload.email || "").trim();

        switchAuthTab("login");
        setMainStatus("Проверяем данные для входа...", "");

        const loginValidationError = validateLoginPayload(payload);
        if (loginValidationError) {
            setMainStatus(loginValidationError, "error");
            return;
        }

        try {
            const session = await requestJson("/users/login", {
                method: "POST",
                headers: buildHeaders(),
                body: JSON.stringify(payload),
            });

            saveSession(session);
            renderAccountState(session.user);
            const ordersHistoryState = await loadOrdersHistorySafely(session.access_token, session.user);
            await loadAdminDashboardSafely(session.access_token, session.user);
            loginForm.reset();
            registerForm?.reset();

            if (shouldShowProfileCompletion(session.user)) {
                setMainStatus(
                    mergeOrdersHistoryNotice(
                        "Вход выполнен. Заполни недостающие данные профиля.",
                        ordersHistoryState,
                    ),
                    "error",
                );
            } else {
                setMainStatus(
                    mergeOrdersHistoryNotice("Вход выполнен успешно.", ordersHistoryState),
                    "success",
                );
            }
        } catch (error) {
            setMainStatus(error.message, "error");
        }
    });

    profileCompletionForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!profileCompletionForm.reportValidity()) {
            return;
        }

        const session = readSession();
        if (!session?.access_token) {
            renderGuestState();
            switchAuthTab("login");
            setMainStatus("Сессия истекла. Войди снова.", "error");
            return;
        }

        const formData = new FormData(profileCompletionForm);
        const payload = Object.fromEntries(formData.entries());
        setCompletionStatus("Сохраняем данные профиля...", "");

        const profileValidationError = validateProfileCompletionPayload(payload);
        if (profileValidationError) {
            setCompletionStatus(profileValidationError, "error");
            return;
        }

        try {
            const user = await requestJson("/users/me", {
                method: "PATCH",
                headers: buildHeaders(session.access_token),
                body: JSON.stringify(payload),
            });

            saveSession({
                access_token: session.access_token,
                token_type: session.token_type || "bearer",
                user,
            });
            renderAccountState(user);
            await loadOrdersHistorySafely(session.access_token, user);
            await loadAdminDashboardSafely(session.access_token, user);
            setCompletionStatus("");
            setMainStatus("Профиль обновлён. Теперь заявки будут привязаны к твоим данным.", "success");
        } catch (error) {
            setCompletionStatus(error.message, "error");
        }
    });

    adminDashboardCard?.addEventListener("submit", async (event) => {
        const serviceForm = event.target.closest("[data-admin-service-edit-form]");
        if (serviceForm) {
            event.preventDefault();
            await submitAdminServiceRequestEdit(serviceForm.dataset.adminServiceEditForm, serviceForm);
            return;
        }

        const contactForm = event.target.closest("[data-admin-contact-status-form]");
        if (contactForm) {
            event.preventDefault();
            await submitAdminContactRequestStatus(contactForm.dataset.adminContactStatusForm, contactForm);
        }
    });

    adminDashboardCard?.addEventListener("click", async (event) => {
        const adminViewButton = event.target.closest("[data-admin-view]");
        if (adminViewButton) {
            setAdminDashboardView(adminViewButton.dataset.adminView);
            return;
        }

        const statusTrigger = event.target.closest("[data-admin-status-trigger]");
        if (statusTrigger) {
            const select = statusTrigger.closest("[data-admin-status-select]");
            if (!select) {
                return;
            }

            const shouldOpen = !select.classList.contains("is-open");
            closeAllAdminStatusSelects(shouldOpen ? select : null);

            if (shouldOpen) {
                openAdminStatusSelect(select);
            } else {
                closeAdminStatusSelect(select);
            }
            return;
        }

        const statusOption = event.target.closest("[data-admin-status-option]");
        if (statusOption) {
            const select = statusOption.closest("[data-admin-status-select]");
            const hiddenInput = select?.querySelector('input[name="status"]');
            const label = select?.querySelector("[data-admin-status-label]");
            const optionValue = statusOption.dataset.adminStatusOption?.trim() || "";
            const previousValue = String(hiddenInput?.value || "").trim();

            if (!select || !hiddenInput || !label || !optionValue) {
                return;
            }

            hiddenInput.value = optionValue;
            label.textContent = statusOption.textContent.trim();
            select.querySelectorAll("[data-admin-status-option]").forEach((option) => {
                option.classList.toggle("is-selected", option === statusOption);
            });
            closeAdminStatusSelect(select);

            if (previousValue === optionValue) {
                return;
            }

            const serviceForm = select.closest("[data-admin-service-edit-form]");
            if (serviceForm?.dataset.adminServiceEditForm) {
                await submitAdminServiceRequestStatus(serviceForm.dataset.adminServiceEditForm, serviceForm);
                return;
            }

            const contactForm = select.closest("[data-admin-contact-status-form]");
            if (contactForm?.dataset.adminContactStatusForm) {
                await submitAdminContactRequestStatus(contactForm.dataset.adminContactStatusForm, contactForm);
            }

            return;
        }

        const addItemButton = event.target.closest("[data-admin-service-item-add]");
        if (addItemButton) {
            const list = document.querySelector(`[data-admin-service-items="${addItemButton.dataset.adminServiceItemAdd}"]`);
            if (!list) {
                return;
            }

            list.insertAdjacentHTML("beforeend", buildAdminServiceRequestItemRowMarkup());
            return;
        }

        const deleteServiceButton = event.target.closest("[data-admin-service-delete]");
        if (deleteServiceButton) {
            await deleteAdminServiceRequest(deleteServiceButton.dataset.adminServiceDelete);
            return;
        }

        const deleteContactButton = event.target.closest("[data-admin-contact-delete]");
        if (deleteContactButton) {
            await deleteAdminContactRequest(deleteContactButton.dataset.adminContactDelete);
            return;
        }

        const removeItemButton = event.target.closest("[data-admin-service-item-remove]");
        if (!removeItemButton) {
            return;
        }

        const row = removeItemButton.closest("[data-admin-service-item]");
        const list = row?.parentElement;
        if (!row || !list) {
            return;
        }

        if (list.querySelectorAll("[data-admin-service-item]").length <= 1) {
            return;
        }

        row.remove();
    });

    document.addEventListener("click", (event) => {
        if (event.target.closest("[data-admin-status-select]")) {
            return;
        }

        closeAllAdminStatusSelects();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        closeAllAdminStatusSelects();
    });

    ordersHistoryCard?.addEventListener("click", async (event) => {
        const deleteButton = event.target.closest("[data-order-delete]");
        if (!deleteButton) {
            return;
        }

        await deleteOwnServiceRequest(deleteButton.dataset.orderDelete);
    });

    accountAvatarImage?.addEventListener("error", () => {
        accountAvatarImage.hidden = true;
        accountAvatarImage.removeAttribute("src");
        accountAvatarMedia?.classList.remove("has-image");
        if (accountAvatarInitials) {
            accountAvatarInitials.hidden = true;
        }
    });

    accountAvatarUploadTrigger?.addEventListener("click", () => {
        if (isAvatarSubmitting) {
            return;
        }

        accountAvatarInput?.click();
    });

    accountAvatarInput?.addEventListener("change", async () => {
        const file = accountAvatarInput.files?.[0];
        if (!file || isAvatarSubmitting) {
            return;
        }

        await uploadAvatar(file);
    });

    accountAvatarRemove?.addEventListener("click", async () => {
        if (isAvatarSubmitting || accountAvatarRemove.hidden) {
            return;
        }

        await removeAvatar();
    });

    logoutButton?.addEventListener("click", () => {
        clearSession();
        renderGuestState();
        switchAuthTab("login");
        setMainStatus("Ты вышел из аккаунта.", "success");
    });

    const initializeAuthPage = async () => {
        switchAuthTab("login");
        ensureAdminDashboardSwitches();
        setAdminDashboardView("");
        configureAuthTabs();
        await loadOAuthAvailability();
        configureOAuthButtons();
        const handledOAuth = await handleOAuthReturn();
        if (!handledOAuth) {
            await loadCurrentUser();
        }
    };

    initializeAuthPage();
}

