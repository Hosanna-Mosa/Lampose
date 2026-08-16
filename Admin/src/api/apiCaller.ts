import type { AxiosResponse } from 'axios';
import { axiosInstance } from './axiosInstance';
import type { ApiResponse, ApiError, ApiRequestOptions } from './types';

/**
 * Helper to construct successful ApiResponse envelope
 */
function buildSuccessResponse<T>(data: T, status: number = 200, message?: string): ApiResponse<T> {
  return {
    data,
    status,
    message: message || 'Success',
    success: true,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper to construct error ApiResponse envelope without crashing the caller.
 * A failed request surfaces the real reason — the UI renders an error state
 * rather than substituting placeholder data.
 */
function buildErrorResponse<T>(error: ApiError | any, defaultMessage: string): ApiResponse<T> {
  return {
    data: null as unknown as T,
    status: error?.status || 500,
    message: error?.message || defaultMessage,
    success: false,
    timestamp: new Date().toISOString(),
  };
}

/**
 * CENTRALIZED API CALLER
 * Strongly-typed CRUD operations over the shared axios instance.
 */
export const api = {
  async get<T>(url: string, params?: Record<string, any>, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await axiosInstance.get(url, { params, ...options });
      return buildSuccessResponse(response.data, response.status);
    } catch (error: any) {
      return buildErrorResponse<T>(error, `Failed to GET ${url}`);
    }
  },

  async post<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await axiosInstance.post(url, data, options);
      return buildSuccessResponse(response.data, response.status, 'Created successfully');
    } catch (error: any) {
      return buildErrorResponse<T>(error, `Failed to POST ${url}`);
    }
  },

  async put<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await axiosInstance.put(url, data, options);
      return buildSuccessResponse(response.data, response.status, 'Updated successfully');
    } catch (error: any) {
      return buildErrorResponse<T>(error, `Failed to PUT ${url}`);
    }
  },

  async patch<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await axiosInstance.patch(url, data, options);
      return buildSuccessResponse(response.data, response.status, 'Patched successfully');
    } catch (error: any) {
      return buildErrorResponse<T>(error, `Failed to PATCH ${url}`);
    }
  },

  async delete<T>(url: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await axiosInstance.delete(url, options);
      return buildSuccessResponse(response.data, response.status, 'Deleted successfully');
    } catch (error: any) {
      return buildErrorResponse<T>(error, `Failed to DELETE ${url}`);
    }
  },

  async upload<T>(
    url: string,
    formData: FormData,
    onProgress?: (percent: number) => void,
    options?: ApiRequestOptions
  ): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await axiosInstance.post(url, formData, {
        ...options,
        headers: { 'Content-Type': 'multipart/form-data', ...options?.headers },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
          }
        },
      });
      return buildSuccessResponse(response.data, response.status, 'File uploaded successfully');
    } catch (error: any) {
      return buildErrorResponse<T>(error, `Failed to upload file to ${url}`);
    }
  },
};

/** Pull an array out of any of the envelope shapes the backend returns. */
export const unwrapList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};
