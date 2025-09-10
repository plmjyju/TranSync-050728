import { defineStore } from "pinia";

function decodeJwtPermissions(token) {
  try {
    if (!token) return [];
    const p = token.split(".")[1];
    if (!p) return [];
    const base64 = p.replace(/-/g, "+").replace(/_/g, "/");
    const pad =
      base64.length % 4 === 2 ? "==" : base64.length % 4 === 3 ? "=" : "";
    const json = atob(base64 + pad);
    const payload = JSON.parse(json || "{}");
    const perms = payload.permissions || payload.perms || [];
    return Array.isArray(perms) ? perms : [];
  } catch {
    return [];
  }
}

export const useAuthStore = defineStore("auth_client", {
  state: () => {
    const initialToken = localStorage.getItem("token_client") || "";
    return {
      token: initialToken,
      permissions: new Set(decodeJwtPermissions(initialToken)),
      dynamicInjected: false,
    };
  },
  getters: {
    permSet(state) {
      return state.permissions;
    },
    isAuthed(state) {
      return !!state.token;
    },
  },
  actions: {
    setToken(token) {
      this.token = token || "";
      if (token) localStorage.setItem("token_client", token);
      else localStorage.removeItem("token_client");
      // decode permissions on token set
      const perms = decodeJwtPermissions(token);
      this.permissions = new Set(perms);
    },
    setPermissions(list) {
      this.permissions = new Set(Array.isArray(list) ? list : []);
    },
    setDynamicInjected(v) {
      this.dynamicInjected = !!v;
    },
    logout() {
      this.setToken("");
      this.setPermissions([]);
      this.dynamicInjected = false;
    },
  },
});
