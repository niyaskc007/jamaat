import { membersApi } from './membersApi';

export async function lookupMembers(search: string) {
  if (!search || search.length < 2) return [];
  const res = await membersApi.list({ page: 1, pageSize: 10, search, status: 1 });
  return res.items;
}
