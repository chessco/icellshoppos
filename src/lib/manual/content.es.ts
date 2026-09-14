import type { ManualContent } from "@/lib/manual/types";

export const manualContentEs: ManualContent = {
  title: "Manual de Usuario iCellShop",
  subtitle: "Guía de cada página principal, funciones clave y conexión entre flujos.",
  updatedAt: "2026-03-15",
  sections: [
    {
      id: "dashboard",
      title: "Panel",
      summary: "Centro rápido de control con resumen de inventario, ventas y actividades pendientes.",
      features: [
        {
          title: "Resumen del Negocio",
          description: "Consulta totales e indicadores para entender el rendimiento actual de la tienda.",
          routes: ["/dashboard"],
        },
        {
          title: "Entrada a Operaciones Diarias",
          description: "Usa accesos directos para ir a inventario, ventas y solicitudes.",
          routes: ["/dashboard", "/inventory", "/sales", "/inventory-requests"],
        },
      ],
      connections: [
        "Los cambios en inventario y ventas se reflejan en métricas del panel.",
        "Las solicitudes pendientes visibles aquí se atienden en Solicitudes de Inventario.",
      ],
    },
    {
      id: "inventory",
      title: "Gestión de Inventario",
      summary: "Ciclo completo de inventario: alta, actualización, etiquetado, importación y control de stock.",
      features: [
        {
          title: "Inventario Completo",
          description: "Busca, filtra y actualiza equipos con modelo, capacidad, grado, costo y precio de venta.",
          routes: ["/inventory"],
        },
        {
          title: "Agregar Equipo",
          description: "Registra nuevos equipos, detecta IMEI duplicado y actualiza registros existentes.",
          routes: ["/add-device"],
        },
        {
          title: "Diseñador de Etiquetas",
          description: "Crea y aplica etiquetas imprimibles para equipos y presentación de inventario.",
          routes: ["/label-designer"],
        },
        {
          title: "Administración de Datos",
          description: "Importa/actualiza datos masivos para mantener calidad en registros.",
          routes: ["/data"],
        },
      ],
      connections: [
        "Los equipos dados de alta pasan a Inventario Completo y Punto de Venta.",
        "Las plantillas del Diseñador se usan para imprimir etiquetas.",
        "Las importaciones impactan disponibilidad, precios y reportes de ventas.",
      ],
    },
    {
      id: "sales",
      title: "Ventas y Crédito",
      summary: "Flujo de cobro, controles de cancelación y análisis histórico del desempeño.",
      features: [
        {
          title: "Punto de Venta",
          description: "Arma carrito, asigna datos de cliente y finaliza ventas.",
          routes: ["/sales"],
        },
        {
          title: "Cancelar Venta",
          description: "Revierte ventas elegibles y regresa stock cuando aplique.",
          routes: ["/sales/cancel"],
        },
        {
          title: "Historial de Ventas",
          description: "Consulta transacciones con filtros por estado, búsqueda y cliente, además de totales y margen.",
          routes: ["/sales/history"],
        },
        {
          title: "Crédito",
          description: "Gestiona operaciones relacionadas con ventas financiadas y pagos.",
          routes: ["/credit"],
        },
      ],
      connections: [
        "Las ventas completadas aparecen en Historial con métricas de utilidad.",
        "Las cancelaciones impactan disponibilidad de inventario y reportes.",
      ],
    },
    {
      id: "purchase-flow",
      title: "Solicitudes de Compra y Ofertas",
      summary: "Recibe solicitudes de clientes, compara precio por nivel vs oferta y aprueba por artículo.",
      features: [
        {
          title: "Inventario Público y Captura",
          description: "Los clientes envían solicitudes de artículos desde tu página pública.",
          routes: ["/[slug]", "/public-inventory"],
        },
        {
          title: "Órdenes de Compra",
          description: "Revisa artículos solicitados, compara nivel/oferta, acepta por artículo y crea carrito.",
          routes: ["/purchase-orders"],
        },
        {
          title: "Solicitudes de Inventario",
          description: "Atiende flujos internos de solicitudes y cantidades pendientes.",
          routes: ["/inventory-requests"],
        },
      ],
      connections: [
        "Si ofertas está habilitado, cada artículo con oferta debe aceptarse antes de crear carrito.",
        "Los artículos aceptados pasan al flujo de ventas en carrito.",
      ],
    },
    {
      id: "public-inventory-settings",
      title: "Configuración de Inventario Público",
      summary: "Controla lo que el cliente externo puede ver y enviar, incluyendo modo opcional de ofertas.",
      features: [
        {
          title: "Visibilidad y Columnas",
          description: "Define campos visibles y comportamiento de listado público.",
          routes: ["/public-inventory-settings"],
        },
        {
          title: "Permitir Ofertas",
          description: "Habilita ofertas opcionales por artículo en MXN o USD.",
          routes: ["/public-inventory-settings", "/purchase-orders"],
        },
      ],
      connections: [
        "La configuración modifica la experiencia de la tienda pública en la ruta con slug.",
        "Los ajustes de ofertas activan lógica de comparación y aceptación en Órdenes de Compra.",
      ],
    },
    {
      id: "imeicheck2",
      title: "Integración IMEICHECK2",
      summary: "Validación por IMEI, consulta de servicios, historial y aceleración del alta a inventario.",
      features: [
        {
          title: "Vinculación de Integración",
          description: "Conecta la cuenta de la organización y carga servicios disponibles.",
          routes: ["/imeicheck2"],
        },
        {
          title: "Consultas IMEI e Historial",
          description: "Envía verificaciones, inspecciona respuestas y conserva historial.",
          routes: ["/imeicheck2"],
        },
        {
          title: "Prefill a Agregar Equipo",
          description: "Envía datos parseados al formulario de alta para reducir captura manual.",
          routes: ["/imeicheck2", "/add-device"],
        },
      ],
      connections: [
        "Los resultados IMEI pueden rellenar automáticamente Agregar Equipo.",
        "El estado de vinculación define si IMEICHECK2 aparece en el menú lateral.",
      ],
    },
    {
      id: "profile-org",
      title: "Perfil, Equipo y Organización",
      summary: "Gestiona perfil, idioma, contraseña, permisos, invitaciones y branding de organización.",
      features: [
        {
          title: "Perfil de Usuario",
          description: "Actualiza nombre, WhatsApp e idioma preferido.",
          routes: ["/profile"],
        },
        {
          title: "Seguridad",
          description: "Cambia contraseña y administra acciones de sesión.",
          routes: ["/profile"],
        },
        {
          title: "Equipo e Invitaciones",
          description: "Asigna roles/permisos e invita colaboradores.",
          routes: ["/profile"],
        },
        {
          title: "Branding de Organización",
          description: "Sube o actualiza logotipo usado en app y páginas públicas.",
          routes: ["/profile", "/public-inventory", "/dashboard"],
        },
      ],
      connections: [
        "El idioma preferido se aplica en toda la interfaz traducida.",
        "Los permisos del equipo controlan acceso a inventario, datos y acciones de ventas.",
      ],
    },
    {
      id: "billing-admin",
      title: "Facturación y Herramientas Admin",
      summary: "Ciclo de suscripción por organización y controles elevados para superadmin.",
      features: [
        {
          title: "Facturación",
          description: "Da seguimiento al estado, plan y periodos de suscripción.",
          routes: ["/billing"],
        },
        {
          title: "Facturación/Planes/Usuarios Superadmin",
          description: "Administra organizaciones, planes, usuarios y operaciones globales.",
          routes: ["/admin/billing", "/admin/plans", "/admin/users", "/admin/organizations", "/admin/logs"],
        },
      ],
      connections: [
        "El plan y estado de suscripción influyen en disponibilidad de funciones.",
        "Las herramientas admin soportan operación y soporte a nivel plataforma.",
      ],
    },
  ],
};
