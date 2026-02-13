// Dashboard Screen for StockHome Mobile
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { dashboardAPI } from '../services/api';
import { CACHE_KEYS } from '../services/storage';
import { colors } from '../theme/colors';

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { isOnline, isSyncing, getCachedOrFetch, fullSync } = useSync();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const result = await getCachedOrFetch(
        CACHE_KEYS.DASHBOARD_STATS,
        () => dashboardAPI.getStats()
      );
      setStats(result.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fullSync();
    await loadStats();
    setRefreshing(false);
  }, []);

  const statCards = [
    {
      title: 'Produits',
      value: stats?.total_products || 0,
      icon: 'cube',
      color: colors.primary,
    },
    {
      title: 'Stock Bas',
      value: stats?.low_stock_count || 0,
      icon: 'warning',
      color: colors.destructive,
      alert: stats?.low_stock_count > 0,
    },
    {
      title: 'Catégories',
      value: stats?.total_categories || 0,
      icon: 'folder',
      color: colors.success,
    },
    {
      title: 'Emplacements',
      value: stats?.total_locations || 0,
      icon: 'location',
      color: colors.warning,
    },
  ];

  const quickActions = [
    {
      title: 'Scanner un produit',
      icon: 'scan',
      screen: 'Scanner',
      color: colors.primary,
    },
    {
      title: 'Voir les produits',
      icon: 'cube',
      screen: 'Products',
      color: colors.success,
    },
    {
      title: 'Liste de courses',
      icon: 'cart',
      screen: 'ShoppingList',
      color: colors.warning,
    },
  ];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* Connection Status */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color={colors.warning} />
          <Text style={styles.offlineText}>Mode hors-ligne</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonjour, {user?.name?.split(' ')[0]}</Text>
          <Text style={styles.subGreeting}>Voici votre stock domestique</Text>
        </View>
        {isSyncing && (
          <ActivityIndicator size="small" color={colors.primary} />
        )}
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {statCards.map((stat, index) => (
          <View key={index} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: `${stat.color}20` }]}>
              <Ionicons name={stat.icon} size={24} color={stat.color} />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statTitle}>{stat.title}</Text>
            {stat.alert && (
              <View style={styles.alertBadge}>
                <Text style={styles.alertText}>!</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Shopping List Summary */}
      <TouchableOpacity
        style={styles.shoppingCard}
        onPress={() => navigation.navigate('ShoppingList')}
      >
        <View style={styles.shoppingHeader}>
          <View style={styles.shoppingIconContainer}>
            <Ionicons name="cart" size={24} color={colors.primary} />
          </View>
          <View style={styles.shoppingInfo}>
            <Text style={styles.shoppingTitle}>Liste de courses</Text>
            <Text style={styles.shoppingSubtitle}>
              {stats?.shopping_list_count || 0} article(s) à acheter
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
      </TouchableOpacity>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Actions rapides</Text>
      <View style={styles.actionsContainer}>
        {quickActions.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={styles.actionCard}
            onPress={() => navigation.navigate(action.screen)}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${action.color}20` }]}>
              <Ionicons name={action.icon} size={24} color={action.color} />
            </View>
            <Text style={styles.actionTitle}>{action.title}</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Low Stock Products */}
      {stats?.low_stock_count > 0 && stats?.recent_products && (
        <>
          <Text style={styles.sectionTitle}>Produits en stock bas</Text>
          <View style={styles.lowStockContainer}>
            {stats.recent_products
              .filter((p) => p.quantity < p.min_quantity)
              .slice(0, 3)
              .map((product, index) => (
                <View key={index} style={styles.lowStockItem}>
                  <View style={styles.lowStockInfo}>
                    <Text style={styles.lowStockName} numberOfLines={1}>
                      {product.name}
                    </Text>
                    <Text style={styles.lowStockBrand}>
                      {product.brand || 'Sans marque'}
                    </Text>
                  </View>
                  <View style={styles.lowStockQuantity}>
                    <Text style={styles.lowStockQtyText}>
                      {product.quantity}/{product.min_quantity}
                    </Text>
                    <Text style={styles.lowStockUnit}>{product.unit}</Text>
                  </View>
                </View>
              ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.warning}20`,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  offlineText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
  },
  subGreeting: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
  },
  statTitle: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  alertBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertText: {
    color: colors.destructiveForeground,
    fontSize: 12,
    fontWeight: '700',
  },
  shoppingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  shoppingHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  shoppingIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: `${colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  shoppingInfo: {
    flex: 1,
  },
  shoppingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  shoppingSubtitle: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 12,
  },
  actionsContainer: {
    gap: 8,
    marginBottom: 24,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
  },
  lowStockContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.destructive + '40',
    overflow: 'hidden',
  },
  lowStockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lowStockInfo: {
    flex: 1,
  },
  lowStockName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  lowStockBrand: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  lowStockQuantity: {
    alignItems: 'flex-end',
  },
  lowStockQtyText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.destructive,
  },
  lowStockUnit: {
    fontSize: 11,
    color: colors.mutedForeground,
  },
});
