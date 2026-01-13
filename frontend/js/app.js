async function loadHeroVideo() {
  const heroVideo = document.querySelector(".hero__video");
  if (!heroVideo) return;

  const res = await fetch("/api/hero/");
  if (!res.ok) return;

  const data = await res.json();
  if (!data.file_url) return;

  heroVideo.src = data.file_url;
  heroVideo.load();
}

async function loadFeed() {
  const app = document.getElementById("app");

  const res = await fetch("/api/videos/");
  if (!res.ok) {
    app.textContent = "API не отвечает: " + res.status;
    return;
  }

  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.results || []);

  if (!items.length) {
    app.textContent = "Пока нет видео (или оно не approved).";
    return;
  }

  app.innerHTML = items.map(v => {
    const src = v.file_url || v.file;
    return `
      <div class="card">
        <div class="title">${v.title ?? "Без названия"}</div>
        <video src="${src}" controls preload="metadata" playsinline muted></video>
        <div class="meta">${src}</div>
      </div>
    `;
  }).join("");
}

async function main() {
  await loadHeroVideo();
  await loadFeed();
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch(e => {
    document.getElementById("app").textContent = "Ошибка: " + e;
  });
});
