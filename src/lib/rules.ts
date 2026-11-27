// Client-safe validation rules shared by the forms and the server schemas.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^\+?[0-9]{8,15}$/;
export const cleanPhone = (v: string) => v.trim().replace(/[\s-]/g, "");

export const passwordRules = {
  len: (p: string) => p.length >= 10,
  mix: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p),
  num: (p: string) => /[0-9]/.test(p),
  sym: (p: string) => /[^A-Za-z0-9]/.test(p),
};
export const passwordOk = (p: string) => p.length <= 128 && Object.values(passwordRules).every((f) => f(p));
