import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from "react-native";
import type { IInventoryListItem } from "@ireader/contracts";
import type { AppleModelGroup } from "../../utils/appleCatalogGrouping";
import { IPAD_THEME } from "../../theme/tokens";
import { formatCurrency } from "../../utils/formatters";

interface AppleConfiguratorSheetProps {
  visible: boolean;
  group: AppleModelGroup | null;
  onClose: () => void;
  onAddToCart: (item: IInventoryListItem) => void;
}

export function AppleConfiguratorSheet({
  visible,
  group,
  onClose,
  onAddToCart,
}: AppleConfiguratorSheetProps) {
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedCapacity, setSelectedCapacity] = useState<string>("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  // Inicializar selecciones por defecto cuando cambia el grupo
  useEffect(() => {
    if (group && group.items.length > 0) {
      const defaultColor = group.colors[0]?.name || "";
      setSelectedColor(defaultColor);

      const itemsWithColor = group.items.filter(
        (it) => (it.color?.trim() || "Estándar") === defaultColor
      );

      const firstItem = itemsWithColor[0] || group.items[0];
      const cap = firstItem.capacity || (firstItem as unknown as { storageSize?: string }).storageSize || "";
      setSelectedCapacity(cap);
      setSelectedItemId(firstItem.id);
    }
  }, [group]);

  // Ítems filtrados por el color activo
  const itemsOfSelectedColor = useMemo(() => {
    if (!group) return [];
    return group.items.filter((it) => (it.color?.trim() || "Estándar") === selectedColor);
  }, [group, selectedColor]);

  // Capacidades disponibles para el color activo
  const availableCapacities = useMemo(() => {
    const caps = new Set<string>();
    itemsOfSelectedColor.forEach((it) => {
      const c = it.capacity || (it as unknown as { storageSize?: string }).storageSize;
      if (c) caps.add(c.trim());
    });
    return Array.from(caps);
  }, [itemsOfSelectedColor]);

  // Actualizar capacidad si la seleccionada ya no existe en el nuevo color
  useEffect(() => {
    if (availableCapacities.length > 0 && !availableCapacities.includes(selectedCapacity)) {
      setSelectedCapacity(availableCapacities[0]);
    }
  }, [availableCapacities, selectedCapacity]);

  // Ítems que coinciden con Color + Capacidad
  const matchingUnits = useMemo(() => {
    return itemsOfSelectedColor.filter((it) => {
      const c = it.capacity || (it as unknown as { storageSize?: string }).storageSize;
      return (c?.trim() || "") === selectedCapacity;
    });
  }, [itemsOfSelectedColor, selectedCapacity]);

  // Unidad activa elegida para la venta
  const activeItem = useMemo(() => {
    return matchingUnits.find((it) => it.id === selectedItemId) || matchingUnits[0] || group?.items[0];
  }, [matchingUnits, selectedItemId, group]);

  if (!visible || !group || !activeItem) return null;

  const handleAddAndClose = () => {
    onAddToCart(activeItem);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <View style={styles.badgeRow}>
                {group.isBestseller && (
                  <View style={styles.bestsellerBadge}>
                    <Text style={styles.bestsellerBadgeText}>
                      {group.bestsellerBadgeText || "⭐ MÁS VENDIDO"}
                    </Text>
                  </View>
                )}
                <Text style={styles.stockText}>{group.totalAvailable} en inventario</Text>
              </View>
              <Text style={styles.modelTitle}>{group.modelName}</Text>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cerrar configurador"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
            {/* Paso 1: Acabado / Color */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>1. ACABADO Y COLOR</Text>
              <Text style={styles.sectionSubtitle}>
                Color seleccionado: <Text style={styles.sectionValueHighlight}>{selectedColor}</Text>
              </Text>

              <View style={styles.colorSwatchesRow}>
                {group.colors.map((c) => {
                  const isSelected = selectedColor === c.name;
                  return (
                    <TouchableOpacity
                      key={c.name}
                      style={[styles.colorSwatchTouch, isSelected && styles.colorSwatchTouchActive]}
                      onPress={() => setSelectedColor(c.name)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Color ${c.name}, ${c.count} disponibles`}
                    >
                      <View style={[styles.colorCircle, { backgroundColor: c.hex }]}>
                        {isSelected && <View style={styles.colorCheckInner} />}
                      </View>
                      <Text style={[styles.colorSwatchLabel, isSelected && styles.colorSwatchLabelActive]}>
                        {c.name}
                      </Text>
                      <Text style={styles.colorSwatchCount}>({c.count})</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Paso 2: Almacenamiento / Capacidad */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>2. CAPACIDAD DE ALMACENAMIENTO</Text>
              <View style={styles.capacityGrid}>
                {availableCapacities.map((cap) => {
                  const isSelected = selectedCapacity === cap;
                  const unitsInCap = itemsOfSelectedColor.filter((it) => {
                    const c = it.capacity || (it as unknown as { storageSize?: string }).storageSize;
                    return (c?.trim() || "") === cap;
                  });
                  const samplePrice = unitsInCap[0]?.price || group.minPrice;

                  return (
                    <TouchableOpacity
                      key={cap}
                      style={[styles.capacityCard, isSelected && styles.capacityCardActive]}
                      onPress={() => {
                        setSelectedCapacity(cap);
                        if (unitsInCap[0]) setSelectedItemId(unitsInCap[0].id);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Capacidad ${cap}, precio ${formatCurrency(samplePrice)}`}
                    >
                      <Text style={[styles.capacityLabel, isSelected && styles.capacityLabelActive]}>
                        {cap}
                      </Text>
                      <Text style={styles.capacityPrice}>{formatCurrency(samplePrice)}</Text>
                      <Text style={styles.capacityStock}>{unitsInCap.length} disponibles</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Paso 3: Dispositivo Físico Asignado (IMEI y Grado) */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>3. EQUIPO FÍSICO ASIGNADO (IMEI)</Text>
              {matchingUnits.length === 1 ? (
                <View style={styles.singleUnitCard}>
                  <View style={styles.unitSpecsRow}>
                    {Boolean(activeItem.grade) && (
                      <View style={styles.unitPill}>
                        <Text style={styles.unitPillText}>Grado {activeItem.grade?.toUpperCase()}</Text>
                      </View>
                    )}
                    {Boolean(activeItem.carrier) && (
                      <View style={styles.unitPill}>
                        <Text style={styles.unitPillText}>{activeItem.carrier}</Text>
                      </View>
                    )}
                    {Boolean(activeItem.batteryHealth) && (
                      <View style={[styles.unitPill, styles.batteryPill]}>
                        <Text style={styles.batteryPillText}>🔋 {activeItem.batteryHealth}%</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.imeiText}>
                    IMEI: {activeItem.imei || activeItem.serialNumber || "Sin serial"}
                  </Text>
                </View>
              ) : (
                <View style={styles.unitsList}>
                  {matchingUnits.map((unit, idx) => {
                    const isSelected = unit.id === activeItem.id;
                    return (
                      <TouchableOpacity
                        key={unit.id}
                        style={[styles.unitRow, isSelected && styles.unitRowActive]}
                        onPress={() => setSelectedItemId(unit.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.unitRowLeft}>
                          <Text style={[styles.unitIndex, isSelected && styles.unitIndexActive]}>
                            #{idx + 1}
                          </Text>
                          <View>
                            <Text style={styles.unitImei}>
                              IMEI: {unit.imei ? `…${unit.imei.slice(-8)}` : unit.serialNumber || "N/A"}
                            </Text>
                            <Text style={styles.unitDetails}>
                              Grado {unit.grade || "A"} · {unit.carrier || "Libre"}
                              {unit.batteryHealth ? ` · 🔋 ${unit.batteryHealth}%` : ""}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.unitSelectCheck, isSelected && styles.unitSelectCheckActive]}>
                          {isSelected ? "✓ Seleccionado" : "Elegir"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Sticky Bottom Actions */}
          <View style={styles.footer}>
            <View style={styles.footerPriceCol}>
              <Text style={styles.footerPriceLabel}>PRECIO FINAL</Text>
              <Text style={styles.footerPriceVal}>{formatCurrency(activeItem.price)} MXN</Text>
            </View>

            <TouchableOpacity
              style={styles.addCartBtn}
              onPress={handleAddAndClose}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Agregar ${activeItem.model} al ticket`}
            >
              <Text style={styles.addCartBtnText}>
                ＋ Agregar al Ticket ({formatCurrency(activeItem.price)}) ›
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#0d131f",
    borderTopLeftRadius: IPAD_THEME.radius.xl,
    borderTopRightRadius: IPAD_THEME.radius.xl,
    maxHeight: "88%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 25,
  },
  header: {
    paddingHorizontal: IPAD_THEME.spacing.xl,
    paddingTop: IPAD_THEME.spacing.lg,
    paddingBottom: IPAD_THEME.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  bestsellerBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: IPAD_THEME.radius.sm,
  },
  bestsellerBadgeText: {
    color: "#f59e0b",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  stockText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  modelTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 16,
    fontWeight: "700",
  },
  contentScroll: {
    paddingHorizontal: IPAD_THEME.spacing.xl,
    paddingVertical: IPAD_THEME.spacing.md,
  },
  section: {
    marginBottom: IPAD_THEME.spacing.xl,
  },
  sectionTitle: {
    color: IPAD_THEME.colors.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    marginBottom: IPAD_THEME.spacing.md,
  },
  sectionValueHighlight: {
    color: IPAD_THEME.colors.textPrimary,
    fontWeight: "800",
  },
  colorSwatchesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorSwatchTouch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: IPAD_THEME.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  colorSwatchTouchActive: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
  },
  colorCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  colorCheckInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  colorSwatchLabel: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  colorSwatchLabelActive: {
    color: IPAD_THEME.colors.textPrimary,
    fontWeight: "900",
  },
  colorSwatchCount: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
  },
  capacityGrid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  capacityCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: IPAD_THEME.radius.lg,
    padding: IPAD_THEME.spacing.md,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
  },
  capacityCardActive: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
  },
  capacityLabel: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  capacityLabelActive: {
    color: IPAD_THEME.colors.textPrimary,
    fontWeight: "900",
  },
  capacityPrice: {
    color: "#38bdf8",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 2,
  },
  capacityStock: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
  },
  singleUnitCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: IPAD_THEME.radius.lg,
    padding: IPAD_THEME.spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  unitSpecsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  unitPill: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  unitPillText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  batteryPill: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
  },
  batteryPillText: {
    color: "#22c55e",
    fontSize: 11,
    fontWeight: "800",
  },
  imeiText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  unitsList: {
    gap: 8,
  },
  unitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: IPAD_THEME.radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  unitRowActive: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: "rgba(56, 189, 248, 0.08)",
  },
  unitRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  unitIndex: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  unitIndexActive: {
    color: IPAD_THEME.colors.accent,
  },
  unitImei: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  unitDetails: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  unitSelectCheck: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  unitSelectCheckActive: {
    color: IPAD_THEME.colors.accent,
    fontWeight: "900",
  },
  footer: {
    backgroundColor: "#090d16",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    padding: IPAD_THEME.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  footerPriceCol: {
    justifyContent: "center",
  },
  footerPriceLabel: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  footerPriceVal: {
    color: "#38bdf8",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 2,
  },
  addCartBtn: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.accent,
    borderRadius: IPAD_THEME.radius.xl,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: IPAD_THEME.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  addCartBtnText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});
