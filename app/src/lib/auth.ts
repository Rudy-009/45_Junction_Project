import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const authBypassEnabled = import.meta.env.VITE_STANDBY_AUTH_BYPASS === 'true';
export const authConfigured = Boolean(supabaseUrl && publishableKey);
export const supabase = supabaseUrl && publishableKey
  ? createClient(supabaseUrl, publishableKey)
  : null;

export async function getStandbyAccessToken(): Promise<string> {
  if (import.meta.env.DEV) {
    return (import.meta.env.VITE_STANDBY_API_TOKEN as string | undefined) ?? 'local-dev-token';
  }
  if (authBypassEnabled) return 'standby-demo-bypass';
  if (!supabase) throw new Error('운영 사용자 인증이 설정되지 않았습니다.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('로그인 후 추출을 시작하세요.');
  return data.session.access_token;
}
