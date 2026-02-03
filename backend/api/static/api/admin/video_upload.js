(() => {
  const form = document.querySelector("form#video_form");
  const progress = document.getElementById("uploadProgress");
  const bar = document.getElementById("uploadProgressBar");
  const text = document.getElementById("uploadProgressText");

  if (!form || !progress || !bar || !text) return;

  form.addEventListener("submit", (e) => {
    const fileInput = form.querySelector("input[type='file']");
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      return;
    }

    e.preventDefault();
    progress.style.display = "block";
    bar.style.width = "0%";
    text.textContent = "Загрузка 0%";

    const xhr = new XMLHttpRequest();
    xhr.open(form.method, form.action);

    xhr.upload.addEventListener("progress", (evt) => {
      if (!evt.lengthComputable) return;
      const percent = Math.round((evt.loaded / evt.total) * 100);
      bar.style.width = percent + "%";
      text.textContent = `Загрузка ${percent}%`;
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 400) {
        const redirectUrl = xhr.responseURL || window.location.href;
        window.location.href = redirectUrl;
        return;
      }
      text.textContent = "Ошибка загрузки. Проверьте логи.";
    });

    xhr.addEventListener("error", () => {
      text.textContent = "Ошибка сети при загрузке.";
    });

    const data = new FormData(form);
    xhr.send(data);
  });
})();
