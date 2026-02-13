// Products Screen for StockHome Mobile
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../context/SyncContext';
import { productsAPI } from '../services/api';
import { CACHE_KEYS, addPendingAction } from '../services/storage';
import { colors } from '../theme/colors';

export default function ProductsScreen({ navigation }) {
  const { isOnline, getCachedOrFetch, fullSync, loadPendingCount } = useSync();
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [products, searchQuery, showLowStock]);

  const loadProducts = async () => {
    try {
      const result = await getCachedOrFetch(
        CACHE_KEYS.PRODUCTS,
        () => productsAPI.getAll()
      );
      setProducts(result.data);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterProducts = () => {
    let filtered = [...products];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.barcode?.toLowerCase().includes(query) ||
          p.brand?.toLowerCase().includes(query)
      );
    }

    if (showLowStock) {
      filtered = filtered.filter((p) => p.quantity < p.min_quantity);
    }

    setFilteredProducts(filtered);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fullSync();
    await loadProducts();
    setRefreshing(false);
  }, []);

  const handleQuantityChange = async (product, delta) => {
    // Optimistic update
    const newQuantity = Math.max(0, product.quantity + delta);
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, quantity: newQuantity } : p))
    );

    if (isOnline) {
      try {
        await productsAPI.updateQuantity(product.id, delta);
      } catch (error) {
        // Revert on error
        setProducts((prev) =>
          prev.map((p) => (p.id === product.id ? { ...p, quantity: product.quantity } : p))
        );
        Alert.alert('Erreur', 'Impossible de mettre à jour la quantité');
      }
    } else {
      // Save for offline sync
      await addPendingAction({
        type: 'UPDATE_QUANTITY',
        productId: product.id,
        delta,
      });
      await loadPendingCount();
    }
  };

  const renderProduct = ({ item }) => {
    const isLowStock = item.quantity < item.min_quantity;

    return (
      <TouchableOpacity
        style={styles.productCard}
        onPress={() => navigation.navigate('ProductDetail', { product: item })}
      >
        <View style={styles.productImage}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="cube" size={32} color={colors.mutedForeground} />
            </View>
          )}
        </View>

        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.productBrand} numberOfLines={1}>
            {item.brand || 'Sans marque'}
          </Text>
          {item.barcode && (
            <Text style={styles.productBarcode} numberOfLines={1}>
              {item.barcode}
            </Text>
          )}
          <View style={styles.tagsContainer}>
            {item.category_name && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{item.category_name}</Text>
              </View>
            )}
            {item.location_name && (
              <View style={[styles.tag, styles.tagOutline]}>
                <Text style={styles.tagTextOutline}>{item.location_name}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.quantityContainer}>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => handleQuantityChange(item, -1)}
            disabled={item.quantity <= 0}
          >
            <Ionicons name="remove" size={18} color={colors.foreground} />
          </TouchableOpacity>

          <View style={styles.qtyDisplay}>
            <Text style={[styles.qtyText, isLowStock && styles.qtyTextLow]}>
              {item.quantity}
            </Text>
            <Text style={styles.qtyUnit}>{item.unit}</Text>
          </View>

          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => handleQuantityChange(item, 1)}
          >
            <Ionicons name="add" size={18} color={colors.foreground} />
          </TouchableOpacity>

          {isLowStock && (
            <View style={styles.lowStockBadge}>
              <Ionicons name="warning" size={12} color={colors.destructiveForeground} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search & Filters */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color={colors.mutedForeground} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher..."
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.filterButton, showLowStock && styles.filterButtonActive]}
          onPress={() => setShowLowStock(!showLowStock)}
        >
          <Ionicons
            name="warning"
            size={20}
            color={showLowStock ? colors.primaryForeground : colors.destructive}
          />
        </TouchableOpacity>
      </View>

      {/* Products List */}
      <FlatList
        data={filteredProducts}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={64} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>Aucun produit trouvé</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery || showLowStock
                ? 'Essayez de modifier vos filtres'
                : 'Scannez un produit pour commencer'}
            </Text>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => navigation.navigate('Scanner')}
            >
              <Ionicons name="scan" size={20} color={colors.primaryForeground} />
              <Text style={styles.scanButtonText}>Scanner un produit</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: colors.foreground,
    fontSize: 15,
    marginLeft: 8,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.destructive,
    borderColor: colors.destructive,
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productImage: {
    marginRight: 12,
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  imagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  productBrand: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  productBarcode: {
    fontSize: 11,
    color: colors.mutedForeground,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  tag: {
    backgroundColor: colors.secondary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 10,
    color: colors.foreground,
  },
  tagOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagTextOutline: {
    fontSize: 10,
    color: colors.mutedForeground,
  },
  quantityContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyDisplay: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  qtyText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.success,
  },
  qtyTextLow: {
    color: colors.destructive,
  },
  qtyUnit: {
    fontSize: 10,
    color: colors.mutedForeground,
  },
  lowStockBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 8,
    textAlign: 'center',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 8,
  },
  scanButtonText: {
    color: colors.primaryForeground,
    fontSize: 15,
    fontWeight: '600',
  },
});
