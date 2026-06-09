const servicesPageRoot = document.querySelector(".services-page");

if (servicesPageRoot) {
    const GUEST_STORAGE_KEY = "irida_service_guest";
    const GUEST_CONTACT_CONFIRMED_KEY = "irida_service_guest_confirmed";
    const ACCOUNT_CONTACT_STORAGE_KEY = "irida_service_account_contact";
    const CART_STORAGE_KEY = "irida_service_cart";
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

    const pricingAccordionRoot = document.querySelector("#pricing-accordion");
    const cartBar = document.querySelector(".service-cart-bar");
    const cartToggleButton = document.querySelector("#service-cart-toggle");
    const cartToggleCount = document.querySelector("#service-cart-toggle-count");
    const cartPanel = document.querySelector("#service-cart-panel");
    const cartCloseButton = document.querySelector("#service-cart-close");
    const cartStatus = document.querySelector("#service-cart-status");
    const cartContact = document.querySelector("#service-cart-contact");
    const cartEmpty = document.querySelector("#service-cart-empty");
    const cartItems = document.querySelector("#service-cart-items");
    const cartTotalCount = document.querySelector("#service-cart-total-count");
    const cartClearButton = document.querySelector("#service-cart-clear");
    const cartSubmitButton = document.querySelector("#service-cart-submit");
    const leadModal = document.querySelector("#service-lead-modal");
    const leadForm = document.querySelector("#service-lead-form");
    const modalCloseTargets = document.querySelectorAll("[data-service-modal-close]");

    let isCartOpen = false;
    let isSubmitting = false;
    let pendingCartItem = null;
    let currentUser = null;
    let authSession = null;

    const apiBase = siteConfig?.resolveApiBase(servicesPageRoot) || "/api";

    const escapeHtml = (value) => String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const readJsonStorage = (key, fallbackValue) => {
        try {
            const rawValue = localStorage.getItem(key);

            if (!rawValue) {
                return fallbackValue;
            }

            return JSON.parse(rawValue);
        } catch (error) {
            localStorage.removeItem(key);
            return fallbackValue;
        }
    };

    const writeJsonStorage = (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
    };

    const readGuestContactConfirmed = () => {
        try {
            return sessionStorage.getItem(GUEST_CONTACT_CONFIRMED_KEY) === "1";
        } catch (error) {
            return false;
        }
    };

    const writeGuestContactConfirmed = (value) => {
        try {
            if (value) {
                sessionStorage.setItem(GUEST_CONTACT_CONFIRMED_KEY, "1");
            } else {
                sessionStorage.removeItem(GUEST_CONTACT_CONFIRMED_KEY);
            }
        } catch (error) {
            // sessionStorage can be unavailable in restrictive browser modes
        }
    };

    const getSession = () => authStorage.read();
    const getGuestContact = () => readJsonStorage(GUEST_STORAGE_KEY, null);
    const getAccountContactKey = (userId) => `${ACCOUNT_CONTACT_STORAGE_KEY}:${userId}`;
    const getAccountContact = (userId = currentUser?.id) => {
        if (!userId) {
            return null;
        }

        return readJsonStorage(getAccountContactKey(userId), null);
    };
    const getCartItems = () => readJsonStorage(CART_STORAGE_KEY, []);
    const saveAccountContact = (userId, value) => {
        if (!userId) {
            return;
        }

        writeJsonStorage(getAccountContactKey(userId), value);
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
            return payload.detail || payload.message || "Не удалось выполнить запрос";
        } catch (error) {
            return "Не удалось выполнить запрос";
        }
    };

    const requestJson = async (path, options = {}) => {
        const response = await fetch(`${apiBase}${path}`, options);

        if (!response.ok) {
            throw new Error(await extractErrorMessage(response));
        }

        return response.json();
    };

    const buildItemId = (item) => [
        item.section.trim().toLowerCase(),
        item.service.trim().toLowerCase(),
        item.classLabel.trim().toLowerCase(),
        item.price.trim().toLowerCase(),
    ].join("::");

    const splitFullName = (fullName = "") => {
        const parts = String(fullName).trim().split(/\s+/).filter(Boolean);

        return {
            firstName: parts[0] || "",
            lastName: parts.slice(1).join(" "),
        };
    };

    const syncCurrentUser = async ({ showExpiredMessage = false } = {}) => {
        authSession = getSession();
        currentUser = authSession?.user || null;

        if (!authSession?.access_token) {
            currentUser = null;
            return null;
        }

        try {
            currentUser = await requestJson("/users/me", {
                method: "GET",
                headers: buildHeaders(authSession.access_token),
            });

            authSession = {
                access_token: authSession.access_token,
                token_type: authSession.token_type || "bearer",
                user: currentUser,
            };
            authStorage.save(authSession);
            return currentUser;
        } catch (error) {
            authStorage.clear();
            authSession = null;
            currentUser = null;

            if (showExpiredMessage) {
                setCartStatus("Сессия истекла. Войди снова или оставь контакты для заявки.", "error");
            }

            return null;
        }
    };

    const getActiveContact = () => {
        const authenticatedUser = currentUser;

        if (authenticatedUser?.full_name && authenticatedUser?.phone) {
            return {
                mode: "auth",
                fullName: authenticatedUser.full_name,
                phone: authenticatedUser.phone,
                email: authenticatedUser.email || "",
                note: "Заявка привязана к аккаунту",
            };
        }

        if (authenticatedUser?.id) {
            const accountContact = getAccountContact(authenticatedUser.id);

            if (accountContact?.firstName && accountContact?.lastName && accountContact?.phone) {
                return {
                    mode: "auth-fallback",
                    fullName: `${accountContact.firstName} ${accountContact.lastName}`.trim(),
                    phone: accountContact.phone,
                    email: authenticatedUser.email || "",
                    note: "Заявка привязана к аккаунту, контакт сохранён для связи",
                    firstName: accountContact.firstName,
                    lastName: accountContact.lastName,
                };
            }

            return null;
        }

        const guestContact = getGuestContact();

        if (readGuestContactConfirmed() && guestContact?.firstName && guestContact?.lastName && guestContact?.phone) {
            return {
                mode: "guest",
                fullName: `${guestContact.firstName} ${guestContact.lastName}`.trim(),
                phone: guestContact.phone,
                note: "Заявка сохранена по контактам",
                firstName: guestContact.firstName,
                lastName: guestContact.lastName,
            };
        }

        return null;
    };

    const getLeadContactDraft = () => {
        if (currentUser?.id) {
            const accountContact = getAccountContact(currentUser.id);

            if (accountContact?.firstName || accountContact?.lastName || accountContact?.phone) {
                return accountContact;
            }

            const nameParts = splitFullName(currentUser.full_name);

            return {
                firstName: nameParts.firstName,
                lastName: nameParts.lastName,
                phone: currentUser.phone || "",
            };
        }

        return getGuestContact();
    };

    const setCartStatus = (message = "", tone = "") => {
        if (!cartStatus) {
            return;
        }

        cartStatus.textContent = message;
        cartStatus.className = "service-cart-status";

        if (tone) {
            cartStatus.classList.add(`is-${tone}`);
        }
    };

    const syncCartPanelState = () => {
        if (!cartPanel || !cartToggleButton) {
            return;
        }

        cartPanel.classList.toggle("is-open", isCartOpen);
        cartPanel.setAttribute("aria-hidden", String(!isCartOpen));
        cartToggleButton.setAttribute("aria-expanded", String(isCartOpen));
    };

    const openCartPanel = () => {
        isCartOpen = true;
        syncCartPanelState();
    };

    const closeCartPanel = () => {
        isCartOpen = false;
        syncCartPanelState();
    };

    const openLeadModal = (item = null) => {
        pendingCartItem = item;
        if (leadModal) {
            leadModal.hidden = false;
            document.body.classList.add("service-modal-open");
        }

        if (!leadForm) {
            return;
        }

        const contactDraft = getLeadContactDraft();
        const firstNameInput = leadForm.querySelector('input[name="first_name"]');
        const lastNameInput = leadForm.querySelector('input[name="last_name"]');
        const phoneInput = leadForm.querySelector('input[name="phone"]');

        if (firstNameInput) {
            firstNameInput.value = contactDraft?.firstName || "";
        }

        if (lastNameInput) {
            lastNameInput.value = contactDraft?.lastName || "";
        }

        if (phoneInput) {
            phoneInput.value = contactDraft?.phone || "";
            phoneInput.setCustomValidity("");
        }
    };

    const closeLeadModal = () => {
        pendingCartItem = null;

        if (leadModal) {
            leadModal.hidden = true;
            document.body.classList.remove("service-modal-open");
        }
    };

    const renderContact = () => {
        if (!cartContact) {
            return;
        }

        const activeContact = getActiveContact();

        if (!activeContact) {
            cartContact.innerHTML = "";
            return;
        }

        const canEditContact = activeContact.mode !== "auth";
        const editButtonMarkup = canEditContact
            ? `
                <button class="service-cart-contact__edit" type="button" data-edit-service-contact>
                    Изменить контакты
                </button>
            `
            : "";

        cartContact.innerHTML = `
            <strong>${escapeHtml(activeContact.note)}</strong>
            <div>${escapeHtml(activeContact.fullName)}</div>
            <div>${escapeHtml(activeContact.phone)}</div>
            ${editButtonMarkup}
        `;
    };

    const setSubmittingState = (value) => {
        isSubmitting = value;

        if (cartSubmitButton) {
            cartSubmitButton.disabled = value || getCartItems().length === 0;
            cartSubmitButton.textContent = value ? "Отправляем..." : "Отправить заявку";
        }
    };

    const renderCart = () => {
        const items = getCartItems();
        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

        if (cartToggleCount) {
            cartToggleCount.textContent = String(totalItems);
        }

        if (cartTotalCount) {
            cartTotalCount.textContent = String(totalItems);
        }

        if (cartEmpty) {
            cartEmpty.hidden = items.length > 0;
        }

        if (cartSubmitButton && !isSubmitting) {
            cartSubmitButton.disabled = items.length === 0;
        }

        if (cartItems) {
            cartItems.hidden = items.length === 0;
            cartItems.innerHTML = items.map((item) => `
                <article class="service-cart-item" data-cart-item-id="${escapeHtml(item.id)}">
                    <div class="service-cart-item__top">
                        <div>
                            <h4 class="service-cart-item__title">${escapeHtml(item.service)}</h4>
                            <p class="service-cart-item__meta">${escapeHtml(item.section)} · ${escapeHtml(item.classLabel)}</p>
                        </div>
                        <strong class="service-cart-item__price">${escapeHtml(item.price)}</strong>
                    </div>
                    <div class="service-cart-item__bottom">
                        <span class="service-cart-item__meta">Количество: ${item.quantity}</span>
                        <button class="service-cart-remove" type="button" data-remove-cart-item="${escapeHtml(item.id)}">Убрать</button>
                    </div>
                </article>
            `).join("");
        }

        renderContact();
        syncCartPanelState();
    };

    const addItemToCart = (item) => {
        const items = getCartItems();
        const itemId = buildItemId(item);
        const existingItem = items.find((entry) => entry.id === itemId);

        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            items.push({
                id: itemId,
                section: item.section,
                service: item.service,
                classLabel: item.classLabel,
                price: item.price,
                quantity: 1,
            });
        }

        writeJsonStorage(CART_STORAGE_KEY, items);
        renderCart();
        openCartPanel();
        setCartStatus(`Добавили в заявку: ${item.service} · ${item.classLabel}.`, "success");
    };

    const removeItemFromCart = (itemId) => {
        const nextItems = getCartItems().filter((item) => item.id !== itemId);
        writeJsonStorage(CART_STORAGE_KEY, nextItems);
        renderCart();
        setCartStatus("Услуга удалена из заявки.", "success");
    };

    const clearCart = () => {
        writeJsonStorage(CART_STORAGE_KEY, []);
        renderCart();
        setCartStatus("Список услуг очищен.", "success");
    };

    const buildCartItemFromButton = (button) => ({
        section: button.dataset.cartSection || "",
        service: button.dataset.cartService || "",
        classLabel: button.dataset.cartClass || "",
        price: button.dataset.cartPrice || "",
    });

    const buildRequestPayload = () => {
        const items = getCartItems().map((item) => ({
            section: item.section,
            service: item.service,
            class_label: item.classLabel,
            price: item.price,
            quantity: item.quantity,
        }));
        const activeContact = getActiveContact();

        if (!activeContact) {
            return { items };
        }

        if (activeContact.mode === "auth") {
            return { items };
        }

        return {
            items,
            first_name: activeContact.firstName || "",
            last_name: activeContact.lastName || "",
            phone: activeContact.phone,
        };
    };

    const submitCart = async () => {
        const items = getCartItems();
        if (items.length === 0) {
            setCartStatus("Сначала добавь хотя бы одну услугу в заявку.", "error");
            return;
        }

        const activeContact = getActiveContact();
        if (!activeContact) {
            openLeadModal();
            setCartStatus("Чтобы отправить заявку, сначала оставь контакты или войди в аккаунт.", "error");
            return;
        }

        if (isSubmitting) {
            return;
        }

        const hadSessionBeforeSync = Boolean(getSession()?.access_token);
        await syncCurrentUser({ showExpiredMessage: true });

        const resolvedContact = getActiveContact();
        if (!resolvedContact) {
            openLeadModal();

            if (!hadSessionBeforeSync || currentUser) {
                setCartStatus("Чтобы отправить заявку, сначала оставь контакты или войди в аккаунт.", "error");
            }

            return;
        }

        try {
            setSubmittingState(true);

            const createdRequest = await requestJson("/service-requests/", {
                method: "POST",
                headers: buildHeaders(authSession?.access_token || ""),
                body: JSON.stringify(buildRequestPayload()),
            });

            writeJsonStorage(CART_STORAGE_KEY, []);
            renderCart();
            openCartPanel();
            setCartStatus(
                `Заявка №${createdRequest.id} отправлена. Это предварительный запрос: менеджер свяжется с тобой по телефону ${createdRequest.customer_phone} и уточнит итоговую стоимость.`,
                "success",
            );
        } catch (error) {
            setCartStatus(error.message, "error");
        } finally {
            setSubmittingState(false);
        }
    };

    pricingAccordionRoot?.addEventListener("click", (event) => {
        const addButton = event.target.closest(".pricing-add-button");

        if (!addButton) {
            return;
        }

        const cartItem = buildCartItemFromButton(addButton);
        const activeContact = getActiveContact();

        if (activeContact) {
            addItemToCart(cartItem);
            return;
        }

        openLeadModal(cartItem);
    });

    cartItems?.addEventListener("click", (event) => {
        const removeButton = event.target.closest("[data-remove-cart-item]");

        if (!removeButton) {
            return;
        }

        removeItemFromCart(removeButton.dataset.removeCartItem);
    });

    cartContact?.addEventListener("click", (event) => {
        if (!event.target.closest("[data-edit-service-contact]")) {
            return;
        }

        openLeadModal();
    });

    cartToggleButton?.addEventListener("click", () => {
        isCartOpen = !isCartOpen;
        syncCartPanelState();
    });

    cartBar?.addEventListener("click", (event) => {
        if (isCartOpen) {
            return;
        }

        if (event.target.closest("button, a, input, textarea, select, label")) {
            return;
        }

        openCartPanel();
    });

    cartCloseButton?.addEventListener("click", closeCartPanel);
    cartClearButton?.addEventListener("click", clearCart);
    cartSubmitButton?.addEventListener("click", submitCart);

    modalCloseTargets.forEach((target) => {
        target.addEventListener("click", closeLeadModal);
    });

    leadForm?.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!leadForm.reportValidity()) {
            return;
        }

        const formData = new FormData(leadForm);
        const firstName = String(formData.get("first_name") || "").trim();
        const lastName = String(formData.get("last_name") || "").trim();
        const phone = String(formData.get("phone") || "").trim();
        const phoneDigits = phone.replace(/\D/g, "");
        const firstNameInput = leadForm.querySelector('input[name="first_name"]');
        const lastNameInput = leadForm.querySelector('input[name="last_name"]');
        const phoneInput = leadForm.querySelector('input[name="phone"]');

        firstNameInput?.setCustomValidity("");
        lastNameInput?.setCustomValidity("");
        if (phoneInput) {
            phoneInput.setCustomValidity("");
        }

        if (firstName.length < 2 || lastName.length < 2) {
            setCartStatus("Укажи имя и фамилию полностью.", "error");
            return;
        }

        if (firstName.length > 40 || lastName.length > 40) {
            const tooLongInput = firstName.length > 40 ? firstNameInput : lastNameInput;
            tooLongInput?.setCustomValidity("Поле не должно превышать 40 символов.");
            tooLongInput?.reportValidity();
            return;
        }

        if (phoneDigits.length < 10) {
            phoneInput?.setCustomValidity("Укажи корректный номер телефона.");
            phoneInput?.reportValidity();
            return;
        }

        const savedContact = {
            firstName,
            lastName,
            phone,
        };

        writeJsonStorage(GUEST_STORAGE_KEY, savedContact);
        writeGuestContactConfirmed(true);

        if (currentUser?.id) {
            saveAccountContact(currentUser.id, savedContact);
        }

        if (pendingCartItem) {
            addItemToCart(pendingCartItem);
        } else {
            renderCart();
        }

        leadForm.reset();
        closeLeadModal();
        setCartStatus("Контакты сохранены. Теперь можно отправить заявку менеджеру.", "success");
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        if (leadModal && !leadModal.hidden) {
            closeLeadModal();
            return;
        }

        if (isCartOpen) {
            closeCartPanel();
        }
    });

    const bootstrap = async () => {
        if (!getSession()?.access_token) {
            writeGuestContactConfirmed(false);
        }

        await syncCurrentUser();
        renderCart();
    };

    bootstrap();
}
