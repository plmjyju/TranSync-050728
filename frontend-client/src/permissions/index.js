import { useAuthStore } from "../store/auth";

export function hasPerm(...perms) {
  const store = useAuthStore();
  if (!perms || perms.length === 0) return true;
  const set = store.permSet || new Set();
  return perms.every((p) => set.has(p));
}

export function hasAnyPerm(...perms) {
  const store = useAuthStore();
  if (!perms || perms.length === 0) return true;
  const set = store.permSet || new Set();
  return perms.some((p) => set.has(p));
}

export const vPermission = {
  mounted(el, binding) {
    const { value, modifiers } = binding || {};
    const mode = modifiers?.disable ? "disable" : "hide";
    const ok = Array.isArray(value) ? hasPerm(...value) : !!hasPerm(value);
    if (!ok) {
      if (mode === "disable") {
        el.setAttribute("disabled", "true");
        el.classList.add("is-disabled");
      } else {
        el.parentNode && el.parentNode.removeChild(el);
      }
    }
  },
};
