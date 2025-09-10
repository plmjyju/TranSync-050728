import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../store/auth";
import { setupDynamicRoutes } from "./dynamic";

const routes = [
  { path: "/", redirect: "/login" },
  {
    path: "/login",
    name: "login",
    component: () => import("../views/Login.vue"),
  },
  {
    path: "/403",
    name: "forbidden",
    component: () => import("../views/403.vue"),
  },
  {
    path: "/404",
    name: "notfound",
    component: () => import("../views/404.vue"),
  },
  { path: "/:pathMatch(.*)*", redirect: "/404" },
];

const router = createRouter({ history: createWebHistory(), routes });

function getDefaultAuthedPath(permSet) {
  if (permSet.has("client.inbond.view")) return "/inbonds";
  if (permSet.has("client.package.view")) return "/packages";
  return "/403";
}

router.beforeEach(async (to, from, next) => {
  const store = useAuthStore();
  const token = localStorage.getItem("token_client");

  // 未登录访问非登录页 → 跳转登录
  if (to.path !== "/login" && !token) return next("/login");

  // 访问登录页
  if (to.path === "/login") {
    if (!token) return next(); // 未登录直接进入登录页
    // 已登录：注入动态路由后，若无可访问权限则允许停留在登录页以便切换账号
    if (!store.dynamicInjected) await setupDynamicRoutes(undefined, router);
    const target = getDefaultAuthedPath(store.permSet);
    if (target === "/403") return next(); // 允许留在登录页
    return next(target);
  }

  // 其他页面：已登录但未注入则先注入
  if (token && !store.dynamicInjected) {
    await setupDynamicRoutes(undefined, router);
    return next({ ...to, replace: true });
  }

  next();
});

// 动态设置页面标题
router.afterEach((to) => {
  const base = "TranSync Client";
  const title = to.meta?.title ? `${to.meta.title} - ${base}` : base;
  document.title = title;
});

export default router;
