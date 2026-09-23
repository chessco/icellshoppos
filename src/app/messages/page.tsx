"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import AppSidebar from "@/components/AppSidebar";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";
import LuxuryHeaderActions from "@/components/LuxuryHeaderActions";
import QRCode from "react-qr-code";

type WhatsAppConv = {
  id: string;
  conversationId: string;
  cleanPhone: string;
  formattedPhone: string;
  clientName: string;
  lastMessage: string;
  updatedAt: string;
  unread: number;
};

type InternalConv = {
  id: string;
  conversationId: string;
  partnerUserId: string;
  partnerName: string;
  partnerRole: string;
  lastMessage: string;
  updatedAt: string;
  unread: number;
};

type ChatMessage = {
  id: string;
  content: string;
  direction: "OUTBOUND" | "INBOUND";
  status: string;
  createdAt: string;
  mediaUrl?: string | null;
  senderName?: string | null;
};

type RecipientClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type?: string;
};

type RecipientTeamUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export default function MessagesPage() {
  const [activeTab, setActiveTab] = useState<"whatsapp" | "internal">("whatsapp");

  // WhatsApp State
  const [waConversations, setWaConversations] = useState<WhatsAppConv[]>([]);
  const [selectedWaPhone, setSelectedWaPhone] = useState<string | null>(null);
  const [waMessages, setWaMessages] = useState<ChatMessage[]>([]);
  const [newWaMessage, setNewWaMessage] = useState("");
  const [isWaLoading, setIsWaLoading] = useState(false);
  const [isWaSending, setIsWaSending] = useState(false);
  const [waSearchQuery, setWaSearchQuery] = useState("");
  const waScrollRef = useRef<HTMLDivElement>(null);

  // Internal Team State
  const [internalConversations, setInternalConversations] = useState<InternalConv[]>([]);
  const [selectedInternalId, setSelectedInternalId] = useState<string | null>(null);
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const [newInternalMessage, setNewInternalMessage] = useState("");
  const [isInternalLoading, setIsInternalLoading] = useState(false);
  const [isInternalSending, setIsInternalSending] = useState(false);
  const internalScrollRef = useRef<HTMLDivElement>(null);

  // Modals & Recipients
  const [isNewWaChatOpen, setIsNewWaChatOpen] = useState(false);
  const [customWaPhone, setCustomWaPhone] = useState("");
  const [isNewInternalChatOpen, setIsNewInternalChatOpen] = useState(false);
  const [availableClients, setAvailableClients] = useState<RecipientClient[]>([]);
  const [availableTeamUsers, setAvailableTeamUsers] = useState<RecipientTeamUser[]>([]);

  // Load WhatsApp Conversations
  const loadWaConversations = async () => {
    setIsWaLoading(true);
    try {
      const res = await fetch("/api/messages/conversations?tab=whatsapp", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const convs = Array.isArray(data.conversations) ? data.conversations : [];
        setWaConversations(convs);
        if (convs.length > 0 && !selectedWaPhone) {
          setSelectedWaPhone(convs[0].cleanPhone);
        }
      }
    } catch (err) {
      console.error("Error loading WhatsApp conversations:", err);
    } finally {
      setIsWaLoading(false);
    }
  };

  // Load Internal Conversations
  const loadInternalConversations = async () => {
    setIsInternalLoading(true);
    try {
      const res = await fetch("/api/messages/conversations?tab=internal", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const convs = Array.isArray(data.conversations) ? data.conversations : [];
        setInternalConversations(convs);
        if (convs.length > 0 && !selectedInternalId) {
          setSelectedInternalId(convs[0].partnerUserId);
        }
      }
    } catch (err) {
      console.error("Error loading internal conversations:", err);
    } finally {
      setIsInternalLoading(false);
    }
  };

  // Load Messages for current selected WhatsApp phone
  const loadWaMessages = async (phone: string) => {
    try {
      const res = await fetch(`/api/messages/history?channel=WHATSAPP&phone=${encodeURIComponent(phone)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setWaMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch (err) {
      console.error("Error loading WA messages:", err);
    }
  };

  // Load Messages for current selected internal user
  const loadInternalMessages = async (partnerUserId: string) => {
    try {
      const res = await fetch(`/api/messages/history?channel=INTERNAL&conversationId=${encodeURIComponent(partnerUserId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setInternalMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch (err) {
      console.error("Error loading internal messages:", err);
    }
  };

  // Load Recipients (clients and team users)
  const loadRecipients = async () => {
    try {
      const res = await fetch("/api/messages/recipients", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAvailableClients(data.clients || []);
        setAvailableTeamUsers(data.teamUsers || []);
      }
    } catch (err) {
      console.error("Error loading recipients:", err);
    }
  };

  // Initial Load
  useEffect(() => {
    loadWaConversations();
    loadInternalConversations();
    loadRecipients();
  }, []);

  // Sync selected WA phone
  useEffect(() => {
    if (selectedWaPhone && activeTab === "whatsapp") {
      loadWaMessages(selectedWaPhone);
    }
  }, [selectedWaPhone, activeTab]);

  // Sync selected Internal user
  useEffect(() => {
    if (selectedInternalId && activeTab === "internal") {
      loadInternalMessages(selectedInternalId);
    }
  }, [selectedInternalId, activeTab]);

  // Auto scroll
  useEffect(() => {
    if (waScrollRef.current) {
      waScrollRef.current.scrollTop = waScrollRef.current.scrollHeight;
    }
  }, [waMessages]);

  useEffect(() => {
    if (internalScrollRef.current) {
      internalScrollRef.current.scrollTop = internalScrollRef.current.scrollHeight;
    }
  }, [internalMessages]);

  // Send WhatsApp Message
  const handleSendWaMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWaMessage.trim() || !selectedWaPhone || isWaSending) return;

    const content = newWaMessage.trim();
    setNewWaMessage("");
    setIsWaSending(true);

    const targetConv = waConversations.find((c) => c.cleanPhone === selectedWaPhone);

    // Optimistic UI push
    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      content,
      direction: "OUTBOUND",
      status: "SENT",
      createdAt: new Date().toISOString(),
    };
    setWaMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "WHATSAPP",
          phone: selectedWaPhone,
          recipientName: targetConv?.clientName,
          content,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setWaMessages((prev) => prev.map((m) => (m.id === tempMsg.id ? data.message : m)));
        }
        // Update conversation in sidebar
        setWaConversations((prev) =>
          prev
            .map((c) =>
              c.cleanPhone === selectedWaPhone
                ? { ...c, lastMessage: content, updatedAt: new Date().toISOString() }
                : c
            )
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        );
      }
    } catch (err) {
      console.error("Failed to send WhatsApp message:", err);
    } finally {
      setIsWaSending(false);
    }
  };

  // Send Internal Message
  const handleSendInternalMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInternalMessage.trim() || !selectedInternalId || isInternalSending) return;

    const content = newInternalMessage.trim();
    setNewInternalMessage("");
    setIsInternalSending(true);

    const targetConv = internalConversations.find((c) => c.partnerUserId === selectedInternalId);

    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      content,
      direction: "OUTBOUND",
      status: "SENT",
      createdAt: new Date().toISOString(),
    };
    setInternalMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "INTERNAL",
          recipientUserId: selectedInternalId,
          recipientName: targetConv?.partnerName,
          content,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setInternalMessages((prev) => prev.map((m) => (m.id === tempMsg.id ? data.message : m)));
        }
        setInternalConversations((prev) =>
          prev
            .map((c) =>
              c.partnerUserId === selectedInternalId
                ? { ...c, lastMessage: content, updatedAt: new Date().toISOString() }
                : c
            )
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        );
      }
    } catch (err) {
      console.error("Failed to send internal message:", err);
    } finally {
      setIsInternalSending(false);
    }
  };

  // Start chat with client from modal
  const handleSelectClient = (client: RecipientClient) => {
    const rawPhone = client.phone ? client.phone.replace(/\D/g, "") : "";
    if (!rawPhone || rawPhone.length < 10) {
      alert("Este cliente no cuenta con un número de WhatsApp registrado válido.");
      return;
    }

    const cleanPhone = rawPhone.length === 10 ? `52${rawPhone}` : rawPhone;
    const formattedPhone =
      cleanPhone.length === 12 && cleanPhone.startsWith("52")
        ? `+52 ${cleanPhone.substring(2, 5)} ${cleanPhone.substring(5, 8)} ${cleanPhone.substring(8)}`
        : `+${cleanPhone}`;

    const exists = waConversations.find((c) => c.cleanPhone === cleanPhone);
    if (!exists) {
      const newConv: WhatsAppConv = {
        id: cleanPhone,
        conversationId: cleanPhone,
        cleanPhone,
        formattedPhone,
        clientName: client.name.toUpperCase(),
        lastMessage: "Nuevo chat WhatsApp",
        updatedAt: new Date().toISOString(),
        unread: 0,
      };
      setWaConversations((prev) => [newConv, ...prev]);
    }

    setSelectedWaPhone(cleanPhone);
    setIsNewWaChatOpen(false);
  };

  // Start chat with custom phone
  const handleStartCustomPhone = () => {
    const rawDigits = customWaPhone.replace(/\D/g, "");
    if (rawDigits.length < 10) {
      alert("Por favor ingresa un número de teléfono válido (mínimo 10 dígitos).");
      return;
    }

    const cleanPhone = rawDigits.length === 10 ? `52${rawDigits}` : rawDigits;
    const formattedPhone =
      cleanPhone.length === 12 && cleanPhone.startsWith("52")
        ? `+52 ${cleanPhone.substring(2, 5)} ${cleanPhone.substring(5, 8)} ${cleanPhone.substring(8)}`
        : `+${cleanPhone}`;

    const exists = waConversations.find((c) => c.cleanPhone === cleanPhone);
    if (!exists) {
      const newConv: WhatsAppConv = {
        id: cleanPhone,
        conversationId: cleanPhone,
        cleanPhone,
        formattedPhone,
        clientName: `CLIENTE (${formattedPhone})`,
        lastMessage: "Nuevo chat WhatsApp",
        updatedAt: new Date().toISOString(),
        unread: 0,
      };
      setWaConversations((prev) => [newConv, ...prev]);
    }

    setSelectedWaPhone(cleanPhone);
    setIsNewWaChatOpen(false);
    setCustomWaPhone("");
  };

  // Filtered WA conversations
  const filteredWaConversations = useMemo(() => {
    if (!waSearchQuery.trim()) return waConversations;
    const q = waSearchQuery.toLowerCase();
    return waConversations.filter(
      (c) =>
        c.clientName.toLowerCase().includes(q) ||
        c.formattedPhone.toLowerCase().includes(q) ||
        c.cleanPhone.includes(q)
    );
  }, [waConversations, waSearchQuery]);

  const selectedWaConv = waConversations.find((c) => c.cleanPhone === selectedWaPhone);
  const selectedInternalConv = internalConversations.find((c) => c.partnerUserId === selectedInternalId);

  // Quick ticket / receipt template
  const handleInsertReceiptTemplate = () => {
    if (!selectedWaConv) return;
    const orderNo = `ORD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const dateStr = new Date().toLocaleDateString("es-MX");
    const trackingUrl = `https://probuyer.org/receipt/${orderNo}`;
    const template = `*PRO BUYER POS* 📱\n\n*Fecha:* ${dateStr}\n*Cliente:* ${selectedWaConv.clientName}\n*No. Orden:* ${orderNo}\n*Concepto:* VENTA / COMPRA EN MOSTRADOR\n*Status:* PAGADO\n\n🌐 *Ver seguimiento y recibo en línea:*\n${trackingUrl}\n\n¡Gracias por tu preferencia! ✨`;
    setNewWaMessage(template);
  };

  return (
    <div className="app-shell">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-30 border-b border-[#d6e4ff] bg-[rgba(244,248,255,0.95)] px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 text-sm text-[#0f1f3d]">
          <div className="flex items-center gap-3">
            <CurrentOrgBadge hideActions />
            <span className="h-4 w-px bg-slate-300 hidden md:block" />
            <span className="font-semibold text-xs uppercase tracking-widest text-slate-500 hidden md:block">
              Centro de Mensajería & WhatsApp
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Luxury Top Navigation Tabs */}
            <div className="flex items-center gap-2 bg-white/90 border border-[#c7dcff] p-1.5 rounded-2xl shadow-sm">
              <button
                onClick={() => {
                  setActiveTab("internal");
                  loadInternalConversations();
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === "internal"
                    ? "bg-[#0f1f3d] text-white shadow-md"
                    : "text-[#5f7298] hover:text-[#0f1f3d] hover:bg-[#eef5ff]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
                <span>Mensajes Internos</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab("whatsapp");
                  loadWaConversations();
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all relative ${
                  activeTab === "whatsapp"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "text-[#5f7298] hover:text-[#0f1f3d] hover:bg-[#eef5ff]"
                }`}
              >
                <svg className="w-4 h-4 text-emerald-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.669-.699c.969.54 1.761.82 2.79.82 3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.806-5.767-5.806zm0 10.354c-.901 0-1.637-.25-2.433-.699l-.174-.099-1.58.414.422-1.54-.113-.18c-.521-.83-.797-1.58-.796-2.477.001-2.527 2.057-4.583 4.674-4.583 2.527 0 4.583 2.056 4.583 4.583 0 2.527-2.056 4.581-4.583 4.581zm2.51-3.44c-.137-.069-.812-.401-.938-.447-.126-.046-.217-.069-.309.069-.092.138-.354.447-.434.54-.08.092-.16.104-.298.035-.138-.069-.583-.215-1.11-.685-.411-.366-.689-.819-.77-.957-.08-.138-.008-.213.061-.281.062-.062.138-.16.207-.241.069-.08.092-.138.138-.23.046-.092.023-.172-.011-.241-.035-.069-.309-.745-.424-1.02-.112-.269-.226-.232-.309-.236l-.264-.005c-.092 0-.241.034-.367.172-.126.138-.481.47-.481 1.146 0 .676.493 1.329.562 1.421.069.092.969 1.48 2.348 2.077.328.142.584.227.784.29.33.105.631.09.869.055.265-.04.812-.332.927-.652.115-.321.115-.596.08-.652-.034-.058-.126-.092-.263-.161z" />
                </svg>
                <span>Clientes (WhatsApp)</span>
                <span className="size-2 rounded-full bg-emerald-400 animate-ping"></span>
              </button>
            </div>

            {/* Luxury Notification and Mail Icons */}
            <LuxuryHeaderActions />
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname="/messages" />

        <main className="min-w-0 p-4 md:p-6">
          {/* TAB 1: WHATSAPP CUSTOMER MESSAGES */}
          {activeTab === "whatsapp" && (
            <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-5">
              {/* Left Column: WhatsApp Conversations */}
              <div className="w-full lg:w-84 flex flex-col bg-white border border-[#c7dcff] rounded-[28px] overflow-hidden shadow-sm">
                <div className="p-5 border-b border-[#e2edff] space-y-3.5 bg-gradient-to-b from-[#f8faff] to-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-[#0f1f3d] text-lg font-black uppercase tracking-wider flex items-center gap-2">
                        <span className="text-emerald-600">
                          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.669-.699c.969.54 1.761.82 2.79.82 3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.806-5.767-5.806zm0 10.354c-.901 0-1.637-.25-2.433-.699l-.174-.099-1.58.414.422-1.54-.113-.18c-.521-.83-.797-1.58-.796-2.477.001-2.527 2.057-4.583 4.674-4.583 2.527 0 4.583 2.056 4.583 4.583 0 2.527-2.056 4.581-4.583 4.581zm2.51-3.44c-.137-.069-.812-.401-.938-.447-.126-.046-.217-.069-.309.069-.092.138-.354.447-.434.54-.08.092-.16.104-.298.035-.138-.069-.583-.215-1.11-.685-.411-.366-.689-.819-.77-.957-.08-.138-.008-.213.061-.281.062-.062.138-.16.207-.241.069-.08.092-.138.138-.23.046-.092.023-.172-.011-.241-.035-.069-.309-.745-.424-1.02-.112-.269-.226-.232-.309-.236l-.264-.005c-.092 0-.241.034-.367.172-.126.138-.481.47-.481 1.146 0 .676.493 1.329.562 1.421.069.092.969 1.48 2.348 2.077.328.142.584.227.784.29.33.105.631.09.869.055.265-.04.812-.332.927-.652.115-.321.115-.596.08-.652-.034-.058-.126-.092-.263-.161z" />
                          </svg>
                        </span>
                        WhatsApp
                      </h2>
                      <p className="text-[#5f7298] text-[10px] font-bold uppercase tracking-wider mt-0.5">
                        Mensajería PitayaCore
                      </p>
                    </div>
                    <button
                      onClick={() => setIsNewWaChatOpen(true)}
                      className="size-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all"
                      title="Nuevo Chat WhatsApp"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={waSearchQuery}
                      onChange={(e) => setWaSearchQuery(e.target.value)}
                      placeholder="Buscar cliente o celular..."
                      className="w-full bg-[#f4f8ff] border border-[#c7dcff] rounded-xl py-2 pl-9 pr-3 text-xs text-[#0f1f3d] placeholder:text-slate-400 outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Conversation items list */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                  {isWaLoading ? (
                    <div className="p-6 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                      Cargando conversaciones...
                    </div>
                  ) : filteredWaConversations.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                      Sin conversaciones de WhatsApp
                    </div>
                  ) : (
                    filteredWaConversations.map((conv) => {
                      const isSelected = selectedWaPhone === conv.cleanPhone;
                      const partnerInitial = conv.clientName.substring(0, 2).toUpperCase();

                      return (
                        <button
                          key={conv.cleanPhone}
                          onClick={() => setSelectedWaPhone(conv.cleanPhone)}
                          className={`w-full p-3.5 rounded-2xl flex items-center gap-3.5 transition-all text-left ${
                            isSelected
                              ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                              : "hover:bg-[#f1f6ff] text-[#0f1f3d]"
                          }`}
                        >
                          <div
                            className={`size-11 rounded-2xl flex items-center justify-center font-black text-xs relative shrink-0 ${
                              isSelected
                                ? "bg-white text-emerald-700"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}
                          >
                            {partnerInitial}
                            <span className="absolute -bottom-1 -right-1 size-4 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-2 ring-white">
                              <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
                                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.669-.699c.969.54 1.761.82 2.79.82 3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.806-5.767-5.806zm0 10.354c-.901 0-1.637-.25-2.433-.699l-.174-.099-1.58.414.422-1.54-.113-.18c-.521-.83-.797-1.58-.796-2.477.001-2.527 2.057-4.583 4.674-4.583 2.527 0 4.583 2.056 4.583 4.583 0 2.527-2.056 4.581-4.583 4.581zm2.51-3.44c-.137-.069-.812-.401-.938-.447-.126-.046-.217-.069-.309.069-.092.138-.354.447-.434.54-.08.092-.16.104-.298.035-.138-.069-.583-.215-1.11-.685-.411-.366-.689-.819-.77-.957-.08-.138-.008-.213.061-.281.062-.062.138-.16.207-.241.069-.08.092-.138.138-.23.046-.092.023-.172-.011-.241-.035-.069-.309-.745-.424-1.02-.112-.269-.226-.232-.309-.236l-.264-.005c-.092 0-.241.034-.367.172-.126.138-.481.47-.481 1.146 0 .676.493 1.329.562 1.421.069.092.969 1.48 2.348 2.077.328.142.584.227.784.29.33.105.631.09.869.055.265-.04.812-.332.927-.652.115-.321.115-.596.08-.652-.034-.058-.126-.092-.263-.161z" />
                              </svg>
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                              <span className={`font-black text-xs uppercase truncate ${isSelected ? "text-white" : "text-[#0f1f3d]"}`}>
                                {conv.clientName}
                              </span>
                              <span className={`text-[9px] font-bold shrink-0 ml-1 ${isSelected ? "text-emerald-100" : "text-slate-400"}`}>
                                {conv.updatedAt ? new Date(conv.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                              </span>
                            </div>

                            <p className={`text-[10px] font-bold tracking-wider mb-0.5 truncate ${isSelected ? "text-emerald-100" : "text-emerald-700"}`}>
                              📱 {conv.formattedPhone}
                            </p>

                            <p className={`text-[10px] truncate ${isSelected ? "text-white/80" : "text-slate-500"}`}>
                              {conv.lastMessage?.replace(/https?:\/\/[^\s]+/g, "📷 [Código]").trim()}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: WhatsApp Chat Area */}
              <div className="flex-1 flex flex-col bg-white border border-[#c7dcff] rounded-[28px] overflow-hidden shadow-sm">
                {selectedWaConv ? (
                  <>
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-[#e2edff] flex items-center justify-between bg-gradient-to-r from-emerald-50/50 via-white to-white border-l-4 border-l-emerald-500">
                      <div className="flex items-center gap-3.5">
                        <div className="size-11 rounded-2xl bg-emerald-100 text-emerald-700 font-black text-xs flex items-center justify-center border border-emerald-200">
                          {selectedWaConv.clientName.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-[#0f1f3d] font-black text-base uppercase tracking-tight">
                            {selectedWaConv.clientName}
                          </h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-emerald-700 text-xs font-bold">
                              Transmisión WhatsApp: <span className="font-mono">{selectedWaConv.formattedPhone}</span>
                            </span>
                            <span className="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleInsertReceiptTemplate}
                          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                          </svg>
                          <span>Enviar Recibo con QR</span>
                        </button>

                        <div className="px-3 py-1.5 rounded-full bg-emerald-100/70 border border-emerald-200 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                          Canal PitayaCore WA
                        </div>
                      </div>
                    </div>

                    {/* Messages History Stream */}
                    <div ref={waScrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f8fbff]">
                      {waMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                          <div className="size-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                            <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.669-.699c.969.54 1.761.82 2.79.82 3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.806-5.767-5.806zm0 10.354c-.901 0-1.637-.25-2.433-.699l-.174-.099-1.58.414.422-1.54-.113-.18c-.521-.83-.797-1.58-.796-2.477.001-2.527 2.057-4.583 4.674-4.583 2.527 0 4.583 2.056 4.583 4.583 0 2.527-2.056 4.581-4.583 4.581z" />
                            </svg>
                          </div>
                          <p className="text-xs font-bold uppercase tracking-widest text-[#0f1f3d]">
                            Inicia la conversación por WhatsApp con {selectedWaConv.clientName}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
                            Los mensajes enviados se transmitirán instantáneamente al número del cliente por la pasarela PitayaCore.
                          </p>
                        </div>
                      ) : (
                        waMessages.map((msg) => {
                          const isOutbound = msg.direction === "OUTBOUND";
                          const urlMatch = msg.content?.match(/(https?:\/\/[^\s]+)/i);
                          const extractedUrl = urlMatch ? urlMatch[0] : null;

                          return (
                            <div key={msg.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                              <div className="max-w-[80%] group">
                                <div
                                  className={`p-4 rounded-2xl text-xs font-medium shadow-sm leading-relaxed ${
                                    isOutbound
                                      ? "bg-emerald-600 text-white rounded-tr-none"
                                      : "bg-white text-[#0f1f3d] rounded-tl-none border border-[#d6e4ff]"
                                  }`}
                                >
                                  {/* Render QR code card if URL exists or is tracking receipt */}
                                  {extractedUrl && (
                                    <div className="mb-3 p-3 bg-white rounded-xl flex flex-col items-center justify-center text-slate-800 shadow-inner border border-emerald-500/20">
                                      <div className="bg-white p-2 rounded-lg">
                                        <QRCode value={extractedUrl} size={130} />
                                      </div>
                                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 mt-2">
                                        Escanear Código de Orden / Ticket
                                      </span>
                                    </div>
                                  )}

                                  <div className="whitespace-pre-wrap">{msg.content}</div>

                                  <div
                                    className={`text-[9px] font-bold uppercase tracking-wider mt-2 flex items-center justify-end gap-1 ${
                                      isOutbound ? "text-emerald-100" : "text-slate-400"
                                    }`}
                                  >
                                    <span>
                                      {new Date(msg.createdAt).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                    {isOutbound && (
                                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                        <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z" />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Bottom Message Composer */}
                    <form onSubmit={handleSendWaMessage} className="p-4 border-t border-[#e2edff] bg-white">
                      <div className="flex items-center gap-3">
                        <textarea
                          rows={1}
                          value={newWaMessage}
                          onChange={(e) => setNewWaMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendWaMessage(e);
                            }
                          }}
                          placeholder={`Enviar WhatsApp a ${selectedWaConv.clientName}...`}
                          className="flex-1 bg-[#f4f8ff] border border-[#c7dcff] rounded-2xl py-3 px-4 text-xs text-[#0f1f3d] placeholder:text-slate-400 focus:border-emerald-500 outline-none transition-all resize-none shadow-sm"
                        />
                        <button
                          type="submit"
                          disabled={!newWaMessage.trim() || isWaSending}
                          className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50 shrink-0"
                        >
                          <span>{isWaSending ? "Enviando..." : "Enviar"}</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
                    <div className="size-20 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                      <svg className="w-10 h-10 fill-current" viewBox="0 0 24 24">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.669-.699c.969.54 1.761.82 2.79.82 3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.806-5.767-5.806zm0 10.354c-.901 0-1.637-.25-2.433-.699l-.174-.099-1.58.414.422-1.54-.113-.18c-.521-.83-.797-1.58-.796-2.477.001-2.527 2.057-4.583 4.674-4.583 2.527 0 4.583 2.056 4.583 4.583 0 2.527-2.056 4.581-4.583 4.581z" />
                      </svg>
                    </div>
                    <h3 className="text-[#0f1f3d] text-lg font-black uppercase tracking-wider">
                      Mensajería WhatsApp de Clientes
                    </h3>
                    <p className="text-slate-500 text-xs font-medium max-w-sm mt-2">
                      Selecciona un cliente de la lista para ver el historial o transmitir mensajes en tiempo real vía PitayaCore.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: INTERNAL TEAM MESSAGES */}
          {activeTab === "internal" && (
            <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-5">
              {/* Left Column: Team Members */}
              <div className="w-full lg:w-84 flex flex-col bg-white border border-[#c7dcff] rounded-[28px] overflow-hidden shadow-sm">
                <div className="p-5 border-b border-[#e2edff] flex items-center justify-between bg-gradient-to-b from-[#f8faff] to-white">
                  <div>
                    <h2 className="text-[#0f1f3d] text-lg font-black uppercase tracking-wider">
                      Mensajes
                    </h2>
                    <p className="text-[#5f7298] text-[10px] font-bold uppercase tracking-wider mt-0.5">
                      Chat del Equipo
                    </p>
                  </div>
                  <button
                    onClick={() => setIsNewInternalChatOpen(true)}
                    className="size-9 rounded-xl bg-[#0f1f3d] text-white flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all"
                    title="Nuevo Mensaje Interno"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                  {isInternalLoading ? (
                    <div className="p-6 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                      Cargando equipo...
                    </div>
                  ) : internalConversations.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                      Sin compañeros de equipo
                    </div>
                  ) : (
                    internalConversations.map((conv) => {
                      const isSelected = selectedInternalId === conv.partnerUserId;
                      const partnerInitial = conv.partnerName.substring(0, 2).toUpperCase();

                      return (
                        <button
                          key={conv.partnerUserId}
                          onClick={() => setSelectedInternalId(conv.partnerUserId)}
                          className={`w-full p-3.5 rounded-2xl flex items-center gap-3.5 transition-all text-left ${
                            isSelected
                              ? "bg-[#0f1f3d] text-white shadow-md shadow-[#0f1f3d]/20"
                              : "hover:bg-[#f1f6ff] text-[#0f1f3d]"
                          }`}
                        >
                          <div
                            className={`size-11 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 ${
                              isSelected
                                ? "bg-white text-[#0f1f3d]"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {partnerInitial}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                              <span className={`font-black text-xs uppercase truncate ${isSelected ? "text-white" : "text-[#0f1f3d]"}`}>
                                {conv.partnerName}
                              </span>
                              <span className={`text-[9px] font-bold shrink-0 ml-1 ${isSelected ? "text-blue-100" : "text-slate-400"}`}>
                                {conv.updatedAt && conv.updatedAt !== new Date(0).toISOString()
                                  ? new Date(conv.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                  : ""}
                              </span>
                            </div>

                            <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isSelected ? "text-blue-200" : "text-blue-700"}`}>
                              {conv.partnerRole}
                            </p>

                            <p className={`text-[10px] truncate ${isSelected ? "text-white/80" : "text-slate-500"}`}>
                              {conv.lastMessage}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Internal Chat Area */}
              <div className="flex-1 flex flex-col bg-white border border-[#c7dcff] rounded-[28px] overflow-hidden shadow-sm">
                {selectedInternalConv ? (
                  <>
                    <div className="px-6 py-4 border-b border-[#e2edff] flex items-center justify-between bg-gradient-to-r from-blue-50/50 via-white to-white">
                      <div className="flex items-center gap-3.5">
                        <div className="size-11 rounded-2xl bg-blue-100 text-blue-800 font-black text-xs flex items-center justify-center border border-blue-200">
                          {selectedInternalConv.partnerName.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-[#0f1f3d] font-black text-base uppercase tracking-tight">
                            {selectedInternalConv.partnerName}
                          </h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                              {selectedInternalConv.partnerRole} · En línea
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div ref={internalScrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f8fbff]">
                      {internalMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                          <p className="text-xs font-bold uppercase tracking-widest text-[#0f1f3d]">
                            Conversación interna con {selectedInternalConv.partnerName}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Envía notas, dudas o avisos en tiempo real sobre órdenes e inventario.
                          </p>
                        </div>
                      ) : (
                        internalMessages.map((msg) => {
                          const isOutbound = msg.direction === "OUTBOUND";
                          return (
                            <div key={msg.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                              <div className="max-w-[75%] group">
                                <div
                                  className={`p-4 rounded-2xl text-xs font-medium shadow-sm leading-relaxed ${
                                    isOutbound
                                      ? "bg-[#0f1f3d] text-white rounded-tr-none"
                                      : "bg-white text-[#0f1f3d] rounded-tl-none border border-[#d6e4ff]"
                                  }`}
                                >
                                  <div>{msg.content}</div>
                                  <div
                                    className={`text-[8px] font-black uppercase tracking-wider mt-1 text-right ${
                                      isOutbound ? "text-blue-200" : "text-slate-400"
                                    }`}
                                  >
                                    {new Date(msg.createdAt).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <form onSubmit={handleSendInternalMessage} className="p-4 border-t border-[#e2edff] bg-white">
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={newInternalMessage}
                          onChange={(e) => setNewInternalMessage(e.target.value)}
                          placeholder={`Escribe un mensaje interno a ${selectedInternalConv.partnerName}...`}
                          className="flex-1 bg-[#f4f8ff] border border-[#c7dcff] rounded-2xl py-3 px-4 text-xs text-[#0f1f3d] placeholder:text-slate-400 focus:border-[#0f1f3d] outline-none transition-all shadow-sm"
                        />
                        <button
                          type="submit"
                          disabled={!newInternalMessage.trim() || isInternalSending}
                          className="px-6 py-3 rounded-2xl bg-[#0f1f3d] hover:bg-[#1d4ed8] text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50 shrink-0"
                        >
                          <span>{isInternalSending ? "Enviando..." : "Enviar"}</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
                    <h3 className="text-[#0f1f3d] text-lg font-black uppercase tracking-wider">
                      Conversaciones Internas
                    </h3>
                    <p className="text-slate-500 text-xs font-medium max-w-sm mt-2">
                      Selecciona un miembro del equipo para comunicarte internamente.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MODAL: Nuevo Chat WhatsApp */}
          {isNewWaChatOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-md bg-white border border-[#c7dcff] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-5 border-b border-[#e2edff] flex justify-between items-center bg-emerald-50">
                  <div className="flex items-center gap-2.5">
                    <span className="size-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.669-.699c.969.54 1.761.82 2.79.82 3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.806-5.767-5.806zm0 10.354c-.901 0-1.637-.25-2.433-.699l-.174-.099-1.58.414.422-1.54-.113-.18c-.521-.83-.797-1.58-.796-2.477.001-2.527 2.057-4.583 4.674-4.583 2.527 0 4.583 2.056 4.583 4.583 0 2.527-2.056 4.581-4.583 4.581z" />
                      </svg>
                    </span>
                    <h3 className="text-[#0f1f3d] font-black uppercase tracking-wider text-sm">
                      Nuevo Chat WhatsApp
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsNewWaChatOpen(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-5">
                  {/* Direct Phone Number */}
                  <div className="p-4 bg-[#f8fbff] border border-[#c7dcff] rounded-2xl space-y-2.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                      Escribir número directo (10 dígitos)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customWaPhone}
                        onChange={(e) => setCustomWaPhone(e.target.value)}
                        placeholder="ej. 6441551116"
                        className="flex-1 bg-white border border-[#c7dcff] rounded-xl py-2 px-3 text-xs text-[#0f1f3d] font-mono outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={handleStartCustomPhone}
                        disabled={!customWaPhone.trim()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                      >
                        Abrir
                      </button>
                    </div>
                  </div>

                  {/* Registered Clients */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2.5 px-1">
                      O seleccionar cliente registrado en el POS
                    </p>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {availableClients.length === 0 ? (
                        <p className="text-center text-slate-400 text-xs py-4">No hay clientes con teléfono</p>
                      ) : (
                        availableClients.map((client) => (
                          <button
                            key={client.id}
                            onClick={() => handleSelectClient(client)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#f1f6ff] transition-all text-left border border-slate-100 hover:border-emerald-300"
                          >
                            <div className="size-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-xs shrink-0">
                              {client.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[#0f1f3d] font-black text-xs uppercase truncate">
                                {client.name}
                              </h4>
                              <p className="text-emerald-700 text-[10px] font-bold tracking-wider mt-0.5">
                                📱 {client.phone || "Sin teléfono"}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODAL: Nuevo Mensaje Interno */}
          {isNewInternalChatOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-md bg-white border border-[#c7dcff] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-5 border-b border-[#e2edff] flex justify-between items-center bg-[#f8fbff]">
                  <h3 className="text-[#0f1f3d] font-black uppercase tracking-wider text-sm">
                    Nuevo Mensaje Interno
                  </h3>
                  <button
                    onClick={() => setIsNewInternalChatOpen(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 px-1">
                    Seleccionar Miembro del Equipo
                  </p>
                  {availableTeamUsers.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs py-6">No hay otros miembros en la organización</p>
                  ) : (
                    availableTeamUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          setSelectedInternalId(u.id);
                          setIsNewInternalChatOpen(false);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#f1f6ff] transition-all text-left border border-slate-100 hover:border-blue-300"
                      >
                        <div className="size-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black text-xs shrink-0">
                          {u.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[#0f1f3d] font-black text-xs uppercase truncate">{u.name}</h4>
                          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">{u.role}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
