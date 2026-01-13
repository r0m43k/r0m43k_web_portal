const Auth = (() => {
  async function json(url, opts = {}) {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
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
    return res.ok;
  }

  async function register(username, password) {
    const res = await json("/api/auth/register/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    return res.ok;
  }

  async function logout() {
    const res = await fetch("/api/auth/logout/", { method: "POST", credentials: "include" });
    return res.ok;
  }

  async function wireTopbar() {
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    if (!loginBtn || !logoutBtn) return;

    const user = await me();
    if (user) {
      loginBtn.hidden = true;
      logoutBtn.hidden = false;
      logoutBtn.addEventListener("click", async () => {
        await logout();
        location.reload();
      });
    } else {
      loginBtn.hidden = false;
      logoutBtn.hidden = true;
    }
  }

  return { me, login, register, logout, wireTopbar };
})();
