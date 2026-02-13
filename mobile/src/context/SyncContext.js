// Sync Context for Offline Support
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  saveToCache,
  getFromCache,
  getPendingActions,
  removePendingAction,
  updateLastSync,
  getLastSync,
  CACHE_KEYS,
} from '../services/storage';
import {
  productsAPI,
  categoriesAPI,
  locationsAPI,
  shoppingListAPI,
  dashboardAPI,
} from '../services/api';
import { sendLowStockAlert } from '../services/notifications';
import { useAuth } from './AuthContext';

const SyncContext = createContext(null);

export const SyncProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable;
      setIsOnline(online);

      // Auto-sync when coming back online
      if (online && isAuthenticated) {
        syncPendingActions();
      }
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  // Load last sync time on mount
  useEffect(() => {
    loadLastSyncTime();
    loadPendingCount();
  }, []);

  const loadLastSyncTime = async () => {
    const time = await getLastSync();
    setLastSyncTime(time);
  };

  const loadPendingCount = async () => {
    const pending = await getPendingActions();
    setPendingCount(pending.length);
  };

  // Sync pending offline actions
  const syncPendingActions = async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    const pending = await getPendingActions();

    for (const action of pending) {
      try {
        switch (action.type) {
          case 'CREATE_PRODUCT':
            await productsAPI.create(action.data);
            break;
          case 'UPDATE_PRODUCT':
            await productsAPI.update(action.productId, action.data);
            break;
          case 'UPDATE_QUANTITY':
            await productsAPI.updateQuantity(action.productId, action.delta);
            break;
          case 'DELETE_PRODUCT':
            await productsAPI.delete(action.productId);
            break;
          case 'ADD_SHOPPING_ITEM':
            await shoppingListAPI.add(action.data);
            break;
          case 'TOGGLE_SHOPPING_ITEM':
            await shoppingListAPI.toggle(action.itemId);
            break;
          case 'DELETE_SHOPPING_ITEM':
            await shoppingListAPI.delete(action.itemId);
            break;
        }
        await removePendingAction(action.id);
      } catch (error) {
        console.error('Error syncing action:', action, error);
        // Keep the action for retry
      }
    }

    await loadPendingCount();
    setIsSyncing(false);
  };

  // Full sync - fetch all data from server
  const fullSync = async () => {
    if (!isOnline || !isAuthenticated) return false;

    setIsSyncing(true);
    try {
      // Sync pending actions first
      await syncPendingActions();

      // Fetch all data
      const [products, categories, locations, shoppingList, stats] = await Promise.all([
        productsAPI.getAll(),
        categoriesAPI.getAll(),
        locationsAPI.getAll(),
        shoppingListAPI.getAll(),
        dashboardAPI.getStats(),
      ]);

      // Save to cache
      await Promise.all([
        saveToCache(CACHE_KEYS.PRODUCTS, products.data),
        saveToCache(CACHE_KEYS.CATEGORIES, categories.data),
        saveToCache(CACHE_KEYS.LOCATIONS, locations.data),
        saveToCache(CACHE_KEYS.SHOPPING_LIST, shoppingList.data),
        saveToCache(CACHE_KEYS.DASHBOARD_STATS, stats.data),
      ]);

      await updateLastSync();
      await loadLastSyncTime();

      // Check for low stock and send notification
      const lowStockProducts = products.data.filter(
        (p) => p.quantity < p.min_quantity
      );
      if (lowStockProducts.length > 0) {
        await sendLowStockAlert(lowStockProducts);
      }

      setIsSyncing(false);
      return true;
    } catch (error) {
      console.error('Error during full sync:', error);
      setIsSyncing(false);
      return false;
    }
  };

  // Get cached data or fetch from server
  const getCachedOrFetch = async (cacheKey, fetchFn) => {
    // Try cache first
    const cached = await getFromCache(cacheKey);

    if (cached && !cached.expired) {
      return { data: cached.data, fromCache: true };
    }

    // If online, fetch fresh data
    if (isOnline) {
      try {
        const response = await fetchFn();
        await saveToCache(cacheKey, response.data);
        return { data: response.data, fromCache: false };
      } catch (error) {
        // Fall back to expired cache if available
        if (cached) {
          return { data: cached.data, fromCache: true, expired: true };
        }
        throw error;
      }
    }

    // Offline - use cache even if expired
    if (cached) {
      return { data: cached.data, fromCache: true, offline: true };
    }

    throw new Error('No cached data available offline');
  };

  const value = {
    isOnline,
    isSyncing,
    lastSyncTime,
    pendingCount,
    syncPendingActions,
    fullSync,
    getCachedOrFetch,
    loadPendingCount,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};
