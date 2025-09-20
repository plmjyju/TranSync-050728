import { useAuthStore } from "../store/auth";

// resetRouter: 移除所有动态注入的路由（保留白名单）
export function resetRouter(r) {
  if (!r) return;
  const keep = new Set(["/login", "/403", "/404", "/"]);
  r.getRoutes().forEach((rt) => {
    if (!keep.has(rt.path) && rt.name) {
      try {
        r.removeRoute(rt.name);
      } catch {}
    }
  });
}

// buildMenuTree: 从已注册路由构建菜单树
export function buildMenuTree(routes) {
  const items = routes
    .filter((r) => r.meta && !r.meta.hideInMenu)
    .map((r) => ({
      title: r.meta?.title || r.path,
      icon: r.meta?.icon || "Menu",
      order: r.meta?.order ?? 999,
      path: r.path,
      children: (r.children || [])
        .filter((c) => !c.meta?.hideInMenu)
        .map((c) => ({
          title: c.meta?.title || c.path,
          icon: c.meta?.icon || "Menu",
          order: c.meta?.order ?? 999,
          path: r.path.replace(/\/$/, "") + "/" + c.path.replace(/^\//, ""),
        })),
    }));
  items.sort((a, b) => a.order - b.order);
  items.forEach(
    (n) => n.children && n.children.sort((a, b) => a.order - b.order)
  );
  return items;
}

// setupDynamicRoutes: 根据权限注入候选路由
export async function setupDynamicRoutes(perms, r) {
  const store = useAuthStore();
  let pset = new Set(perms || Array.from(store.permSet));

  // 本地没有权限，尝试从 /me 拉取
  if (!pset.size && store.token) {
    try {
      const base = import.meta.env.VITE_API_BASE || "http://localhost:3000";
      const resp = await fetch(`${base}/api/common/me`, {
        headers: { Authorization: `Bearer ${store.token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        const list = data.permissions || data.perms || [];
        store.setPermissions(list);
        pset = new Set(list);
      }
    } catch {}
  }

  // 候选模块路由（权限键名与后端保持一致）
  const candidates = [
    {
      name: "client-inbonds",
      path: "/inbonds",
      component: () => import("../views/Inbonds.vue"),
      meta: {
        title: "入库单",
        icon: "Box",
        permissions: ["client.inbond.view"],
        requiresClient: true,
      },
    },
    // 新建入库单页面（隐藏菜单）
    {
      name: "client-inbonds-new",
      path: "/inbonds/new",
      component: () => import("../views/InbondCreate.vue"),
      meta: {
        title: "新建入库单",
        icon: "Plus",
        permissions: ["client.inbond.create"],
        requiresClient: true,
        hideInMenu: true,
      },
    },
    {
      name: "client-packages",
      path: "/packages",
      component: () => import("../views/Packages.vue"),
      meta: {
        title: "包裹",
        icon: "Tickets",
        permissions: ["client.package.view"],
        requiresClient: true,
      },
    },
    // 新增：航空单页面（复用包裹查看权限，后续可引入独立权限 client.airwaybill.view）
    {
      name: "client-airwaybills",
      path: "/airwaybills",
      component: () => import("../views/AirWaybills.vue"),
      meta: {
        title: "航空单",
        icon: "Promotion",
        permissions: ["client.package.view"],
        requiresClient: true,
      },
    },
  ];

  const allow = (route) => {
    const need = route.meta?.permissions || [];
    if (need.length === 0) return true;
    return need.every((p) => pset.has(p));
  };

  candidates.filter(allow).forEach((route) => {
    if (!r.hasRoute(route.name)) {
      r.addRoute(route);
    }
  });

  store.setDynamicInjected(true);
}
