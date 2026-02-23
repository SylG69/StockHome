import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// On s'assure que l'URL ne finit pas par un slash pour éviter les doubles //
const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // Configuration de l'instance Axios
  const api = axios.create({
    baseURL: `${API_URL}/api`,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Intercepteur pour injecter le Token Bearer (Indispensable pour @app.get("/api/auth/me"))
  api.interceptors.request.use((config) => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      config.headers.Authorization = `Bearer ${storedToken}`;
    }
    return config;
  });

  // Gestion globale de la déconnexion sur 401 (Token expiré)
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        logout();
      }
      return Promise.reject(error);
    }
  );

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  const fetchUser = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const register = async (name, email, password) => {
    // CORRECTION ICI : On envoie 'username' au lieu de 'name' pour matcher le Backend
    const response = await api.post('/auth/register', {
      username: name,
      email,
      password
    });

    // Si votre API register ne renvoie pas encore de token,
    // il faudra peut-être appeler login() juste après ici.
    const { access_token, id } = response.data;
    if (access_token) {
      localStorage.setItem('token', access_token);
      setToken(access_token);
    }
    return response.data;
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    api,
    isAuthenticated: !!user,
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
