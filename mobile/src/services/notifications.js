// Notification Service for StockHome Mobile
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_SETTINGS_KEY = '@stockhome_notification_settings';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Request permissions
export const requestNotificationPermissions = async () => {
  if (!Device.isDevice) {
    console.log('Notifications require a physical device');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permissions not granted');
    return false;
  }

  // Configure Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('stock-alerts', {
      name: 'Alertes Stock',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
    });
  }

  return true;
};

// Get push token
export const getPushToken = async () => {
  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'stockhome-mobile',
    });
    return token.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
};

// Schedule local notification
export const scheduleLocalNotification = async (title, body, data = {}, trigger = null) => {
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: trigger || null, // null = immediate
    });
    return id;
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return null;
  }
};

// Send low stock alert
export const sendLowStockAlert = async (products) => {
  if (!products || products.length === 0) return;

  const settings = await getNotificationSettings();
  if (!settings.lowStockAlerts) return;

  const count = products.length;
  const title = '⚠️ Alerte Stock Bas';
  const body = count === 1
    ? `${products[0].name} est en stock bas`
    : `${count} produits sont en stock bas`;

  await scheduleLocalNotification(title, body, { type: 'low_stock', products });
};

// Send shopping list reminder
export const sendShoppingReminder = async (itemCount) => {
  if (itemCount === 0) return;

  const settings = await getNotificationSettings();
  if (!settings.shoppingReminders) return;

  const title = '🛒 Liste de Courses';
  const body = `Vous avez ${itemCount} article${itemCount > 1 ? 's' : ''} sur votre liste de courses`;

  await scheduleLocalNotification(title, body, { type: 'shopping_reminder' });
};

// Cancel all notifications
export const cancelAllNotifications = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};

// Notification settings
export const getNotificationSettings = async () => {
  try {
    const settings = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    return settings
      ? JSON.parse(settings)
      : {
          lowStockAlerts: true,
          shoppingReminders: true,
          syncNotifications: false,
        };
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return {
      lowStockAlerts: true,
      shoppingReminders: true,
      syncNotifications: false,
    };
  }
};

export const saveNotificationSettings = async (settings) => {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Error saving notification settings:', error);
    return false;
  }
};

// Add notification listeners
export const addNotificationListeners = (
  onNotificationReceived,
  onNotificationResponse
) => {
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    onNotificationReceived
  );

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    onNotificationResponse
  );

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
};
