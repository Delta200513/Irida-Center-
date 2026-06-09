const newsAdminRoot = document.querySelector("[data-news-root]");

if (newsAdminRoot) {
    const newsFeedList = document.querySelector("#news-feed-list");
    const newsStatus = document.querySelector("#news-status");
    const refreshFeedButton = document.querySelector("#refresh-feed-button");
    const siteConfig = window.IridaSiteConfig || null;
    const apiBase = siteConfig?.resolveApiBase(newsAdminRoot) || "/api";
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
    const ALLOWED_NEWS_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const ALLOWED_NEWS_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
    const MAX_NEWS_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

    let currentUser = authStorage.read()?.user || null;

    const escapeHtml = (value) => String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const buildHeaders = (token = "") => {
        const headers = {};
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        return headers;
    };

    const setStatus = (message = "", tone = "") => {
        if (!newsStatus) {
            return;
        }

        newsStatus.textContent = message;
        newsStatus.className = "news-status";

        if (tone) {
            newsStatus.classList.add(`is-${tone}`);
        }
    };

    const extractErrorMessage = async (response) => {
        try {
            const payload = await response.json();
            return payload.detail || payload.message || "Запрос не выполнен";
        } catch (error) {
            return "Запрос не выполнен";
        }
    };

    const requestJson = async (path, options = {}) => {
        const response = await fetch(`${apiBase}${path}`, options);
        if (!response.ok) {
            throw new Error(await extractErrorMessage(response));
        }
        return response.json();
    };

    const validateNewsImageFile = (file) => {
        if (!file || !file.name) {
            return "";
        }

        const fileName = String(file.name || "").trim().toLowerCase();
        const extension = fileName.includes(".")
            ? fileName.slice(fileName.lastIndexOf("."))
            : "";

        if (!ALLOWED_NEWS_IMAGE_EXTENSIONS.has(extension)) {
            return "Для новости подходит только JPG, PNG, WEBP или GIF.";
        }

        if (file.type && !ALLOWED_NEWS_IMAGE_TYPES.has(file.type)) {
            return "Файл новости должен быть изображением JPG, PNG, WEBP или GIF.";
        }

        if (file.size > MAX_NEWS_IMAGE_SIZE_BYTES) {
            return "Изображение для новости не должно превышать 5 МБ.";
        }

        return "";
    };

    const readSession = () => authStorage.read();

    const syncCurrentUser = async (force = false) => {
        const session = readSession();
        if (!force && currentUser) {
            return currentUser;
        }

        currentUser = session?.user || null;

        if (!session?.access_token) {
            return currentUser;
        }

        try {
            currentUser = await requestJson("/users/me", {
                method: "GET",
                headers: buildHeaders(session.access_token),
            });
        } catch (error) {
            currentUser = null;
        }

        return currentUser;
    };

    const buildEditorMarkup = ({ postId, title, content, hasImage }) => `
        <form class="news-post-editor" data-admin-edit-post-form="${postId}" hidden>
            <label class="news-field">
                <span>Заголовок</span>
                <input type="text" name="title" value="${escapeHtml(title)}" minlength="3" maxlength="140" required>
            </label>

            <label class="news-field">
                <span>Текст новости</span>
                <textarea name="content" rows="7" minlength="10" maxlength="10000" required>${escapeHtml(content)}</textarea>
            </label>

            <label class="news-field">
                <span>Новое изображение</span>
                <input type="file" name="image" accept=".jpg,.jpeg,.png,.webp,.gif">
            </label>

            ${hasImage ? `
                <label class="news-checkbox news-checkbox--editor">
                    <input type="checkbox" name="remove_image" value="true">
                    <span>Удалить текущее изображение</span>
                </label>
            ` : ""}

            <label class="news-checkbox news-checkbox--editor">
                <input type="checkbox" name="is_published" checked>
                <span>Публиковать пост</span>
            </label>

            <div class="news-post-editor__actions">
                <button class="news-submit" type="submit">Сохранить изменения</button>
                <button class="news-post__action" type="button" data-cancel-admin-edit="${postId}">Отмена</button>
            </div>
        </form>
    `;

    const toggleEditor = (postId, forceOpen = null) => {
        const form = document.querySelector(`[data-admin-edit-post-form="${postId}"]`);
        const button = document.querySelector(`[data-open-admin-edit="${postId}"]`);
        if (!form) {
            return;
        }

        const shouldOpen = forceOpen ?? form.hidden;
        form.hidden = !shouldOpen;

        if (button) {
            button.textContent = shouldOpen ? "Скрыть редактор" : "Редактировать";
        }
    };

    const enhancePostCard = (post) => {
        if (currentUser?.role !== "admin" || !post) {
            return;
        }

        const postId = post.dataset.postId;
        if (!postId) {
            return;
        }

        const header = post.querySelector(".news-post__header");
        const deleteButton = header?.querySelector("[data-delete-post]");
        if (deleteButton && !header.querySelector(`[data-open-admin-edit="${postId}"]`)) {
            deleteButton.insertAdjacentHTML(
                "beforebegin",
                `<button class="news-post__action" type="button" data-open-admin-edit="${postId}">Редактировать</button>`,
            );
        }

        if (post.querySelector(`[data-admin-edit-post-form="${postId}"]`)) {
            return;
        }

        const body = post.querySelector(".news-post__body");
        const title = post.querySelector(".news-post__title")?.textContent?.trim() || "";
        const content = post.querySelector(".news-post__text")?.textContent?.trim() || "";
        const hasImage = Boolean(post.querySelector(".news-post__image"));

        if (body) {
            body.insertAdjacentHTML(
                "afterend",
                buildEditorMarkup({
                    postId,
                    title,
                    content,
                    hasImage,
                }),
            );
        }
    };

    const enhanceAdminEditors = async () => {
        await syncCurrentUser();
        if (currentUser?.role !== "admin" || !newsFeedList) {
            return;
        }

        newsFeedList.querySelectorAll(".news-post").forEach(enhancePostCard);
    };

    const submitPostUpdate = async (postId, form) => {
        const session = readSession();
        await syncCurrentUser(true);
        if (!session?.access_token || currentUser?.role !== "admin") {
            setStatus("Редактирование постов доступно только администратору.", "error");
            return;
        }

        if (!form.reportValidity()) {
            return;
        }

        const formData = new FormData(form);
        const title = String(formData.get("title") || "").trim();
        const content = String(formData.get("content") || "").trim();
        const imageFile = formData.get("image");

        if (title.length > 140) {
            setStatus("Заголовок не должен превышать 140 символов.", "error");
            return;
        }

        if (content.length < 10) {
            setStatus("Текст новости должен содержать минимум 10 символов.", "error");
            return;
        }

        if (content.length > 10000) {
            setStatus("Текст новости не должен превышать 10000 символов.", "error");
            return;
        }

        const imageValidationError = validateNewsImageFile(imageFile);
        if (imageValidationError) {
            setStatus(imageValidationError, "error");
            return;
        }

        if (!formData.get("is_published")) {
            formData.set("is_published", "false");
        } else {
            formData.set("is_published", "true");
        }

        if (!formData.get("remove_image")) {
            formData.set("remove_image", "false");
        }

        setStatus("Сохраняем изменения поста...", "");

        try {
            await requestJson(`/posts/${postId}`, {
                method: "PUT",
                headers: buildHeaders(session.access_token),
                body: formData,
            });

            setStatus("Пост обновлён.", "success");
            if (refreshFeedButton) {
                refreshFeedButton.click();
            } else {
                window.location.reload();
            }
        } catch (error) {
            setStatus(error.message, "error");
        }
    };

    newsFeedList?.addEventListener("click", async (event) => {
        const openEditorButton = event.target.closest("[data-open-admin-edit]");
        if (openEditorButton) {
            toggleEditor(openEditorButton.dataset.openAdminEdit);
            return;
        }

        const cancelEditorButton = event.target.closest("[data-cancel-admin-edit]");
        if (cancelEditorButton) {
            toggleEditor(cancelEditorButton.dataset.cancelAdminEdit, false);
            return;
        }
    });

    newsFeedList?.addEventListener("submit", async (event) => {
        const editForm = event.target.closest("[data-admin-edit-post-form]");
        if (!editForm) {
            return;
        }

        event.preventDefault();
        await submitPostUpdate(editForm.dataset.adminEditPostForm, editForm);
    });

    const observer = new MutationObserver(() => {
        void enhanceAdminEditors();
    });

    if (newsFeedList) {
        observer.observe(newsFeedList, { childList: true, subtree: true });
    }

    void enhanceAdminEditors();
}
