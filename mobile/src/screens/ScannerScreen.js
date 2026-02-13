// Scanner Screen for StockHome Mobile
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../context/SyncContext';
import { productsAPI, barcodeAPI, categoriesAPI, locationsAPI } from '../services/api';
import { addPendingAction, saveToCache, CACHE_KEYS } from '../services/storage';
import { colors } from '../theme/colors';

export default function ScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const { isOnline, loadPendingCount, fullSync } = useSync();
  
  const [scanning, setScanning] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [searching, setSearching] = useState(false);
  
  // Result states
  const [showResultModal, setShowResultModal] = useState(false);
  const [existingProduct, setExistingProduct] = useState(null);
  const [openFoodFactsData, setOpenFoodFactsData] = useState(null);
  const [scannedBarcode, setScannedBarcode] = useState('');
  
  // Categories & Locations
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  
  // New product form
  const [newProduct, setNewProduct] = useState({
    name: '',
    brand: '',
    quantity: 1,
    min_quantity: 1,
    unit: 'unité',
    category_id: null,
    location_id: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCategoriesAndLocations();
  }, []);

  const loadCategoriesAndLocations = async () => {
    try {
      const [catRes, locRes] = await Promise.all([
        categoriesAPI.getAll(),
        locationsAPI.getAll(),
      ]);
      setCategories(catRes.data);
      setLocations(locRes.data);
    } catch (error) {
      console.error('Error loading categories/locations:', error);
    }
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    if (searching) return;
    setScanning(false);
    processBarcode(data);
  };

  const processBarcode = async (barcode) => {
    setSearching(true);
    setScannedBarcode(barcode);
    setExistingProduct(null);
    setOpenFoodFactsData(null);

    try {
      // Check if product exists in inventory
      try {
        const existingRes = await productsAPI.getByBarcode(barcode);
        setExistingProduct(existingRes.data);
        setShowResultModal(true);
        setSearching(false);
        return;
      } catch (error) {
        // Product not found in inventory
      }

      // Look up in Open Food Facts
      if (isOnline) {
        try {
          const offRes = await barcodeAPI.lookup(barcode);
          setOpenFoodFactsData(offRes.data);
          setNewProduct({
            ...newProduct,
            name: offRes.data.name || '',
            brand: offRes.data.brand || '',
            barcode: barcode,
          });
        } catch (error) {
          // Not found in Open Food Facts
          setNewProduct({
            ...newProduct,
            name: '',
            brand: '',
            barcode: barcode,
          });
        }
      } else {
        setNewProduct({
          ...newProduct,
          barcode: barcode,
        });
      }

      setShowResultModal(true);
    } catch (error) {
      Alert.alert('Erreur', 'Erreur lors de la recherche');
    } finally {
      setSearching(false);
    }
  };

  const handleManualSearch = () => {
    if (!manualBarcode.trim()) {
      Alert.alert('Erreur', 'Entrez un code-barres');
      return;
    }
    processBarcode(manualBarcode.trim());
    setManualBarcode('');
  };

  const handleUpdateQuantity = async (delta) => {
    if (!existingProduct) return;

    const newQuantity = Math.max(0, existingProduct.quantity + delta);
    setExistingProduct((prev) => ({ ...prev, quantity: newQuantity }));

    if (isOnline) {
      try {
        await productsAPI.updateQuantity(existingProduct.id, delta);
      } catch (error) {
        setExistingProduct((prev) => ({ ...prev, quantity: existingProduct.quantity }));
        Alert.alert('Erreur', 'Impossible de mettre à jour');
      }
    } else {
      await addPendingAction({
        type: 'UPDATE_QUANTITY',
        productId: existingProduct.id,
        delta,
      });
      await loadPendingCount();
    }
  };

  const handleSaveNewProduct = async () => {
    if (!newProduct.name.trim()) {
      Alert.alert('Erreur', 'Le nom du produit est requis');
      return;
    }

    setSaving(true);
    const productData = {
      ...newProduct,
      barcode: scannedBarcode,
      image_url: openFoodFactsData?.image_url || null,
    };

    if (isOnline) {
      try {
        await productsAPI.create(productData);
        await fullSync();
        Alert.alert('Succès', 'Produit ajouté à votre inventaire');
        setShowResultModal(false);
        resetForm();
      } catch (error) {
        Alert.alert('Erreur', "Impossible d'ajouter le produit");
      }
    } else {
      await addPendingAction({
        type: 'CREATE_PRODUCT',
        data: productData,
      });
      await loadPendingCount();
      Alert.alert('Hors-ligne', 'Le produit sera ajouté lors de la prochaine synchronisation');
      setShowResultModal(false);
      resetForm();
    }
    setSaving(false);
  };

  const resetForm = () => {
    setNewProduct({
      name: '',
      brand: '',
      quantity: 1,
      min_quantity: 1,
      unit: 'unité',
      category_id: null,
      location_id: null,
    });
    setOpenFoodFactsData(null);
    setExistingProduct(null);
    setScannedBarcode('');
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={64} color={colors.mutedForeground} />
        <Text style={styles.permissionText}>
          Accès à la caméra requis pour scanner les codes-barres
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Autoriser la caméra</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera Scanner */}
      {scanning ? (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
            }}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setScanning(false)}
          >
            <Ionicons name="close" size={28} color={colors.foreground} />
          </TouchableOpacity>
          {searching && (
            <View style={styles.searchingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.searchingText}>Recherche...</Text>
            </View>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Scan Button */}
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => setScanning(true)}
          >
            <View style={styles.scanButtonIcon}>
              <Ionicons name="scan" size={48} color={colors.primary} />
            </View>
            <Text style={styles.scanButtonTitle}>Scanner un code-barres</Text>
            <Text style={styles.scanButtonSubtitle}>
              Appuyez pour ouvrir la caméra
            </Text>
          </TouchableOpacity>

          {/* Manual Input */}
          <View style={styles.manualSection}>
            <Text style={styles.sectionTitle}>Saisie manuelle</Text>
            <View style={styles.manualInputContainer}>
              <TextInput
                style={styles.manualInput}
                placeholder="Entrez le code-barres"
                placeholderTextColor={colors.mutedForeground}
                value={manualBarcode}
                onChangeText={setManualBarcode}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={styles.manualButton}
                onPress={handleManualSearch}
                disabled={searching}
              >
                {searching ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Ionicons name="search" size={20} color={colors.primaryForeground} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionsTitle}>Comment ça marche ?</Text>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>1</Text>
              </View>
              <Text style={styles.instructionText}>
                Scannez le code-barres ou saisissez-le manuellement
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>2</Text>
              </View>
              <Text style={styles.instructionText}>
                Les informations sont récupérées automatiquement
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>3</Text>
              </View>
              <Text style={styles.instructionText}>
                Ajoutez le produit à votre inventaire
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Result Modal */}
      <Modal
        visible={showResultModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {existingProduct ? 'Produit trouvé' : 'Nouveau produit'}
            </Text>
            <TouchableOpacity onPress={() => { setShowResultModal(false); resetForm(); }}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {existingProduct ? (
              // Existing Product View
              <View>
                <View style={styles.productHeader}>
                  {existingProduct.image_url ? (
                    <Image source={{ uri: existingProduct.image_url }} style={styles.productImage} />
                  ) : (
                    <View style={styles.productImagePlaceholder}>
                      <Ionicons name="cube" size={40} color={colors.mutedForeground} />
                    </View>
                  )}
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>{existingProduct.name}</Text>
                    <Text style={styles.productBrand}>{existingProduct.brand || 'Sans marque'}</Text>
                  </View>
                </View>

                <View style={styles.quantitySection}>
                  <Text style={styles.quantityLabel}>Quantité en stock</Text>
                  <View style={styles.quantityControls}>
                    <TouchableOpacity
                      style={styles.qtyButton}
                      onPress={() => handleUpdateQuantity(-1)}
                    >
                      <Ionicons name="remove" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{existingProduct.quantity}</Text>
                    <TouchableOpacity
                      style={styles.qtyButton}
                      onPress={() => handleUpdateQuantity(1)}
                    >
                      <Ionicons name="add" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={() => { setShowResultModal(false); resetForm(); }}
                >
                  <Text style={styles.doneButtonText}>Terminé</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // New Product Form
              <View>
                {openFoodFactsData?.image_url && (
                  <Image source={{ uri: openFoodFactsData.image_url }} style={styles.newProductImage} />
                )}

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Nom *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={newProduct.name}
                    onChangeText={(text) => setNewProduct({ ...newProduct, name: text })}
                    placeholder="Nom du produit"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Marque</Text>
                  <TextInput
                    style={styles.formInput}
                    value={newProduct.brand}
                    onChangeText={(text) => setNewProduct({ ...newProduct, brand: text })}
                    placeholder="Marque"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Quantité</Text>
                    <TextInput
                      style={styles.formInput}
                      value={String(newProduct.quantity)}
                      onChangeText={(text) => setNewProduct({ ...newProduct, quantity: parseInt(text) || 0 })}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Min.</Text>
                    <TextInput
                      style={styles.formInput}
                      value={String(newProduct.min_quantity)}
                      onChangeText={(text) => setNewProduct({ ...newProduct, min_quantity: parseInt(text) || 0 })}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={handleSaveNewProduct}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <Text style={styles.saveButtonText}>Ajouter au stock</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  permissionText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  permissionButtonText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 280,
    height: 180,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchingText: {
    color: colors.foreground,
    fontSize: 16,
    marginTop: 12,
  },
  content: {
    padding: 16,
  },
  scanButton: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary + '40',
    marginBottom: 24,
  },
  scanButtonIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  scanButtonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
  },
  scanButtonSubtitle: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  manualSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 12,
  },
  manualInputContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  manualInput: {
    flex: 1,
    height: 48,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    color: colors.foreground,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  manualButton: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionsContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  instructionsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  instructionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  instructionNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  instructionText: {
    flex: 1,
    fontSize: 13,
    color: colors.mutedForeground,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  productHeader: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 16,
  },
  productImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  productInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
  },
  productBrand: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  quantitySection: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
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
  qtyValue: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.success,
    minWidth: 80,
    textAlign: 'center',
  },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: '600',
  },
  newProductImage: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
    marginBottom: 8,
  },
  formInput: {
    height: 48,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    color: colors.foreground,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: '600',
  },
});
