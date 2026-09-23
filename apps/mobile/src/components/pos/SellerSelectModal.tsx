import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
} from "react-native";
import { IPAD_THEME } from "../../theme/tokens";
import { useCommission } from "../../contexts/CommissionContext";
import type { SellerProfile } from "@ireader/contracts";

interface SellerSelectModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SellerSelectModal({ visible, onClose }: SellerSelectModalProps) {
  const { sellers, activeSeller, setActiveSeller, addSeller } = useCommission();
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newSellerName, setNewSellerName] = useState("");
  const [newSellerRole, setNewSellerRole] = useState("Vendedor");

  const handleSelect = (seller: SellerProfile) => {
    setActiveSeller(seller);
    onClose();
  };

  const handleCreate = async () => {
    if (!newSellerName.trim()) return;
    await addSeller(newSellerName.trim(), newSellerRole.trim() || "Vendedor");
    setNewSellerName("");
    setIsAddingNew(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.badge}>COMISIÓN DE VENTAS</Text>
              <Text style={styles.title}>Vendedor Asignado</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Selecciona el vendedor que atenderá y comisionará esta venta:
          </Text>

          {/* Sellers List */}
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {sellers.map((seller) => {
              const isSelected = activeSeller.id === seller.id;
              const initials = (seller.name || "V")
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")
                .toUpperCase();

              return (
                <TouchableOpacity
                  key={seller.id}
                  style={[styles.sellerRow, isSelected && styles.sellerRowActive]}
                  onPress={() => handleSelect(seller)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.avatar, { backgroundColor: seller.avatarColor || "#6366f1" }]}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                  <View style={styles.sellerInfo}>
                    <Text style={[styles.sellerName, isSelected && styles.sellerNameActive]}>
                      {seller.name}
                    </Text>
                    <Text style={styles.sellerRole}>
                      {seller.role || "Vendedor"} {seller.email ? `· ${seller.email}` : ""}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={styles.checkBadge}>
                      <Text style={styles.checkBadgeText}>✓ ACTIVO</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Quick Add Seller Form */}
          {isAddingNew ? (
            <View style={styles.newSellerForm}>
              <Text style={styles.newSellerTitle}>Registrar Nuevo Vendedor</Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre del vendedor..."
                placeholderTextColor={IPAD_THEME.colors.textMuted}
                value={newSellerName}
                onChangeText={setNewSellerName}
                autoFocus
              />
              <TextInput
                style={styles.input}
                placeholder="Puesto o Rol (ej. Piso, Comisionista)..."
                placeholderTextColor={IPAD_THEME.colors.textMuted}
                value={newSellerRole}
                onChangeText={setNewSellerRole}
              />
              <View style={styles.formBtnRow}>
                <TouchableOpacity
                  style={styles.cancelFormBtn}
                  onPress={() => setIsAddingNew(false)}
                >
                  <Text style={styles.cancelFormText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveFormBtn, !newSellerName.trim() && styles.saveFormBtnDisabled]}
                  onPress={handleCreate}
                  disabled={!newSellerName.trim()}
                >
                  <Text style={styles.saveFormText}>Guardar Vendedor</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addSellerTriggerBtn}
              onPress={() => setIsAddingNew(true)}
            >
              <Text style={styles.addSellerTriggerText}>+ Registrar Otro Vendedor</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#0f172a",
    borderRadius: IPAD_THEME.radius.xl,
    padding: 24,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.12)",
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  badge: {
    color: "#38bdf8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 20,
    fontWeight: "900",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  subtitle: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    marginBottom: 16,
  },
  list: {
    maxHeight: 280,
    marginBottom: 16,
  },
  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#1e293b",
    borderRadius: IPAD_THEME.radius.lg,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  sellerRowActive: {
    borderColor: "#38bdf8",
    backgroundColor: "rgba(56, 189, 248, 0.12)",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  sellerInfo: {
    flex: 1,
  },
  sellerName: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  sellerNameActive: {
    color: "#38bdf8",
  },
  sellerRole: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  checkBadge: {
    backgroundColor: "#38bdf8",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: IPAD_THEME.radius.full,
  },
  checkBadgeText: {
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "900",
  },
  addSellerTriggerBtn: {
    paddingVertical: 12,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderStyle: "dashed",
    alignItems: "center",
  },
  addSellerTriggerText: {
    color: "#38bdf8",
    fontSize: 13,
    fontWeight: "800",
  },
  newSellerForm: {
    backgroundColor: "#1e293b",
    padding: 14,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  newSellerTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: IPAD_THEME.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 8,
  },
  formBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  cancelFormBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelFormText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  saveFormBtn: {
    backgroundColor: "#38bdf8",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: IPAD_THEME.radius.md,
  },
  saveFormBtnDisabled: {
    opacity: 0.5,
  },
  saveFormText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },
});
