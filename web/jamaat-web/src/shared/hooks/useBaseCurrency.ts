import { useQuery } from '@tanstack/react-query';
import { currenciesApi } from '../../features/admin/master-data/currencies/currenciesApi';

/** Returns the tenant's base currency code (e.g. 'AED'). Cached indefinitely within session. */
export function useBaseCurrency(): string {
  const { data } = useQuery({
    queryKey: ['currency', 'base'],
    queryFn: currenciesApi.base,
    staleTime: Infinity,
  });
  return data?.baseCurrency ?? 'AED';
}

export function useCurrencies() {
  return useQuery({
    queryKey: ['currencies', 'active'],
    queryFn: () => currenciesApi.list(true),
    staleTime: 5 * 60_000,
  });
}
