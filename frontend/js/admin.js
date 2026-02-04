const AdminApp = (() => {
  const listEl = document.getElementById("adminVideoList");
  const uploadForm = document.getElementById("uploadForm");
  const progress = document.getElementById("adminUploadProgress");
  const bar = document.getElementById("adminUploadBar");
  const text = document.getElementById("adminUploadText");
  const heroPanel = document.getElementById("heroPanel");
  const heroForm = document.getElementById("heroForm");
  const heroProgress = document.getElementById("heroUploadProgress");
  const heroBar = document.getElementById("heroUploadBar");
  const heroText = document.getElementById("heroUploadText");
  const heroPreview = document.getElementById("heroPreview");
  const logoutBtn = document.getElementById("logoutBtn");
  const adminUser = document.getElementById("adminUser");
  const uploadLocks = new WeakSet();

  function setFormUploading(form, isUploading) {
    if (!form) return;
    if (isUploading) {
      form.dataset.uploading = "1";
    } else {
      delete form.dataset.uploading;
    }
    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) {
      submitBtn.disabled = isUploading;
      submitBtn.classList.toggle("is-disabled", isUploading);
    }
  }

  async function ensureAdmin() {
    const me = await Auth.me();
    if (!me) {
      location.href = "/login.html";
      return null;
    }
    if (adminUser) {
      adminUser.hidden = false;
      adminUser.textContent = me.nickname || me.username || "admin";
    }
    if (logoutBtn) logoutBtn.hidden = false;
    const isAdmin = Boolean(me.is_staff || me.is_superuser);
    if (!isAdmin) {
      if (listEl) listEl.innerHTML = "Нет доступа к модерации";
      if (heroPanel) heroPanel.style.display = "none";
    }
    return { me, isAdmin };
  }

  function statusLabel(status) {
    if (status === "approved") return "В профиле";
    return "Скрыто";
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isImageUrl(url) {
    const clean = String(url || "").split("?")[0];
    return /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(clean);
  }

  function renderVideoCard(v) {
    const inFeed = v.status === "approved";
    const primaryLabel = inFeed ? "Убрать из ленты" : "Отобразить в профиле";
    const primaryAction = inFeed ? "hide" : "publish";
    const el = document.createElement("div");
    el.className = "admin-card";
    el.dataset.id = v.id;
    el.innerHTML = `
      <div class="admin-card__thumb">
        <video muted playsinline preload="metadata" src="${v.file_url || ""}"></video>
      </div>
      <div class="admin-card__meta">
        <div class="admin-card__title">${escapeHtml(v.title || "Без названия")}</div>
        <div class="admin-card__sub">Автор: ${escapeHtml(v.owner_username || "—")}</div>
        <div class="admin-card__sub">Лайки: ${v.likes_count || 0} • Комм: ${v.comments_count || 0}</div>
      </div>
      <div class="admin-card__actions">
        <div class="admin-card__status">${statusLabel(v.status)}</div>
        <button class="btn btn--primary" data-action="${primaryAction}">${primaryLabel}</button>
        <button class="btn" data-action="delete">Удалить</button>
      </div>
    `;

    el.querySelector("[data-action='publish']").addEventListener("click", async () => {
      const csrf = await Auth.ensureCsrf();
      await fetch(`/api/admin/videos/${v.id}/publish/`, {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "X-CSRFToken": csrf } : {},
      });
      await loadVideos();
    });

    el.querySelector("[data-action='hide']").addEventListener("click", async () => {
      const csrf = await Auth.ensureCsrf();
      await fetch(`/api/admin/videos/${v.id}/hide/`, {
        method: "POST",
        credentials: "include",
        headers: {
          ...(csrf ? { "X-CSRFToken": csrf } : {}),
        },
      });
      await loadVideos();
    });

    el.querySelector("[data-action='delete']").addEventListener("click", async () => {
      if (!confirm("Удалить видео навсегда?")) return;
      const csrf = await Auth.ensureCsrf();
      await fetch(`/api/admin/videos/${v.id}/delete/`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          ...(csrf ? { "X-CSRFToken": csrf } : {}),
        },
      });
      await loadVideos();
    });

    return el;
  }

  async function loadVideos() {
    if (!listEl) return;
    listEl.innerHTML = "Загрузка...";
    const res = await fetch("/api/admin/videos/", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      listEl.innerHTML = "Нет доступа";
      return;
    }
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.results || [];
    listEl.innerHTML = "";
    for (const v of items) {
      listEl.appendChild(renderVideoCard(v));
    }
  }

  async function uploadWithProgress(
    form,
    progressEl,
    barEl,
    textEl,
    url,
    successText
  ) {
    if (!form) return { ok: false, skipped: true };
    if (form.dataset.uploading === "1") return { ok: false, skipped: true };
    if (uploadLocks.has(form)) return { ok: false, skipped: true };

    const fileInput = form.querySelector("input[type='file']");
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      if (textEl) textEl.textContent = "Выберите файл";
      return { ok: false, skipped: true };
    }
    if (fileInput.files.length > 1) {
      if (textEl) textEl.textContent = "Выберите один файл";
      return { ok: false, skipped: true };
    }

    uploadLocks.add(form);
    if (progressEl) progressEl.style.display = "block";
    if (barEl) barEl.style.width = "0%";
    if (textEl) textEl.textContent = "Загрузка 0% (0 / 0 МБ)";

    const csrf = await Auth.ensureCsrf();
    return await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.withCredentials = true;
      if (csrf) xhr.setRequestHeader("X-CSRFToken", csrf);

      xhr.upload.addEventListener("progress", (evt) => {
        if (!evt.lengthComputable) return;
        const percent = Math.round((evt.loaded / evt.total) * 100);
        const loadedMb = (evt.loaded / (1024 * 1024)).toFixed(1);
        const totalMb = (evt.total / (1024 * 1024)).toFixed(1);
        if (barEl) barEl.style.width = percent + "%";
        if (textEl) {
          textEl.textContent = `Загрузка ${percent}% (${loadedMb} / ${totalMb} МБ)`;
        }
      });

      xhr.addEventListener("load", async () => {
        const ok = xhr.status >= 200 && xhr.status < 300;
        if (barEl) barEl.style.width = "100%";
        if (ok) {
          if (textEl) textEl.textContent = successText;
          form.reset();
          if (progressEl) {
            setTimeout(() => {
              progressEl.style.display = "none";
            }, 600);
          }
        } else {
          let msg = "Ошибка загрузки";
          try {
            const data = JSON.parse(xhr.responseText || "{}");
            if (data?.detail) msg = data.detail;
          } catch {}
          if (textEl) textEl.textContent = msg;
        }
        uploadLocks.delete(form);
        resolve({ ok });
      });

      xhr.addEventListener("error", () => {
        if (textEl) textEl.textContent = "Ошибка сети";
        uploadLocks.delete(form);
        resolve({ ok: false });
      });

      xhr.send(new FormData(form));
    });
  }

  function wireUpload() {
    if (!uploadForm) return;
    if (uploadForm.dataset.bound === "1") return;
    uploadForm.dataset.bound = "1";
    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (uploadForm.dataset.uploading === "1") return;
      setFormUploading(uploadForm, true);
      const result = await uploadWithProgress(
        uploadForm,
        progress,
        bar,
        text,
        "/api/videos/",
        "Загрузка завершена"
      );
      setFormUploading(uploadForm, false);
      if (result?.ok) {
        await loadVideos();
      }
    });
  }

  function wireHeroUpload() {
    if (!heroForm) return;
    if (heroForm.dataset.bound === "1") return;
    heroForm.dataset.bound = "1";
    heroForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (heroForm.dataset.uploading === "1") return;
      setFormUploading(heroForm, true);
      const result = await uploadWithProgress(
        heroForm,
        heroProgress,
        heroBar,
        heroText,
        "/api/admin/hero/",
        "Главный экран обновлён"
      );
      setFormUploading(heroForm, false);
      if (result?.ok) {
        await loadHeroPreview();
      }
    });
  }

  async function loadHeroPreview() {
    if (!heroPreview) return;
    heroPreview.innerHTML = "";
    try {
      const res = await fetch("/api/hero/", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        heroPreview.innerHTML = "";
        return;
      }
      const data = await res.json();
      const url = data.file_url || data.file;
      if (!url) {
        heroPreview.innerHTML = "";
        return;
      }
      if (isImageUrl(url)) {
        heroPreview.innerHTML = `<img class="hero-preview__media" src="${url}" alt="Hero preview" />`;
        return;
      }
      heroPreview.innerHTML = `
        <video class="hero-preview__media" muted playsinline preload="metadata"></video>
      `;
      const v = heroPreview.querySelector("video");
      if (v) {
        v.src = url;
        v.addEventListener("loadedmetadata", () => {
          try { v.currentTime = 0.01; } catch {}
        }, { once: true });
      }
    } catch {
      heroPreview.innerHTML = "";
    }
  }

  async function boot() {
    const state = await ensureAdmin();
    if (!state) return;
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await Auth.logout();
        location.href = "/login.html";
      });
    }
    wireUpload();
    if (state.isAdmin) {
      wireHeroUpload();
      await loadHeroPreview();
    }
    if (state.isAdmin) {
      await loadVideos();
    }
  }

  return { boot };
})();

document.addEventListener("DOMContentLoaded", () => {
  AdminApp.boot();
});
