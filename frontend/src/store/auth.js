import { defineStore } from "pinia";

export const useAuthStore = defineStore("auth", {
  state: () => ({ token: localStorage.getItem("token_agent") || "" }),
  actions: {
    setToken(t) {
      this.token = t;
      localStorage.setItem("token_agent", t);
    },
    logout() {
      this.token = "";
      localStorage.removeItem("token_agent");
    },
  },
});
