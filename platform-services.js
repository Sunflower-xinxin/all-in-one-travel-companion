(() => {
  "use strict";

  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(options.headers || {}) }
    });
    if (!response.ok) throw new Error(`luxia-api-${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  window.LuxiaCloud = Object.freeze({
    session: () => request("/api/session"),
    pullTrip: (tripId) => request(`/api/trips/${encodeURIComponent(tripId)}`),
    pushTrip: (tripId, payload, version) => request(`/api/trips/${encodeURIComponent(tripId)}`, {
      method: "PUT",
      body: JSON.stringify({ payload, version })
    }),
    inviteCollaborator: (tripId, email, role = "editor") => request(`/api/trips/${encodeURIComponent(tripId)}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role })
    }),
    revisions: (tripId) => request(`/api/trips/${encodeURIComponent(tripId)}/revisions`)
  });

  function setupAccount() {
    const dialog = document.querySelector("#account-dialog");
    const trigger = document.querySelector("#account-trigger");
    if (!dialog || !trigger) return;

    const open = () => {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    };
    const close = () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };

    trigger.addEventListener("click", open);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog || event.target.closest("[data-account-close]")) close();
      const signIn = event.target.closest("[data-account-signin]");
      if (!signIn) return;
      let message = dialog.querySelector("[data-account-message]");
      if (!message) {
        message = document.createElement("p");
        message.dataset.accountMessage = "";
        message.className = "account-security-note";
        message.setAttribute("role", "status");
        signIn.insertAdjacentElement("afterend", message);
      }
      message.textContent = "当前是本地审批版本。待你确认部署方式后，将启用正式身份验证、云端数据库与邀请链接。";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupAccount);
  else setupAccount();
})();
