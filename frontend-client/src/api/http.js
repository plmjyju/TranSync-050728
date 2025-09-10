import axios from "axios";
import router from "../router";
import { resetRouter } from "../router/dynamic";

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:3000",
  timeout: 15000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("token_client");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      localStorage.removeItem("token_client");
      try {
        resetRouter(router);
      } catch {}
      if (location.pathname !== "/login") location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default http;
