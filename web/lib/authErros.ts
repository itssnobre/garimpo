// Mensagens do Supabase Auth em português.
const ERROS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha não conferem.",
  "Email not confirmed": "Confirme o e-mail pelo link que enviamos antes de entrar.",
  "User already registered": "Já existe conta com este e-mail. Entre com a senha ou recupere a senha.",
  "Password should be at least 6 characters": "A senha precisa ter pelo menos 6 caracteres.",
  "Email rate limit exceeded": "Muitos e-mails em pouco tempo. Aguarde alguns minutos.",
  "User is banned": "Esta conta está bloqueada. Fale com o administrador.",
  "banned": "Esta conta está bloqueada. Fale com o administrador.",
  "Signups not allowed": "Cadastro fechado no momento.",
  "New password should be different": "A nova senha precisa ser diferente da atual.",
  "same_password": "A nova senha precisa ser diferente da atual.",
};
export const traduz = (m: string) => ERROS[m] ?? Object.entries(ERROS).find(([k]) => m.toLowerCase().includes(k.toLowerCase()))?.[1] ?? m;
