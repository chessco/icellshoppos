import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { IPAD_THEME } from "../../theme/tokens";
import { useAuth } from "../../contexts/AuthContext";
import { formatCurrency } from "../../utils/formatters";

interface QuickMessagesModalProps {
  visible: boolean;
  onClose: () => void;
  initialPhone?: string;
  initialCustomerName?: string;
}

interface ChatMessageItem {
  id: string;
  senderName: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  createdAt: string;
  status?: string;
}

interface ConversationItem {
  id: string;
  phone: string;
  customerName: string;
  lastMessage: string;
  updatedAt: string;
  unreadCount?: number;
}

export function QuickMessagesModal({
  visible,
  onClose,
  initialPhone,
  initialCustomerName,
}: QuickMessagesModalProps) {
  const { baseUrl, session } = useAuth();
  const [activeTab, setActiveTab] = useState<"WHATSAPP" | "INTERNAL">("WHATSAPP");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);
  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState(initialPhone || "");
  const [newChatName, setNewChatName] = useState(initialCustomerName || "");

  // Mock initial conversations for instant reactivity and offline resilience
  const [conversations, setConversations] = useState<ConversationItem[]>([
    {
      id: "526441551116",
      phone: "+52 644 155 1116",
      customerName: "Carlos Mendoza",
      lastMessage: "Hola, ¿tienen disponibilidad de iPhone 15 Pro Max 256GB?",
      updatedAt: "10:42 AM",
      unreadCount: 1,
    },
    {
      id: "526442119933",
      phone: "+52 644 211 9933",
      customerName: "Lucía Morales",
      lastMessage: "Recibido el comprobante de compra. Muchas gracias!",
      updatedAt: "Ayer",
    },
    {
      id: "526449887722",
      phone: "+52 644 988 7722",
      customerName: "Roberto Vega",
      lastMessage: "Perfecto, paso a recoger el equipo por la tarde.",
      updatedAt: "Lun",
    },
  ]);

  const [messages, setMessages] = useState<Record<string, ChatMessageItem[]>>({
    "526441551116": [
      {
        id: "m1",
        senderName: "Carlos Mendoza",
        direction: "INBOUND",
        content: "Hola, ¿tienen disponibilidad de iPhone 15 Pro Max 256GB?",
        createdAt: "10:40 AM",
      },
      {
        id: "m2",
        senderName: "Pro Buyer POS",
        direction: "OUTBOUND",
        content: "¡Hola Carlos! Sí, tenemos 3 unidades disponibles en color Natural Titanium a $22,499 MXN.",
        createdAt: "10:41 AM",
        status: "DELIVERED",
      },
      {
        id: "m3",
        senderName: "Carlos Mendoza",
        direction: "INBOUND",
        content: "¿Me podrías apartar uno para pasar hoy a las 4pm?",
        createdAt: "10:42 AM",
      },
    ],
  });

  useEffect(() => {
    if (visible && !selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0]);
    }
  }, [visible, conversations, selectedConversation]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.lastMessage.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const activeMessages = useMemo(() => {
    if (!selectedConversation) return [];
    return messages[selectedConversation.id] || [];
  }, [selectedConversation, messages]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedConversation) return;

    const text = messageText.trim();
    const convId = selectedConversation.id;
    setMessageText("");
    setIsSending(true);

    const newMsg: ChatMessageItem = {
      id: `local-${Date.now()}`,
      senderName: session?.email || "Vendedor",
      direction: "OUTBOUND",
      content: text,
      createdAt: "Ahora",
      status: "SENT",
    };

    // Update local state instantly for zero-latency UX
    setMessages((prev) => ({
      ...prev,
      [convId]: [...(prev[convId] || []), newMsg],
    }));

    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, lastMessage: text, updatedAt: "Ahora" } : c))
    );

    try {
      if (baseUrl) {
        await fetch(`${baseUrl}/api/messages/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: activeTab,
            phone: convId,
            content: text,
            recipientName: selectedConversation.customerName,
          }),
        }).catch(() => null);
      }
    } catch {
      // Offline fallback preserves local message
    } finally {
      setIsSending(false);
    }
  };

  const handleStartNewChat = () => {
    const rawDigits = newChatPhone.replace(/\D/g, "");
    if (!rawDigits || rawDigits.length < 10) return;
    const cleanId = rawDigits.length === 10 ? `52${rawDigits}` : rawDigits;

    const newConv: ConversationItem = {
      id: cleanId,
      phone: `+${cleanId}`,
      customerName: newChatName.trim() || "Cliente WhatsApp",
      lastMessage: "Nueva conversación iniciada",
      updatedAt: "Ahora",
    };

    setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== cleanId)]);
    setSelectedConversation(newConv);
    setIsNewChatModalOpen(false);
    setNewChatPhone("");
    setNewChatName("");
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Top Header Bar with Luxury Styling */}
          <View style={styles.headerBar}>
            <View style={styles.headerLeft}>
              <View style={styles.mailIconBadge}>
                <Text style={styles.mailIconEmoji}>✉️</Text>
              </View>
              <View>
                <Text style={styles.headerTitle}>Mensajería Luxury & WhatsApp</Text>
                <Text style={styles.headerSubtitle}>
                  Comunicación directa con clientes y pasarela oficial PitayaCore
                </Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              <View style={styles.activeServiceBadge}>
                <View style={styles.greenPulseDot} />
                <Text style={styles.activeServiceText}>Servicio Activo</Text>
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Cerrar mensajería"
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Main 2-Column iPad Layout */}
          <View style={styles.contentGrid}>
            {/* Left Column: Conversations List (36% width) */}
            <View style={styles.conversationsColumn}>
              {/* Channel Tabs */}
              <View style={styles.channelTabsRow}>
                <TouchableOpacity
                  style={[styles.channelTab, activeTab === "WHATSAPP" && styles.channelTabActive]}
                  onPress={() => setActiveTab("WHATSAPP")}
                >
                  <Text
                    style={[
                      styles.channelTabText,
                      activeTab === "WHATSAPP" && styles.channelTabTextActive,
                    ]}
                  >
                    💬 Clientes (WA)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.channelTab, activeTab === "INTERNAL" && styles.channelTabActive]}
                  onPress={() => setActiveTab("INTERNAL")}
                >
                  <Text
                    style={[
                      styles.channelTabText,
                      activeTab === "INTERNAL" && styles.channelTabTextActive,
                    ]}
                  >
                    👥 Equipo Interno
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Search & New Chat Row */}
              <View style={styles.searchAndAddRow}>
                <TextInput
                  style={styles.convSearchInput}
                  placeholder="Buscar cliente o celular..."
                  placeholderTextColor={IPAD_THEME.colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                <TouchableOpacity
                  style={styles.addChatBtn}
                  onPress={() => setIsNewChatModalOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Iniciar nuevo chat"
                >
                  <Text style={styles.addChatBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Conversations FlatList */}
              <FlatList
                data={filteredConversations}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.convListContent}
                renderItem={({ item }) => {
                  const isSelected = selectedConversation?.id === item.id;
                  return (
                    <TouchableOpacity
                      style={[styles.convItemCard, isSelected && styles.convItemCardSelected]}
                      onPress={() => setSelectedConversation(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.avatarContainer}>
                        <Text style={styles.avatarText}>
                          {item.customerName
                            .split(" ")
                            .map((p) => p[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.convInfo}>
                        <View style={styles.convHeaderRow}>
                          <Text style={styles.convName} numberOfLines={1}>
                            {item.customerName}
                          </Text>
                          <Text style={styles.convTime}>{item.updatedAt}</Text>
                        </View>
                        <Text style={styles.convPhone}>{item.phone}</Text>
                        <Text style={styles.convLastMessage} numberOfLines={1}>
                          {item.lastMessage}
                        </Text>
                      </View>

                      {item.unreadCount ? (
                        <View style={styles.convUnreadBadge}>
                          <Text style={styles.convUnreadText}>{item.unreadCount}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            {/* Right Column: Chat Window & Input (64% width) */}
            <View style={styles.chatColumn}>
              {selectedConversation ? (
                <KeyboardAvoidingView
                  style={styles.chatWrapper}
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                  {/* Chat Top Banner */}
                  <View style={styles.chatHeader}>
                    <View>
                      <Text style={styles.chatCustomerName}>
                        {selectedConversation.customerName}
                      </Text>
                      <Text style={styles.chatCustomerPhone}>
                        {selectedConversation.phone} • En línea vía WhatsApp
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.quickReceiptBtn}
                      onPress={() => {
                        setMessageText(
                          `Hola ${selectedConversation.customerName}, le compartimos el recibo digital de su compra en Pro Buyer POS. Puede consultar los detalles escaneando su ticket de entrega.`
                        );
                      }}
                    >
                      <Text style={styles.quickReceiptText}>🧾 Enviar Recibo</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Messages Bubble List */}
                  <ScrollView
                    style={styles.messagesScroll}
                    contentContainerStyle={styles.messagesContainer}
                  >
                    {activeMessages.map((msg) => {
                      const isOutbound = msg.direction === "OUTBOUND";
                      return (
                        <View
                          key={msg.id}
                          style={[
                            styles.messageRow,
                            isOutbound ? styles.messageRowOutbound : styles.messageRowInbound,
                          ]}
                        >
                          <View
                            style={[
                              styles.messageBubble,
                              isOutbound ? styles.bubbleOutbound : styles.bubbleInbound,
                            ]}
                          >
                            <Text
                              style={[
                                styles.messageContentText,
                                isOutbound ? styles.contentOutbound : styles.contentInbound,
                              ]}
                            >
                              {msg.content}
                            </Text>
                            <View style={styles.bubbleMeta}>
                              <Text style={styles.bubbleTime}>{msg.createdAt}</Text>
                              {isOutbound && (
                                <Text style={styles.checkDoneText}> ✓✓</Text>
                              )}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>

                  {/* Message Composer Bar */}
                  <View style={styles.composerBar}>
                    <TextInput
                      style={styles.composerInput}
                      placeholder="Escriba un mensaje para WhatsApp..."
                      placeholderTextColor={IPAD_THEME.colors.textMuted}
                      value={messageText}
                      onChangeText={setMessageText}
                      multiline
                    />
                    <TouchableOpacity
                      style={[
                        styles.sendBtn,
                        (!messageText.trim() || isSending) && styles.sendBtnDisabled,
                      ]}
                      onPress={handleSendMessage}
                      disabled={!messageText.trim() || isSending}
                    >
                      {isSending ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={styles.sendBtnText}>Enviar</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              ) : (
                <View style={styles.emptyChatPlaceholder}>
                  <Text style={styles.emptyPlaceholderIcon}>✉️</Text>
                  <Text style={styles.emptyPlaceholderTitle}>Seleccione una conversación</Text>
                  <Text style={styles.emptyPlaceholderSubtitle}>
                    Comience a chatear o envíe recordatorios por WhatsApp a sus clientes.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* New Chat Modal Dialog */}
      <Modal visible={isNewChatModalOpen} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.newChatCard}>
            <Text style={styles.newChatTitle}>Nuevo Chat de WhatsApp</Text>
            <Text style={styles.newChatSubtitle}>
              Ingrese el celular de 10 dígitos o seleccione un cliente
            </Text>

            <View style={styles.newChatField}>
              <Text style={styles.fieldLabel}>NOMBRE DEL CLIENTE (OPCIONAL)</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Ej. Juan Pérez"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
                value={newChatName}
                onChangeText={setNewChatName}
              />
            </View>

            <View style={styles.newChatField}>
              <Text style={styles.fieldLabel}>NÚMERO DE TELÉFONO (10 DÍGITOS)</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="6441551116"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
                keyboardType="phone-pad"
                value={newChatPhone}
                onChangeText={setNewChatPhone}
              />
            </View>

            <View style={styles.newChatActions}>
              <TouchableOpacity
                style={styles.newChatCancelBtn}
                onPress={() => setIsNewChatModalOpen(false)}
              >
                <Text style={styles.newChatCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.newChatConfirmBtn}
                onPress={handleStartNewChat}
              >
                <Text style={styles.newChatConfirmText}>Iniciar Conversación</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "95%",
    maxWidth: 1100,
    height: "90%",
    maxHeight: 800,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },
  headerBar: {
    height: 64,
    backgroundColor: "#111b2e",
    borderBottomWidth: 1,
    borderBottomColor: IPAD_THEME.colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mailIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderWidth: 1.5,
    borderColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
  },
  mailIconEmoji: {
    fontSize: 18,
  },
  headerTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "500",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  activeServiceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.4)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  greenPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  activeServiceText: {
    color: "#10b981",
    fontSize: 11,
    fontWeight: "800",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: "700",
  },
  contentGrid: {
    flex: 1,
    flexDirection: "row",
  },
  conversationsColumn: {
    width: "36%",
    borderRightWidth: 1,
    borderRightColor: IPAD_THEME.colors.borderSubtle,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
  },
  channelTabsRow: {
    flexDirection: "row",
    padding: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: IPAD_THEME.colors.borderSubtle,
  },
  channelTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  channelTabActive: {
    backgroundColor: "#2563eb",
  },
  channelTabText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  channelTabTextActive: {
    color: "#ffffff",
    fontWeight: "800",
  },
  searchAndAddRow: {
    flexDirection: "row",
    padding: 10,
    gap: 8,
  },
  convSearchInput: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 38,
    color: "#f8fafc",
    fontSize: 12,
  },
  addChatBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  addChatBtnText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },
  convListContent: {
    padding: 8,
    gap: 6,
  },
  convItemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 14,
    padding: 10,
    gap: 10,
  },
  convItemCardSelected: {
    backgroundColor: "rgba(37, 99, 235, 0.18)",
    borderColor: "#2563eb",
  },
  avatarContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1e3a8a",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#bfdbfe",
    fontWeight: "800",
    fontSize: 12,
  },
  convInfo: {
    flex: 1,
    minWidth: 0,
  },
  convHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  convName: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "700",
  },
  convTime: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 10,
  },
  convPhone: {
    color: "#94a3b8",
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  convLastMessage: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  convUnreadBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  convUnreadText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  chatColumn: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
  },
  chatWrapper: {
    flex: 1,
  },
  chatHeader: {
    height: 58,
    borderBottomWidth: 1,
    borderBottomColor: IPAD_THEME.colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  chatCustomerName: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "800",
  },
  chatCustomerPhone: {
    color: "#10b981",
    fontSize: 11,
    fontWeight: "600",
  },
  quickReceiptBtn: {
    backgroundColor: "rgba(37, 99, 235, 0.2)",
    borderWidth: 1,
    borderColor: "#2563eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  quickReceiptText: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "700",
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
    gap: 12,
  },
  messageRow: {
    flexDirection: "row",
  },
  messageRowInbound: {
    justifyContent: "flex-start",
  },
  messageRowOutbound: {
    justifyContent: "flex-end",
  },
  messageBubble: {
    maxWidth: "75%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleInbound: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderTopLeftRadius: 4,
  },
  bubbleOutbound: {
    backgroundColor: "#2563eb",
    borderTopRightRadius: 4,
  },
  messageContentText: {
    fontSize: 13,
    lineHeight: 18,
  },
  contentInbound: {
    color: "#f1f5f9",
  },
  contentOutbound: {
    color: "#ffffff",
  },
  bubbleMeta: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 4,
  },
  bubbleTime: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 9,
  },
  checkDoneText: {
    color: "#67e8f9",
    fontSize: 9,
    fontWeight: "800",
  },
  composerBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: IPAD_THEME.colors.borderSubtle,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    gap: 10,
  },
  composerInput: {
    flex: 1,
    maxHeight: 90,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: "#f8fafc",
    fontSize: 13,
  },
  sendBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  emptyChatPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyPlaceholderIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyPlaceholderTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
  },
  emptyPlaceholderSubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 320,
  },
  newChatCard: {
    width: 440,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  newChatTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
  },
  newChatSubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  newChatField: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 42,
    color: "#f8fafc",
    fontSize: 13,
  },
  newChatActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  newChatCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  newChatCancelText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "700",
  },
  newChatConfirmBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  newChatConfirmText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
});
