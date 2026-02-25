const FeedApp = (() => {
  const feedEl = document.getElementById("feed");
  const sentinel = document.getElementById("sentinel");
  const heroVideo = document.getElementById("heroVideo");
  const heroPost = document.getElementById("heroPost");
  const startBtn = document.getElementById("startBtn");
  const heroLoader = document.getElementById("heroLoader");
  const heroQuality = document.getElementById("heroQuality");
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

        const csrf = await Auth.ensureCsrf();
        const res = await fetch(
          `/api/videos/${activeCommentVideoId}/comments/`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(csrf ? { "X-CSRFToken": csrf } : {}),
            },
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
          `.post[data-id="${activeCommentVideoId}"]`
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
    const post = videoEl.closest(".post");
    const shouldDimPost = !document.body.classList.contains("feed-page");
    let lastPercent = 0;
    let settleTimer = null;

    const getDuration = () => {
      const d = videoEl.duration;
      if (Number.isFinite(d) && d > 0) return d;
      const s = videoEl.seekable;
      if (s && s.length) {
        const end = s.end(s.length - 1);
        if (Number.isFinite(end) && end > 0) return end;
      }
      return 0;
    };

    const update = () => {
      if (!videoEl.buffered?.length) return;
      show();
      const end = videoEl.buffered.end(videoEl.buffered.length - 1);
      const duration = getDuration();
      if (!duration) {
        if (text) text.textContent = "Загрузка видео...";
        return;
      }
      const percent = Math.max(
        0,
        Math.min(100, Math.round((end / duration) * 100))
      );
      lastPercent = percent;
      if (bar) bar.style.width = percent + "%";
      if (text) text.textContent = `Загрузка видео ${percent}%`;
      if (percent >= 100) hide();

      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleToHundred();
      }, 1200);
    };

    const settleToHundred = () => {
      if (lastPercent >= 95 || videoEl.readyState >= 3) {
        lastPercent = 100;
        if (bar) bar.style.width = "100%";
        if (text) text.textContent = "Загрузка видео 100%";
        hide();
      }
    };

    const hide = () => {
      loaderEl.classList.add("is-hidden");
      if (shouldDimPost && post) post.classList.remove("is-loading");
    };
    const show = () => {
      loaderEl.classList.remove("is-hidden");
      if (shouldDimPost && post) post.classList.add("is-loading");
    };
    const showError = () => {
      if (text) text.textContent = "Ошибка загрузки видео";
    };

    videoEl.addEventListener("loadstart", show);
    videoEl.addEventListener("waiting", show);
    videoEl.addEventListener("stalled", show);
    videoEl.addEventListener("progress", update);
    videoEl.addEventListener("loadedmetadata", update);
    videoEl.addEventListener("canplaythrough", () => {
      if (lastPercent >= 100) hide();
    });
    videoEl.addEventListener("canplay", settleToHundred);
    videoEl.addEventListener("playing", settleToHundred);
    videoEl.addEventListener("ended", hide);
    videoEl.addEventListener("error", showError);

    update();
  }

  function attachHoldToPause(videoEl, post) {
    if (!videoEl || !post) return;
    let isHolding = false;
    let holdTimer = null;
    let seekDir = 0;
    let seekInterval = null;
    let seekTotal = 0;
    let downX = 0;
    let downY = 0;
    let moved = false;

    const seekEl = post.querySelector(".seek-indicator");
    const seekLeft = seekEl?.querySelector(".seek-petal--left");
    const seekRight = seekEl?.querySelector(".seek-petal--right");
    const seekLeftText = seekLeft?.querySelector(".seek-petal__text");
    const seekRightText = seekRight?.querySelector(".seek-petal__text");

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    const showSeek = (dir, total) => {
      if (!seekEl) return;
      seekEl.classList.add("is-visible");
      seekEl.classList.toggle("is-left", dir < 0);
      seekEl.classList.toggle("is-right", dir > 0);
      if (dir < 0 && seekLeftText) {
        seekLeftText.textContent = `−${total.toFixed(1)}s`;
      }
      if (dir > 0 && seekRightText) {
        seekRightText.textContent = `+${total.toFixed(1)}s`;
      }
    };

    const hideSeek = () => {
      if (!seekEl) return;
      seekEl.classList.remove("is-visible", "is-left", "is-right");
    };

    const stopSeek = () => {
      if (seekInterval) clearInterval(seekInterval);
      seekInterval = null;
      seekTotal = 0;
      hideSeek();
    };

    const startSeek = (dir) => {
      stopSeek();
      seekDir = dir;
      seekInterval = setInterval(() => {
        const step = 0.5;
        const duration = isFinite(videoEl.duration) ? videoEl.duration : videoEl.currentTime + 1;
        videoEl.currentTime = clamp(videoEl.currentTime + dir * step, 0, duration);
        seekTotal = clamp(seekTotal + step, 0, 30);
        showSeek(dir, seekTotal);
      }, 200);
    };

    const getDir = (clientX) => {
      const rect = videoEl.getBoundingClientRect();
      const x = clientX - rect.left;
      const left = rect.width * 0.33;
      const right = rect.width * 0.67;
      if (x < left) return -1;
      if (x > right) return 1;
      return 0;
    };

    const beginHold = (clientX) => {
      isHolding = true;
      videoEl.pause();
      const dir = getDir(clientX);
      if (dir !== 0) startSeek(dir);
    };

    const endHold = () => {
      if (!isHolding) return;
      isHolding = false;
      stopSeek();
      videoEl.play().catch(() => {});
    };

    videoEl.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      moved = false;
      downX = e.clientX;
      downY = e.clientY;
      holdTimer = setTimeout(() => beginHold(e.clientX), 220);
    });

    videoEl.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 10) {
        moved = true;
      }
    });

    const onPointerUp = () => {
      if (holdTimer) clearTimeout(holdTimer);
      if (isHolding) {
        endHold();
        return;
      }
      if (!moved) {
        videoEl.muted = !videoEl.muted;
        post.classList.toggle("is-unmuted", !videoEl.muted);
      }
    };

    videoEl.addEventListener("pointerup", onPointerUp);
    videoEl.addEventListener("pointerleave", onPointerUp);
    videoEl.addEventListener("pointercancel", onPointerUp);
  }

  function isImageUrl(url) {
    const clean = String(url || "").split("?")[0];
    return /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(clean);
  }

  function canPlayHls(videoEl) {
    if (!videoEl || !videoEl.canPlayType) return false;
    const t1 = videoEl.canPlayType("application/vnd.apple.mpegurl");
    const t2 = videoEl.canPlayType("application/x-mpegURL");
    return t1 === "probably" || t1 === "maybe" || t2 === "probably" || t2 === "maybe";
  }

  function ensureLoopPlayback(videoEl) {
    if (!videoEl) return;
    if (videoEl.dataset.loopBound === "1") return;
    videoEl.dataset.loopBound = "1";
    videoEl.loop = true;
  }

  function qualityLabelFromHeight(height) {
    const h = Number(height || 0);
    if (!Number.isFinite(h) || h <= 0) return "авто";
    if (h >= 2160) return "4K";
    if (h >= 1440) return "1440p";
    if (h >= 1080) return "1080p";
    if (h >= 720) return "720p";
    if (h >= 540) return "540p";
    if (h >= 480) return "480p";
    if (h >= 360) return "360p";
    return `${Math.round(h)}p`;
  }

  function setQualityBadge(qualityEl, label) {
    if (!qualityEl) return;
    const value = (label || "авто").toString().trim() || "авто";
    qualityEl.textContent = `Качество: ${value}`;
  }

  function bindQualityTracking(videoEl, qualityEl) {
    if (!videoEl || !qualityEl) {
      return { updateFromVideo: () => {} };
    }
    setQualityBadge(qualityEl, "авто");
    if (typeof videoEl.__qualityUpdater !== "function") {
      const updateFromVideo = () => {
        setQualityBadge(
          qualityEl,
          qualityLabelFromHeight(videoEl.videoHeight)
        );
      };
      videoEl.__qualityUpdater = updateFromVideo;
      videoEl.addEventListener("loadedmetadata", updateFromVideo);
      videoEl.addEventListener("canplay", updateFromVideo);
      videoEl.addEventListener("playing", updateFromVideo);
      videoEl.addEventListener("resize", updateFromVideo);
    }
    return { updateFromVideo: videoEl.__qualityUpdater };
  }

  function attachStreamSource(videoEl, src, hlsUrl, qualityEl) {
    if (!videoEl) return;
    if (videoEl.dataset.loaded === "1") return;
    if (!src && !hlsUrl) return;

    videoEl.dataset.loaded = "1";
    videoEl.preload = "metadata";
    ensureLoopPlayback(videoEl);
    const { updateFromVideo } = bindQualityTracking(videoEl, qualityEl);

    const fallbackToMp4 = () => {
      if (!src) return;
      if (videoEl.dataset.hlsFallback === "1") return;
      videoEl.dataset.hlsFallback = "1";
      if (videoEl.__hls) {
        try { videoEl.__hls.destroy(); } catch {}
        delete videoEl.__hls;
      }
      videoEl.removeAttribute("src");
      videoEl.src = src;
      videoEl.load();
      videoEl.addEventListener("loadedmetadata", updateFromVideo, { once: true });
      videoEl.play().catch(() => {});
    };

    if (hlsUrl && window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        maxBufferLength: 30,
        backBufferLength: 30,
      });
      videoEl.__hls = hls;
      const updateFromLevelIndex = (idx) => {
        const level = hls.levels?.[idx];
        if (!level) return;
        setQualityBadge(qualityEl, qualityLabelFromHeight(level.height));
      };
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        const idx = hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel;
        if (Number.isFinite(idx) && idx >= 0) {
          updateFromLevelIndex(idx);
          return;
        }
        updateFromVideo();
      });
      hls.on(window.Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
        const idx = Number(data?.level);
        if (Number.isFinite(idx) && idx >= 0) {
          updateFromLevelIndex(idx);
          return;
        }
        updateFromVideo();
      });
      hls.on(window.Hls.Events.ERROR, (_evt, data) => {
        if (data?.fatal) fallbackToMp4();
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoEl);
      return;
    }

    if (hlsUrl && canPlayHls(videoEl)) {
      videoEl.src = hlsUrl;
      videoEl.addEventListener(
        "error",
        () => fallbackToMp4(),
        { once: true }
      );
      videoEl.load();
      videoEl.addEventListener("loadedmetadata", updateFromVideo, { once: true });
      return;
    }

    if (src) {
      videoEl.src = src;
      videoEl.load();
      videoEl.addEventListener("loadedmetadata", updateFromVideo, { once: true });
    }
  }

  async function loadHeroVideo() {
    if (!heroVideo) return;
    setQualityBadge(heroQuality, "авто");

    try {
      const res = await fetch("/api/hero/", { credentials: "include" });
      if (!res.ok) {
        heroVideo.removeAttribute("src");
        heroVideo.removeAttribute("poster");
        if (heroLoader) heroLoader.classList.add("is-hidden");
        if (heroQuality) heroQuality.hidden = true;
        heroPost?.classList.add("is-empty");
        return;
      }

      const data = await res.json();
      const url = data.file_url || data.file;
      const hlsUrl = data.hls_url || data.hls;
      if (!url) {
        heroVideo.removeAttribute("src");
        heroVideo.removeAttribute("poster");
        if (heroLoader) heroLoader.classList.add("is-hidden");
        if (heroQuality) heroQuality.hidden = true;
        heroPost?.classList.add("is-empty");
        return;
      }

      if (isImageUrl(url)) {
        const source = heroVideo.querySelector("source");
        if (source) source.removeAttribute("src");
        heroVideo.removeAttribute("src");
        heroVideo.poster = url;
        heroVideo.load();
        if (heroLoader) heroLoader.classList.add("is-hidden");
        if (heroQuality) heroQuality.hidden = true;
        heroPost?.classList.remove("is-empty");
        if (heroPost) heroPost.classList.add("is-image");
        return;
      }
      if (heroQuality) heroQuality.hidden = false;

      heroVideo.loop = true;
      heroVideo.muted = true;
      heroVideo.autoplay = true;
      heroVideo.preload = "metadata";
      heroVideo.setAttribute("playsinline", "");

      attachVideoLoader(heroVideo, heroLoader);

      const source = heroVideo.querySelector("source");
      if (source) source.removeAttribute("src");
      heroVideo.removeAttribute("src");
      heroPost?.classList.remove("is-empty");

      attachStreamSource(heroVideo, url, hlsUrl, heroQuality);
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

  function ensureVideoSource(videoEl, src, hlsUrl, qualityEl) {
    attachStreamSource(videoEl, src, hlsUrl, qualityEl);
  }

  function createPost(v) {
    const hlsUrl = v.hls_url || v.hls || "";
    const src = v.file_url || v.file || "";
    const title = v.title ?? "Без названия";
    const likes = typeof v.likes_count === "number" ? v.likes_count : 0;
    const comments = typeof v.comments_count === "number" ? v.comments_count : 0;
    const likedByMe = Boolean(v.liked_by_me);

    const post = document.createElement("section");
    post.className = "post post--compact";
    post.dataset.src = src;
    post.dataset.hls = hlsUrl;
    post.dataset.id = v.id;

    post.innerHTML = `
      <video class="post__video" playsinline muted preload="metadata" loop></video>
      <div class="seek-indicator" aria-hidden="true">
        <div class="seek-petal seek-petal--left">
          <div class="seek-petal__icon">⏪</div>
          <div class="seek-petal__text">−0.0s</div>
        </div>
        <div class="seek-petal seek-petal--right">
          <div class="seek-petal__icon">⏩</div>
          <div class="seek-petal__text">+0.0s</div>
        </div>
      </div>

      <div class="post__ui">
        <div class="post__meta">
          <div class="video-loader is-hidden">
            <div class="video-loader__bar" style="width: 0%"></div>
            <div class="video-loader__text">Загрузка видео 0%</div>
          </div>
          <div class="post__quality" data-role="quality">Качество: авто</div>
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
        </div>
      </div>
    `;

    const videoEl = post.querySelector(".post__video");
    const loader = post.querySelector(".video-loader");

    videoEl.loop = true;
    videoEl.setAttribute("playsinline", "");
    videoEl.addEventListener("loadedmetadata", () => {
      try { videoEl.currentTime = 0.01; } catch {}
    }, { once: true });

    attachVideoLoader(videoEl, loader);

    if (src) videoEl.dataset.src = src;
    if (hlsUrl) videoEl.dataset.hls = hlsUrl;

    attachHoldToPause(videoEl, post);

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
        const csrf = await Auth.ensureCsrf();
        const res = await fetch(`/api/videos/${id}/like/`, {
          method: "POST",
          credentials: "include",
          headers: csrf ? { "X-CSRFToken": csrf } : {},
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

  function normalizeApiUrl(url) {
    try {
      const u = new URL(url, window.location.origin);
      if (u.origin === window.location.origin) {
        return u.pathname + u.search;
      }
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        return u.pathname + u.search;
      }
      return u.href;
    } catch {
      return url;
    }
  }

  async function fetchVideos() {
    const res = await fetch(normalizeApiUrl(nextUrl), { credentials: "include" });
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

      const src = post.dataset.src;
      const hlsUrl = post.dataset.hls;
      const qualityEl = post.querySelector('[data-role="quality"]');
      ensureVideoSource(video, src, hlsUrl, qualityEl);

      video.play().catch(() => {});

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
    }, { rootMargin: "1500px 0px" });

    io.observe(sentinel);
  }

  function scrollToFirstRealPost() {
    const first = heroPost?.nextElementSibling;
    if (!first) return;
    first.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function boot() {
    currentUser = await Auth.me();
    await loadHeroVideo();

    setupActiveAutoplay();
    setupInfiniteScroll();
    setupCommentsModal();

    // IMPORTANT: мы можем начать подгрузку сразу, но это не мешает —
    // hero остаётся первым экраном, а посты просто появятся ниже.
    try {
      await loadNextPage();
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
