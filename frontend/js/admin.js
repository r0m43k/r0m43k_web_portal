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
  const logoutBtn = document.getElementById("logoutBtn");
  const adminUser = document.getElementById("adminUser");

  let activeXhr = null;
  let pollTimer = null;
  let activeJobId = null;
  let activeUploadId = null;

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

  function setUploadBusy(isBusy) {
    if (uploadBtn) uploadBtn.disabled = isBusy;
    if (cancelUploadBtn) cancelUploadBtn.hidden = !isBusy;
    if (uploadForm) uploadForm.dataset.uploading = isBusy ? "1" : "0";
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
      const res = await fetch("/api/admin/videos?limit=12", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const items = await res.json();
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
        el.innerHTML = `
          <div class="admin-card__meta">
            <div class="admin-card__title">${safeTitle}</div>
            <div class="admin-card__sub">status: ${safeStatus}</div>
            <div class="admin-card__sub">raw: ${fileUrl ? `<a href="${fileUrl}" target="_blank" rel="noopener">open</a>` : "missing"}</div>
            <div class="admin-card__sub">hls: ${hlsPlaylist ? `<a href="${hlsPlaylist}" target="_blank" rel="noopener">open</a>` : "processing"}</div>
          </div>
        `;
        recentList.appendChild(el);
      }
    } catch {
      recentList.innerHTML = "Unable to load recent videos";
    }
  }

  async function refreshUploadStatus() {
    if (!activeUploadId) return;
    try {
      const res = await fetch(`/api/admin/uploads/${activeUploadId}`, {
        credentials: "include",
        cache: "no-store",
      });
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
      const res = await fetch(`/api/admin/jobs/${activeJobId}`, {
        credentials: "include",
        cache: "no-store",
      });
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
        setProgress(
          jobBar,
          jobText,
          pct,
          `failed: ${job.error || "processing error"}`
        );
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

    const csrf = await Auth.ensureCsrf();
    const xhr = new XMLHttpRequest();
    activeXhr = xhr;
    setUploadBusy(true);
    if (retryJobBtn) retryJobBtn.hidden = true;
    if (cancelJobBtn) cancelJobBtn.hidden = true;

    xhr.open("POST", "/api/admin/videos");
    xhr.withCredentials = true;
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
        `Network error during upload (status ${st})`
      );
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
      await fetch(`/api/admin/jobs/${activeJobId}/cancel`, {
        method: "POST",
        credentials: "include",
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
      const res = await fetch(`/api/admin/jobs/${activeJobId}/retry`, {
        method: "POST",
        credentials: "include",
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
    if (uploadForm) {
      uploadForm.addEventListener("submit", handleUploadSubmit);
    }
    await loadRecentVideos();
  }

  return { boot };
})();

document.addEventListener("DOMContentLoaded", () => {
  AdminApp.boot();
});
