const AdminApp = (() => {
  const listEl = document.getElementById("adminVideoList");
  const uploadForm = document.getElementById("uploadForm");
  const progress = document.getElementById("adminUploadProgress");
  const bar = document.getElementById("adminUploadBar");
  const text = document.getElementById("adminUploadText");
  const logoutBtn = document.getElementById("logoutBtn");

  async function ensureAdmin() {
    const me = await Auth.me();
    if (!me) {
      location.href = "/login.html";
      return null;
    }
    if (!me.is_staff && !me.is_superuser) {
      location.href = "/";
      return null;
    }
    return me;
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
      await fetch(`/api/admin/videos/${v.id}/approve/`, {
        method: "POST",
        credentials: "include",
      });
      await loadVideos();
    });

    el.querySelector("[data-action='reject']").addEventListener("click", async () => {
      const reason = prompt("Причина отклонения:");
      await fetch(`/api/admin/videos/${v.id}/reject/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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

  function wireUpload() {
    if (!uploadForm) return;
    uploadForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (progress) progress.style.display = "block";
      if (bar) bar.style.width = "0%";
      if (text) text.textContent = "Загрузка 0%";

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/videos/");
      xhr.withCredentials = true;

      xhr.upload.addEventListener("progress", (evt) => {
        if (!evt.lengthComputable) return;
        const percent = Math.round((evt.loaded / evt.total) * 100);
        if (bar) bar.style.width = percent + "%";
        if (text) text.textContent = `Загрузка ${percent}%`;
      });

      xhr.addEventListener("load", async () => {
        if (xhr.status >= 200 && xhr.status < 400) {
          await loadVideos();
        } else if (text) {
          text.textContent = "Ошибка загрузки";
        }
      });

      xhr.addEventListener("error", () => {
        if (text) text.textContent = "Ошибка сети";
      });

      xhr.send(new FormData(uploadForm));
    });
  }

  async function boot() {
    await ensureAdmin();
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await Auth.logout();
        location.href = "/login.html";
      });
    }
    wireUpload();
    await loadVideos();
  }

  return { boot };
})();

document.addEventListener("DOMContentLoaded", () => {
  AdminApp.boot();
});
