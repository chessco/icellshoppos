import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableWithoutFeedback,
} from "react-native";
import { IPAD_THEME } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { useCart } from "../../contexts/CartContext";
import { useAuth } from "../../contexts/AuthContext";
import { CustomerApplicationService, normalizeWhatsappPhone } from "@ireader/application";
import type { ICustomerListItem } from "@ireader/contracts";

interface CustomerSelectModalProps {
  visible: boolean;
  onClose: () => void;
}

export function CustomerSelectModal({ visible, onClose }: CustomerSelectModalProps) {
  const { apiClient } = useAuth();
  const { selectedCustomer, setCustomer } = useCart();

  const [activeTab, setActiveTab] = useState<"search" | "new">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [customers, setCustomers] = useState<ICustomerListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New customer form fields
  const [newName, setNewName] = useState(selectedCustomer?.name || "");
  const [newPhone, setNewPhone] = useState(selectedCustomer?.phone || "");
  const [newEmail, setNewEmail] = useState(selectedCustomer?.email || "");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const customerService = useMemo(
    () => new CustomerApplicationService(apiClient),
    [apiClient]
  );

  useEffect(() => {
    if (visible) {
      void fetchCustomers();
    }
  }, [visible, customerService]);

  const fetchCustomers = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await customerService.loadCustomers();
      if (res.ok) {
        setCustomers(res.items);
      } else {
        setErrorMessage(res.error || "Failed to load customers");
      }
    } catch {
      setErrorMessage("Network error loading customer list");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    return customerService.filterCustomers(customers, searchQuery);
  }, [customerService, customers, searchQuery]);

  const handleSelectExisting = (customer: ICustomerListItem) => {
    setCustomer({
      id: customer.id,
      name: customer.name,
      phone: customer.whatsapp || undefined,
      email: customer.email || undefined,
      creditEnabled: Boolean(customer.creditEnabled),
    });
    onClose();
  };

  const handleSaveNew = async () => {
    if (!newName.trim()) {
      setErrorMessage("Customer full name is required.");
      return;
    }

    const phoneNorm = normalizeWhatsappPhone(newPhone);
    if (!phoneNorm.valid) {
      setPhoneError(phoneNorm.error || "Valid phone number required.");
      return;
    }
    setPhoneError(null);

    // Save customer locally in cart
    setCustomer({
      name: newName.trim(),
      phone: phoneNorm.normalized,
      email: newEmail.trim().toLowerCase() || undefined,
      creditEnabled: false,
    });
    onClose();
  };

  const handleClear = () => {
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setCustomer(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {/* Header */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>Customer / Receipt Routing</Text>
                  <Text style={styles.subtitle}>
                    Attach customer details to order for warranty and digital receipts.
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Tab Switcher */}
              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.tab, activeTab === "search" && styles.tabActive]}
                  onPress={() => setActiveTab("search")}
                >
                  <Text style={[styles.tabText, activeTab === "search" && styles.tabTextActive]}>
                    🔍 Search Existing ({customers.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, activeTab === "new" && styles.tabActive]}
                  onPress={() => setActiveTab("new")}
                >
                  <Text style={[styles.tabText, activeTab === "new" && styles.tabTextActive]}>
                    + Walk-in / New Customer
                  </Text>
                </TouchableOpacity>
              </View>

              {activeTab === "search" ? (
                <View style={styles.searchSection}>
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search customer by name, email, or phone..."
                    placeholderTextColor={IPAD_THEME.colors.textMuted}
                    autoFocus
                  />

                  {isLoading ? (
                    <View style={styles.centerBox}>
                      <ActivityIndicator color={IPAD_THEME.colors.accent} />
                    </View>
                  ) : errorMessage ? (
                    <View style={styles.centerBox}>
                      <Text style={styles.errorText}>{errorMessage}</Text>
                      <Button title="Retry" variant="secondary" size="sm" onPress={fetchCustomers} />
                    </View>
                  ) : (
                    <FlatList
                      data={filteredCustomers}
                      keyExtractor={(c) => c.id}
                      style={styles.customerList}
                      renderItem={({ item }) => {
                        const isSelected = selectedCustomer?.id === item.id;
                        return (
                          <TouchableOpacity
                            style={[styles.customerItem, isSelected && styles.customerItemSelected]}
                            onPress={() => handleSelectExisting(item)}
                          >
                            <View style={styles.customerMeta}>
                              <View style={styles.customerNameRow}>
                                <Text style={styles.customerName}>{item.name}</Text>
                                {item.creditEnabled && (
                                  <Badge label="CREDIT ENABLED" variant="success" />
                                )}
                              </View>
                              <Text style={styles.customerContact}>
                                {[item.whatsapp, item.email].filter(Boolean).join(" • ") || "No contact info"}
                              </Text>
                            </View>
                            <Text style={styles.selectArrow}>›</Text>
                          </TouchableOpacity>
                        );
                      }}
                      ListEmptyComponent={
                        <View style={styles.centerBox}>
                          <Text style={styles.emptyText}>No matching customers found</Text>
                          <Button
                            title="Add as New Customer"
                            variant="primary"
                            size="sm"
                            onPress={() => setActiveTab("new")}
                            style={styles.quickAddBtn}
                          />
                        </View>
                      }
                    />
                  )}
                </View>
              ) : (
                <View style={styles.formSection}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Full Name *</Text>
                    <TextInput
                      style={styles.input}
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="Jane Doe"
                      placeholderTextColor={IPAD_THEME.colors.textMuted}
                      autoFocus
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>WhatsApp Phone (with Country Code) *</Text>
                    <TextInput
                      style={[styles.input, Boolean(phoneError) && styles.inputError]}
                      value={newPhone}
                      onChangeText={(t) => {
                        setNewPhone(t);
                        setPhoneError(null);
                      }}
                      placeholder="+52 55 1234 5678"
                      placeholderTextColor={IPAD_THEME.colors.textMuted}
                      keyboardType="phone-pad"
                    />
                    {phoneError && <Text style={styles.errorTextSmall}>{phoneError}</Text>}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Email Address (Optional Receipt)</Text>
                    <TextInput
                      style={styles.input}
                      value={newEmail}
                      onChangeText={setNewEmail}
                      placeholder="customer@domain.com"
                      placeholderTextColor={IPAD_THEME.colors.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              )}

              {/* Actions Footer */}
              <View style={styles.footer}>
                <Button
                  title="Remove Customer"
                  variant="ghost"
                  onPress={handleClear}
                />
                {activeTab === "new" && (
                  <Button
                    title="Attach to POS Order"
                    variant="primary"
                    onPress={handleSaveNew}
                  />
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: IPAD_THEME.spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 580,
    maxHeight: "85%",
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.xl,
    padding: IPAD_THEME.spacing.xxl,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: IPAD_THEME.spacing.md,
  },
  title: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    padding: IPAD_THEME.spacing.xs,
  },
  closeText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 16,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    padding: 3,
    marginBottom: IPAD_THEME.spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: IPAD_THEME.spacing.sm,
    alignItems: "center",
    borderRadius: IPAD_THEME.radius.sm,
  },
  tabActive: {
    backgroundColor: IPAD_THEME.colors.surfaceElevated,
  },
  tabText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  tabTextActive: {
    color: IPAD_THEME.colors.textPrimary,
    fontWeight: "700",
  },
  searchSection: {
    flex: 1,
    minHeight: 240,
  },
  searchInput: {
    height: IPAD_THEME.touchTarget.minHeight,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    paddingHorizontal: IPAD_THEME.spacing.md,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  customerList: {
    flex: 1,
  },
  customerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  customerItemSelected: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: IPAD_THEME.colors.surfaceElevated,
  },
  customerMeta: {
    flex: 1,
  },
  customerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.sm,
  },
  customerName: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  customerContact: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  selectArrow: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 18,
    marginLeft: IPAD_THEME.spacing.sm,
  },
  centerBox: {
    padding: IPAD_THEME.spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 14,
    marginBottom: IPAD_THEME.spacing.md,
  },
  quickAddBtn: {
    marginTop: IPAD_THEME.spacing.xs,
  },
  formSection: {
    paddingVertical: IPAD_THEME.spacing.sm,
  },
  inputGroup: {
    marginBottom: IPAD_THEME.spacing.md,
  },
  label: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: IPAD_THEME.spacing.xs,
    textTransform: "uppercase",
  },
  input: {
    height: IPAD_THEME.touchTarget.minHeight,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    paddingHorizontal: IPAD_THEME.spacing.md,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
  },
  inputError: {
    borderColor: IPAD_THEME.colors.danger,
  },
  errorTextSmall: {
    color: IPAD_THEME.colors.danger,
    fontSize: 11,
    marginTop: 4,
  },
  errorText: {
    color: IPAD_THEME.colors.danger,
    fontSize: 13,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: IPAD_THEME.spacing.md,
    paddingTop: IPAD_THEME.spacing.md,
    borderTopWidth: 1,
    borderTopColor: IPAD_THEME.colors.borderSubtle,
  },
});
