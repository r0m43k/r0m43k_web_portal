const FeedApp = (() => {
  const feedEl = document.getElementById("feed");
  const sentinel = document.getElementById("sentinel");
  const heroVideo = document.getElementById("heroVideo");
  const heroPost = document.getElementById("heroPost");
  const startBtn = document.getElementById("startBtn");
  const heroLoader = document.getElementById("heroLoader");
  const commentsModal = document.getElementById("commentsModal");
  const commentsList = document.getElementById("commentsList");
  const commentForm = document.getElementById("commentForm");
  const commentHint = document.getElementById("commentHint");

  let nextUrl = "/api/videos/?limit=6&offset=0";
  let loading = false;
  let done = false;

  let activeVideo = null;
  let postsCount = 0;
  let currentUser = null;
  let activeCommentVideoId = null;
  let preloadQueue = [];
  const preloaded = new Set();
  const PRELOAD_CONCURRENCY = 2;

  function enqueuePreload(src) {
    if (!src || preloaded.has(src)) return;
    preloaded.add(src);
    preloadQueue.push(src);
    runPreloadQueue();
  }

  function runPreloadQueue() {
    if (!preloadQueue.length) return;
    const inFlight = document.querySelectorAll(
      "video[data-preloading='1']"
    ).length;
    if (inFlight >= PRELOAD_CONCURRENCY) return;

    const src = preloadQueue.shift();
    if (!src) return;

    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.src = src;
    v.setAttribute("data-preloading", "1");
    v.style.position = "absolute";
    v.style.width = "1px";
    v.style.height = "1px";
    v.style.opacity = "0";
    document.body.appendChild(v);

    const cleanup = () => {
      v.removeAttribute("data-preloading");
      v.remove();
      runPreloadQueue();
    };

    v.addEventListener("canplaythrough", cleanup, { once: true });
    v.addEventListener("error", cleanup, { once: true });
    v.load();
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("ru-RU");
    } catch {
      return "";
    }
  }

  function renderComments(items) {
    if (!commentsList) return;
    commentsList.innerHTML = "";
    if (!items.length) {
      commentsList.innerHTML = `<div class="comment">Пока нет комментариев</div>`;
      return;
    }
    for (const c of items) {
      const el = document.createElement("div");
      el.className = "comment";
      el.innerHTML = `
        <div class="comment__user">${escapeHtml(c.user || "user")}</div>
        <div class="comment__text">${escapeHtml(c.text || "")}</div>
        <div class="comment__time">${escapeHtml(formatTime(c.created_at))}</div>
      `;
      commentsList.appendChild(el);
    }
  }

  async function openCommentsModal(videoId) {
    if (!commentsModal) return;
    activeCommentVideoId = videoId;
    commentsModal.classList.remove("is-hidden");
    if (commentHint) commentHint.textContent = "";

    if (!currentUser) {
      if (commentHint) {
        commentHint.textContent =
          "Нужно войти, чтобы оставлять комментарии.";
      }
    }

    try {
      const res = await fetch(`/api/videos/${videoId}/comments/`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("load comments");
      const data = await res.json();
      renderComments(Array.isArray(data) ? data : data.results || []);
    } catch {
      renderComments([]);
    }

    if (commentForm) {
      const input = commentForm.querySelector("input[name='text']");
      if (input) {
        input.disabled = !currentUser;
        input.value = "";
      }
    }
  }

  function closeCommentsModal() {
    if (!commentsModal) return;
    commentsModal.classList.add("is-hidden");
    activeCommentVideoId = null;
  }

  function setupCommentsModal() {
    if (!commentsModal) return;
    commentsModal.addEventListener("click", (e) => {
      const target = e.target;
      if (target?.dataset?.action === "close") {
        closeCommentsModal();
      }
      if (target?.classList?.contains("modal__backdrop")) {
        closeCommentsModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeCommentsModal();
    });

    if (commentForm) {
      commentForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUser || !activeCommentVideoId) return;
        const input = commentForm.querySelector("input[name='text']");
        const text = input?.value?.trim();
        if (!text) return;

        const res = await fetch(
          `/api/videos/${activeCommentVideoId}/comments/`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          }
        );

        if (!res.ok) return;
        const newComment = await res.json();
        const existing =
          commentsList?.querySelectorAll(".comment") || [];
        if (commentsList) {
          if (
            existing.length === 1 &&
            existing[0].textContent?.includes("Пока нет")
          ) {
            commentsList.innerHTML = "";
          }
          const el = document.createElement("div");
          el.className = "comment";
          el.innerHTML = `
            <div class="comment__user">${escapeHtml(newComment.user || "user")}</div>
            <div class="comment__text">${escapeHtml(newComment.text || "")}</div>
            <div class="comment__time">${escapeHtml(formatTime(newComment.created_at))}</div>
          `;
          commentsList.prepend(el);
        }
        if (input) input.value = "";

        const post = document.querySelector(
          \`.post[data-id="\${activeCommentVideoId}"]\`
        );
        const countEl = post?.querySelector('[data-role="comments"]');
        if (countEl) {
          const current = parseInt(countEl.textContent || "0", 10);
          countEl.textContent = String(current + 1);
        }
      });
    }
  }

  function attachVideoLoader(videoEl, loaderEl) {
    if (!videoEl || !loaderEl) return;
    const bar = loaderEl.querySelector(".video-loader__bar");
    const text = loaderEl.querySelector(".video-loader__text");

    const update = () => {
      if (!videoEl.duration || !videoEl.buffered?.length) return;
      const end = videoEl.buffered.end(videoEl.buffered.length - 1);
      const percent = Math.max(0, Math.min(100, Math.round((end / videoEl.duration) * 100)));
      if (bar) bar.style.width = percent + "%";
      if (text) text.textContent = `Загрузка видео ${percent}%`;
    };

    const hide = () => {
      loaderEl.classList.add("is-hidden");
    };
    const show = () => {
      loaderEl.classList.remove("is-hidden");
    };
    const showError = () => {
      if (text) text.textContent = "Ошибка загрузки видео";
    };

    videoEl.addEventListener("loadstart", show);
    videoEl.addEventListener("waiting", show);
    videoEl.addEventListener("stalled", show);
    videoEl.addEventListener("progress", update);
    videoEl.addEventListener("loadedmetadata", update);
    videoEl.addEventListener("canplay", hide);
    videoEl.addEventListener("playing", hide);
    videoEl.addEventListener("error", showError);

    update();
  }

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

      attachVideoLoader(heroVideo, heroLoader);

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
    const likes = typeof v.likes_count === "number" ? v.likes_count : 0;
    const comments = typeof v.comments_count === "number" ? v.comments_count : 0;
    const likedByMe = Boolean(v.liked_by_me);

    const post = document.createElement("section");
    post.className = "post";
    post.dataset.src = src;
    post.dataset.id = v.id;

    post.innerHTML = `
      <video class="post__video" playsinline muted preload="auto" loop></video>

      <div class="post__ui">
        <div class="post__meta">
          <div class="post__title">${escapeHtml(title)}</div>
          <div class="post__sub">${escapeHtml(src)}</div>
          <div class="video-loader is-hidden">
            <div class="video-loader__bar" style="width: 0%"></div>
            <div class="video-loader__text">Загрузка видео 0%</div>
          </div>
        </div>

        <div class="post__actions">
          <button class="pill" type="button" data-action="like" data-liked="${likedByMe}">
            <span class="pill__icon">❤</span>
            <span class="pill__count" data-role="likes">${likes}</span>
          </button>
          <button class="pill" type="button" data-action="comment">
            <span class="pill__icon">💬</span>
            <span class="pill__count" data-role="comments">${comments}</span>
          </button>
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

    const loader = post.querySelector(".video-loader");
    attachVideoLoader(videoEl, loader);

    if (src) enqueuePreload(src);

    post.addEventListener("click", () => {
      videoEl.muted = !videoEl.muted;
      post.classList.toggle("is-unmuted", !videoEl.muted);
    });

    const likeBtn = post.querySelector('[data-action="like"]');
    const commentBtn = post.querySelector('[data-action="comment"]');

    if (likeBtn) {
      likeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!currentUser) {
          location.href = "/login.html";
          return;
        }
        const id = post.dataset.id;
        if (!id) return;
        const res = await fetch(`/api/videos/${id}/like/`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const countEl = likeBtn.querySelector('[data-role="likes"]');
        if (countEl && typeof data.likes_count === "number") {
          countEl.textContent = data.likes_count;
        }
        likeBtn.dataset.liked = data.liked ? "true" : "false";
      });
    }

    if (commentBtn) {
      commentBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = post.dataset.id;
        if (!id) return;
        openCommentsModal(id, commentBtn);
      });
    }

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
        if (nextVideo) {
          nextVideo.preload = "auto";
          const src = nextVideo.getAttribute("src");
          if (src) enqueuePreload(src);
        }
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
    currentUser = await Auth.me();
    await loadHeroVideo();

    setupActiveAutoplay();
    setupInfiniteScroll();
    setupCommentsModal();

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
