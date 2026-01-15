document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  // создаём оверлей
  const overlay = document.createElement("div");
  overlay.id = "upload-overlay";
  overlay.innerHTML = `
    <div class="box">
      <div class="spinner"></div>
      <div>Загружаю видео… не закрывай вкладку</div>
    </div>
  `;
  document.body.appendChild(overlay);

  // показываем оверлей при сабмите формы
  form.addEventListener("submit", () => {
    overlay.style.display = "flex";
  });
});
