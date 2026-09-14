"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchOrgLogoDataUrl } from "@/lib/org-logo";
import { buildQrPayload, replaceLabelPlaceholders, type LabelTemplateData } from "@/lib/label-template";

type TemplateObject = {
  type?: string;
  text?: string;
  textPlaceholder?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  fontSize?: number;
  fill?: string;
  src?: string;
  isBarcode?: boolean;
  isLogo?: boolean;
  codeType?: "code128" | "qrcode";
  dataPlaceholder?: string;
  qrSelectedFields?: string[];
  qrCustomText?: string;
};

type TemplateCanvas = {
  width?: number;
  height?: number;
  objects?: TemplateObject[];
};

type FabricObject = {
  set: (props: Record<string, unknown>) => void;
};

type FabricCanvas = {
  width: number;
  height: number;
  loadFromJSON: (json: unknown, callback: () => void) => void;
  renderAll: () => void;
  dispose: () => void;
};

type FabricNamespace = {
  StaticCanvas: new (element: HTMLCanvasElement | null, options?: Record<string, unknown>) => FabricCanvas;
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

type LabelRenderWindow = Window & {
  fabric?: FabricNamespace;
  bwipjs?: BwipJs;
};

type SavedLabelTemplate = {
  canvas?: TemplateCanvas;
  settings?: {
    useCustomSize?: boolean;
    labelSize?: "small" | "shipping";
    customWidthInches?: number;
    customHeightInches?: number;
    orientation?: "portrait" | "landscape";
  };
};

type LabelPreviewProps = {
  model: string;
  color: string;
  capacity: string;
  batteryHealth: string;
  cycleCount: string;
  iosVersion: string;
  carrier: string;
  condition: string;
  comments?: string;
  grade?: string;
  imei: string;
  sku?: string;
  qrRaw: string;
  serialNumber: string;
  dateOfPurchase: string;
  createdAt?: string;
  price?: string;
  price2?: string;
  price3?: string;
  logoDataUrl?: string;
  onRendered?: (payload: { dataUrl: string; width: number; height: number }) => void;
};

const fetchLabelTemplate = async (): Promise<SavedLabelTemplate | null> => {
  return fetch("/api/org/label-template", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json().catch(() => ({}));
      if (!payload?.template) return null;
      const template = payload.template as SavedLabelTemplate | { objects?: TemplateObject[]; width?: number; height?: number };
      if (template && typeof template === "object" && "canvas" in template && template.canvas) {
        return template as SavedLabelTemplate;
      }
      return { canvas: template as SavedLabelTemplate["canvas"] };
    })
    .catch(() => null);
};

const DPI = 96;
const RENDER_SCALE = 3;
const inchesToPixels = (inches: number) => Math.round(inches * DPI);

const resolveTemplateSize = (template: SavedLabelTemplate) => {
  const settings = template.settings;

  if (settings?.useCustomSize) {
    let width = inchesToPixels(settings.customWidthInches ?? 2);
    let height = inchesToPixels(settings.customHeightInches ?? 1);
    if (settings.orientation === "landscape" && width < height) {
      [width, height] = [height, width];
    }
    if (settings.orientation === "portrait" && width > height) {
      [width, height] = [height, width];
    }
    return { width, height };
  }

  if (settings?.labelSize === "shipping") {
    return { width: 384, height: 576 };
  }

  return { width: 192, height: 96 };
};

const ensureScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.getAttribute("data-loaded") === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.setAttribute("data-loaded", "true");
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

const ensureRenderLibs = async () => {
  const renderWindow = window as LabelRenderWindow;
  if (!renderWindow.fabric) {
    await ensureScript("https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js");
  }
  if (!renderWindow.bwipjs) {
    await ensureScript("https://cdn.jsdelivr.net/npm/bwip-js@4.5.0/dist/bwip-js-min.js");
  }
};

const generateCodeDataUrl = async (codeType: "code128" | "qrcode", textValue: string): Promise<string> => {
  const bwip = (window as LabelRenderWindow).bwipjs;
  if (!bwip) {
    throw new Error("bwip-js not loaded");
  }

  const tempCanvas = document.createElement("canvas");
  const cleanValue = textValue || "";

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

const getImageDimensions = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width || 1, height: img.naturalHeight || img.height || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = src;
  });

const PLACEHOLDER_LINE_REGEX = /^\s*\{\{\s*[a-zA-Z0-9_]+\s*\}\}\s*$/;
const PLACEHOLDER_TOKEN_REGEX = /\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g;

const resolveQrPayload = (obj: TemplateObject, labelData: LabelTemplateData) => {
  const placeholderText = String(obj.dataPlaceholder ?? "{{imei}}\n{{model_color_capacity}}");

  const placeholderLines = placeholderText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const placeholderFieldsFromLines = placeholderLines.filter((line) => PLACEHOLDER_LINE_REGEX.test(line));
  const placeholderFieldsFromTokens = Array.from(placeholderText.match(PLACEHOLDER_TOKEN_REGEX) ?? []);

  const selectedFromObject = Array.isArray(obj.qrSelectedFields)
    ? obj.qrSelectedFields.map(String).map((v) => v.trim()).filter(Boolean)
    : [];

  let mergedSelectedFields: string[];
  let mergedCustomText: string;

  if (selectedFromObject.length > 0) {
    // Modern format: qrSelectedFields is authoritative — ignore dataPlaceholder content
    mergedSelectedFields = selectedFromObject;
    mergedCustomText = typeof obj.qrCustomText === "string" ? obj.qrCustomText.trim() : "";
  } else {
    // Legacy format: derive fields from dataPlaceholder
    mergedSelectedFields = Array.from(
      new Set([...placeholderFieldsFromLines, ...placeholderFieldsFromTokens])
    );
    const customFromPlaceholderLines = placeholderLines
      .filter((line) => !PLACEHOLDER_LINE_REGEX.test(line))
      .join("\n")
      .trim();
    mergedCustomText = [
      typeof obj.qrCustomText === "string" ? obj.qrCustomText : "",
      customFromPlaceholderLines,
    ]
      .filter((value) => value.trim().length > 0)
      .join("\n")
      .trim();
  }

  const payload = buildQrPayload(
    labelData,
    mergedSelectedFields.length > 0 ? mergedSelectedFields : undefined,
    mergedCustomText || undefined
  ).trim();

  if (payload) {
    return payload;
  }

  return replaceLabelPlaceholders(placeholderText, labelData).trim();
};

const resolveBarcodePayload = (obj: TemplateObject, labelData: LabelTemplateData) => {
  const configured = replaceLabelPlaceholders(String(obj.dataPlaceholder ?? "{{imei}}"), labelData).trim();
  if (configured) return configured;

  const serialFallback = replaceLabelPlaceholders("{{serial_number}}", labelData).trim();
  if (serialFallback) return serialFallback;

  const qrFallback = replaceLabelPlaceholders("{{url}}", labelData).trim();
  if (qrFallback) return qrFallback;

  const modelFallback = replaceLabelPlaceholders("{{model_color_capacity}}", labelData).trim();
  if (modelFallback) return modelFallback;

  // Code128 cannot be generated from an empty string.
  return "NO-ID";
};

const LabelPreview = ({
  model,
  color,
  capacity,
  batteryHealth,
  cycleCount,
  iosVersion,
  carrier,
  condition,
  comments,
  grade,
  imei,
  sku,
  qrRaw,
  serialNumber,
  createdAt,
  dateOfPurchase,
  price,
  price2,
  price3,
  logoDataUrl,
  onRendered,
}: LabelPreviewProps) => {
  const [template, setTemplate] = useState<SavedLabelTemplate | null>(null);
  const [resolvedLogoDataUrl, setResolvedLogoDataUrl] = useState<string | undefined>(logoDataUrl);
  const [renderedDataUrl, setRenderedDataUrl] = useState<string>("");

  useEffect(() => {
    fetchLabelTemplate().then((value) => setTemplate(value));
  }, []);

  useEffect(() => {
    if (logoDataUrl) {
      setResolvedLogoDataUrl(logoDataUrl);
      return;
    }
    fetchOrgLogoDataUrl()
      .then((url) => setResolvedLogoDataUrl(url))
      .catch(() => setResolvedLogoDataUrl(undefined));
  }, [logoDataUrl]);

  const labelData = useMemo(
    () => ({
      imei,
      sku,
      model,
      color,
      capacity,
      carrier,
      batteryHealth,
      cycleCount,
      iosVersion,
      grade: grade,
      condition,
      comments,
      price,
      price2,
      price3,
      serialNumber,
      registeredAt: createdAt || dateOfPurchase,
      qrRaw,
    }),
    [batteryHealth, capacity, carrier, color, comments, condition, createdAt, cycleCount, dateOfPurchase, grade, imei, iosVersion, model, price, price2, price3, qrRaw, serialNumber, sku]
  );

  const canvas = template?.canvas;
  const objects = Array.isArray(canvas?.objects) ? canvas.objects : [];
  const resolvedSize = template ? resolveTemplateSize(template) : { width: 192, height: 96 };
  const canvasWidth = resolvedSize.width;
  const canvasHeight = resolvedSize.height;

  useEffect(() => {
    const renderTemplate = async () => {
      if (!template?.canvas || !objects.length) {
        setRenderedDataUrl("");
        onRendered?.({ dataUrl: "", width: canvasWidth, height: canvasHeight });
        return;
      }

      try {
        await ensureRenderLibs();
        const renderWindow = window as LabelRenderWindow;
        if (!renderWindow.fabric) {
          setRenderedDataUrl("");
          onRendered?.({ dataUrl: "", width: canvasWidth, height: canvasHeight });
          return;
        }
        const fabric = renderWindow.fabric;

        const clone = JSON.parse(JSON.stringify(template.canvas)) as TemplateCanvas;
        const cloneObjects = Array.isArray(clone.objects) ? clone.objects : [];

        for (const obj of cloneObjects) {
          const type = String(obj.type ?? "");

          if (type === "i-text" || type === "textbox" || type === "text") {
            const textPlaceholder = typeof obj.textPlaceholder === "string" ? obj.textPlaceholder : null;
            if (textPlaceholder) {
              obj.text = replaceLabelPlaceholders(textPlaceholder, labelData);
            } else if (typeof obj.text === "string") {
              obj.text = replaceLabelPlaceholders(obj.text, labelData);
            }
            continue;
          }

          if (obj.isLogo === true) {
            if (resolvedLogoDataUrl) {
              obj.src = resolvedLogoDataUrl;
            }
            continue;
          }

          if (obj.isBarcode === true) {
            const codeType = obj.codeType === "qrcode" ? "qrcode" : "code128";
            const previousWidth = typeof obj.width === "number" && obj.width > 0 ? obj.width : undefined;
            const previousHeight = typeof obj.height === "number" && obj.height > 0 ? obj.height : undefined;
            const previousScaleX = typeof obj.scaleX === "number" && Number.isFinite(obj.scaleX) ? obj.scaleX : 1;
            const previousScaleY = typeof obj.scaleY === "number" && Number.isFinite(obj.scaleY) ? obj.scaleY : 1;
            const value =
              codeType === "qrcode"
                ? resolveQrPayload(obj, labelData)
                : resolveBarcodePayload(obj, labelData);
            const nextSrc = await generateCodeDataUrl(codeType, value || "");
            const nextSize = await getImageDimensions(nextSrc);

            const targetDisplayWidth = (previousWidth ?? nextSize.width) * previousScaleX;
            const targetDisplayHeight = (previousHeight ?? nextSize.height) * previousScaleY;

            obj.src = nextSrc;
            obj.width = nextSize.width;
            obj.height = nextSize.height;
            obj.scaleX = targetDisplayWidth / Math.max(1, nextSize.width);
            obj.scaleY = targetDisplayHeight / Math.max(1, nextSize.height);
          }
        }

        const staticCanvasElement = document.createElement("canvas");
        clone.width = canvasWidth;
        clone.height = canvasHeight;

        const staticCanvas = new fabric.StaticCanvas(staticCanvasElement, {
          width: canvasWidth,
          height: canvasHeight,
        });

        await new Promise<void>((resolve) => {
          staticCanvas.loadFromJSON(clone, () => {
            staticCanvas.renderAll();
            resolve();
          });
        });

        const highResDataUrl = (staticCanvas as unknown as { toDataURL: (options?: Record<string, unknown>) => string }).toDataURL({
          format: "png",
          multiplier: RENDER_SCALE,
        });
        setRenderedDataUrl(highResDataUrl);
        onRendered?.({ dataUrl: highResDataUrl, width: canvasWidth, height: canvasHeight });
        staticCanvas.dispose();
      } catch {
        setRenderedDataUrl("");
        onRendered?.({ dataUrl: "", width: canvasWidth, height: canvasHeight });
      }
    };

    void renderTemplate();
  }, [canvasHeight, canvasWidth, labelData, objects.length, onRendered, resolvedLogoDataUrl, template]);

  if (!objects.length) {
    return (
      <div className="rounded-md border border-[#d6c1ad] bg-white p-4 text-sm text-[#6a4d3a]">
        No saved label template found.
      </div>
    );
  }

  if (!renderedDataUrl) {
    return (
      <div
        className="relative overflow-hidden rounded-md border border-[#d6c1ad] bg-white"
        style={{ width: canvasWidth, height: canvasHeight }}
      />
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-md border border-[#d6c1ad] bg-white"
      style={{ width: canvasWidth, height: canvasHeight }}
    >
      <img src={renderedDataUrl} alt="Label preview" style={{ width: canvasWidth, height: canvasHeight, display: "block" }} />
    </div>
  );
};

export default LabelPreview;
