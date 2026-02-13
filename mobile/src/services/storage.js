// Offline Storage Service for StockHome Mobile
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@stockhome_cache_';
const PENDING_ACTIONS_KEY = '@stockhome_pending_actions';

// Cache keys
export const CACHE_KEYS = {
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  LOCATIONS: 'locations',
  SHOPPING_LIST: 'shopping_list',
  DASHBOARD_STATS: 'dashboard_stats',
  LAST_SYNC: 'last_sync',
};

// Save data to cache
export const saveToCache = async (key, data) => {
  try {
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(cacheData));
    return true;
  } catch (error) {
    console.error('Error saving to cache:', error);
    return false;
  }
};

// Get data from cache
export const getFromCache = async (key, maxAge = 3600000) => {
  try {
    const cached = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    
    // Check if cache is still valid (default: 1 hour)
    if (Date.now() - timestamp > maxAge) {
      return { data, expired: true };
    }
    
    return { data, expired: false };
  } catch (error) {
    console.error('Error getting from cache:', error);
    return null;
  }
};

// Clear specific cache
export const clearCache = async (key) => {
  try {
    await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
    return true;
  } catch (error) {
    console.error('Error clearing cache:', error);
    return false;
  }
};

// Clear all cache
export const clearAllCache = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
    await AsyncStorage.multiRemove(cacheKeys);
    return true;
  } catch (error) {
    console.error('Error clearing all cache:', error);
    return false;
  }
};

// Pending Actions for offline sync
export const addPendingAction = async (action) => {
  try {
    const pending = await getPendingActions();
    pending.push({
      ...action,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    });
    await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(pending));
    return true;
  } catch (error) {
    console.error('Error adding pending action:', error);
    return false;
  }
};

export const getPendingActions = async () => {
  try {
    const pending = await AsyncStorage.getItem(PENDING_ACTIONS_KEY);
    return pending ? JSON.parse(pending) : [];
  } catch (error) {
    console.error('Error getting pending actions:', error);
    return [];
  }
};

export const removePendingAction = async (actionId) => {
  try {
    const pending = await getPendingActions();
    const filtered = pending.filter(a => a.id !== actionId);
    await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error removing pending action:', error);
    return false;
  }
};

export const clearPendingActions = async () => {
  try {
    await AsyncStorage.removeItem(PENDING_ACTIONS_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing pending actions:', error);
    return false;
  }
};

// Update last sync timestamp
export const updateLastSync = async () => {
  try {
    await AsyncStorage.setItem(`${CACHE_PREFIX}${CACHE_KEYS.LAST_SYNC}`, Date.now().toString());
    return true;
  } catch (error) {
    console.error('Error updating last sync:', error);
    return false;
  }
};

export const getLastSync = async () => {
  try {
    const timestamp = await AsyncStorage.getItem(`${CACHE_PREFIX}${CACHE_KEYS.LAST_SYNC}`);
    return timestamp ? parseInt(timestamp) : null;
  } catch (error) {
    console.error('Error getting last sync:', error);
    return null;
  }
};
