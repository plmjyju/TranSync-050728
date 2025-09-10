import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../store/auth";
import clientRoutes from "./client";
import { setupAgentDynamicRoutesIfAuthed } from "./dynamic";

const routes = [
  { path: "/", redirect: "/agent/packages" },
  { path: "/login", component: () => import("../views/Login.vue") },
  // 仅保留最小静态入口，其他按权限动态注入
  // { path: '/agent/packages', component: () => import('../views/AgentPackages.vue'), meta: { requiresAgent: true } },
  ...clientRoutes,
];

const router = createRouter({ history: createWebHistory(), routes });

// 初始化时基于现有 token 注入动态路由
setupAgentDynamicRoutesIfAuthed(router);

router.beforeEach((to, from, next) => {
  const auth = useAuthStore();
  const hasAgent = auth.token || localStorage.getItem("token_agent");
  const hasClient = localStorage.getItem("token_client");

  if (to.meta.requiresAgent && !hasAgent) return next("/login");
  if (to.meta.requiresClient && !hasClient) return next("/client/login");

  if (to.path === "/login" && hasAgent) return next("/agent/packages");
  if (to.path === "/client/login" && hasClient) return next("/client");

  next();
});

export default router;
