const AdminApp = (() => {
  const uploadForm = document.getElementById("videoUploadForm");
  const uploadBtn = document.getElementById("uploadBtn");
  const cancelUploadBtn = document.getElementById("cancelUploadBtn");
  const cancelJobBtn = document.getElementById("cancelJobBtn");
  const retryJobBtn = document.getElementById("retryJobBtn");
  const uploadBar = document.getElementById("uploadBar");
  const uploadText = document.getElementById("uploadText");
  const jobBar = document.getElementById("jobBar");
  const jobText = document.getElementById("jobText");
  const resultBox = document.getElementById("resultBox");
  const rawUrl = document.getElementById("rawUrl");
  const hlsUrl = document.getElementById("hlsUrl");
  const recentList = document.getElementById("recentList");
  const orderList = document.getElementById("orderList");
  const orderStatus = document.getElementById("orderStatus");
  const saveOrderBtn = document.getElementById("saveOrderBtn");
  const reloadOrderBtn = document.getElementById("reloadOrderBtn");
  const carouselForm = document.getElementById("carouselUploadForm");
  const carouselUploadBtn = document.getElementById("carouselUploadBtn");
  const saveCarouselOrderBtn = document.getElementById("saveCarouselOrderBtn");
  const carouselList = document.getElementById("carouselList");
  const carouselStatus = document.getElementById("carouselStatus");
  const heroForm = null;
  const heroUploadBtn = null;
  const heroPreview = null;
  const heroStatus = null;
  const adminCommentsList = document.getElementById("commentsList");
  const commentsStatus = document.getElementById("commentsStatus");
  const reloadCommentsBtn = document.getElementById("reloadCommentsBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const adminUser = document.getElementById("adminUser");

  let activeXhr = null;
  let pollTimer = null;
  let activeJobId = null;
  let activeUploadId = null;
  let dragItem = null;

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtBytes(bytes) {
    const value = Number(bytes || 0);
    if (value <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let idx = 0;
    while (size >= 1024 && idx < units.length - 1) {
      size /= 1024;
      idx += 1;
    }
    return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function setProgress(barEl, textEl, percent, message) {
    const safe = Math.max(0, Math.min(100, Math.round(percent || 0)));
    if (barEl) barEl.style.width = `${safe}%`;
    if (textEl) textEl.textContent = message || `${safe}%`;
  }

  function setUploadBusy(isBusy) {
    if (uploadBtn) uploadBtn.disabled = isBusy;
    if (cancelUploadBtn) cancelUploadBtn.hidden = !isBusy;
    if (uploadForm) uploadForm.dataset.uploading = isBusy ? "1" : "0";
  }

  function isImageUrl(url) {
    const clean = String(url || "").split("?")[0];
    return /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(clean);
  }

  async function extractErrorText(res, fallback) {
    let text = fallback || `HTTP ${res.status || 0}`;
    try {
      const payload = await res.json();
      if (payload?.detail) text = `${text}: ${payload.detail}`;
    } catch {}
    return text;
  }

  async function apiFetch(url, opts = {}) {
    if (Auth?.fetchWithAuth) {
      return Auth.fetchWithAuth(
        url,
        {
          cache: "no-store",
          ...opts,
        },
        true
      );
    }
    return fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...opts,
    });
  }

  function showResult(job) {
    if (!resultBox || !rawUrl || !hlsUrl) return;
    const file = job?.file_url || "";
    const hls = job?.hls_url || "";
    rawUrl.href = file || "#";
    rawUrl.textContent = file || "not ready";
    hlsUrl.href = hls || "#";
    hlsUrl.textContent = hls || "not ready";
    resultBox.hidden = false;
  }

  function renumberOrderList() {
    if (!orderList) return;
    const items = orderList.querySelectorAll(".admin-order-item");
    items.forEach((item, idx) => {
      const idxEl = item.querySelector(".admin-order-item__idx");
      if (idxEl) idxEl.textContent = `#${idx + 1}`;
    });
  }

  function getCurrentOrderIds() {
    if (!orderList) return [];
    return Array.from(orderList.querySelectorAll(".admin-order-item"))
      .map((item) => Number(item.dataset.videoId))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  function renderOrderList(items) {
    if (!orderList) return;
    const videos = Array.isArray(items) ? items : [];
    if (!videos.length) {
      orderList.innerHTML = "No videos yet";
      return;
    }
    orderList.innerHTML = "";

    for (const item of videos) {
      const card = document.createElement("div");
      card.className = "admin-order-item";
      card.draggable = true;
      card.dataset.videoId = String(item.id);
      card.innerHTML = `
        <div class="admin-order-item__grip" aria-hidden="true">⋮⋮</div>
        <div>
          <div class="admin-order-item__title">${escapeHtml(item.title || "Untitled video")}</div>
          <div class="admin-order-item__meta">status: ${escapeHtml(item.status || "unknown")}</div>
        </div>
        <div class="admin-order-item__idx"></div>
      `;

      card.addEventListener("dragstart", () => {
        dragItem = card;
        card.classList.add("is-dragging");
      });

      card.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
        orderList
          .querySelectorAll(".admin-order-item")
          .forEach((el) => el.classList.remove("is-drop-target"));
        dragItem = null;
        renumberOrderList();
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!dragItem || dragItem === card) return;
        card.classList.add("is-drop-target");
        const rect = card.getBoundingClientRect();
        const insertAfter = e.clientY >= rect.top + rect.height / 2;
        if (insertAfter) {
          orderList.insertBefore(dragItem, card.nextSibling);
        } else {
          orderList.insertBefore(dragItem, card);
        }
      });

      card.addEventListener("dragleave", () => {
        card.classList.remove("is-drop-target");
      });

      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("is-drop-target");
      });

      orderList.appendChild(card);
    }

    renumberOrderList();
  }

  function renderRecentList(items) {
    if (!recentList) return;
    if (!Array.isArray(items) || !items.length) {
      recentList.innerHTML = "No videos yet";
      return;
    }
    recentList.innerHTML = "";
    for (const item of items) {
      const el = document.createElement("div");
      el.className = "admin-card admin-card--compact";
      const fileUrl = item.file_url || "";
      const hlsPlaylist = item.hls_url || "";
      const safeTitle = escapeHtml(item.title || "Untitled video");
      const safeStatus = escapeHtml(item.status || "unknown");
      const safeOrder = Number(item.display_order || 0);
      el.innerHTML = `
        <div class="admin-card__meta">
          <div class="admin-card__title">${safeTitle}</div>
          <div class="admin-card__sub">order: ${safeOrder > 0 ? `#${safeOrder}` : "not set"}</div>
          <div class="admin-card__sub">status: ${safeStatus}</div>
          <div class="admin-card__sub">raw: ${fileUrl ? `<a href="${fileUrl}" target="_blank" rel="noopener">open</a>` : "missing"}</div>
          <div class="admin-card__sub">hls: ${hlsPlaylist ? `<a href="${hlsPlaylist}" target="_blank" rel="noopener">open</a>` : "processing"}</div>
        </div>
      `;
      recentList.appendChild(el);
    }
  }

  function renderCommentsList(items) {
    if (!adminCommentsList) return;
    const comments = Array.isArray(items) ? items : [];
    if (!comments.length) {
      adminCommentsList.innerHTML = "No comments yet";
      return;
    }
    adminCommentsList.innerHTML = "";
    for (const item of comments) {
      const el = document.createElement("div");
      el.className = "admin-card admin-card--compact admin-comment";
      el.dataset.commentId = String(item.id);
      const videoTitle = escapeHtml(item.video_title || "Untitled video");
      const user = escapeHtml(item.user || "user");
      const text = escapeHtml(item.text || "");
      const createdAt = escapeHtml(
        item.created_at ? new Date(item.created_at).toLocaleString("ru-RU") : ""
      );
      el.innerHTML = `
        <div class="admin-card__meta">
          <div class="admin-card__title">${user}</div>
          <div class="admin-card__sub">video: ${videoTitle} (#${escapeHtml(item.video_id || "")})</div>
          <div class="admin-comment__text">${text}</div>
          <div class="admin-card__sub">${createdAt}</div>
        </div>
        <button class="btn btn--ghost admin-comment__delete" type="button" data-action="delete-comment" data-comment-id="${escapeHtml(item.id)}">Delete</button>
      `;
      adminCommentsList.appendChild(el);
    }
  }

  async function loadComments() {
    if (!adminCommentsList) return;
    adminCommentsList.innerHTML = "Loading...";
    if (commentsStatus) commentsStatus.textContent = "Loading comments...";
    try {
      const res = await apiFetch("/api/admin/comments/?limit=100");
      if (!res.ok) {
        const message = await extractErrorText(res, "Unable to load comments");
        adminCommentsList.innerHTML = message;
        if (commentsStatus) commentsStatus.textContent = message;
        return;
      }
      const items = await res.json();
      renderCommentsList(items);
      if (commentsStatus) commentsStatus.textContent = "Latest comments loaded.";
    } catch (err) {
      const message = err?.message || "Unable to load comments";
      adminCommentsList.innerHTML = message;
      if (commentsStatus) commentsStatus.textContent = message;
    }
  }

  async function deleteComment(commentId, buttonEl) {
    if (!commentId) return;
    if (buttonEl) buttonEl.disabled = true;
    if (commentsStatus) commentsStatus.textContent = "Deleting comment...";
    try {
      const csrf = await Auth.ensureCsrf();
      const res = await apiFetch(`/api/comments/${commentId}/`, {
        method: "DELETE",
        headers: csrf ? { "X-CSRFToken": csrf } : {},
      });
      if (!res.ok) {
        const message = await extractErrorText(res, "Failed to delete comment");
        if (commentsStatus) commentsStatus.textContent = message;
        if (buttonEl) buttonEl.disabled = false;
        return;
      }
      buttonEl?.closest(".admin-comment")?.remove();
      if (commentsStatus) commentsStatus.textContent = "Comment deleted.";
      if (adminCommentsList && !adminCommentsList.children.length) {
        adminCommentsList.innerHTML = "No comments yet";
      }
      await loadRecentVideos();
    } catch (err) {
      if (commentsStatus) {
        commentsStatus.textContent = err?.message || "Failed to delete comment";
      }
      if (buttonEl) buttonEl.disabled = false;
    }
  }

  async function ensureAdmin() {
    const me = await Auth.me();
    if (!me) {
      location.href = "/login.html";
      return false;
    }
    const isAdmin = Boolean(me.is_staff || me.is_superuser);
    if (!isAdmin) {
      if (uploadForm) uploadForm.remove();
      if (uploadText) uploadText.textContent = "Access denied";
      if (jobText) jobText.textContent = "Access denied";
      return false;
    }
    if (adminUser) {
      adminUser.hidden = false;
      adminUser.textContent = me.nickname || me.username || "admin";
    }
    if (logoutBtn) logoutBtn.hidden = false;
    return true;
  }

  async function loadRecentVideos() {
    if (!recentList) return;
    recentList.innerHTML = "Loading...";
    try {
      const res = await apiFetch("/api/admin/videos/?limit=50");
      if (!res.ok) {
        const message = await extractErrorText(res, "Unable to load recent videos");
        recentList.innerHTML = message;
        if (orderStatus) orderStatus.textContent = message;
        return;
      }
      const items = await res.json();
      renderRecentList(items);
      renderOrderList(items);
      if (orderStatus) {
        orderStatus.textContent = "Drag cards, then click Save Order.";
      }
    } catch (err) {
      const message = err?.message || "Unable to load recent videos";
      recentList.innerHTML = message;
      if (orderStatus) orderStatus.textContent = message;
    }
  }

  async function saveVideoOrder() {
    if (!saveOrderBtn) return;
    const ids = getCurrentOrderIds();
    if (!ids.length) {
      if (orderStatus) orderStatus.textContent = "No videos to sort.";
      return;
    }
    saveOrderBtn.disabled = true;
    if (orderStatus) orderStatus.textContent = "Saving order...";
    try {
      const csrf = await Auth.ensureCsrf();
      const res = await apiFetch("/api/admin/videos/order/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRFToken": csrf } : {}),
        },
        body: JSON.stringify({ video_ids: ids }),
      });
      if (!res.ok) {
        const message = await extractErrorText(res, "Failed to save order");
        if (orderStatus) orderStatus.textContent = message;
        return;
      }
      if (orderStatus) orderStatus.textContent = "Order saved.";
      await loadRecentVideos();
    } catch (err) {
      if (orderStatus) {
        orderStatus.textContent = err?.message || "Failed to save order";
      }
    } finally {
      saveOrderBtn.disabled = false;
    }
  }

  function getCarouselOrderIds() {
    if (!carouselList) return [];
    return Array.from(carouselList.querySelectorAll(".admin-carousel-item"))
      .map((item) => Number(item.dataset.itemId))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  function renderCarouselList(items) {
    if (!carouselList) return;
    const photos = Array.isArray(items) ? items : [];
    if (!photos.length) {
      carouselList.innerHTML = "No carousel photos yet";
      return;
    }

    carouselList.innerHTML = "";
    for (const item of photos) {
      const card = document.createElement("div");
      card.className = "admin-carousel-item";
      card.draggable = true;
      card.dataset.itemId = String(item.id);
      const imageUrl = item.image_url || "";
      card.innerHTML = `
        <div class="admin-order-item__grip" aria-hidden="true">в‹®в‹®</div>
        <img class="admin-carousel-item__thumb" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />
        <div class="admin-carousel-item__meta">
          <div class="admin-order-item__title">${escapeHtml(item.title || "Photo")}</div>
          <div class="admin-order-item__meta">order: #${escapeHtml(item.display_order || "")}</div>
        </div>
        <button class="btn btn--ghost" type="button" data-action="delete-carousel" data-item-id="${escapeHtml(item.id)}">Delete</button>
      `;

      card.addEventListener("dragstart", () => {
        dragItem = card;
        card.classList.add("is-dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
        carouselList
          .querySelectorAll(".admin-carousel-item")
          .forEach((el) => el.classList.remove("is-drop-target"));
        dragItem = null;
      });
      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!dragItem || dragItem === card) return;
        card.classList.add("is-drop-target");
        const rect = card.getBoundingClientRect();
        const insertAfter = e.clientY >= rect.top + rect.height / 2;
        carouselList.insertBefore(
          dragItem,
          insertAfter ? card.nextSibling : card
        );
      });
      card.addEventListener("dragleave", () => {
        card.classList.remove("is-drop-target");
      });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("is-drop-target");
      });

      carouselList.appendChild(card);
    }
  }

  async function loadCarouselItems() {
    if (!carouselList) return;
    carouselList.innerHTML = "Loading...";
    if (carouselStatus) carouselStatus.textContent = "Loading carousel photos...";
    try {
      const res = await apiFetch("/api/admin/carousel/");
      if (!res.ok) {
        const message = await extractErrorText(res, "Unable to load carousel");
        carouselList.innerHTML = message;
        if (carouselStatus) carouselStatus.textContent = message;
        return;
      }
      const items = await res.json();
      renderCarouselList(items);
      if (carouselStatus) carouselStatus.textContent = "Carousel photos loaded.";
    } catch (err) {
      const message = err?.message || "Unable to load carousel";
      carouselList.innerHTML = message;
      if (carouselStatus) carouselStatus.textContent = message;
    }
  }

  async function saveCarouselOrder() {
    if (!saveCarouselOrderBtn) return;
    const ids = getCarouselOrderIds();
    if (!ids.length) {
      if (carouselStatus) carouselStatus.textContent = "No photos to sort.";
      return;
    }
    saveCarouselOrderBtn.disabled = true;
    if (carouselStatus) carouselStatus.textContent = "Saving photo order...";
    try {
      const csrf = await Auth.ensureCsrf();
      const res = await apiFetch("/api/admin/carousel/order/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRFToken": csrf } : {}),
        },
        body: JSON.stringify({ item_ids: ids }),
      });
      if (!res.ok) {
        const message = await extractErrorText(res, "Failed to save carousel order");
        if (carouselStatus) carouselStatus.textContent = message;
        return;
      }
      if (carouselStatus) carouselStatus.textContent = "Photo order saved.";
      await loadCarouselItems();
    } catch (err) {
      if (carouselStatus) {
        carouselStatus.textContent = err?.message || "Failed to save carousel order";
      }
    } finally {
      saveCarouselOrderBtn.disabled = false;
    }
  }

  async function deleteCarouselItem(itemId, buttonEl) {
    if (!itemId) return;
    if (buttonEl) buttonEl.disabled = true;
    if (carouselStatus) carouselStatus.textContent = "Deleting photo...";
    try {
      const csrf = await Auth.ensureCsrf();
      const res = await apiFetch(`/api/admin/carousel/${itemId}/`, {
        method: "DELETE",
        headers: csrf ? { "X-CSRFToken": csrf } : {},
      });
      if (!res.ok) {
        const message = await extractErrorText(res, "Failed to delete photo");
        if (carouselStatus) carouselStatus.textContent = message;
        if (buttonEl) buttonEl.disabled = false;
        return;
      }
      if (carouselStatus) carouselStatus.textContent = "Photo deleted.";
      await loadCarouselItems();
    } catch (err) {
      if (carouselStatus) {
        carouselStatus.textContent = err?.message || "Failed to delete photo";
      }
      if (buttonEl) buttonEl.disabled = false;
    }
  }

  async function handleCarouselUploadSubmit(e) {
    e.preventDefault();
    if (!carouselForm || !carouselUploadBtn) return;
    const fileInput = carouselForm.querySelector("input[type='file']");
    if (!fileInput || !fileInput.files || fileInput.files.length < 1) {
      if (carouselStatus) carouselStatus.textContent = "Select at least one photo.";
      return;
    }
    carouselUploadBtn.disabled = true;
    if (carouselStatus) carouselStatus.textContent = "Uploading photos...";
    try {
      if (Auth?.refreshAccess) {
        await Auth.refreshAccess();
      }
      const csrf = await Auth.ensureCsrf();
      const res = await apiFetch("/api/admin/carousel/", {
        method: "POST",
        body: new FormData(carouselForm),
        headers: csrf ? { "X-CSRFToken": csrf } : {},
      });
      if (!res.ok) {
        const message = await extractErrorText(res, "Photo upload failed");
        if (carouselStatus) carouselStatus.textContent = message;
        return;
      }
      carouselForm.reset();
      if (carouselStatus) carouselStatus.textContent = "Photos uploaded.";
      await loadCarouselItems();
    } catch (err) {
      if (carouselStatus) carouselStatus.textContent = err?.message || "Photo upload failed";
    } finally {
      carouselUploadBtn.disabled = false;
    }
  }

  function renderHeroPreview(data) {
    if (!heroPreview) return;
    const fileUrl = data?.file_url || "";
    const hlsUrl = data?.hls_url || "";
    if (!fileUrl) {
      heroPreview.innerHTML = "Hero media not set";
      return;
    }
    if (isImageUrl(fileUrl)) {
      heroPreview.innerHTML = `<img class="admin__hero-media" src="${fileUrl}" alt="Hero preview" />`;
      return;
    }
    const src = hlsUrl || fileUrl;
    heroPreview.innerHTML = `
      <video class="admin__hero-media" src="${src}" controls muted playsinline preload="metadata"></video>
    `;
  }

  async function loadHeroMedia() {
    if (heroStatus) heroStatus.textContent = "Loading hero media...";
    try {
      const res = await apiFetch("/api/admin/hero/current/");
      if (res.status === 404) {
        if (heroStatus) heroStatus.textContent = "Hero media is not uploaded yet.";
        if (heroPreview) heroPreview.innerHTML = "No hero media";
        return;
      }
      if (!res.ok) {
        const message = await extractErrorText(res, "Unable to load hero media");
        if (heroStatus) heroStatus.textContent = message;
        if (heroPreview) heroPreview.innerHTML = "Failed to load";
        return;
      }
      const hero = await res.json();
      const label = hero?.title ? `Current hero: ${hero.title}` : "Current hero media is active.";
      if (heroStatus) heroStatus.textContent = label;
      renderHeroPreview(hero);
    } catch (err) {
      if (heroStatus) heroStatus.textContent = err?.message || "Unable to load hero media";
      if (heroPreview) heroPreview.innerHTML = "Failed to load";
    }
  }

  async function handleHeroUploadSubmit(e) {
    e.preventDefault();
    if (!heroForm || !heroUploadBtn) return;
    const fileInput = heroForm.querySelector("input[type='file']");
    if (!fileInput || !fileInput.files || fileInput.files.length !== 1) {
      if (heroStatus) heroStatus.textContent = "Select one image or video file.";
      return;
    }
    heroUploadBtn.disabled = true;
    if (heroStatus) heroStatus.textContent = "Uploading hero media...";
    try {
      if (Auth?.refreshAccess) {
        await Auth.refreshAccess();
      }
      const csrf = await Auth.ensureCsrf();
      const res = await apiFetch("/api/admin/hero/", {
        method: "POST",
        body: new FormData(heroForm),
        headers: csrf ? { "X-CSRFToken": csrf } : {},
      });
      if (!res.ok) {
        const message = await extractErrorText(res, "Hero upload failed");
        if (heroStatus) heroStatus.textContent = message;
        return;
      }
      heroForm.reset();
      if (heroStatus) heroStatus.textContent = "Hero upload accepted. Processing started.";
      await loadHeroMedia();
    } catch (err) {
      if (heroStatus) heroStatus.textContent = err?.message || "Hero upload failed";
    } finally {
      heroUploadBtn.disabled = false;
    }
  }

  async function refreshUploadStatus() {
    if (!activeUploadId) return;
    try {
      const res = await apiFetch(`/api/admin/uploads/${activeUploadId}/`);
      if (!res.ok) return;
      const data = await res.json();
      const percent = Number(data.progress || 0);
      setProgress(
        uploadBar,
        uploadText,
        percent,
        `Upload: ${percent}% (${fmtBytes(data.received_bytes)} / ${fmtBytes(data.total_bytes)})`
      );
    } catch {}
  }

  function stopJobPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollJobStatus() {
    if (!activeJobId) return;
    try {
      const res = await apiFetch(`/api/admin/jobs/${activeJobId}/`);
      if (!res.ok) throw new Error("job load failed");
      const job = await res.json();
      const pct = Number(job.progress || 0);
      const stage = job.stage || "processing";
      setProgress(jobBar, jobText, pct, `${stage}: ${pct}%`);

      if (job.status === "done") {
        stopJobPolling();
        if (cancelJobBtn) cancelJobBtn.hidden = true;
        if (retryJobBtn) retryJobBtn.hidden = true;
        setProgress(jobBar, jobText, 100, "done: 100%");
        showResult(job);
        await loadRecentVideos();
        return;
      }

      if (job.status === "failed") {
        stopJobPolling();
        if (cancelJobBtn) cancelJobBtn.hidden = true;
        if (retryJobBtn) retryJobBtn.hidden = false;
        setProgress(jobBar, jobText, pct, `failed: ${job.error || "processing error"}`);
        await loadRecentVideos();
        return;
      }

      if (job.status === "canceled") {
        stopJobPolling();
        if (cancelJobBtn) cancelJobBtn.hidden = true;
        if (retryJobBtn) retryJobBtn.hidden = false;
        setProgress(jobBar, jobText, pct, "canceled");
        await loadRecentVideos();
      }
    } catch {
      setProgress(jobBar, jobText, 0, "job status unavailable");
    }
  }

  function startJobPolling(jobId) {
    stopJobPolling();
    activeJobId = jobId;
    if (cancelJobBtn) cancelJobBtn.hidden = false;
    if (retryJobBtn) retryJobBtn.hidden = true;
    pollJobStatus();
    pollTimer = setInterval(pollJobStatus, 1500);
  }

  async function handleUploadSubmit(e) {
    e.preventDefault();
    if (!uploadForm || uploadForm.dataset.uploading === "1" || activeXhr) {
      return;
    }
    const fileInput = uploadForm.querySelector("input[type='file']");
    if (!fileInput || !fileInput.files || fileInput.files.length !== 1) {
      setProgress(uploadBar, uploadText, 0, "Select one video file");
      return;
    }

    stopJobPolling();
    activeJobId = null;
    activeUploadId = null;
    if (resultBox) resultBox.hidden = true;
    setProgress(uploadBar, uploadText, 0, "Upload: 0%");
    setProgress(jobBar, jobText, 0, "Queued");

    if (Auth?.refreshAccess) {
      const refreshed = await Auth.refreshAccess();
      if (!refreshed) {
        setProgress(uploadBar, uploadText, 0, "Session expired. Please login again.");
        location.href = "/login.html";
        return;
      }
    }

    const csrf = await Auth.ensureCsrf();
    const xhr = new XMLHttpRequest();
    activeXhr = xhr;
    setUploadBusy(true);
    if (retryJobBtn) retryJobBtn.hidden = true;
    if (cancelJobBtn) cancelJobBtn.hidden = true;

    xhr.open("POST", "/api/admin/videos/");
    xhr.withCredentials = true;
    xhr.timeout = 3600 * 1000;
    if (csrf) xhr.setRequestHeader("X-CSRFToken", csrf);

    xhr.upload.addEventListener("progress", (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      setProgress(
        uploadBar,
        uploadText,
        pct,
        `Upload: ${pct}% (${fmtBytes(evt.loaded)} / ${fmtBytes(evt.total)})`
      );
    });

    xhr.addEventListener("load", async () => {
      setUploadBusy(false);
      activeXhr = null;
      if (xhr.status < 200 || xhr.status >= 300) {
        let detail = `Upload failed (HTTP ${xhr.status || 0})`;
        try {
          const payload = JSON.parse(xhr.responseText || "{}");
          if (payload?.detail) detail = `${detail}: ${payload.detail}`;
        } catch {}
        setProgress(uploadBar, uploadText, 0, detail);
        return;
      }
      let payload = null;
      try {
        payload = JSON.parse(xhr.responseText || "{}");
      } catch {
        payload = null;
      }
      if (!payload?.upload?.id || !payload?.job?.id) {
        setProgress(uploadBar, uploadText, 0, "Upload response invalid");
        return;
      }
      activeUploadId = payload.upload.id;
      activeJobId = payload.job.id;
      await refreshUploadStatus();
      setProgress(jobBar, jobText, 1, "starting");
      startJobPolling(activeJobId);
      await loadRecentVideos();
      uploadForm.reset();
    });

    xhr.addEventListener("error", () => {
      setUploadBusy(false);
      activeXhr = null;
      const st = xhr.status || 0;
      setProgress(
        uploadBar,
        uploadText,
        0,
        `Network error during upload (status ${st}). Connection was interrupted (proxy timeout, auth, or backend restart).`
      );
    });

    xhr.addEventListener("timeout", () => {
      setUploadBusy(false);
      activeXhr = null;
      setProgress(uploadBar, uploadText, 0, "Upload timeout reached (3600s).");
    });

    xhr.addEventListener("abort", () => {
      setUploadBusy(false);
      activeXhr = null;
      setProgress(uploadBar, uploadText, 0, "Upload canceled");
    });

    xhr.send(new FormData(uploadForm));
  }

  function wireUploadCancel() {
    if (!cancelUploadBtn) return;
    cancelUploadBtn.addEventListener("click", () => {
      if (activeXhr) activeXhr.abort();
    });
  }

  function wireJobCancel() {
    if (!cancelJobBtn) return;
    cancelJobBtn.addEventListener("click", async () => {
      if (!activeJobId) return;
      const csrf = await Auth.ensureCsrf();
      await apiFetch(`/api/admin/jobs/${activeJobId}/cancel/`, {
        method: "POST",
        headers: csrf ? { "X-CSRFToken": csrf } : {},
      });
      await pollJobStatus();
    });
  }

  function wireJobRetry() {
    if (!retryJobBtn) return;
    retryJobBtn.addEventListener("click", async () => {
      if (!activeJobId) return;
      const csrf = await Auth.ensureCsrf();
      const res = await apiFetch(`/api/admin/jobs/${activeJobId}/retry/`, {
        method: "POST",
        headers: csrf ? { "X-CSRFToken": csrf } : {},
      });
      if (!res.ok) return;
      const job = await res.json();
      activeJobId = job.id;
      if (resultBox) resultBox.hidden = true;
      setProgress(jobBar, jobText, 0, "queued");
      startJobPolling(activeJobId);
    });
  }

  function wireOrderActions() {
    if (saveOrderBtn) {
      saveOrderBtn.addEventListener("click", saveVideoOrder);
    }
    if (reloadOrderBtn) {
      reloadOrderBtn.addEventListener("click", () => {
        loadRecentVideos();
      });
    }
  }

  function wireCarouselUpload() {
    if (carouselForm) {
      carouselForm.addEventListener("submit", handleCarouselUploadSubmit);
    }
    if (saveCarouselOrderBtn) {
      saveCarouselOrderBtn.addEventListener("click", saveCarouselOrder);
    }
    if (carouselList) {
      carouselList.addEventListener("click", (e) => {
        const target = e.target;
        if (target?.dataset?.action !== "delete-carousel") return;
        const itemId = Number(target.dataset.itemId || 0);
        deleteCarouselItem(itemId, target);
      });
    }
  }

  function wireCommentActions() {
    if (reloadCommentsBtn) {
      reloadCommentsBtn.addEventListener("click", loadComments);
    }
    if (adminCommentsList) {
      adminCommentsList.addEventListener("click", (e) => {
        const target = e.target;
        if (target?.dataset?.action !== "delete-comment") return;
        const commentId = Number(target.dataset.commentId || 0);
        deleteComment(commentId, target);
      });
    }
  }

  function wireLogout() {
    if (!logoutBtn) return;
    logoutBtn.addEventListener("click", async () => {
      await Auth.logout();
      location.href = "/login.html";
    });
  }

  async function boot() {
    const canUseAdmin = await ensureAdmin();
    if (!canUseAdmin) return;
    wireLogout();
    wireUploadCancel();
    wireJobCancel();
    wireJobRetry();
    wireOrderActions();
    wireCarouselUpload();
    wireCommentActions();
    if (uploadForm) {
      uploadForm.addEventListener("submit", handleUploadSubmit);
    }
    await Promise.all([loadCarouselItems(), loadRecentVideos(), loadComments()]);
  }

  return { boot };
})();

document.addEventListener("DOMContentLoaded", () => {
  AdminApp.boot();
});
