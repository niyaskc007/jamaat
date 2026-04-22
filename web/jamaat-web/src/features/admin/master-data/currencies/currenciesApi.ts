import { api } from '../../../../shared/api/client';

export type Currency = {
  id: string; code: string; name: string; symbol: string;
  decimalPlaces: number; isActive: boolean; isBase: boolean;
};

export type ExchangeRate = {
  id: string; fromCurrency: string; toCurrency: string; rate: number;
  effectiveFrom: string; effectiveTo?: string | null;
  source?: string | null; isActive: boolean;
};

export type FxConversion = {
  originalAmount: number; originalCurrency: string;
  rate: number; baseAmount: number; baseCurrency: string;
};

export const currenciesApi = {
  list: async (active?: boolean) =>
    (await api.get<Currency[]>('/api/v1/currencies', { params: { active } })).data,
  base: async () => (await api.get<{ baseCurrency: string }>('/api/v1/currencies/base')).data,
  create: async (input: { code: string; name: string; symbol: string; decimalPlaces: number }) =>
    (await api.post<Currency>('/api/v1/currencies', input)).data,
  update: async (id: string, input: { name: string; symbol: string; decimalPlaces: number; isActive: boolean }) =>
    (await api.put<Currency>(`/api/v1/currencies/${id}`, input)).data,
  setBase: async (id: string) => (await api.post<Currency>(`/api/v1/currencies/${id}/set-base`)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/currencies/${id}`); },
  convert: async (amount: number, from: string, asOf?: string) =>
    (await api.get<FxConversion>('/api/v1/currencies/convert', { params: { amount, from, asOf } })).data,
};

export const exchangeRatesApi = {
  list: async (from?: string, to?: string, asOf?: string) =>
    (await api.get<ExchangeRate[]>('/api/v1/exchange-rates', { params: { from, to, asOf } })).data,
  create: async (input: { fromCurrency: string; toCurrency: string; rate: number; effectiveFrom: string; effectiveTo?: string | null; source?: string }) =>
    (await api.post<ExchangeRate>('/api/v1/exchange-rates', input)).data,
  update: async (id: string, input: { rate: number; effectiveFrom: string; effectiveTo?: string | null; source?: string; isActive: boolean }) =>
    (await api.put<ExchangeRate>(`/api/v1/exchange-rates/${id}`, input)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/exchange-rates/${id}`); },
};
