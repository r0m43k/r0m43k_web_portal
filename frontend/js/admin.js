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
  const logoutBtn = document.getElementById("logoutBtn");
  const adminUser = document.getElementById("adminUser");

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
    if (status === "approved") return "Одобрено";
    if (status === "rejected") return "Отклонено";
    return "На модерации";
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderVideoCard(v) {
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
        <div class="admin-card__sub">Причина: ${escapeHtml(v.reject_reason || "—")}</div>
      </div>
      <div class="admin-card__actions">
        <div class="admin-card__status">${statusLabel(v.status)}</div>
        <button class="btn btn--primary" data-action="approve">Одобрить</button>
        <button class="btn" data-action="reject">Отклонить</button>
      </div>
    `;

    el.querySelector("[data-action='approve']").addEventListener("click", async () => {
      const csrf = await Auth.ensureCsrf();
      await fetch(`/api/admin/videos/${v.id}/approve/`, {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "X-CSRFToken": csrf } : {},
      });
      await loadVideos();
    });

    el.querySelector("[data-action='reject']").addEventListener("click", async () => {
      const reason = prompt("Причина отклонения:");
      const csrf = await Auth.ensureCsrf();
      await fetch(`/api/admin/videos/${v.id}/reject/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRFToken": csrf } : {}),
        },
        body: JSON.stringify({ reason }),
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
    if (!form) return;
    if (progressEl) progressEl.style.display = "block";
    if (barEl) barEl.style.width = "0%";
    if (textEl) textEl.textContent = "Загрузка 0% (0 / 0 МБ)";

    const csrf = await Auth.ensureCsrf();
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
      if (xhr.status >= 200 && xhr.status < 300) {
        if (textEl) textEl.textContent = successText;
        if (form) form.reset();
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
    });

    xhr.addEventListener("error", () => {
      if (textEl) textEl.textContent = "Ошибка сети";
    });

    xhr.send(new FormData(form));
  }

  function wireUpload() {
    if (!uploadForm) return;
    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await uploadWithProgress(
        uploadForm,
        progress,
        bar,
        text,
        "/api/videos/",
        "Загрузка завершена"
      );
      await loadVideos();
    });
  }

  function wireHeroUpload() {
    if (!heroForm) return;
    heroForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await uploadWithProgress(
        heroForm,
        heroProgress,
        heroBar,
        heroText,
        "/api/admin/hero/",
        "Главный экран обновлён"
      );
    });
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
