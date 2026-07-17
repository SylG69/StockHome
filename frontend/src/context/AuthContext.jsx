import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// URL de l'API injectée au build par Vite via VITE_API_URL (voir .env généré
// par deploy_stockhome.sh). Fallback sur localhost:8000 pour le dev local
// sans .env. On retire un éventuel slash final pour éviter les doubles //.
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

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

  // Utilisé après un login externe (Google) qui a déjà renvoyé
  // access_token + user depuis le backend : on met à jour le contexte
  // directement, sans reload ni appel /auth/me supplémentaire.
  const loginWithToken = (accessToken, userData) => {
    localStorage.setItem('token', accessToken);
    setToken(accessToken);
    setUser(userData);
  };

  // Met à jour l'utilisateur dans le contexte après une modification de
  // profil (PATCH /auth/me), pour refléter immédiatement le nouveau nom
  // dans le menu sans recharger la page.
  const updateUser = useCallback((userData) => {
    setUser(userData);
  }, []);

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

    const { access_token, user: userData } = response.data;

    // Un compte nouvellement inscrit peut être "pending" (en attente de
    // validation par un admin) : dans ce cas on NE stocke PAS le token,
    // sinon l'utilisateur semblerait connecté alors que toutes ses
    // requêtes seraient rejetées en 403. La page d'inscription doit
    // afficher le message d'attente en se basant sur userData.status.
    if (access_token && userData?.status === 'active') {
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(userData);
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
    loginWithToken,
    updateUser,
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
