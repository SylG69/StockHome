// Auth Context for StockHome Mobile
import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on app start
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const storedToken = await SecureStore.getItemAsync('auth_token');
      const storedUser = await SecureStore.getItemAsync('user_data');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));

        // Verify token is still valid
        try {
          const response = await authAPI.getProfile();
          setUser(response.data);
          await SecureStore.setItemAsync('user_data', JSON.stringify(response.data));
        } catch (error) {
          // Token invalid, clear session
          await logout();
        }
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await authAPI.login(email, password);
      const { access_token, user: userData } = response.data;

      await SecureStore.setItemAsync('auth_token', access_token);
      await SecureStore.setItemAsync('user_data', JSON.stringify(userData));

      setToken(access_token);
      setUser(userData);

      return { success: true };
    } catch (error) {
      const message = error.response?.data?.detail || 'Erreur de connexion';
      return { success: false, error: message };
    }
  };

  const register = async (name, email, password) => {
    try {
      const response = await authAPI.register(name, email, password);
      const { access_token, user: userData } = response.data;

      await SecureStore.setItemAsync('auth_token', access_token);
      await SecureStore.setItemAsync('user_data', JSON.stringify(userData));

      setToken(access_token);
      setUser(userData);

      return { success: true };
    } catch (error) {
      const message = error.response?.data?.detail || "Erreur lors de l'inscription";
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('user_data');
    } catch (error) {
      console.error('Error during logout:', error);
    }
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user && !!token,
    login,
    register,
    logout,
    refreshUser: checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
