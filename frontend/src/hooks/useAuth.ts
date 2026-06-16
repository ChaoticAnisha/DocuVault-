import { useQuery } from '@tanstack/react-query';
import api from '../api/axios';
import type { User } from '../types';

export const useAuth = () => {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await api.get<{ data: User }>('/auth/me');
      return res.data.data!;
    },
    retry: false,
  });

  return { user, isLoading, isAuthenticated: !!user, error };
};
