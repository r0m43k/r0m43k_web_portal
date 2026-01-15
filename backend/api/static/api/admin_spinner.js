document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  const overlay = document.createElement("div");
  overlay.id = "upload-overlay";
  overlay.innerHTML = `
    <div class="box">
      <div class="spinner"></div>
      <div>Uploading... please wait</div>
    </div>
  `;
  document.body.appendChild(overlay);

  form.addEventListener("submit", () => {
    overlay.style.display = "flex";
  });
});
