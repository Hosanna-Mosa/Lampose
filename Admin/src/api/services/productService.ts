import { api, unwrapList } from '../apiCaller';
import type { ApiResponse, ProductEntity } from '../types';

/** Map a raw `products` document onto the shape the UI reads. */
const normalize = (raw: any): ProductEntity => ({
  id: raw._id || raw.id,
  name: raw.name || 'Untitled product',
  description: raw.description || '',
  price: Number(raw.price) || 0,
  inStock: raw.inStock !== false,
  createdAt: raw.createdAt || null,
  updatedAt: raw.updatedAt || null,
});

export const productService = {
  /** Every record in the `products` collection. Super Admin only. */
  async getProducts(params?: { search?: string }): Promise<ApiResponse<ProductEntity[]>> {
    const res = await api.get<any>('/admin/products', params);
    return res.success ? { ...res, data: unwrapList(res.data).map(normalize) } : { ...res, data: [] };
  },

  async createProduct(payload: {
    name: string;
    description?: string;
    price?: number;
    inStock?: boolean;
  }): Promise<ApiResponse<ProductEntity | null>> {
    const res = await api.post<any>('/admin/products', payload);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async updateProduct(
    id: string,
    changes: Partial<{ name: string; description: string; price: number; inStock: boolean }>
  ): Promise<ApiResponse<ProductEntity | null>> {
    const res = await api.put<any>(`/admin/products/${id}`, changes);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async deleteProduct(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return api.delete<{ success: boolean }>(`/admin/products/${id}`);
  },
};
