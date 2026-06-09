const reviewsRoot = document.querySelector("[data-reviews-root]");

if (reviewsRoot) {
    const averageRatingElement = document.querySelector("#reviews-average-rating");
    const averageStarsElement = document.querySelector("#reviews-average-stars");
    const totalCountElement = document.querySelector("#reviews-total-count");
    const verifiedCountElement = document.querySelector("#reviews-verified-count");
    const repliesCountElement = document.querySelector("#reviews-replies-count");
    const distributionElement = document.querySelector("#reviews-distribution");
    const toolbarCountElement = document.querySelector("#reviews-toolbar-count");
    const reviewsListElement = document.querySelector("#reviews-list");
    const filterButtons = document.querySelectorAll("[data-review-filter]");
    const authHintElement = document.querySelector("#reviews-auth-hint");
    const reviewForm = document.querySelector("#review-form");
    const reviewFormMeta = document.querySelector("#reviews-form-meta");
    const reviewFormStatus = document.querySelector("#reviews-form-status");
    const ratingInput = document.querySelector("#review-rating");
    const ratingButtons = document.querySelectorAll("[data-rating-value]");
    const requestField = document.querySelector("#review-request-field");
    const requestSelect = document.querySelector("#review-request-select");
    const adminCard = document.querySelector("#reviews-admin-card");
    const adminList = document.querySelector("#reviews-admin-list");
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
    const apiBase = siteConfig?.resolveApiBase(reviewsRoot) || "/api";

    const STAR_FILLED = "\u2605";
    const STAR_EMPTY = "\u2606";

    let allReviews = [];
    let currentFilter = "all";
    let currentUser = null;
    let authSession = null;
    let myRequests = [];
    let adminReviews = [];

    const pluralizeReviews = (count) => {
        const lastTwo = count % 100;
        const lastOne = count % 10;

        if (lastTwo >= 11 && lastTwo <= 14) {
            return "отзывов";
        }
        if (lastOne === 1) {
            return "отзыв";
        }
        if (lastOne >= 2 && lastOne <= 4) {
            return "отзыва";
        }
        return "отзывов";
    };

    const escapeHtml = (value = "") =>
        String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");

    const formatText = (value = "") => escapeHtml(value).replaceAll("\n", "<br>");

    const formatDate = (value) => {
        if (!value) {
            return "";
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "";
        }

        return date.toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
        });
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

    const buildStars = (rating) => {
        const safeRating = Math.max(0, Math.min(5, Number(rating) || 0));
        return `${STAR_FILLED.repeat(safeRating)}${STAR_EMPTY.repeat(5 - safeRating)}`;
    };

    const setFormStatus = (message = "", tone = "") => {
        reviewFormStatus.textContent = message;
        reviewFormStatus.className = "reviews-form__status";

        if (tone) {
            reviewFormStatus.classList.add(`is-${tone}`);
        }
    };

    const updateRatingButtons = (value) => {
        const numericValue = Number(value) || 0;
        ratingInput.value = String(numericValue);

        ratingButtons.forEach((button) => {
            const buttonValue = Number(button.dataset.ratingValue || 0);
            button.classList.toggle("is-active", buttonValue <= numericValue);
        });
    };

    const summarizeRequest = (serviceRequest) => {
        const services = (serviceRequest.items || [])
            .map((item) => item.service)
            .filter(Boolean);
        const uniqueServices = [...new Set(services)];

        if (!uniqueServices.length) {
            return `Заявка #${serviceRequest.id}`;
        }

        const preview = uniqueServices.slice(0, 2).join(", ");
        const suffix = uniqueServices.length > 2 ? " и другое" : "";
        return preview + suffix;
    };

    const renderSummary = (summary) => {
        const averageRating = Math.max(0, Math.min(5, Number(summary.average_rating || 0)));
        const ratingFill = `${(averageRating / 5) * 100}%`;

        averageRatingElement.textContent = averageRating.toFixed(1);
        if (averageStarsElement) {
            averageStarsElement.style.setProperty("--rating-fill", ratingFill);
            averageStarsElement.setAttribute("aria-label", `Средняя оценка ${averageRating.toFixed(1)} из 5`);
            averageStarsElement.title = `${averageRating.toFixed(1)} из 5`;
        }
        totalCountElement.textContent = String(summary.total_reviews || 0);
        verifiedCountElement.textContent = String(summary.verified_reviews || 0);
        repliesCountElement.textContent = String(summary.replies_count || 0);

        if (distributionElement) {
            distributionElement.innerHTML = (summary.distribution || []).map((item) => `
                <div class="reviews-distribution__item">
                    <span class="reviews-distribution__label">${item.rating} ${STAR_FILLED}</span>
                    <div class="reviews-distribution__bar">
                        <span class="reviews-distribution__fill" style="--fill-width: ${item.percentage}%"></span>
                    </div>
                    <span class="reviews-distribution__count">${item.count}</span>
                </div>
            `).join("");
        }
    };

    const renderToolbarCount = (visibleCount) => {
        if (currentFilter === "all") {
            toolbarCountElement.textContent = `Показано ${visibleCount} ${pluralizeReviews(visibleCount)}.`;
            return;
        }

        toolbarCountElement.textContent = `Показано ${visibleCount} ${pluralizeReviews(visibleCount)} с оценкой ${currentFilter}.`;
    };

    const renderReviewCard = (review) => {
        const badges = [];

        if (review.is_verified) {
            badges.push('<span class="review-badge review-badge--verified">Подтверждённый клиент</span>');
        }

        if (review.admin_reply) {
            badges.push('<span class="review-badge review-badge--reply">Есть ответ студии</span>');
        }

        const headlineMarkup = review.headline
            ? `<h3 class="review-card__headline">${escapeHtml(review.headline)}</h3>`
            : "";

        const serviceMarkup = review.service_label
            ? `<div class="review-card__service">Услуга: ${escapeHtml(review.service_label)}</div>`
            : "";

        const replyMarkup = review.admin_reply
            ? `
                <div class="review-reply">
                    <div class="review-reply__title">Ответ студии</div>
                    <div class="review-reply__body">${formatText(review.admin_reply)}</div>
                </div>
            `
            : "";

        return `
            <article class="review-card">
                <div class="review-card__header">
                    <div class="review-card__author">
                        <strong>${escapeHtml(review.reviewer_name)}</strong>
                        <div class="review-card__badges">${badges.join("")}</div>
                    </div>
                    <div class="review-card__rating">
                        <div class="review-card__stars" aria-label="Оценка ${review.rating} из 5">${buildStars(review.rating)}</div>
                        <div class="review-card__meta">${escapeHtml(formatDate(review.created_at))}</div>
                    </div>
                </div>
                ${headlineMarkup}
                ${serviceMarkup}
                <div class="review-card__text">${formatText(review.review_text)}</div>
                ${replyMarkup}
            </article>
        `;
    };

    const applyFilter = (filterValue = "all") => {
        currentFilter = filterValue;

        filterButtons.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.reviewFilter === filterValue);
        });

        const filteredReviews = filterValue === "all"
            ? allReviews
            : allReviews.filter((review) => review.rating === Number(filterValue));

        renderToolbarCount(filteredReviews.length);

        if (!filteredReviews.length) {
            reviewsListElement.innerHTML = `
                <div class="reviews-empty">
                    Пока нет отзывов в этой категории. Можно выбрать другой фильтр или оставить новый отзыв.
                </div>
            `;
            return;
        }

        reviewsListElement.innerHTML = filteredReviews.map(renderReviewCard).join("");
    };

    const renderRequestOptions = () => {
        if (!currentUser || !requestSelect) {
            return;
        }

        if (!myRequests.length) {
            requestField.hidden = true;
            return;
        }

        requestField.hidden = false;
        requestSelect.innerHTML = [
            '<option value="">Без привязки к заявке</option>',
            ...myRequests.map((serviceRequest) => `
                <option value="${serviceRequest.id}">
                    Заявка #${serviceRequest.id} · ${escapeHtml(summarizeRequest(serviceRequest))}
                </option>
            `),
        ].join("");
    };

    const renderAuthState = () => {
        if (currentUser) {
            authHintElement.hidden = true;
            reviewForm.hidden = false;
            reviewFormMeta.innerHTML = `
                Отзыв будет опубликован от имени <strong>${escapeHtml(currentUser.full_name)}</strong>.
                Если выбрать свою заявку ниже, отзыв получит пометку «Подтверждённый клиент».
            `;
            renderRequestOptions();
            return;
        }

        reviewForm.hidden = true;
        requestField.hidden = true;
        authHintElement.hidden = false;
        authHintElement.innerHTML = `
            Чтобы оставить отзыв, <a href="profile.html">войти или зарегистрироваться</a> в личном кабинете.
            Это защищает страницу от случайного спама и делает отзывы ближе к логике крупных площадок.
        `;
    };

    const renderAdminQueue = () => {
        if (!adminCard) {
            return;
        }

        if (!currentUser || currentUser.role !== "admin") {
            adminCard.hidden = true;
            return;
        }

        adminCard.hidden = false;

        if (!adminReviews.length) {
            adminList.innerHTML = '<div class="reviews-empty">Отзывов для модерации пока нет.</div>';
            return;
        }

        adminList.innerHTML = adminReviews.map((review) => `
            <article class="reviews-admin-item" data-admin-review-id="${review.id}">
                <div class="reviews-admin-item__top">
                    <div class="reviews-admin-item__title">
                        <strong>${escapeHtml(review.reviewer_name)}</strong>
                        <div class="reviews-admin-item__meta">
                            ${buildStars(review.rating)} · ${escapeHtml(formatDate(review.created_at))}
                        </div>
                        ${review.service_label ? `<div class="reviews-admin-item__service">Услуга: ${escapeHtml(review.service_label)}</div>` : ""}
                    </div>
                    <span class="reviews-admin-item__status ${review.status === "hidden" ? "is-hidden" : ""}">
                        ${review.status === "hidden" ? "Скрыт" : "Опубликован"}
                    </span>
                </div>
                <div class="reviews-admin-item__body">${formatText(review.review_text)}</div>
                <div class="reviews-admin-actions">
                    <button class="reviews-admin-button ${review.status !== "hidden" ? "is-primary" : ""}" type="button" data-review-status-action="${review.id}" data-next-status="${review.status === "hidden" ? "published" : "hidden"}">
                        ${review.status === "hidden" ? "Опубликовать" : "Скрыть"}
                    </button>
                </div>
                <form class="reviews-admin-reply" data-admin-reply-form="${review.id}">
                    <textarea name="admin_reply" placeholder="Ответ студии на отзыв..." minlength="4" maxlength="1500">${escapeHtml(review.admin_reply || "")}</textarea>
                    <div class="reviews-admin-reply__status" data-admin-reply-status="${review.id}"></div>
                    <button class="reviews-admin-button" type="submit">Сохранить ответ</button>
                </form>
            </article>
        `).join("");
    };

    const syncCurrentUser = async () => {
        const session = authStorage.read();
        authSession = session;

        if (!session?.access_token) {
            currentUser = null;
            myRequests = [];
            renderAuthState();
            renderAdminQueue();
            return;
        }

        try {
            currentUser = await requestJson("/users/me", {
                method: "GET",
                headers: buildHeaders(session.access_token),
            });

            authSession = {
                access_token: session.access_token,
                token_type: session.token_type || "bearer",
                user: currentUser,
            };
            authStorage.save(authSession);
        } catch (error) {
            currentUser = null;
            authSession = null;
            myRequests = [];
            authStorage.clear();
        }

        renderAuthState();
        renderAdminQueue();
    };

    const loadMyRequests = async () => {
        if (!currentUser || !authSession?.access_token) {
            myRequests = [];
            renderRequestOptions();
            return;
        }

        try {
            myRequests = await requestJson("/service-requests/my", {
                method: "GET",
                headers: buildHeaders(authSession.access_token),
            });
        } catch (error) {
            myRequests = [];
        }

        renderRequestOptions();
    };

    const loadReviews = async () => {
        reviewsListElement.innerHTML = '<div class="reviews-empty">Загружаем отзывы...</div>';

        try {
            const payload = await requestJson("/reviews/", {
                method: "GET",
                headers: buildHeaders(),
            });

            allReviews = payload.items || [];
            renderSummary(payload.summary || {
                average_rating: 0,
                total_reviews: 0,
                verified_reviews: 0,
                replies_count: 0,
                distribution: [],
            });
            applyFilter(currentFilter);
        } catch (error) {
            reviewsListElement.innerHTML = `<div class="reviews-empty">${escapeHtml(error.message)}</div>`;
            toolbarCountElement.textContent = "Не удалось загрузить отзывы.";
        }
    };

    const loadAdminReviews = async () => {
        if (!currentUser || currentUser.role !== "admin" || !authSession?.access_token) {
            adminReviews = [];
            renderAdminQueue();
            return;
        }

        try {
            adminReviews = await requestJson("/reviews/admin", {
                method: "GET",
                headers: buildHeaders(authSession.access_token),
            });
        } catch (error) {
            adminReviews = [];
        }

        renderAdminQueue();
    };

    const submitReview = async (event) => {
        event.preventDefault();

        if (!authSession?.access_token) {
            setFormStatus("Сначала войди в аккаунт, чтобы оставить отзыв.", "error");
            return;
        }

        if (!reviewForm.reportValidity()) {
            return;
        }

        const formData = new FormData(reviewForm);
        const serviceRequestValue = String(formData.get("service_request_id") || "").trim();
        const payload = {
            rating: Number(formData.get("rating") || 0),
            service_request_id: serviceRequestValue ? Number(serviceRequestValue) : null,
            service_label: String(formData.get("service_label") || "").trim() || null,
            headline: String(formData.get("headline") || "").trim() || null,
            review_text: String(formData.get("review_text") || "").trim(),
        };

        if (!payload.rating) {
            setFormStatus("Выбери оценку от 1 до 5.", "error");
            return;
        }

        if (payload.headline && payload.headline.length > 120) {
            setFormStatus("Заголовок не должен превышать 120 символов.", "error");
            return;
        }

        if (payload.service_label && payload.service_label.length > 120) {
            setFormStatus("Название услуги не должно превышать 120 символов.", "error");
            return;
        }

        if (payload.review_text.length < 12) {
            setFormStatus("Текст отзыва должен содержать минимум 12 символов.", "error");
            return;
        }

        if (payload.review_text.length > 3000) {
            setFormStatus("Текст отзыва не должен превышать 3000 символов.", "error");
            return;
        }

        setFormStatus("Сохраняем отзыв...", "");

        try {
            await requestJson("/reviews/", {
                method: "POST",
                headers: buildHeaders(authSession.access_token),
                body: JSON.stringify(payload),
            });

            reviewForm.reset();
            updateRatingButtons(5);
            currentFilter = "all";
            setFormStatus("Отзыв сохранён. Спасибо за обратную связь.", "success");
            await loadReviews();
            await loadAdminReviews();
            renderAuthState();
        } catch (error) {
            setFormStatus(error.message, "error");
        }
    };

    const setAdminReplyStatus = (reviewId, message = "", tone = "") => {
        const statusElement = document.querySelector(`[data-admin-reply-status="${reviewId}"]`);
        if (!statusElement) {
            return;
        }

        statusElement.textContent = message;
        statusElement.className = "reviews-admin-reply__status";
        if (tone) {
            statusElement.classList.add(`is-${tone}`);
        }
    };

    const updateReviewStatus = async (reviewId, nextStatus) => {
        if (!authSession?.access_token) {
            return;
        }

        try {
            await requestJson(`/reviews/admin/${reviewId}/status`, {
                method: "PUT",
                headers: buildHeaders(authSession.access_token),
                body: JSON.stringify({ status: nextStatus }),
            });

            await loadReviews();
            await loadAdminReviews();
        } catch (error) {
            setAdminReplyStatus(reviewId, error.message, "error");
        }
    };

    const submitAdminReply = async (reviewId, form) => {
        if (!authSession?.access_token) {
            return;
        }

        if (!form.reportValidity()) {
            return;
        }

        const formData = new FormData(form);
        const adminReply = String(formData.get("admin_reply") || "").trim();

        if (adminReply.length > 1500) {
            setAdminReplyStatus(reviewId, "Ответ студии не должен превышать 1500 символов.", "error");
            return;
        }

        setAdminReplyStatus(reviewId, "Сохраняем ответ...", "");

        try {
            await requestJson(`/reviews/admin/${reviewId}/reply`, {
                method: "PUT",
                headers: buildHeaders(authSession.access_token),
                body: JSON.stringify({ admin_reply: adminReply }),
            });

            setAdminReplyStatus(reviewId, "Ответ студии сохранён.", "success");
            await loadReviews();
            await loadAdminReviews();
        } catch (error) {
            setAdminReplyStatus(reviewId, error.message, "error");
        }
    };

    const initialize = async () => {
        updateRatingButtons(5);

        filterButtons.forEach((button) => {
            button.addEventListener("click", () => {
                applyFilter(button.dataset.reviewFilter || "all");
            });
        });

        ratingButtons.forEach((button) => {
            button.addEventListener("click", () => {
                updateRatingButtons(button.dataset.ratingValue || "5");
            });
        });

        reviewForm?.addEventListener("submit", submitReview);

        adminCard?.addEventListener("click", async (event) => {
            const actionButton = event.target.closest("[data-review-status-action]");
            if (!actionButton) {
                return;
            }

            await updateReviewStatus(
                actionButton.dataset.reviewStatusAction,
                actionButton.dataset.nextStatus || "hidden",
            );
        });

        adminCard?.addEventListener("submit", async (event) => {
            const form = event.target.closest("[data-admin-reply-form]");
            if (!form) {
                return;
            }

            event.preventDefault();
            await submitAdminReply(form.dataset.adminReplyForm, form);
        });

        await syncCurrentUser();
        await loadMyRequests();
        await loadReviews();
        await loadAdminReviews();
    };

    initialize();
}
