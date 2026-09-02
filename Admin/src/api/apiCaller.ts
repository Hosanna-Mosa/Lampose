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

/** The rejection the response interceptor builds, read without trusting it. */
const asApiError = (error: unknown): Partial<ApiError> =>
  (error !== null && typeof error === 'object' ? (error as Partial<ApiError>) : {});

/**
 * The server's own refusal code, when the body carried one.
 *
 * `axiosInstance` puts the whole response body on `ApiError.data` but sets
 * `ApiError.code` from AXIOS's code ('ERR_BAD_REQUEST', 'NETWORK_ERROR'),
 * which says how the call failed and not why it was refused. The body's code
 * is the answer to "why", so it wins where there is one.
 */
const codeOf = (failure: Partial<ApiError>): string | undefined => {
  const body: unknown = failure.data;
  if (body !== null && typeof body === 'object') {
    const sent = (body as { code?: unknown }).code;
    if (typeof sent === 'string' && sent) return sent;
  }
  return failure.code;
};

/**
 * Helper to construct error ApiResponse envelope without crashing the caller.
 * A failed request surfaces the real reason — the UI renders an error state
 * rather than substituting placeholder data.
 *
 * The reason is the code as well as the sentence. Dropping it used to leave
 * every caller that needs to tell one refusal from another parsing English or
 * bypassing this file with its own `validateStatus`; the field is optional, so
 * nothing that only ever reads `message` notices it is there.
 */
function buildErrorResponse<T>(error: unknown, defaultMessage: string): ApiResponse<T> {
  const failure = asApiError(error);
  return {
    data: null as unknown as T,
    status: failure.status || 500,
    message: failure.message || defaultMessage,
    code: codeOf(failure),
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
    } catch (error) {
      return buildErrorResponse<T>(error, `Failed to GET ${url}`);
    }
  },

  async post<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await axiosInstance.post(url, data, options);
      return buildSuccessResponse(response.data, response.status, 'Created successfully');
    } catch (error) {
      return buildErrorResponse<T>(error, `Failed to POST ${url}`);
    }
  },

  async put<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await axiosInstance.put(url, data, options);
      return buildSuccessResponse(response.data, response.status, 'Updated successfully');
    } catch (error) {
      return buildErrorResponse<T>(error, `Failed to PUT ${url}`);
    }
  },

  async patch<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await axiosInstance.patch(url, data, options);
      return buildSuccessResponse(response.data, response.status, 'Patched successfully');
    } catch (error) {
      return buildErrorResponse<T>(error, `Failed to PATCH ${url}`);
    }
  },

  async delete<T>(url: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await axiosInstance.delete(url, options);
      return buildSuccessResponse(response.data, response.status, 'Deleted successfully');
    } catch (error) {
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
    } catch (error) {
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
