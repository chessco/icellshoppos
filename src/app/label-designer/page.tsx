"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { fetchOrgLogoDataUrl } from "@/lib/org-logo";
import {
  AVAILABLE_LABEL_FIELDS,
  FIELD_EXAMPLE_BY_PLACEHOLDER,
  QR_FIELD_OPTIONS,
  buildLabelDataMap,
  buildQrPayload,
  replaceLabelPlaceholders,
} from "@/lib/label-template";

type FabricObject = {
  type?: string;
  text?: string;
  textPlaceholder?: string;
  fontSize?: number;
  fontWeight?: string | number;
  isBarcode?: boolean;
  isLogo?: boolean;
  codeType?: "code128" | "qrcode";
  dataPlaceholder?: string;
  elementKey?: string;
  qrSelectedFields?: string[];
  qrCustomText?: string;
  set: (props: Record<string, unknown>) => void;
};

type FabricCanvas = {
  width: number;
  height: number;
  setWidth: (value: number) => void;
  setHeight: (value: number) => void;
  setZoom: (value: number) => void;
  add: (obj: unknown) => void;
  renderAll: () => void;
  requestRenderAll: () => void;
  dispose: () => void;
  getActiveObject: () => FabricObject | null;
  remove: (obj: FabricObject) => void;
  toJSON: (extraProps?: string[]) => unknown;
  loadFromJSON: (json: unknown, callback: () => void) => void;
  getObjects: () => FabricObject[];
  on: (event: string, handler: () => void) => void;
};

type FabricNamespace = {
  Canvas: new (elementId: string, options?: Record<string, unknown>) => FabricCanvas;
  StaticCanvas: new (element: HTMLCanvasElement | null, options?: Record<string, unknown>) => FabricCanvas;
  IText: new (text: string, options?: Record<string, unknown>) => FabricObject;
  Image: {
    fromURL: (
      url: string,
      callback: (image: FabricObject) => void,
      options?: Record<string, unknown>
    ) => void;
  };
};

type BwipJs = {
  toCanvas: (canvas: HTMLCanvasElement, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    fabric?: FabricNamespace;
    bwipjs?: BwipJs;
  }
}

const LABEL_SIZES = {
  small: { label: "Small Barcode (2x1 in)", width: 192, height: 96 },
  shipping: { label: "Shipping (4x6 in)", width: 384, height: 576 },
} as const;

type LabelSizeKey = keyof typeof LABEL_SIZES;

// 96 DPI for screen representation
const DPI = 96;
const inchesToPixels = (inches: number) => Math.round(inches * DPI);
const pixelsToInches = (pixels: number) => (pixels / DPI).toFixed(2);

const MOCK_INVENTORY = [
  {
    device_model: "iPhone 17 Pro Max",
    imei: "359991234567890",
    sku: "IP17PM-256-CO-UNL",
    capacity: "256GB",
    color: "Cosmic Orange",
    carrier: "Unlocked",
    battery_health: "100%",
    cycle_count: "142",
    ios_version: "18.3",
    condition: "Excellent",
    comments: "Minor scratches on frame",
    grade: "A",
    price: "$1,499",
    price2: "$1,449",
    price3: "$1,399",
    serial_number: "DX3Q91ABCD12",
    registered_date: "2026-03-13",
    url: "https://icellshop.com/device/1",
    model_color_capacity: "iPhone 17 Pro Max Cosmic Orange 256GB",
  },
  {
    device_model: "iPhone 16",
    imei: "351234567890987",
    sku: "IP16-128-MB-UNL",
    capacity: "128GB",
    color: "Midnight Blue",
    carrier: "Unlocked",
    battery_health: "97%",
    cycle_count: "88",
    ios_version: "18.2",
    condition: "Excellent",
    comments: "Battery replaced recently",
    grade: "AB",
    price: "$999",
    price2: "$949",
    price3: "$899",
    serial_number: "HX7P54WXYZ89",
    registered_date: "2026-03-01",
    url: "https://icellshop.com/device/2",
    model_color_capacity: "iPhone 16 Midnight Blue 128GB",
  },
];

const isTextObject = (obj: FabricObject) =>
  obj.type === "i-text" || obj.type === "textbox" || obj.type === "text";

type SavedLabelTemplate = {
  canvas: unknown;
  settings?: {
    useCustomSize?: boolean;
    labelSize?: LabelSizeKey;
    customWidthInches?: number;
    customHeightInches?: number;
    orientation?: "portrait" | "landscape";
    previewScalePercent?: number;
  };
};

export default function LabelDesignerPage() {
  const pathname = usePathname();
  const [libsReady, setLibsReady] = useState(false);
  const [status, setStatus] = useState<string>("Loading editor libraries...");
  const [labelSize, setLabelSize] = useState<LabelSizeKey>("small");
  const [useCustomSize, setUseCustomSize] = useState(false);
  const [customWidthInches, setCustomWidthInches] = useState(2);
  const [customHeightInches, setCustomHeightInches] = useState(1);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [selectedObject, setSelectedObject] = useState<FabricObject | null>(null);
  const [placeholderInput, setPlaceholderInput] = useState("{{sku}}");
  const [qrSelectedFields, setQrSelectedFields] = useState<string[]>(["{{imei}}", "{{model_color_capacity}}"]);
  const [qrCustomText, setQrCustomText] = useState("");
  const [fontSizeInput, setFontSizeInput] = useState(22);
  const [fontBoldInput, setFontBoldInput] = useState(false);
  const [widthInput, setWidthInput] = useState(0);
  const [heightInput, setHeightInput] = useState(0);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const [previewScalePercent, setPreviewScalePercent] = useState(100);

  const canvasRef = useRef<FabricCanvas | null>(null);
  const readyRef = useRef(false);
  const canvasHostId = "label-designer-canvas";

  const canvasSize = useMemo(() => {
    if (useCustomSize) {
      let width = inchesToPixels(customWidthInches);
      let height = inchesToPixels(customHeightInches);
      if (orientation === "landscape" && width < height) {
        [width, height] = [height, width];
      } else if (orientation === "portrait" && width > height) {
        [width, height] = [height, width];
      }
      return { width, height };
    }
    return LABEL_SIZES[labelSize];
  }, [labelSize, useCustomSize, customWidthInches, customHeightInches, orientation]);

  const previewScale = useMemo(() => {
    const availableWidth = Math.max(500, viewport.width - 660);
    const availableHeight = Math.max(300, viewport.height - 260);
    const scaleW = availableWidth / canvasSize.width;
    const scaleH = availableHeight / canvasSize.height;
    return Math.max(1, Math.min(4.5, scaleW, scaleH));
  }, [canvasSize.height, canvasSize.width, viewport.height, viewport.width]);

  const effectivePreviewScale = useMemo(() => {
    const manualMultiplier = previewScalePercent / 100;
    return Math.max(0.6, Math.min(6, previewScale * manualMultiplier));
  }, [previewScale, previewScalePercent]);

  const generateCodeDataUrl = async (
    codeType: "code128" | "qrcode",
    textValue: string
  ): Promise<string> => {
    const bwip = window.bwipjs;
    if (!bwip) {
      throw new Error("bwip-js is not loaded.");
    }

    const tempCanvas = document.createElement("canvas");
    const cleanValue = textValue || "123456789";

    if (codeType === "code128") {
      bwip.toCanvas(tempCanvas, {
        bcid: "code128",
        text: cleanValue,
        scale: 2,
        height: 10,
        includetext: false,
      });
    } else {
      bwip.toCanvas(tempCanvas, {
        bcid: "qrcode",
        text: cleanValue,
        scale: 4,
      });
    }

    return tempCanvas.toDataURL("image/png");
  };

  const syncSelection = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const current = canvas.getActiveObject();
    setSelectedObject(current);

    if (!current) return;

    if (
      current.type === "i-text" ||
      current.type === "textbox" ||
      current.type === "text"
    ) {
      setFontSizeInput(Number(current.fontSize ?? 22));
      setFontBoldInput(String(current.fontWeight ?? "normal").toLowerCase() === "bold");
    }

    if (current.isBarcode) {
      setPlaceholderInput(String(current.dataPlaceholder ?? "{{sku}}"));
      if (current.codeType === "qrcode") {
        setQrSelectedFields(Array.isArray(current.qrSelectedFields) ? current.qrSelectedFields : ["{{imei}}", "{{model_color_capacity}}"]);
        setQrCustomText(String(current.qrCustomText ?? ""));
      } else {
        setQrSelectedFields(["{{imei}}", "{{model_color_capacity}}"]);
        setQrCustomText("");
      }
    }

    // Sync width and height
    const w = (current as unknown as { width?: number }).width ?? 0;
    const h = (current as unknown as { height?: number }).height ?? 0;
    const scaleX = (current as unknown as { scaleX?: number }).scaleX ?? 1;
    const scaleY = (current as unknown as { scaleY?: number }).scaleY ?? 1;
    setWidthInput(Math.round(w * scaleX));
    setHeightInput(Math.round(h * scaleY));
  };

  const initCanvas = async () => {
    if (readyRef.current) return;
    if (!window.fabric) return;

    const canvas = new window.fabric.Canvas(canvasHostId, {
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
    });

    canvasRef.current = canvas;
    readyRef.current = true;

    canvas.on("selection:created", syncSelection);
    canvas.on("selection:updated", syncSelection);
    canvas.on("selection:cleared", () => setSelectedObject(null));

    setStatus("Editor ready.");

    try {
      const response = await fetch("/api/org/label-template", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.template) {
        const savedTemplate = payload.template as SavedLabelTemplate | Record<string, unknown>;
        const wrappedTemplate =
          savedTemplate &&
          typeof savedTemplate === "object" &&
          "canvas" in savedTemplate &&
          (savedTemplate as SavedLabelTemplate).canvas
            ? (savedTemplate as SavedLabelTemplate)
            : null;

        if (wrappedTemplate?.settings) {
          const settings = wrappedTemplate.settings;
          setUseCustomSize(Boolean(settings.useCustomSize));
          if (settings.labelSize && settings.labelSize in LABEL_SIZES) {
            setLabelSize(settings.labelSize);
          }
          if (typeof settings.customWidthInches === "number" && settings.customWidthInches > 0) {
            setCustomWidthInches(settings.customWidthInches);
          }
          if (typeof settings.customHeightInches === "number" && settings.customHeightInches > 0) {
            setCustomHeightInches(settings.customHeightInches);
          }
          if (settings.orientation === "portrait" || settings.orientation === "landscape") {
            setOrientation(settings.orientation);
          }
          if (typeof settings.previewScalePercent === "number") {
            setPreviewScalePercent(Math.max(60, Math.min(200, Math.round(settings.previewScalePercent))));
          }
        }

        const canvasJson = wrappedTemplate?.canvas ?? payload.template;
        await new Promise<void>((resolve) => {
          canvas.loadFromJSON(canvasJson, () => {
            const loadedObjects = canvas.getObjects();
            for (const obj of loadedObjects) {
              if (!isTextObject(obj)) continue;

              const explicitPlaceholder = typeof obj.textPlaceholder === "string" ? obj.textPlaceholder : "";
              const currentText = String(obj.text ?? "").trim();
              const placeholder = explicitPlaceholder || currentText;

              if (placeholder in FIELD_EXAMPLE_BY_PLACEHOLDER) {
                obj.set({
                  textPlaceholder: placeholder,
                  text: FIELD_EXAMPLE_BY_PLACEHOLDER[placeholder],
                });
              }
            }
            canvas.renderAll();
            resolve();
          });
        });
        setStatus("Loaded saved label template.");
      }
    } catch {
      setStatus("Editor ready. Could not load saved template.");
    }
  };

  useEffect(() => {
    if (libsReady) {
      void initCanvas();
    }
    return () => {
      canvasRef.current?.dispose();
      canvasRef.current = null;
      readyRef.current = false;
    };
  }, [libsReady]);

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scaledWidth = Math.round(canvasSize.width * effectivePreviewScale);
    const scaledHeight = Math.round(canvasSize.height * effectivePreviewScale);

    canvas.setWidth(scaledWidth);
    canvas.setHeight(scaledHeight);
    canvas.setZoom(effectivePreviewScale);

    const fabricCanvas = canvas as unknown as {
      wrapperEl?: HTMLElement;
      lowerCanvasEl?: HTMLCanvasElement;
      upperCanvasEl?: HTMLCanvasElement;
    };

    if (fabricCanvas.wrapperEl) {
      fabricCanvas.wrapperEl.style.width = `${scaledWidth}px`;
      fabricCanvas.wrapperEl.style.height = `${scaledHeight}px`;
    }

    const canvasElement = document.getElementById(canvasHostId) as HTMLCanvasElement | null;
    if (canvasElement) {
      canvasElement.style.width = `${scaledWidth}px`;
      canvasElement.style.height = `${scaledHeight}px`;
    }

    if (fabricCanvas.lowerCanvasEl) {
      fabricCanvas.lowerCanvasEl.style.width = `${scaledWidth}px`;
      fabricCanvas.lowerCanvasEl.style.height = `${scaledHeight}px`;
    }

    if (fabricCanvas.upperCanvasEl) {
      fabricCanvas.upperCanvasEl.style.width = `${scaledWidth}px`;
      fabricCanvas.upperCanvasEl.style.height = `${scaledHeight}px`;
    }

    canvas.renderAll();
  }, [canvasSize, effectivePreviewScale]);

  const buildMockLabelData = (row: (typeof MOCK_INVENTORY)[number]) => ({
    imei: row.imei,
    sku: row.sku,
    model: row.device_model,
    color: row.color,
    capacity: row.capacity,
    carrier: row.carrier,
    batteryHealth: row.battery_health,
    cycleCount: row.cycle_count,
    iosVersion: row.ios_version,
    grade: row.grade,
    condition: row.condition,
    comments: row.comments,
    price: row.price,
    price2: row.price2,
    price3: row.price3,
    serialNumber: row.serial_number,
    registeredAt: row.registered_date,
    qrRaw: row.url,
  });

  const addDateField = (placeholder: string, label: string) => {
    addField(placeholder, label);
  };

  const addLogo = async () => {
    const canvas = canvasRef.current;
    const fabric = window.fabric;
    if (!canvas || !fabric) return;

    const existingLogo = canvas.getObjects().find((obj) => obj.elementKey === "element:logo");
    if (existingLogo) {
      canvas.remove(existingLogo);
      canvas.requestRenderAll();
      setStatus("Removed logo.");
      return;
    }

    try {
      const logoDataUrl = await fetchOrgLogoDataUrl();
      if (!logoDataUrl) {
        setStatus("No organization logo found.");
        return;
      }

      fabric.Image.fromURL(logoDataUrl, (img) => {
        img.set({
          left: 20,
          top: 18,
          scaleX: 0.35,
          scaleY: 0.35,
          isLogo: true,
          elementKey: "element:logo",
          selectable: true,
        });
        canvas.add(img);
        canvas.requestRenderAll();
        setStatus("Added logo.");
      });
    } catch {
      setStatus("Failed to load logo.");
    }
  };

  const buildQrPlaceholderText = (selectedFieldsValue: string[], customTextValue: string) => {
    const selectedText = selectedFieldsValue.join("\n");
    return [selectedText, customTextValue.trim()].filter(Boolean).join("\n");
  };

  const addText = () => {
    const canvas = canvasRef.current;
    const fabric = window.fabric;
    if (!canvas || !fabric) return;

    const existingText = canvas.getObjects().find((obj) => obj.elementKey === "element:text");
    if (existingText) {
      canvas.remove(existingText);
      canvas.requestRenderAll();
      setStatus("Removed text element.");
      return;
    }

    const text = new fabric.IText("iPhone 17 Pro Max", {
      left: 24,
      top: 24,
      fontSize: 22,
      fill: "#111827",
      elementKey: "element:text",
      textPlaceholder: "{{device_model}}",
    });
    canvas.add(text);
    canvas.requestRenderAll();
    setStatus("Added text object.");
  };

  const addField = (placeholder: string, label: string) => {
    const canvas = canvasRef.current;
    const fabric = window.fabric;
    if (!canvas || !fabric) return;

    const fieldElementKey = `field:${placeholder}`;

    const duplicateFields = canvas
      .getObjects()
      .filter((obj) => obj.elementKey === fieldElementKey);

    if (duplicateFields.length > 0) {
      duplicateFields.forEach((obj) => canvas.remove(obj));
      canvas.requestRenderAll();
      setStatus(`Removed ${label} field.`);
      return;
    }

    const text = new fabric.IText(FIELD_EXAMPLE_BY_PLACEHOLDER[placeholder] ?? placeholder, {
      left: 24,
      top: 24,
      fontSize: 18,
      fill: "#111827",
      elementKey: fieldElementKey,
      textPlaceholder: placeholder,
    });
    canvas.add(text);
    canvas.requestRenderAll();
    setStatus(`Added ${label} field.`);
  };

  const addCodeObject = async (codeType: "code128" | "qrcode") => {
    const canvas = canvasRef.current;
    const fabric = window.fabric;
    if (!canvas || !fabric) return;

    const codeElementKey = codeType === "code128" ? "element:barcode" : "element:qrcode";
    const existingCodeObjects = canvas
      .getObjects()
      .filter((obj) => obj.elementKey === codeElementKey || (obj.isBarcode && obj.codeType === codeType));

    if (existingCodeObjects.length > 0) {
      existingCodeObjects.forEach((obj) => canvas.remove(obj));
      if (codeType === "code128") {
        const barcodeSupportObjects = canvas
          .getObjects()
          .filter((obj) => obj.elementKey === "element:barcode-id-text");
        barcodeSupportObjects.forEach((obj) => canvas.remove(obj));
      }
      canvas.requestRenderAll();
      setStatus(`Removed ${codeType === "code128" ? "barcode" : "QR code"} object.`);
      return;
    }

    const defaultQrFields = ["{{imei}}", "{{model_color_capacity}}", "{{battery_health}}", "{{cycle_count}}"];
    const placeholder =
      codeType === "code128"
        ? "{{sku}}"
        : buildQrPlaceholderText(defaultQrFields, "");
    const sample =
      codeType === "code128"
        ? FIELD_EXAMPLE_BY_PLACEHOLDER["{{sku}}"]
        : buildQrPayload(buildMockLabelData(MOCK_INVENTORY[0]), defaultQrFields, "");

    try {
      const dataUrl = await generateCodeDataUrl(codeType, sample);
      fabric.Image.fromURL(
        dataUrl,
        (img) => {
          img.set({
            left: codeType === "code128" ? 24 : 120,
            top: codeType === "code128" ? 58 : 20,
            scaleX: codeType === "code128" ? 1.1 : 0.55,
            scaleY: codeType === "code128" ? 1.1 : 0.55,
            isBarcode: true,
            codeType,
            dataPlaceholder: placeholder,
            elementKey: codeElementKey,
            qrSelectedFields: codeType === "qrcode" ? defaultQrFields : undefined,
            qrCustomText: codeType === "qrcode" ? "" : undefined,
            selectable: true,
          });

          canvas.add(img);
          if (codeType === "code128") {
            const identifierText = new fabric.IText(FIELD_EXAMPLE_BY_PLACEHOLDER["{{sku}}"], {
              left: 24,
              top: 106,
              fontSize: 14,
              fill: "#111827",
              elementKey: "element:barcode-id-text",
              textPlaceholder: "{{imei}}",
            });
            canvas.add(identifierText);
          }
          canvas.requestRenderAll();
          setStatus(`Added ${codeType === "code128" ? "barcode" : "QR code"} object.`);
        },
        { crossOrigin: "anonymous" }
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to add code object.");
    }
  };

  const applySelectionChanges = async (
    nextQrSelectedFields: string[] = qrSelectedFields,
    nextQrCustomText: string = qrCustomText
  ) => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedObject) return;

    if (
      selectedObject.type === "i-text" ||
      selectedObject.type === "textbox" ||
      selectedObject.type === "text"
    ) {
      selectedObject.set({
        fontSize: Number(fontSizeInput || 22),
        fontWeight: fontBoldInput ? "bold" : "normal",
      });
      canvas.requestRenderAll();
      return;
    }

    if (selectedObject.isBarcode) {
      const codeType = selectedObject.codeType === "qrcode" ? "qrcode" : "code128";
      const qrPlaceholder = buildQrPlaceholderText(nextQrSelectedFields, nextQrCustomText);
      const sample =
        codeType === "code128"
          ? FIELD_EXAMPLE_BY_PLACEHOLDER["{{sku}}"]
          : buildQrPayload(buildMockLabelData(MOCK_INVENTORY[0]), nextQrSelectedFields, nextQrCustomText);
      const fabric = window.fabric;
      if (!fabric) return;

      try {
        const dataUrl = await generateCodeDataUrl(codeType, sample);
        const prev = selectedObject;
        fabric.Image.fromURL(dataUrl, (img) => {
          img.set({
            ...(prev as unknown as Record<string, unknown>),
            left: (prev as unknown as { left?: number }).left,
            top: (prev as unknown as { top?: number }).top,
            scaleX: (prev as unknown as { scaleX?: number }).scaleX,
            scaleY: (prev as unknown as { scaleY?: number }).scaleY,
            angle: (prev as unknown as { angle?: number }).angle,
            isBarcode: true,
            codeType,
            elementKey: (prev as unknown as { elementKey?: string }).elementKey,
            isLogo: false,
            qrSelectedFields: codeType === "qrcode" ? nextQrSelectedFields : undefined,
            qrCustomText: codeType === "qrcode" ? nextQrCustomText : undefined,
            dataPlaceholder: codeType === "code128" ? "{{sku}}" : qrPlaceholder || placeholderInput,
          });

          canvas.remove(prev);
          canvas.add(img);
          canvas.requestRenderAll();
          setSelectedObject(img);
          setStatus("Updated code placeholder.");
        });
      } catch {
        setStatus("Failed to update code placeholder.");
      }
    }
  };

  const applyDimensionChanges = () => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedObject) return;

    selectedObject.set({
      width: widthInput,
      height: heightInput,
    });
    canvas.requestRenderAll();
    setStatus("Updated dimensions.");
  };

  const deleteSelected = () => {
    const canvas = canvasRef.current;
    const obj = canvas?.getActiveObject();
    if (!canvas || !obj) return;
    canvas.remove(obj);
    canvas.requestRenderAll();
    setSelectedObject(null);
    setStatus("Deleted selected object.");
  };

  const saveTemplate = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const json = canvas.toJSON([
      "isBarcode",
      "isLogo",
      "codeType",
      "dataPlaceholder",
      "elementKey",
      "textPlaceholder",
      "qrSelectedFields",
      "qrCustomText",
    ]);
    (json as { width?: number; height?: number }).width = canvasSize.width;
    (json as { width?: number; height?: number }).height = canvasSize.height;
    const templateToSave: SavedLabelTemplate = {
      canvas: json,
      settings: {
        useCustomSize,
        labelSize,
        customWidthInches,
        customHeightInches,
        orientation,
        previewScalePercent,
      },
    };

    try {
      const response = await fetch("/api/org/label-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: templateToSave }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(payload?.error ?? "Failed to save template.");
        return;
      }
      setStatus("Template saved successfully.");
    } catch {
      setStatus("Failed to save template.");
    }
  };

  const printTestLabel = () => {
    const canvasElement = document.getElementById(canvasHostId) as HTMLCanvasElement | null;
    if (!canvasElement) {
      setStatus("Nothing to print.");
      return;
    }

    const imageData = canvasElement.toDataURL("image/png");
    const printWindow = window.open("", "_blank", "width=700,height=500");
    if (!printWindow) {
      setStatus("Popup blocked while trying to print label.");
      return;
    }

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Print Test Label</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;}img{display:block;max-width:100%;height:auto;}@page{margin:0;}@media print{body{min-height:auto;}}</style></head><body><img src="${imageData}" alt="Test Label" /></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 150);
  };

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js" strategy="afterInteractive" onLoad={() => setLibsReady(Boolean(window.fabric && window.bwipjs))} />
      <Script src="https://cdn.jsdelivr.net/npm/bwip-js@4.5.0/dist/bwip-js-min.js" strategy="afterInteractive" onLoad={() => setLibsReady(Boolean(window.fabric && window.bwipjs))} />

      <div className="app-shell">
        <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
          <AppSidebar pathname={pathname} />
          <main className="flex min-w-0 flex-col gap-6 px-6 py-10">
            <header>
              <h1 className="text-3xl font-semibold text-[#1f1a16]">Label Designer</h1>
              <p className="text-sm text-[#6a4d3a]">Create reusable organization-level print templates for item labels.</p>
            </header>

            <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="rounded-2xl border border-[#e6d6c6] bg-white p-4">
                <div className="grid gap-3">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-[#3b2a1e]">
                      <input
                        type="checkbox"
                        checked={useCustomSize}
                        onChange={(e) => setUseCustomSize(e.target.checked)}
                        className="rounded"
                      />
                      Custom Size
                    </label>
                  </div>

                  {!useCustomSize ? (
                    <label className="grid gap-1 text-sm text-[#3b2a1e]">
                      Preset Size
                      <select
                        value={labelSize}
                        onChange={(e) => setLabelSize(e.target.value as LabelSizeKey)}
                        className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2"
                      >
                        <option value="small">{LABEL_SIZES.small.label}</option>
                        <option value="shipping">{LABEL_SIZES.shipping.label}</option>
                      </select>
                    </label>
                  ) : (
                    <>
                      <div className="grid gap-2">
                        <label className="grid gap-1 text-sm text-[#3b2a1e]">
                          Width (inches)
                          <input
                            type="number"
                            min={0.5}
                            max={12}
                            step={0.1}
                            value={customWidthInches}
                            onChange={(e) => setCustomWidthInches(Number(e.target.value))}
                            className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2"
                          />
                        </label>
                        <label className="grid gap-1 text-sm text-[#3b2a1e]">
                          Height (inches)
                          <input
                            type="number"
                            min={0.5}
                            max={12}
                            step={0.1}
                            value={customHeightInches}
                            onChange={(e) => setCustomHeightInches(Number(e.target.value))}
                            className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setOrientation("portrait")}
                          className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                            orientation === "portrait"
                              ? "bg-[#1f1a16] text-white"
                              : "border border-[#d6c1ad] text-[#3b2a1e]"
                          }`}
                        >
                          Portrait
                        </button>
                        <button
                          onClick={() => setOrientation("landscape")}
                          className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                            orientation === "landscape"
                              ? "bg-[#1f1a16] text-white"
                              : "border border-[#d6c1ad] text-[#3b2a1e]"
                          }`}
                        >
                          Landscape
                        </button>
                      </div>

                      <label className="grid gap-1 text-sm text-[#3b2a1e]">
                        Preview Scale ({previewScalePercent}%)
                        <input
                          type="range"
                          min={60}
                          max={200}
                          step={5}
                          value={previewScalePercent}
                          onChange={(e) => setPreviewScalePercent(Number(e.target.value))}
                          className="w-full"
                        />
                      </label>
                    </>
                  )}

                  {!useCustomSize && (
                    <label className="grid gap-1 text-sm text-[#3b2a1e]">
                      Preview Scale ({previewScalePercent}%)
                      <input
                        type="range"
                        min={60}
                        max={200}
                        step={5}
                        value={previewScalePercent}
                        onChange={(e) => setPreviewScalePercent(Number(e.target.value))}
                        className="w-full"
                      />
                    </label>
                  )}

                  <div className="border-t border-[#e6d6c6] pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6a4d3a]">Add Elements</p>
                    <button onClick={addText} className="w-full rounded-xl bg-[#1f1a16] px-3 py-2 text-sm font-semibold text-white">
                      Add Text
                    </button>
                    <button onClick={() => void addCodeObject("code128")} className="mt-2 w-full rounded-xl border border-[#d6c1ad] px-3 py-2 text-sm font-semibold text-[#3b2a1e]">
                      Add Barcode
                    </button>
                    <button onClick={() => void addCodeObject("qrcode")} className="mt-2 w-full rounded-xl border border-[#d6c1ad] px-3 py-2 text-sm font-semibold text-[#3b2a1e]">
                      Add QR Code
                    </button>
                    <button onClick={() => void addLogo()} className="mt-2 w-full rounded-xl border border-[#d6c1ad] px-3 py-2 text-sm font-semibold text-[#3b2a1e]">
                      Add Logo
                    </button>
                    <button onClick={() => addDateField("{{printed_date}}", "Print Date")} className="mt-2 w-full rounded-xl border border-[#d6c1ad] px-3 py-2 text-sm font-semibold text-[#3b2a1e]">
                      Add Print Date
                    </button>
                    <button onClick={() => addDateField("{{printed_datetime}}", "Print Date + Time")} className="mt-2 w-full rounded-xl border border-[#d6c1ad] px-3 py-2 text-sm font-semibold text-[#3b2a1e]">
                      Add Print Date + Time
                    </button>
                  </div>

                  <div className="border-t border-[#e6d6c6] pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6a4d3a]">Fields</p>
                    <div className="grid grid-cols-2 gap-2">
                      {AVAILABLE_LABEL_FIELDS.map((field) => (
                        <button
                          key={field.placeholder}
                          onClick={() => addField(field.placeholder, field.label)}
                          className="rounded-lg border border-[#d6c1ad] px-2 py-1.5 text-xs font-semibold text-[#3b2a1e] transition hover:bg-[#fffaf3]"
                        >
                          <span className="block">{field.label}</span>
                          <span className="block text-[10px] font-normal text-[#8b7355]">Ex: {field.example}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#ead8c6] bg-[#fffaf3] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#6a4d3a]">Editor</p>
                    {!selectedObject && <p className="mt-2 text-xs text-[#8b7355]">Select an object to edit.</p>}

                    {selectedObject && (selectedObject.type === "i-text" || selectedObject.type === "textbox" || selectedObject.type === "text") && (
                      <div className="mt-2 grid gap-2 text-sm text-[#3b2a1e]">
                        <label className="grid gap-1">
                          Font Size
                          <input
                            type="number"
                            min={8}
                            max={120}
                            value={fontSizeInput}
                            onChange={(e) => setFontSizeInput(Number(e.target.value || 22))}
                            onBlur={() => void applySelectionChanges()}
                            className="rounded border border-[#e6d6c6] bg-white px-2 py-1"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={fontBoldInput}
                            onChange={(e) => {
                              setFontBoldInput(e.target.checked);
                              setTimeout(() => {
                                void applySelectionChanges();
                              }, 0);
                            }}
                            className="rounded"
                          />
                          Bold
                        </label>
                      </div>
                    )}

                    {selectedObject && selectedObject.isBarcode && selectedObject.codeType !== "code128" && (
                      <div className="mt-2 grid gap-2 text-sm text-[#3b2a1e]">
                        <p className="font-semibold">QR Content</p>
                        <div className="grid grid-cols-2 gap-2">
                          {QR_FIELD_OPTIONS.map((field) => {
                            const checked = qrSelectedFields.includes(field.placeholder);
                            return (
                              <label key={field.placeholder} className="flex items-start gap-2 text-xs text-[#3b2a1e]">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const nextFields = e.target.checked
                                      ? [...qrSelectedFields, field.placeholder]
                                      : qrSelectedFields.filter((value) => value !== field.placeholder);
                                    setQrSelectedFields(nextFields);
                                    setPlaceholderInput(buildQrPlaceholderText(nextFields, qrCustomText));
                                    void applySelectionChanges(nextFields, qrCustomText);
                                  }}
                                />
                                <span>{field.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        <label className="grid gap-1">
                          Custom QR Text
                          <textarea
                            value={qrCustomText}
                            onChange={(e) => {
                              setQrCustomText(e.target.value);
                              setPlaceholderInput(buildQrPlaceholderText(qrSelectedFields, e.target.value));
                              void applySelectionChanges(qrSelectedFields, e.target.value);
                            }}
                            placeholder="Optional custom text or placeholders"
                            rows={3}
                            className="rounded border border-[#e6d6c6] bg-white px-2 py-1"
                          />
                        </label>
                      </div>
                    )}

                    {selectedObject && (
                      <>
                        <label className="mt-2 grid gap-1 text-sm text-[#3b2a1e]">
                          Width (px)
                          <input
                            type="number"
                            min={10}
                            value={widthInput}
                            onChange={(e) => setWidthInput(Number(e.target.value))}
                            onBlur={() => applyDimensionChanges()}
                            className="rounded border border-[#e6d6c6] bg-white px-2 py-1"
                          />
                        </label>
                        <label className="mt-2 grid gap-1 text-sm text-[#3b2a1e]">
                          Height (px)
                          <input
                            type="number"
                            min={10}
                            value={heightInput}
                            onChange={(e) => setHeightInput(Number(e.target.value))}
                            onBlur={() => applyDimensionChanges()}
                            className="rounded border border-[#e6d6c6] bg-white px-2 py-1"
                          />
                        </label>
                      </>
                    )}
                  </div>

                  <button onClick={deleteSelected} className="rounded-xl border border-[#c24d34] px-3 py-2 text-sm font-semibold text-[#c24d34]">
                    Delete Selected
                  </button>
                  <button onClick={() => void saveTemplate()} className="rounded-xl bg-[#2563eb] px-3 py-2 text-sm font-semibold text-white">
                    Save Template
                  </button>
                  <button onClick={printTestLabel} className="rounded-xl bg-[#6b4f3b] px-3 py-2 text-sm font-semibold text-white">
                    Print Test Label
                  </button>
                </div>
              </aside>

              <div className="rounded-2xl border border-[#e6d6c6] bg-white p-4">
                <p className="mb-2 text-sm font-medium text-[#6a4d3a]">
                  Data is an example of how your actual labels will look like.
                </p>
                <p className="mb-3 text-xs text-[#8b7355]">
                  Mock: iPhone 17 Pro Max Cosmic Orange 256GB
                </p>
                <div className="overflow-auto rounded-xl border border-[#ead8c6] bg-[#fffdf8] p-3">
                  <div
                    className="mx-auto overflow-hidden rounded-md border border-[#d6c1ad] bg-white"
                    style={{ width: Math.round(canvasSize.width * effectivePreviewScale), height: Math.round(canvasSize.height * effectivePreviewScale) }}
                  >
                    <canvas id={canvasHostId} className="block" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-[#6a4d3a]">{status}</p>
              </div>
            </section>

          </main>
        </div>
      </div>
    </>
  );
}
