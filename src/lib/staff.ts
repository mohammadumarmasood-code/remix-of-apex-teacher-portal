export const mobileToEmail = (mobile: string) =>
  `${mobile.replace(/\D/g, "")}@apexlearning.local`;
export const isValidMobile = (m: string) => /^[6-9]\d{9}$/.test(m.replace(/\D/g, ""));
export const isValidPassword = (password: string) => password.length >= 6;
