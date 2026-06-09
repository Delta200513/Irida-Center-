const blogRoot = document.querySelector("[data-blog-root]");

if (blogRoot) {
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
    };
    const apiBase = siteConfig?.resolveApiBase(blogRoot) || "/api";
    const toolbarCount = document.querySelector("#blog-toolbar-count");
    const chipButtons = Array.from(document.querySelectorAll("[data-blog-filter]"));
    const paginationRoot = document.querySelector("#blog-pagination");
    const postsRoot = document.querySelector("#blog-posts");
    const postCards = Array.from(postsRoot?.querySelectorAll("[data-blog-category]") || []);
    const ctaForm = document.querySelector("#blog-cta-form");
    const ctaStatus = document.querySelector("#blog-cta-status");

    const PAGE_SIZE = 4;
    const state = {
        activeFilter: "all",
        currentPage: 1,
    };

    const scrollToPostsTop = () => {
        const scrollTarget = document.querySelector(".blog-heading") || postsRoot || blogRoot;
        if (!scrollTarget) {
            return;
        }

        scrollTarget.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    };

    const pluralizeMaterials = (count) => {
        const lastTwoDigits = count % 100;
        const lastDigit = count % 10;

        if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
            return `${count} материалов`;
        }

        if (lastDigit === 1) {
            return `${count} материал`;
        }

        if (lastDigit >= 2 && lastDigit <= 4) {
            return `${count} материала`;
        }

        return `${count} материалов`;
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
            return payload.detail || payload.message || "Не удалось выполнить запрос.";
        } catch (error) {
            return "Не удалось выполнить запрос.";
        }
    };

    const requestJson = async (path, options = {}) => {
        const response = await fetch(`${apiBase}${path}`, options);

        if (!response.ok) {
            throw new Error(await extractErrorMessage(response));
        }

        return response.json();
    };

    const setStatus = (message = "", tone = "") => {
        if (!ctaStatus) {
            return;
        }

        ctaStatus.textContent = message;
        ctaStatus.className = "blog-cta__status";

        if (tone) {
            ctaStatus.classList.add(`is-${tone}`);
        }
    };

    const getFilteredPosts = () => {
        if (state.activeFilter === "all") {
            return postCards;
        }

        return postCards.filter((post) => post.dataset.blogCategory === state.activeFilter);
    };

    const renderEmptyState = (filteredPosts) => {
        const existingEmpty = postsRoot.querySelector(".blog-empty");
        if (existingEmpty) {
            existingEmpty.remove();
        }

        if (filteredPosts.length > 0) {
            return;
        }

        const emptyState = document.createElement("div");
        emptyState.className = "blog-empty";
        emptyState.textContent = "В этой категории пока нет материалов. Выбери другой раздел блога.";
        postsRoot.append(emptyState);
    };

    const renderPagination = (totalPages) => {
        if (!paginationRoot) {
            return;
        }

        paginationRoot.innerHTML = "";
        paginationRoot.hidden = totalPages <= 1;

        for (let page = 1; page <= totalPages; page += 1) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `blog-page-link${page === state.currentPage ? " is-current" : ""}`;
            button.dataset.blogPage = String(page);
            button.textContent = String(page);
            paginationRoot.append(button);
        }

        if (totalPages > 1) {
            const nextButton = document.createElement("button");
            nextButton.type = "button";
            nextButton.className = "blog-page-link";
            nextButton.dataset.blogPageNext = "true";
            nextButton.textContent = "Следующая";
            nextButton.disabled = state.currentPage >= totalPages;
            paginationRoot.append(nextButton);
        }
    };

    const renderPosts = () => {
        const filteredPosts = getFilteredPosts();
        const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE));
        state.currentPage = Math.min(state.currentPage, totalPages);

        const startIndex = (state.currentPage - 1) * PAGE_SIZE;
        const visiblePosts = new Set(filteredPosts.slice(startIndex, startIndex + PAGE_SIZE));

        postCards.forEach((post) => {
            post.hidden = !visiblePosts.has(post);
        });

        if (toolbarCount) {
            toolbarCount.textContent = pluralizeMaterials(filteredPosts.length);
        }

        renderEmptyState(filteredPosts);
        renderPagination(totalPages);
    };

    const renderChips = () => {
        chipButtons.forEach((button) => {
            const isActive = button.dataset.blogFilter === state.activeFilter;
            button.classList.toggle("is-active", isActive);
        });
    };

    const applyFilter = (filter) => {
        state.activeFilter = filter;
        state.currentPage = 1;
        renderChips();
        renderPosts();
        scrollToPostsTop();
    };

    const prefillFormFromSession = () => {
        if (!ctaForm) {
            return;
        }

        const session = authStorage.read();
        const user = session?.user;
        if (!user) {
            return;
        }

        const nameInput = ctaForm.querySelector('input[name="name"]');
        const phoneInput = ctaForm.querySelector('input[name="phone"]');

        if (nameInput && !nameInput.value.trim()) {
            nameInput.value = user.full_name || "";
        }

        if (phoneInput && !phoneInput.value.trim() && user.phone) {
            phoneInput.value = user.phone;
        }
    };

    chipButtons.forEach((button) => {
        button.addEventListener("click", () => {
            applyFilter(button.dataset.blogFilter || "all");
        });
    });

    paginationRoot?.addEventListener("click", (event) => {
        const pageButton = event.target.closest("[data-blog-page]");
        if (pageButton) {
            state.currentPage = Number(pageButton.dataset.blogPage) || 1;
            renderPosts();
            scrollToPostsTop();
            return;
        }

        const nextButton = event.target.closest("[data-blog-page-next]");
        if (nextButton) {
            const totalPages = Math.max(1, Math.ceil(getFilteredPosts().length / PAGE_SIZE));
            if (state.currentPage < totalPages) {
                state.currentPage += 1;
                renderPosts();
                scrollToPostsTop();
            }
        }
    });

    ctaForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!ctaForm.reportValidity()) {
            return;
        }

        const formData = new FormData(ctaForm);
        const name = String(formData.get("name") || "").trim();
        const phone = String(formData.get("phone") || "").trim();
        const message = String(formData.get("message") || "").trim();
        const phoneDigits = phone.replace(/\D/g, "");

        if (name.length < 2) {
            setStatus("Укажи имя, чтобы мы понимали, как к тебе обратиться.", "error");
            return;
        }

        if (phoneDigits.length < 10) {
            setStatus("Укажи корректный номер телефона, чтобы менеджер мог связаться с тобой.", "error");
            return;
        }

        if (name.length > 80) {
            setStatus("Имя не должно превышать 80 символов.", "error");
            return;
        }

        if (message.length > 1000) {
            setStatus("Комментарий не должен превышать 1000 символов.", "error");
            return;
        }

        const session = authStorage.read();

        setStatus("Отправляем заявку...", "");

        try {
            const createdRequest = await requestJson("/contact-requests/", {
                method: "POST",
                headers: buildHeaders(session?.access_token || ""),
                body: JSON.stringify({
                    name,
                    phone,
                    message,
                    source_page: "blog",
                }),
            });

            ctaForm.reset();
            prefillFormFromSession();
            setStatus(
                `Заявка №${createdRequest.id} отправлена. Менеджер свяжется с тобой по номеру ${createdRequest.customer_phone}.`,
                "success",
            );
        } catch (error) {
            setStatus(error.message, "error");
        }
    });

    renderChips();
    renderPosts();
    prefillFormFromSession();
}
