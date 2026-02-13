// StockHome Mobile App - Main Entry Point
import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';

// Context
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SyncProvider } from './src/context/SyncContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ProductsScreen from './src/screens/ProductsScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import CategoriesScreen from './src/screens/CategoriesScreen';
import LocationsScreen from './src/screens/LocationsScreen';
import ShoppingListScreen from './src/screens/ShoppingListScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// Theme
import { colors } from './src/theme/colors';

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const ProductStack = createNativeStackNavigator();

// Products Stack Navigator
function ProductsStackNavigator() {
  return (
    <ProductStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <ProductStack.Screen 
        name="ProductsList" 
        component={ProductsScreen}
        options={{ title: 'Produits' }}
      />
      <ProductStack.Screen 
        name="ProductDetail" 
        component={ProductDetailScreen}
        options={{ title: 'Détails du produit' }}
      />
    </ProductStack.Navigator>
  );
}

// Main Tab Navigator
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'Products':
              iconName = focused ? 'cube' : 'cube-outline';
              break;
            case 'Scanner':
              iconName = focused ? 'scan' : 'scan-outline';
              break;
            case 'ShoppingList':
              iconName = focused ? 'cart' : 'cart-outline';
              break;
            case 'Settings':
              iconName = focused ? 'settings' : 'settings-outline';
              break;
            default:
              iconName = 'ellipse';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontWeight: '700' },
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ title: 'Accueil' }}
      />
      <Tab.Screen 
        name="Products" 
        component={ProductsStackNavigator}
        options={{ headerShown: false, title: 'Produits' }}
      />
      <Tab.Screen 
        name="Scanner" 
        component={ScannerScreen}
        options={{ title: 'Scanner' }}
      />
      <Tab.Screen 
        name="ShoppingList" 
        component={ShoppingListScreen}
        options={{ title: 'Courses' }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ title: 'Paramètres' }}
      />
    </Tab.Navigator>
  );
}

// Auth Navigator
function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

// Root Navigator
function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();

  const onLayoutRootView = useCallback(async () => {
    if (!loading) {
      await SplashScreen.hideAsync();
    }
  }, [loading]);

  if (loading) {
    return null;
  }

  return (
    <NavigationContainer onReady={onLayoutRootView}>
      {isAuthenticated ? <MainTabs /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

// Main App Component
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SyncProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </SyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
