const newsRoot = document.querySelector("[data-news-root]");

if (newsRoot) {
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
        save(nextSession) {
            localStorage.setItem("irida_auth_session", JSON.stringify(nextSession));
        },
        clear() {
            localStorage.removeItem("irida_auth_session");
        },
    };
    const newsStatus = document.querySelector("#news-status");
    const newsFeedMeta = document.querySelector("#news-feed-meta");
    const newsFeedList = document.querySelector("#news-feed-list");
    const refreshFeedButton = document.querySelector("#refresh-feed-button");
    const newsUserTitle = document.querySelector("#news-user-title");
    const newsUserDescription = document.querySelector("#news-user-description");
    const newsComposer = document.querySelector("#news-composer");
    const newsPostForm = document.querySelector("#news-post-form");
    const commentsCache = new Map();
    const ALLOWED_NEWS_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const ALLOWED_NEWS_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
    const MAX_NEWS_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

    let session = null;
    let currentUser = null;
    let editingPostId = null;

    const apiBase = siteConfig?.resolveApiBase(newsRoot) || "/api";

    const setStatus = (message = "", tone = "") => {
        newsStatus.textContent = message;
        newsStatus.className = "news-status";

        if (tone) {
            newsStatus.classList.add(`is-${tone}`);
        }
    };

    const formatDate = (value) => {
        if (!value) {
            return "";
        }

        return new Intl.DateTimeFormat("ru-RU", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(value));
    };

    const escapeHtml = (value) => String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const formatText = (value) => escapeHtml(value).replace(/\n/g, "<br>");

    const getSession = () => {
        return authStorage.read();
    };

    const saveSession = (nextSession) => {
        session = nextSession;
        authStorage.save(nextSession);
    };

    const clearSession = () => {
        session = null;
        currentUser = null;
        authStorage.clear();
    };

    const buildHeaders = (token = "") => {
        const headers = {};

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        return headers;
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

    const resolveAssetUrl = (value) => {
        if (!value) {
            return "";
        }

        if (/^https?:\/\//i.test(value)) {
            return value;
        }

        if (value.startsWith("/")) {
            if (/^https?:\/\//i.test(apiBase)) {
                return `${new URL(apiBase).origin}${value}`;
            }

            return value;
        }

        return value;
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

    const updateUserPanel = () => {
        if (!currentUser) {
            newsUserTitle.textContent = "Гость";
            newsUserDescription.textContent = "Чтобы комментировать новости и ставить лайки, войди в аккаунт на странице профиля.";
            newsComposer.hidden = true;
            return;
        }

        newsUserTitle.textContent = currentUser.full_name;

        if (currentUser.role === "admin") {
            newsUserDescription.textContent = "У тебя есть права администратора: можешь публиковать новости с фото прямо из этой панели.";
            newsComposer.hidden = false;
            return;
        }

        newsUserDescription.textContent = "Ты авторизован. Можешь ставить лайки и писать комментарии под новостями.";
        newsComposer.hidden = true;
    };

    const syncCurrentUser = async () => {
        session = getSession();
        currentUser = session?.user || null;

        if (!session?.access_token) {
            updateUserPanel();
            return;
        }

        try {
            currentUser = await requestJson("/users/me", {
                method: "GET",
                headers: buildHeaders(session.access_token),
            });

            saveSession({
                access_token: session.access_token,
                token_type: session.token_type || "bearer",
                user: currentUser,
            });
        } catch (error) {
            clearSession();
            setStatus("Сессия истекла. Войди снова через страницу профиля.", "error");
        }

        updateUserPanel();
    };

    const renderComment = (comment) => {
        const adminDeleteMarkup = currentUser?.role === "admin"
            ? `
                <button
                    class="news-comment__delete"
                    type="button"
                    data-delete-comment="${comment.id}"
                    data-comment-post="${comment.post_id}">
                    Удалить
                </button>
            `
            : "";

        return `
            <article class="news-comment">
                <div class="news-comment__header">
                    <div class="news-comment__author">
                        <strong>${escapeHtml(comment.user_name)}</strong>
                        <span class="news-comment__meta">${escapeHtml(formatDate(comment.created_at))}</span>
                    </div>
                    ${adminDeleteMarkup}
                </div>
                <div class="news-comment__text">${formatText(comment.comment_text)}</div>
            </article>
        `;
    };

    const buildCommentsMarkup = (postId) => {
        const comments = commentsCache.get(postId) || [];

        const commentsListMarkup = comments.length > 0
            ? comments.map(renderComment).join("")
            : '<div class="news-comment__empty">Пока комментариев нет. Можно стать первым.</div>';

        const commentFormMarkup = currentUser
            ? `
                <form class="news-comment__form" data-comment-form="${postId}">
                    <textarea name="comment_text" rows="3" placeholder="Напиши комментарий к новости..." minlength="2" maxlength="1000" required></textarea>
                    <button class="news-comment__submit" type="submit">Отправить комментарий</button>
                </form>
            `
            : `
                <div class="news-comment__login">
                    Чтобы комментировать, войди в аккаунт на <a class="news-secondary-link" href="profile.html">странице профиля</a>.
                </div>
            `;

        return `
            <div class="news-comments__list">${commentsListMarkup}</div>
            ${commentFormMarkup}
        `;
    };

    const buildAdminPostEditorMarkup = (post) => {
        if (currentUser?.role !== "admin") {
            return "";
        }

        const isEditing = String(editingPostId) === String(post.id);

        return `
            <form class="news-post-editor" data-edit-post-form="${post.id}"${isEditing ? "" : " hidden"}>
                <label class="news-field">
                    <span>Заголовок</span>
                    <input type="text" name="title" value="${escapeHtml(post.title || "")}" minlength="3" maxlength="140" required>
                </label>

                <label class="news-field">
                    <span>Текст новости</span>
                    <textarea name="content" rows="7" minlength="10" maxlength="10000" required>${escapeHtml(post.content || "")}</textarea>
                </label>

                <label class="news-field">
                    <span>Новое изображение</span>
                    <input type="file" name="image" accept=".jpg,.jpeg,.png,.webp,.gif">
                </label>

                ${post.image_url ? `
                    <label class="news-checkbox news-checkbox--editor">
                        <input type="checkbox" name="remove_image" value="true">
                        <span>Удалить текущее изображение</span>
                    </label>
                ` : ""}

                <label class="news-checkbox news-checkbox--editor">
                    <input type="checkbox" name="is_published"${post.is_published !== false ? " checked" : ""}>
                    <span>Публиковать пост</span>
                </label>

                <div class="news-post-editor__actions">
                    <button class="news-submit" type="submit">Сохранить изменения</button>
                    <button class="news-post__action" type="button" data-cancel-edit-post="${post.id}">Отмена</button>
                </div>
            </form>
        `;
    };

    const renderPost = (post) => {
        const imageMarkup = post.image_url
            ? `<img class="news-post__image" src="${escapeHtml(resolveAssetUrl(post.image_url))}" alt="${escapeHtml(post.title)}">`
            : "";

        const adminActionsMarkup = currentUser?.role === "admin"
            ? `
                <button class="news-post__danger" type="button" data-delete-post="${post.id}">
                    Удалить
                </button>
            `
            : "";

        return `
            <article class="news-post" data-post-id="${post.id}">
                <div class="news-post__header">
                    <div>
                        <div class="news-post__top">
                            <h3 class="news-post__title">${escapeHtml(post.title)}</h3>
                        </div>
                        <p class="news-post__meta">
                            ${escapeHtml(post.author_name)} · ${escapeHtml(formatDate(post.created_at))}
                        </p>
                    </div>
                    ${adminActionsMarkup}
                </div>

                <div class="news-post__body">
                    ${imageMarkup}
                    <div class="news-post__text">${formatText(post.content)}</div>
                </div>

                <div class="news-post__actions">
                    <div class="news-post__actions-group">
                        <button
                            class="news-post__action${post.liked_by_current_user ? " is-liked" : ""}"
                            type="button"
                            data-like-post="${post.id}">
                            ${post.liked_by_current_user ? "Лайк поставлен" : "Лайк"} · ${post.likes_count}
                        </button>

                        <button
                            class="news-post__action"
                            type="button"
                            data-toggle-comments="${post.id}">
                            Комментарии · ${post.comments_count}
                        </button>
                    </div>
                </div>

                <div class="news-comments" id="comments-${post.id}" hidden></div>
            </article>
        `;
    };

    const loadComments = async (postId) => {
        const comments = await requestJson(`/comments/post/${postId}`, {
            method: "GET",
            headers: buildHeaders(session?.access_token || ""),
        });
        commentsCache.set(postId, comments);
        return comments;
    };

    const toggleComments = async (postId) => {
        const commentsContainer = document.querySelector(`#comments-${postId}`);
        if (!commentsContainer) {
            return;
        }

        if (commentsContainer.hidden) {
            if (!commentsCache.has(postId)) {
                commentsContainer.innerHTML = '<div class="news-comment__empty">Загружаем комментарии...</div>';
                commentsContainer.hidden = false;

                try {
                    await loadComments(postId);
                } catch (error) {
                    commentsContainer.innerHTML = `<div class="news-comment__empty">${escapeHtml(error.message)}</div>`;
                    return;
                }
            }

            commentsContainer.innerHTML = buildCommentsMarkup(postId);
            commentsContainer.hidden = false;
            return;
        }

        commentsContainer.hidden = true;
    };

    const loadPosts = async () => {
        newsFeedMeta.textContent = "Загрузка ленты...";

        try {
            const posts = await requestJson("/posts/", {
                method: "GET",
                headers: buildHeaders(session?.access_token || ""),
            });

            if (posts.length === 0) {
                newsFeedList.innerHTML = '<div class="news-empty">Пока новостей нет. Как только администратор опубликует первую запись, она появится здесь.</div>';
                newsFeedMeta.textContent = "0 публикаций";
                return;
            }

            commentsCache.clear();
            newsFeedList.innerHTML = posts.map(renderPost).join("");
            newsFeedMeta.textContent = `${posts.length} публикац${posts.length === 1 ? "ия" : posts.length < 5 ? "ии" : "ий"}`;
        } catch (error) {
            newsFeedList.innerHTML = '<div class="news-empty">Лента временно недоступна.</div>';
            newsFeedMeta.textContent = "Ошибка загрузки";
            setStatus(error.message, "error");
        }
    };

    const submitNewsPost = async (form) => {
        if (currentUser?.role !== "admin") {
            setStatus("Публикация доступна только администратору.", "error");
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

        setStatus("Публикуем новость...", "");

        try {
            await requestJson("/posts/", {
                method: "POST",
                headers: buildHeaders(session?.access_token || ""),
                body: formData,
            });

            form.reset();
            setStatus("Новость опубликована.", "success");
            await loadPosts();
        } catch (error) {
            setStatus(error.message, "error");
        }
    };

    const toggleLike = async (postId) => {
        if (!session?.access_token) {
            setStatus("Чтобы ставить лайки, сначала войди в аккаунт.", "error");
            return;
        }

        try {
            await requestJson(`/posts/${postId}/like`, {
                method: "POST",
                headers: buildHeaders(session.access_token),
            });

            await loadPosts();
        } catch (error) {
            setStatus(error.message, "error");
        }
    };

    const deletePost = async (postId) => {
        if (currentUser?.role !== "admin") {
            setStatus("Удаление постов доступно только администратору.", "error");
            return;
        }

        try {
            await requestJson(`/posts/${postId}`, {
                method: "DELETE",
                headers: buildHeaders(session.access_token),
            });

            setStatus("Пост удалён.", "success");
            await loadPosts();
        } catch (error) {
            setStatus(error.message, "error");
        }
    };

    const deleteComment = async (commentId, postId) => {
        if (currentUser?.role !== "admin") {
            setStatus("Удаление комментариев доступно только администратору.", "error");
            return;
        }

        try {
            await requestJson(`/comments/admin/delete/${commentId}`, {
                method: "DELETE",
                headers: buildHeaders(session?.access_token || ""),
            });

            commentsCache.delete(postId);
            await loadPosts();

            const commentsContainer = document.querySelector(`#comments-${postId}`);
            if (commentsContainer) {
                await loadComments(postId);
                commentsContainer.innerHTML = buildCommentsMarkup(postId);
                commentsContainer.hidden = false;
            }

            setStatus("Комментарий удалён.", "success");
        } catch (error) {
            setStatus(error.message, "error");
        }
    };

    const submitComment = async (postId, form) => {
        if (!session?.access_token) {
            setStatus("Чтобы комментировать, войди в аккаунт.", "error");
            return;
        }

        if (!form.reportValidity()) {
            return;
        }

        const formData = new FormData(form);
        const commentText = String(formData.get("comment_text") || "").trim();

        if (commentText.length < 2) {
            setStatus("Комментарий слишком короткий.", "error");
            return;
        }

        if (commentText.length > 1000) {
            setStatus("Комментарий не должен превышать 1000 символов.", "error");
            return;
        }

        try {
            await requestJson(`/comments/post/${postId}`, {
                method: "POST",
                headers: {
                    ...buildHeaders(session.access_token),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ comment_text: commentText }),
            });

            form.reset();
            await loadPosts();
            await loadComments(postId);

            const commentsContainer = document.querySelector(`#comments-${postId}`);
            if (commentsContainer) {
                commentsContainer.innerHTML = buildCommentsMarkup(postId);
                commentsContainer.hidden = false;
            }

            setStatus("Комментарий добавлен.", "success");
        } catch (error) {
            setStatus(error.message, "error");
        }
    };

    newsPostForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await submitNewsPost(newsPostForm);
    });

    newsFeedList?.addEventListener("click", async (event) => {
        const likeButton = event.target.closest("[data-like-post]");
        if (likeButton) {
            await toggleLike(likeButton.dataset.likePost);
            return;
        }

        const toggleCommentsButton = event.target.closest("[data-toggle-comments]");
        if (toggleCommentsButton) {
            await toggleComments(toggleCommentsButton.dataset.toggleComments);
            return;
        }

        const deletePostButton = event.target.closest("[data-delete-post]");
        if (deletePostButton) {
            await deletePost(deletePostButton.dataset.deletePost);
            return;
        }

        const deleteCommentButton = event.target.closest("[data-delete-comment]");
        if (deleteCommentButton) {
            await deleteComment(
                deleteCommentButton.dataset.deleteComment,
                deleteCommentButton.dataset.commentPost,
            );
        }
    });

    newsFeedList?.addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-comment-form]");
        if (!form) {
            return;
        }

        event.preventDefault();
        await submitComment(form.dataset.commentForm, form);
    });

    refreshFeedButton?.addEventListener("click", async () => {
        setStatus("Обновляем ленту...", "");
        await syncCurrentUser();
        await loadPosts();
        setStatus("Лента обновлена.", "success");
    });

    const bootstrap = async () => {
        await syncCurrentUser();
        await loadPosts();
    };

    bootstrap();
}
