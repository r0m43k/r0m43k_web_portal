const FeedApp = (() => {
  const feedEl = document.getElementById("feed");
  const sentinel = document.getElementById("sentinel");
  const heroVideo = document.getElementById("heroVideo");
  const heroPost = document.getElementById("heroPost");
  const startBtn = document.getElementById("startBtn");

  let nextUrl = "/api/videos/?limit=6&offset=0";
  let loading = false;
  let done = false;

  let activeVideo = null;
  let postsCount = 0;

async function loadHeroVideo() {
  if (!heroVideo) return;

  try {
    const res = await fetch("/api/hero/", { credentials: "include" });
    if (!res.ok) return;

    const data = await res.json();              
    const url = data.file_url || data.file;
    if (!url) return;

    heroVideo.src = url;

    const source = heroVideo.querySelector("source");
    if (source) source.src = url;

    heroVideo.loop = true;
    heroVideo.muted = true;
    heroVideo.autoplay = true;
    heroVideo.preload = "auto";
    heroVideo.setAttribute("playsinline", "");
               

    heroVideo.load();
    heroVideo.play().catch(() => {});
  } catch {}
}



  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function createPost(v) {
    const src = v.file_url || v.file;
    const title = v.title ?? "Без названия";

    const post = document.createElement("section");
    post.className = "post";
    post.dataset.src = src;

    post.innerHTML = `
      <video class="post__video" playsinline muted preload="auto" loop></video>

      <div class="post__ui">
        <div class="post__meta">
          <div class="post__title">${escapeHtml(title)}</div>
          <div class="post__sub">${escapeHtml(src)}</div>
        </div>

        <div class="post__actions">
          <button class="pill" type="button" data-action="like">❤</button>
          <button class="pill" type="button" data-action="comment">💬</button>
          <button class="pill" type="button" data-action="share">↗</button>
        </div>
      </div>
    `;

    const videoEl = post.querySelector(".post__video");
    videoEl.src = src;
    videoEl.loop = true;

    videoEl.setAttribute("playsinline", "");
    videoEl.addEventListener("loadedmetadata", () => {
      try { videoEl.currentTime = 0.01; } catch {}
    }, { once: true });

    post.addEventListener("click", () => {
      videoEl.muted = !videoEl.muted;
      post.classList.toggle("is-unmuted", !videoEl.muted);
    });

    return post;
  }

  async function fetchVideos() {
    const res = await fetch(nextUrl.replace("http://localhost", ""), { credentials: "include" });
    if (!res.ok) throw new Error("API " + res.status);

    const data = await res.json();

    if (Array.isArray(data)) {
      done = true;
      return { items: data, next: null };
    }

    const items = data.results || [];
    const next = data.next ? data.next : null;
    return { items, next };
  }

  async function loadNextPage() {
    if (loading || done) return;
    loading = true;

    try {
      const { items, next } = await fetchVideos();

      if (!items.length) {
        done = true;
        return;
      }

      for (const v of items) {
        const post = createPost(v);
        feedEl.appendChild(post);
        postsCount++;
      }

      if (next) nextUrl = next;
      else done = true;
    } finally {
      loading = false;
    }
  }

  function setupActiveAutoplay() {
    const io = new IntersectionObserver((entries) => {
      let best = null;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
      }
      if (!best) return;

      const post = best.target;
      const video = post.querySelector("video");
      if (!video) return;

      if (activeVideo && activeVideo !== video) {
        activeVideo.pause();
      }

      activeVideo = video;

      // hero и посты всегда loop
      video.loop = true;

      video.play().catch(() => {});

      // preload next
      const nextPost = post.nextElementSibling;
      if (nextPost) {
        const nextVideo = nextPost.querySelector("video");
        if (nextVideo) nextVideo.preload = "auto";
      }
    }, { threshold: [0.6, 0.75, 0.9] });

    // наблюдаем hero сразу
    if (heroPost) io.observe(heroPost);

    // наблюдаем новые посты
    const mo = new MutationObserver(() => {
      document.querySelectorAll(".post").forEach(p => {
        if (!p.dataset.observed) {
          p.dataset.observed = "1";
          io.observe(p);
        }
      });
    });

    mo.observe(feedEl, { childList: true });
  }

  function setupInfiniteScroll() {
    const io = new IntersectionObserver(async (entries) => {
      if (!entries.some(e => e.isIntersecting)) return;
      await loadNextPage();
      if (!done && postsCount < 4) await loadNextPage();
    }, { rootMargin: "1500px 0px" });

    io.observe(sentinel);
  }

  function scrollToFirstRealPost() {
    const first = heroPost?.nextElementSibling;
    if (!first) return;
    first.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function boot() {
    await Auth.wireTopbar();
    await loadHeroVideo();

    setupActiveAutoplay();
    setupInfiniteScroll();

    // IMPORTANT: мы можем начать подгрузку сразу, но это не мешает —
    // hero остаётся первым экраном, а посты просто появятся ниже.
    try {
      await loadNextPage();
      if (!done && postsCount < 4) await loadNextPage();
    } catch {}

    // Кнопка "смотреть" = проскроллить к первому посту
    if (startBtn) startBtn.addEventListener("click", scrollToFirstRealPost);

    // Также если человек сам свайпнул вниз — он естественно уйдёт на следующий пост,
    // и к hero можно вернуться свайпом вверх (scroll-snap).
  }

  return { boot };
})();

document.addEventListener("DOMContentLoaded", () => {
  FeedApp.boot();
});
