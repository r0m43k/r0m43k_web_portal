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

  async function login(login, password) {
    try {
      const res = await json("/api/auth/login/", {
        method: "POST",
        body: JSON.stringify({ login, password }),
      });
      let detail = "";
      let data = null;
      try {
        data = await res.json();
        detail = data?.detail || "";
      } catch {}
      return { ok: res.ok, detail, data };
    } catch {
      return { ok: false, detail: "Сеть недоступна. Попробуйте позже." };
    }
  }

  async function register(password, nickname, email) {
    try {
      const res = await json("/api/auth/register/", {
        method: "POST",
        body: JSON.stringify({ password, nickname, email }),
      });
      let detail = "";
      let data = null;
      try {
        data = await res.json();
        detail = data?.detail || "";
      } catch {}
      return { ok: res.ok, detail, data };
    } catch {
      return { ok: false, detail: "Сеть недоступна. Попробуйте позже." };
    }
  }

  async function logout() {
    try {
      const res = await json("/api/auth/logout/", { method: "POST" });
      localStorage.removeItem(ADMIN_BRIDGE_KEY);
      return res.ok;
    } catch {
      localStorage.removeItem(ADMIN_BRIDGE_KEY);
      return false;
    }
  }

  const ADMIN_BRIDGE_KEY = "adminBridge";

  async function tryAdminBridge() {
    try {
      const res = await fetch("/api/auth/admin-bridge/", {
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function wireTopbar() {
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const adminBtn = document.getElementById("adminBtn");
    const userEl = document.getElementById("topbarUser");
    if (!loginBtn || !logoutBtn) return;

    loginBtn.hidden = true;
    logoutBtn.hidden = true;
    if (adminBtn) adminBtn.hidden = true;
    if (userEl) userEl.hidden = true;

    const hasBridge = localStorage.getItem(ADMIN_BRIDGE_KEY) === "1";
    if (hasBridge) {
      const ok = await tryAdminBridge();
      if (!ok) {
        await logout();
        localStorage.removeItem(ADMIN_BRIDGE_KEY);
        location.reload();
        return;
      }
    }

    let user = await me();
    if (!user) {
      const bridged = await tryAdminBridge();
      if (bridged) {
        localStorage.setItem(ADMIN_BRIDGE_KEY, "1");
        user = await me();
      }
    }
    if (user) {
      document.body.classList.add("is-auth");
      document.body.classList.remove("is-guest");
      loginBtn.hidden = true;
      logoutBtn.hidden = false;
      if (userEl) {
        userEl.hidden = false;
        userEl.textContent = user.nickname || user.username || "user";
      }
      if (adminBtn) {
        adminBtn.hidden = !(user.is_staff || user.is_superuser);
      }
      logoutBtn.addEventListener("click", async () => {
        await logout();
        location.reload();
      });
    } else {
      document.body.classList.add("is-guest");
      document.body.classList.remove("is-auth");
      loginBtn.hidden = false;
    }
  }

  const api = { me, login, register, logout, wireTopbar, ensureCsrf, getCookie };

  document.addEventListener("DOMContentLoaded", () => {
    api.wireTopbar();
  });

  return api;
})();
