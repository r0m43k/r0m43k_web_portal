document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  const overlay = document.createElement("div");
  overlay.id = "admin-upload-overlay";
  overlay.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center;">
      <div id="admin-upload-spinner"></div>
      <div id="admin-upload-text">Загружаю видео…</div>
    </div>
  `;
  document.body.appendChild(overlay);

  form.addEventListener("submit", () => {
    overlay.style.display = "flex";
  });
});
