export default [
  {
    path: "/client/login",
    component: () => import("../views/client/Login.vue"),
  },
  { path: "/client", redirect: "/client/inbonds" },
  {
    path: "/client/inbonds",
    component: () => import("../views/client/Inbonds.vue"),
    meta: { requiresClient: true },
  },
  {
    path: "/client/packages",
    component: () => import("../views/client/Packages.vue"),
    meta: { requiresClient: true },
  },
];
