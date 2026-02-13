// Product Detail Screen for StockHome Mobile
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../context/SyncContext';
import { productsAPI } from '../services/api';
import { addPendingAction } from '../services/storage';
import { colors } from '../theme/colors';

export default function ProductDetailScreen({ route, navigation }) {
  const { product: initialProduct } = route.params;
  const [product, setProduct] = useState(initialProduct);
  const { isOnline, loadPendingCount } = useSync();
  const [loading, setLoading] = useState(false);

  const isLowStock = product.quantity < product.min_quantity;

  const handleQuantityChange = async (delta) => {
    const newQuantity = Math.max(0, product.quantity + delta);
    setProduct((prev) => ({ ...prev, quantity: newQuantity }));

    if (isOnline) {
      try {
        await productsAPI.updateQuantity(product.id, delta);
      } catch (error) {
        setProduct((prev) => ({ ...prev, quantity: product.quantity }));
        Alert.alert('Erreur', 'Impossible de mettre à jour la quantité');
      }
    } else {
      await addPendingAction({
        type: 'UPDATE_QUANTITY',
        productId: product.id,
        delta,
      });
      await loadPendingCount();
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Supprimer le produit',
      `Êtes-vous sûr de vouloir supprimer "${product.name}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            if (isOnline) {
              try {
                await productsAPI.delete(product.id);
                navigation.goBack();
              } catch (error) {
                Alert.alert('Erreur', 'Impossible de supprimer le produit');
                setLoading(false);
              }
            } else {
              await addPendingAction({
                type: 'DELETE_PRODUCT',
                productId: product.id,
              });
              await loadPendingCount();
              navigation.goBack();
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Product Image */}
      <View style={styles.imageContainer}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.image} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="cube" size={64} color={colors.mutedForeground} />
          </View>
        )}
        {isLowStock && (
          <View style={styles.lowStockBanner}>
            <Ionicons name="warning" size={16} color={colors.destructiveForeground} />
            <Text style={styles.lowStockText}>Stock bas</Text>
          </View>
        )}
      </View>

      {/* Product Info */}
      <View style={styles.infoCard}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productBrand}>{product.brand || 'Sans marque'}</Text>

        {product.barcode && (
          <View style={styles.barcodeContainer}>
            <Ionicons name="barcode" size={16} color={colors.mutedForeground} />
            <Text style={styles.barcodeText}>{product.barcode}</Text>
          </View>
        )}

        {/* Tags */}
        <View style={styles.tagsContainer}>
          {product.category_name && (
            <View style={styles.tag}>
              <Ionicons name="folder" size={14} color={colors.primary} />
              <Text style={styles.tagText}>{product.category_name}</Text>
            </View>
          )}
          {product.location_name && (
            <View style={styles.tag}>
              <Ionicons name="location" size={14} color={colors.warning} />
              <Text style={styles.tagText}>{product.location_name}</Text>
            </View>
          )}
        </View>

        {product.description && (
          <Text style={styles.description}>{product.description}</Text>
        )}
      </View>

      {/* Quantity Control */}
      <View style={styles.quantityCard}>
        <Text style={styles.quantityLabel}>Quantité en stock</Text>
        <View style={styles.quantityControls}>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => handleQuantityChange(-1)}
            disabled={product.quantity <= 0}
          >
            <Ionicons name="remove" size={24} color={colors.foreground} />
          </TouchableOpacity>

          <View style={styles.qtyDisplay}>
            <Text style={[styles.qtyValue, isLowStock && styles.qtyValueLow]}>
              {product.quantity}
            </Text>
            <Text style={styles.qtyUnit}>{product.unit}</Text>
          </View>

          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => handleQuantityChange(1)}
          >
            <Ionicons name="add" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <Text style={styles.minQuantity}>
          Quantité minimum: {product.min_quantity} {product.unit}
        </Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleQuantityChange(5)}>
          <Ionicons name="add-circle" size={20} color={colors.success} />
          <Text style={styles.actionText}>+5</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleQuantityChange(10)}>
          <Ionicons name="add-circle" size={20} color={colors.success} />
          <Text style={styles.actionText}>+10</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleQuantityChange(-5)}>
          <Ionicons name="remove-circle" size={20} color={colors.warning} />
          <Text style={styles.actionText}>-5</Text>
        </TouchableOpacity>
      </View>

      {/* Delete Button */}
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={handleDelete}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.destructiveForeground} />
        ) : (
          <>
            <Ionicons name="trash" size={20} color={colors.destructiveForeground} />
            <Text style={styles.deleteText}>Supprimer ce produit</Text>
          </>
        )}
      </TouchableOpacity>
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
  imageContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  lowStockBanner: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.destructive,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  lowStockText: {
    color: colors.destructiveForeground,
    fontSize: 12,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  productName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
  },
  productBrand: {
    fontSize: 16,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  barcodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  barcodeText: {
    fontSize: 14,
    color: colors.mutedForeground,
    fontFamily: 'monospace',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  tagText: {
    fontSize: 13,
    color: colors.foreground,
  },
  description: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 16,
    lineHeight: 20,
  },
  quantityCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    alignItems: 'center',
  },
  quantityLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 16,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  qtyButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyDisplay: {
    alignItems: 'center',
  },
  qtyValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.success,
  },
  qtyValueLow: {
    color: colors.destructive,
  },
  qtyUnit: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  minQuantity: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.destructive + '20',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.destructive + '40',
    gap: 8,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.destructive,
  },
});
