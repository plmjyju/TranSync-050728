import axios from "axios";

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:3000",
  timeout: 15000,
});

function pickTokenByUrl(url = "") {
  // 统一使用相对路径判断；绝对路径也兼容包含 /api/xxx
  if (url.includes("/api/client")) return localStorage.getItem("token_client");
  if (url.includes("/api/agent")) return localStorage.getItem("token_agent");
  if (url.includes("/api/warehouse"))
    return localStorage.getItem("token_warehouse");
  // 默认优先 agent
  return (
    localStorage.getItem("token_agent") ||
    localStorage.getItem("token_client") ||
    ""
  );
}

http.interceptors.request.use((config) => {
  // 若已手动设置 Authorization 则尊重
  if (!config.headers?.Authorization) {
    const token = pickTokenByUrl(config.url || "");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

function redirectToLoginByUrl(url = "") {
  if (url.includes("/api/client")) {
    if (location.pathname !== "/client/login") location.href = "/client/login";
  } else if (url.includes("/api/agent")) {
    if (location.pathname !== "/login") location.href = "/login";
  } else if (url.includes("/api/warehouse")) {
    if (location.pathname !== "/warehouse/login")
      location.href = "/warehouse/login";
  } else {
    if (location.pathname !== "/login") location.href = "/login";
  }
}

http.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      // 清除所有可能的 token，避免循环 401
      localStorage.removeItem("token_agent");
      localStorage.removeItem("token_client");
      localStorage.removeItem("token_warehouse");
      redirectToLoginByUrl(error?.config?.url || "");
    }
    return Promise.reject(error);
  }
);

export default http;
