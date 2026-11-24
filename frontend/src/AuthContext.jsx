import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import api from './api';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => { try { return JSON.parse(localStorage.getItem('payroll_admin')); } catch { return null; } });
  const [companySettings, setCompanySettings] = useState(() => ({
    currency: localStorage.getItem('payroll_currency') || 'USD',
    locale: localStorage.getItem('payroll_locale') || 'en-US'
  }));
  const updateCompanySettings = useCallback(settings => {
    const updated = {
      ...settings,
      currency: settings.currency || 'USD',
      locale: settings.locale || 'en-US'
    };
    localStorage.setItem('payroll_currency', updated.currency);
    localStorage.setItem('payroll_locale', updated.locale);
    setCompanySettings(updated);
  }, []);
  const signIn = async (credentials, mode = 'login') => {
    const { data } = await api.post(`/auth/${mode}`, credentials);
    localStorage.setItem('payroll_token', data.token); localStorage.setItem('payroll_admin', JSON.stringify(data.admin)); setAdmin(data.admin);
  };
  const signOut = () => { localStorage.removeItem('payroll_token'); localStorage.removeItem('payroll_admin'); setAdmin(null); };
  const value = useMemo(() => ({ admin, signIn, signOut, setAdmin, companySettings, updateCompanySettings }), [admin, companySettings, updateCompanySettings]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
