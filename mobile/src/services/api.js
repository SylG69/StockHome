// API Configuration for StockHome Mobile
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// IMPORTANT: Change this to your backend URL
// For local development: http://localhost:8001
// For production: https://your-backend-url.com
export const API_BASE_URL = 'https://grocerymate-20.preview.emergentagent.com';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error getting token:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('user_data');
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (name, email, password) => api.post('/auth/register', { name, email, password }),
  getProfile: () => api.get('/auth/me'),
};

// Products API
export const productsAPI = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  getByBarcode: (barcode) => api.get(`/products/barcode/${barcode}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  updateQuantity: (id, delta) => api.patch(`/products/${id}/quantity?delta=${delta}`),
  delete: (id) => api.delete(`/products/${id}`),
};

// Categories API
export const categoriesAPI = {
  getAll: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
};

// Locations API
export const locationsAPI = {
  getAll: () => api.get('/locations'),
  create: (data) => api.post('/locations', data),
  update: (id, data) => api.put(`/locations/${id}`, data),
  delete: (id) => api.delete(`/locations/${id}`),
};

// Shopping List API
export const shoppingListAPI = {
  getAll: () => api.get('/shopping-list'),
  generate: () => api.get('/shopping-list/generate'),
  add: (data) => api.post('/shopping-list', data),
  toggle: (id) => api.patch(`/shopping-list/${id}/toggle`),
  delete: (id) => api.delete(`/shopping-list/${id}`),
  clear: (checkedOnly = true) => api.delete(`/shopping-list?checked_only=${checkedOnly}`),
};

// Barcode Lookup API
export const barcodeAPI = {
  lookup: (barcode) => api.get(`/barcode/${barcode}`),
};

// Dashboard API
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
};
