const Auth = (() => {
  function getCookie(name) {
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
  }

  async function ensureCsrf() {
    const token = getCookie("csrftoken");
    if (token) return token;
    try {
      await fetch("/api/auth/csrf/", { credentials: "include" });
    } catch {}
    return getCookie("csrftoken");
  }

  async function json(url, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const needsCsrf = !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method);
    const csrf = needsCsrf ? await ensureCsrf() : getCookie("csrftoken");
    const headers = {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRFToken": csrf } : {}),
      ...(opts.headers || {}),
    };
    const res = await fetch(url, {
      credentials: "include",
      headers,
      ...opts,
    });
    return res;
  }

  async function me() {
    try {
      const res = await fetch("/api/auth/me/", { credentials: "include" });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function login(username, password) {
    const res = await json("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail || "";
    } catch {}
    return { ok: res.ok, detail };
  }

  async function register(username, password, nickname, email) {
    const res = await json("/api/auth/register/", {
      method: "POST",
      body: JSON.stringify({ username, password, nickname, email }),
    });
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail || "";
    } catch {}
    return { ok: res.ok, detail };
  }

  async function logout() {
    const res = await json("/api/auth/logout/", { method: "POST" });
    return res.ok;
  }

  async function wireTopbar() {
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const userEl = document.getElementById("topbarUser");
    if (!loginBtn || !logoutBtn) return;

    const user = await me();
    if (user) {
      loginBtn.hidden = true;
      logoutBtn.hidden = false;
      if (userEl) {
        userEl.hidden = false;
        userEl.textContent = user.nickname || user.username || "user";
      }
      logoutBtn.addEventListener("click", async () => {
        await logout();
        location.reload();
      });
    } else {
      loginBtn.hidden = false;
      logoutBtn.hidden = true;
      if (userEl) userEl.hidden = true;
    }
  }

  return { me, login, register, logout, wireTopbar, ensureCsrf, getCookie };
})();
