import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import QRCode from "qrcode";

type LabelEditorProps = {
  baseUrl: string;
  session: DesktopSessionResponse | null;
};

type LabelSizeKey = "small" | "shipping";

type LabelFieldOption = {
  label: string;
  placeholder: string;
  example: string;
};

type TemplateObject = {
  type?: string;
  textPlaceholder?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontWeight?: string | number;
  isBarcode?: boolean;
  isLogo?: boolean;
  codeType?: "code128" | "qrcode";
  dataPlaceholder?: string;
  qrSelectedFields?: string[];
  qrCustomText?: string;
};

type SavedTemplate = {
  canvas?: {
    width?: number;
    height?: number;
    objects?: TemplateObject[];
  };
  settings?: {
    useCustomSize?: boolean;
    labelSize?: LabelSizeKey;
    customWidthInches?: number;
    customHeightInches?: number;
    orientation?: "portrait" | "landscape";
    previewScalePercent?: number;
  };
};

type EditableField = {
  placeholder: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
};

type FieldDragState = {
  target: "field" | "barcode" | "qr" | "logo";
  placeholder?: string;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
};

const FIELD_LIBRARY: LabelFieldOption[] = [
  { label: "IMEI", placeholder: "{{imei}}", example: "359991234567890" },
  { label: "SKU", placeholder: "{{sku}}", example: "IP16-128-BLK-UNL" },
  { label: "Model", placeholder: "{{device_model}}", example: "iPhone 17 Pro Max" },
  { label: "Model + Color + Capacity", placeholder: "{{model_color_capacity}}", example: "iPhone 17 Pro Max Cosmic Orange 256GB" },
  { label: "Capacity", placeholder: "{{capacity}}", example: "256GB" },
  { label: "Color", placeholder: "{{color}}", example: "Cosmic Orange" },
  { label: "Carrier", placeholder: "{{carrier}}", example: "Unlocked" },
  { label: "Battery Health", placeholder: "{{battery_health}}", example: "100%" },
  { label: "Cycle Count", placeholder: "{{cycle_count}}", example: "142" },
  { label: "iOS Version", placeholder: "{{ios_version}}", example: "18.3" },
  { label: "Grade", placeholder: "{{grade}}", example: "A" },
  { label: "Condition", placeholder: "{{condition}}", example: "Excellent" },
  { label: "Comments", placeholder: "{{comments}}", example: "Minor scratches" },
  { label: "Price", placeholder: "{{price}}", example: "$1499" },
  { label: "Price 2", placeholder: "{{price2}}", example: "$1449" },
  { label: "Price 3", placeholder: "{{price3}}", example: "$1399" },
  { label: "Serial Number", placeholder: "{{serial_number}}", example: "DX3Q91ABCD12" },
  { label: "Registered Date", placeholder: "{{registered_date}}", example: "2026-03-13" },
  { label: "Print Date", placeholder: "{{printed_date}}", example: "2026-03-13" },
  { label: "Print Date + Time", placeholder: "{{printed_datetime}}", example: "2026-03-13 14:30" },
];

const QR_FIELD_OPTIONS = FIELD_LIBRARY.filter(
  (field) => !["{{printed_date}}", "{{printed_datetime}}"].includes(field.placeholder)
);

const BARCODE_FIELD_OPTIONS: Array<{ label: string; placeholder: string }> = [
  { label: "IMEI", placeholder: "{{imei}}" },
  { label: "SN", placeholder: "{{serial_number}}" },
  { label: "SKU", placeholder: "{{sku}}" },
];

const LABEL_SIZE_PRESETS: Record<LabelSizeKey, { width: number; height: number }> = {
  small: { width: 192, height: 96 },
  shipping: { width: 384, height: 576 },
};

const toNumber = (value: unknown, fallback: number) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const buildQrPlaceholderText = (selectedFields: string[], customText: string) => {
  const selectedText = selectedFields.join("\n");
  return [selectedText, customText.trim()].filter(Boolean).join("\n");
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

function resolveCanvasSize(
  useCustomSize: boolean,
  labelSize: LabelSizeKey,
  customWidthInches: number,
  customHeightInches: number,
  orientation: "portrait" | "landscape"
) {
  if (!useCustomSize) {
    return LABEL_SIZE_PRESETS[labelSize];
  }

  let width = Math.round(customWidthInches * 96);
  let height = Math.round(customHeightInches * 96);

  if (orientation === "landscape" && width < height) {
    [width, height] = [height, width];
  }
  if (orientation === "portrait" && width > height) {
    [width, height] = [height, width];
  }

  return {
    width: Math.max(96, width),
    height: Math.max(96, height),
  };
}

export function LabelEditor({ baseUrl, session }: LabelEditorProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Label editor ready.");
  const [useCustomSize, setUseCustomSize] = useState(false);
  const [labelSize, setLabelSize] = useState<LabelSizeKey>("small");
  const [customWidthInches, setCustomWidthInches] = useState(2);
  const [customHeightInches, setCustomHeightInches] = useState(1);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [previewScalePercent, setPreviewScalePercent] = useState(100);
  const [fields, setFields] = useState<EditableField[]>([
    { placeholder: "{{model_color_capacity}}", left: 18, top: 16, width: 280, height: 28, fontSize: 18, bold: false },
    { placeholder: "{{imei}}", left: 18, top: 44, width: 220, height: 20, fontSize: 14, bold: false },
  ]);
  const [barcodeEnabled, setBarcodeEnabled] = useState(true);
  const [barcodePlaceholder, setBarcodePlaceholder] = useState("{{imei}}");
  const [barcodeLeft, setBarcodeLeft] = useState(18);
  const [barcodeTop, setBarcodeTop] = useState(66);
  const [barcodeWidth, setBarcodeWidth] = useState(168);
  const [barcodeHeight, setBarcodeHeight] = useState(34);
  const [qrEnabled, setQrEnabled] = useState(false);
  const [qrFields, setQrFields] = useState<string[]>(["{{imei}}", "{{model_color_capacity}}"]);
  const [qrCustomText, setQrCustomText] = useState("");
  const [qrLeft, setQrLeft] = useState(230);
  const [qrTop, setQrTop] = useState(14);
  const [qrWidth, setQrWidth] = useState(72);
  const [qrHeight, setQrHeight] = useState(72);
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [logoLeft, setLogoLeft] = useState(16);
  const [logoTop, setLogoTop] = useState(14);
  const [logoWidth, setLogoWidth] = useState(90);
  const [logoHeight, setLogoHeight] = useState(40);
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [qrPreviewDataUrl, setQrPreviewDataUrl] = useState("");
  const [activeDragKey, setActiveDragKey] = useState("");
  const fieldDragRef = useRef<FieldDragState | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const [previewViewport, setPreviewViewport] = useState({ width: 420, height: 260 });

  const canvasSize = useMemo(
    () => resolveCanvasSize(useCustomSize, labelSize, customWidthInches, customHeightInches, orientation),
    [customHeightInches, customWidthInches, labelSize, orientation, useCustomSize]
  );

  const previewScale = useMemo(() => {
    const fitWidth = Math.max(80, previewViewport.width - 12) / Math.max(1, canvasSize.width);
    const fitHeight = Math.max(80, previewViewport.height - 12) / Math.max(1, canvasSize.height);
    const fit = Math.max(0.1, Math.min(fitWidth, fitHeight));
    const manualFactor = Math.max(0.6, Math.min(2, previewScalePercent / 100));
    // Keep full label visible: allow manual zoom-out but never zoom beyond fit.
    return Math.max(0.1, Math.min(fit, fit * manualFactor));
  }, [canvasSize.height, canvasSize.width, previewScalePercent, previewViewport.height, previewViewport.width]);

  const startFieldDrag = (
    event: ReactMouseEvent<HTMLDivElement>,
    placeholder: string,
    mode: "move" | "resize"
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const field = fields.find((entry) => entry.placeholder === placeholder);
    if (!field) return;

    setActiveDragKey(`field:${placeholder}`);
    fieldDragRef.current = {
      target: "field",
      placeholder,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: field.left,
      startTop: field.top,
      startWidth: field.width,
      startHeight: field.height,
    };
  };

  const startElementDrag = (
    event: ReactMouseEvent<HTMLDivElement>,
    target: "barcode" | "qr" | "logo",
    mode: "move" | "resize",
    box: { left: number; top: number; width: number; height: number }
  ) => {
    event.preventDefault();
    event.stopPropagation();

    setActiveDragKey(target);
    fieldDragRef.current = {
      target,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: box.left,
      startTop: box.top,
      startWidth: box.width,
      startHeight: box.height,
    };
  };

  const getFieldOption = (placeholder: string) => {
    return FIELD_LIBRARY.find((item) => item.placeholder === placeholder);
  };

  const loadFromServer = async () => {
    if (!session) {
      setStatus("Sign in to edit label template settings.");
      return;
    }

    setBusy(true);
    setStatus("Loading label template...");

    try {
      const [templatePayload, logoPayload] = await Promise.all([
        window.desktop.labelTemplate.get({ baseUrl }),
        window.desktop.org.logoDataUrl({ baseUrl }).catch(() => ({ logoDataUrl: "" })),
      ]);

      const logoUrl = String(logoPayload.logoDataUrl ?? "");
      setLogoDataUrl(logoUrl);

      const rawTemplate = templatePayload?.template as SavedTemplate | null;
      if (!rawTemplate || typeof rawTemplate !== "object") {
        setStatus("No saved template found. Editing defaults.");
        return;
      }

      const wrappedTemplate =
        rawTemplate && typeof rawTemplate === "object" && "canvas" in rawTemplate
          ? rawTemplate
          : ({ canvas: rawTemplate } as SavedTemplate);

      const settings = wrappedTemplate.settings;
      if (settings) {
        setUseCustomSize(Boolean(settings.useCustomSize));
        if (settings.labelSize === "small" || settings.labelSize === "shipping") {
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
        if (typeof settings.previewScalePercent === "number" && Number.isFinite(settings.previewScalePercent)) {
          setPreviewScalePercent(Math.max(60, Math.min(200, Math.round(settings.previewScalePercent))));
        }
      }

      const objects = Array.isArray(wrappedTemplate.canvas?.objects) ? wrappedTemplate.canvas?.objects : [];
      const nextFields: EditableField[] = [];

      const barcode = objects?.find((obj) => obj.isBarcode && obj.codeType !== "qrcode");
      if (barcode) {
        setBarcodeEnabled(true);
        setBarcodePlaceholder(String(barcode.dataPlaceholder ?? "{{imei}}"));
        setBarcodeLeft(toNumber(barcode.left, 18));
        setBarcodeTop(toNumber(barcode.top, 66));
        setBarcodeWidth(toNumber(barcode.width, 168));
        setBarcodeHeight(toNumber(barcode.height, 34));
      }

      const qr = objects?.find((obj) => obj.isBarcode && obj.codeType === "qrcode");
      if (qr) {
        setQrEnabled(true);
        const parsedFields = Array.isArray(qr.qrSelectedFields)
          ? qr.qrSelectedFields.map((entry) => String(entry)).filter(Boolean)
          : ["{{imei}}", "{{model_color_capacity}}"];
        setQrFields(parsedFields.length > 0 ? parsedFields : ["{{imei}}", "{{model_color_capacity}}"]);
        setQrCustomText(String(qr.qrCustomText ?? ""));
        setQrLeft(toNumber(qr.left, 230));
        setQrTop(toNumber(qr.top, 14));
        setQrWidth(toNumber(qr.width, 72));
        setQrHeight(toNumber(qr.height, 72));
      }

      const logo = objects?.find((obj) => obj.isLogo);
      if (logo) {
        setLogoEnabled(true);
        setLogoLeft(toNumber(logo.left, 16));
        setLogoTop(toNumber(logo.top, 14));
        setLogoWidth(toNumber(logo.width, 90));
        setLogoHeight(toNumber(logo.height, 40));
      }

      for (const obj of objects ?? []) {
        const placeholder = String(obj.textPlaceholder ?? "");
        if (!placeholder) continue;
        const known = getFieldOption(placeholder);
        if (!known) continue;

        nextFields.push({
          placeholder,
          left: toNumber(obj.left, 18),
          top: toNumber(obj.top, 16 + nextFields.length * 24),
          width: toNumber(obj.width, 220),
          height: toNumber(obj.height, 24),
          fontSize: toNumber(obj.fontSize, 16),
          bold: String(obj.fontWeight ?? "normal").toLowerCase() === "bold",
        });
      }

      if (nextFields.length > 0) {
        setFields(nextFields);
      }

      setStatus("Loaded saved label template.");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Failed to load label template.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, baseUrl]);

  useEffect(() => {
    const node = previewFrameRef.current;
    if (!node) return;

    const updateViewport = () => {
      setPreviewViewport({
        width: Math.max(160, node.clientWidth),
        height: Math.max(160, node.clientHeight),
      });
    };

    updateViewport();
    const observer = new ResizeObserver(() => updateViewport());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const drag = fieldDragRef.current;
      if (!drag) return;

      const scale = Math.max(previewScale, 0.01);
      const deltaX = (event.clientX - drag.startClientX) / scale;
      const deltaY = (event.clientY - drag.startClientY) / scale;

      if (drag.target === "field" && drag.placeholder) {
        setFields((prev) =>
          prev.map((entry) => {
            if (entry.placeholder !== drag.placeholder) return entry;

            if (drag.mode === "move") {
              return {
                ...entry,
                left: Math.max(0, Math.round(drag.startLeft + deltaX)),
                top: Math.max(0, Math.round(drag.startTop + deltaY)),
              };
            }

            return {
              ...entry,
              width: Math.max(20, Math.round(drag.startWidth + deltaX)),
              height: Math.max(14, Math.round(drag.startHeight + deltaY)),
            };
          })
        );
        return;
      }

      const nextLeft = Math.max(0, Math.round(drag.startLeft + deltaX));
      const nextTop = Math.max(0, Math.round(drag.startTop + deltaY));
      const nextWidth = Math.max(20, Math.round(drag.startWidth + deltaX));
      const nextHeight = Math.max(14, Math.round(drag.startHeight + deltaY));

      if (drag.target === "barcode") {
        if (drag.mode === "move") {
          setBarcodeLeft(nextLeft);
          setBarcodeTop(nextTop);
        } else {
          setBarcodeWidth(nextWidth);
          setBarcodeHeight(nextHeight);
        }
        return;
      }

      if (drag.target === "qr") {
        if (drag.mode === "move") {
          setQrLeft(nextLeft);
          setQrTop(nextTop);
        } else {
          setQrWidth(nextWidth);
          setQrHeight(nextHeight);
        }
        return;
      }

      if (drag.target === "logo") {
        if (drag.mode === "move") {
          setLogoLeft(nextLeft);
          setLogoTop(nextTop);
        } else {
          setLogoWidth(nextWidth);
          setLogoHeight(nextHeight);
        }
      }
    };

    const handleUp = () => {
      if (!fieldDragRef.current) return;
      fieldDragRef.current = null;
      setActiveDragKey("");
      setStatus("Layout updated. Save template to persist in organization database.");
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [previewScale]);

  const removeField = (placeholder: string) => {
    const label = getFieldOption(placeholder)?.label ?? placeholder;
    setFields((prev) => prev.filter((entry) => entry.placeholder !== placeholder));
    setStatus(`Removed ${label} field.`);
  };

  const toggleFieldSelection = (placeholder: string) => {
    const alreadySelected = fields.some((entry) => entry.placeholder === placeholder);
    if (alreadySelected) {
      removeField(placeholder);
      return;
    }

    setFields((prev) => [
      ...prev,
      {
        placeholder,
        left: 18,
        top: 18 + prev.length * 26,
        width: 220,
        height: 24,
        fontSize: 16,
        bold: false,
      },
    ]);
    const label = getFieldOption(placeholder)?.label ?? placeholder;
    setStatus(`Added ${label} field.`);
  };

  const updateField = (placeholder: string, patch: Partial<EditableField>) => {
    setFields((prev) =>
      prev.map((entry) => (entry.placeholder === placeholder ? { ...entry, ...patch } : entry))
    );
  };

  const toggleQrField = (placeholder: string) => {
    setQrFields((prev) => {
      if (prev.includes(placeholder)) {
        return prev.filter((item) => item !== placeholder);
      }
      return [...prev, placeholder];
    });
  };

  const getPreviewText = (placeholder: string) => {
    return getFieldOption(placeholder)?.example ?? placeholder;
  };

  const getQrPreviewText = () => {
    const selected = qrFields.map((placeholder) => getPreviewText(placeholder)).filter(Boolean);
    const custom = qrCustomText.trim();
    const allLines = custom ? [...selected, custom] : selected;
    return allLines.join(" | ") || "QR payload";
  };

  const getBarcodeSelectedLabel = () => {
    return BARCODE_FIELD_OPTIONS.find((entry) => entry.placeholder === barcodePlaceholder)?.label ?? "IMEI";
  };

  useEffect(() => {
    if (!qrEnabled) {
      setQrPreviewDataUrl("");
      return;
    }

    let cancelled = false;
    const qrValue = getQrPreviewText();
    const qrSize = Math.max(48, Math.min(720, Math.round(Math.max(qrWidth, qrHeight))));

    QRCode.toDataURL(qrValue, {
      margin: 0,
      width: qrSize,
      errorCorrectionLevel: "M",
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    })
      .then((dataUrl: string) => {
        if (cancelled) return;
        setQrPreviewDataUrl(dataUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setQrPreviewDataUrl("");
      });

    return () => {
      cancelled = true;
    };
  }, [qrEnabled, qrFields, qrCustomText, qrWidth, qrHeight]);

  const handlePrintPreview = async () => {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      setStatus("Popup blocked while trying to print label preview.");
      return;
    }

    const fieldHtml = fields
      .map((field) => {
        const text = escapeHtml(getPreviewText(field.placeholder));
        const fontWeight = field.bold ? "700" : "400";
        return `<div style="position:absolute;left:${field.left}px;top:${field.top}px;width:${field.width}px;height:${field.height}px;font-size:${field.fontSize}px;font-weight:${fontWeight};line-height:1.2;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#111827;">${text}</div>`;
      })
      .join("");

    const logoHtml = logoEnabled
      ? logoDataUrl
        ? `<img src="${logoDataUrl}" alt="Organization Logo" style="position:absolute;left:${logoLeft}px;top:${logoTop}px;width:${logoWidth}px;height:${logoHeight}px;object-fit:contain;"/>`
        : `<div style="position:absolute;left:${logoLeft}px;top:${logoTop}px;width:${logoWidth}px;height:${logoHeight}px;border:1px dashed #64748b;display:flex;align-items:center;justify-content:center;font-size:11px;color:#64748b;">LOGO</div>`
      : "";

    const barcodeHtml = barcodeEnabled
      ? `<div style="position:absolute;left:${barcodeLeft}px;top:${barcodeTop}px;width:${barcodeWidth}px;height:${barcodeHeight}px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;">
            <div style="font-size:10px;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;">|||| ||| |||| || | ||| ||||</div>
            <div style="font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;width:100%;">${escapeHtml(barcodePlaceholder || "{{imei}}")}</div>
         </div>`
      : "";

    let qrHtml = "";
    if (qrEnabled) {
      const qrValue = getQrPreviewText();
      const qrSize = Math.max(48, Math.min(720, Math.round(Math.max(qrWidth, qrHeight))));
      const qrDataUrl = await QRCode.toDataURL(qrValue, {
        margin: 0,
        width: qrSize,
        errorCorrectionLevel: "M",
        color: {
          dark: "#111827",
          light: "#ffffff",
        },
      }).catch(() => "");

      qrHtml = qrDataUrl
        ? `<img src="${qrDataUrl}" alt="QR" style="position:absolute;left:${qrLeft}px;top:${qrTop}px;width:${qrWidth}px;height:${qrHeight}px;object-fit:contain;"/>`
        : `<div style="position:absolute;left:${qrLeft}px;top:${qrTop}px;width:${qrWidth}px;height:${qrHeight}px;display:flex;align-items:center;justify-content:center;font-size:10px;text-align:center;overflow:hidden;">QR</div>`;
    }

    printWindow.document.write(`<!doctype html><html><head><title>Print Label Preview</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:0;padding:24px;background:#fff;color:#0f172a}.sheet{display:flex;justify-content:center}.label{position:relative;width:${canvasSize.width}px;height:${canvasSize.height}px;border:1px solid #0f172a;background:#fff}@media print{body{padding:0}.label{border:none}}</style></head><body><div class="sheet"><div class="label">${fieldHtml}${logoHtml}${barcodeHtml}${qrHtml}</div></div><script>window.onload=()=>window.print();</script></body></html>`);
    printWindow.document.close();
  };

  const saveTemplate = async () => {
    if (!session) {
      setStatus("Sign in to save label template.");
      return;
    }

    setBusy(true);
    setStatus("Saving label template...");

    try {
      const textObjects = fields
        .map((field) => {
          const option = getFieldOption(field.placeholder);
          return {
            type: "i-text",
            text: option?.example ?? field.placeholder,
            textPlaceholder: field.placeholder,
            elementKey: `field:${field.placeholder}`,
            left: field.left,
            top: field.top,
            width: field.width,
            height: field.height,
            fontSize: field.fontSize,
            fontWeight: field.bold ? "bold" : "normal",
            fill: "#111827",
          };
        });

      const objects: Array<Record<string, unknown>> = [...textObjects];

      if (barcodeEnabled) {
        objects.push({
          type: "image",
          isBarcode: true,
          codeType: "code128",
          dataPlaceholder: barcodePlaceholder || "{{imei}}",
          elementKey: "element:barcode",
          left: barcodeLeft,
          top: barcodeTop,
          width: barcodeWidth,
          height: barcodeHeight,
          scaleX: 1,
          scaleY: 1,
        });
      }

      if (qrEnabled) {
        objects.push({
          type: "image",
          isBarcode: true,
          codeType: "qrcode",
          dataPlaceholder: buildQrPlaceholderText(qrFields, qrCustomText),
          qrSelectedFields: qrFields,
          qrCustomText,
          elementKey: "element:qrcode",
          left: qrLeft,
          top: qrTop,
          width: qrWidth,
          height: qrHeight,
          scaleX: 1,
          scaleY: 1,
        });
      }

      if (logoEnabled) {
        objects.push({
          type: "image",
          isLogo: true,
          elementKey: "element:logo",
          left: logoLeft,
          top: logoTop,
          width: logoWidth,
          height: logoHeight,
          scaleX: 1,
          scaleY: 1,
          ...(logoDataUrl ? { src: logoDataUrl } : {}),
        });
      }

      await window.desktop.labelTemplate.save({
        baseUrl,
        template: {
          canvas: {
            width: canvasSize.width,
            height: canvasSize.height,
            objects,
          },
          settings: {
            useCustomSize,
            labelSize,
            customWidthInches,
            customHeightInches,
            orientation,
            previewScalePercent,
          },
        },
      });

      setStatus("Template saved successfully.");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Failed to save label template.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="label-editor">
      <div className="label-editor__header">
        <div>
          <h2>Label Editor</h2>
          <p>Edit label size, fields, QR, barcode, and logo. Saved templates are stored in the organization database for any computer you log in on.</p>
        </div>
        <div className="button-row">
          <button type="button" disabled={busy || !session} onClick={() => void loadFromServer()}>
            Reload
          </button>
          <button type="button" disabled={busy} onClick={handlePrintPreview}>
            Print Preview
          </button>
          <button type="button" disabled={busy || !session} onClick={() => void saveTemplate()}>
            Save Label Template
          </button>
        </div>
      </div>

      {!session ? <p className="hint">Sign in to load and save your label editor settings.</p> : null}

      <div className="label-editor__grid">
        <div className="label-editor__panel label-editor__panel--preview">
          <h3>Preview</h3>
          <div className="label-editor__preview-frame" ref={previewFrameRef}>
            <div
              className="label-editor__preview-canvas"
              style={{
                width: canvasSize.width,
                height: canvasSize.height,
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
              }}
            >
              {fields.map((field) => (
                <div
                  key={field.placeholder}
                  className={activeDragKey === `field:${field.placeholder}` ? "label-editor__preview-text active" : "label-editor__preview-text"}
                  style={{
                    left: field.left,
                    top: field.top,
                    width: field.width,
                    height: field.height,
                    fontSize: field.fontSize,
                    fontWeight: field.bold ? 700 : 400,
                  }}
                  title={field.placeholder}
                  onMouseDown={(event) => startFieldDrag(event, field.placeholder, "move")}
                >
                  {getPreviewText(field.placeholder)}
                  <div
                    className="label-editor__resize-handle"
                    onMouseDown={(event) => startFieldDrag(event, field.placeholder, "resize")}
                  />
                </div>
              ))}

              {logoEnabled ? (
                logoDataUrl ? (
                  <img
                    src={logoDataUrl}
                    alt="Organization Logo"
                    className={activeDragKey === "logo" ? "label-editor__preview-logo active" : "label-editor__preview-logo"}
                    style={{ left: logoLeft, top: logoTop, width: logoWidth, height: logoHeight }}
                    onMouseDown={(event) => startElementDrag(event, "logo", "move", { left: logoLeft, top: logoTop, width: logoWidth, height: logoHeight })}
                  />
                ) : (
                  <div
                    className={activeDragKey === "logo" ? "label-editor__preview-logo-fallback active" : "label-editor__preview-logo-fallback"}
                    style={{ left: logoLeft, top: logoTop, width: logoWidth, height: logoHeight }}
                    onMouseDown={(event) => startElementDrag(event, "logo", "move", { left: logoLeft, top: logoTop, width: logoWidth, height: logoHeight })}
                  >
                    LOGO
                    <div
                      className="label-editor__resize-handle"
                      onMouseDown={(event) => startElementDrag(event, "logo", "resize", { left: logoLeft, top: logoTop, width: logoWidth, height: logoHeight })}
                    />
                  </div>
                )
              ) : null}

              {barcodeEnabled ? (
                <div
                  className={activeDragKey === "barcode" ? "label-editor__preview-barcode active" : "label-editor__preview-barcode"}
                  style={{ left: barcodeLeft, top: barcodeTop, width: barcodeWidth, height: barcodeHeight }}
                  onMouseDown={(event) => startElementDrag(event, "barcode", "move", { left: barcodeLeft, top: barcodeTop, width: barcodeWidth, height: barcodeHeight })}
                >
                  <div className="label-editor__preview-barcode-lines">|||| ||| |||| || | ||| ||||</div>
                  <div className="label-editor__preview-barcode-text">{getBarcodeSelectedLabel()}</div>
                  <div
                    className="label-editor__resize-handle"
                    onMouseDown={(event) => startElementDrag(event, "barcode", "resize", { left: barcodeLeft, top: barcodeTop, width: barcodeWidth, height: barcodeHeight })}
                  />
                </div>
              ) : null}

              {qrEnabled ? (
                <div
                  className={activeDragKey === "qr" ? "label-editor__preview-qr active" : "label-editor__preview-qr"}
                  style={{ left: qrLeft, top: qrTop, width: qrWidth, height: qrHeight }}
                  onMouseDown={(event) => startElementDrag(event, "qr", "move", { left: qrLeft, top: qrTop, width: qrWidth, height: qrHeight })}
                >
                  {qrPreviewDataUrl ? <img src={qrPreviewDataUrl} alt="QR" className="label-editor__preview-qr-image" draggable={false} /> : <span>QR</span>}
                  <div
                    className="label-editor__resize-handle"
                    onMouseDown={(event) => startElementDrag(event, "qr", "resize", { left: qrLeft, top: qrTop, width: qrWidth, height: qrHeight })}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <p className="hint">Live preview of current layout settings.</p>
          <div className="button-row">
            <button
              type="button"
              onClick={() => {
                const next = !logoEnabled;
                setLogoEnabled(next);
                if (next && !logoDataUrl) {
                  setStatus("No organization logo found in database.");
                  return;
                }
                setStatus(next ? "Logo added to template. Drag in preview to position/resize." : "Logo removed from template.");
              }}
            >
              {logoEnabled ? "Remove Logo" : "Add Logo"}
            </button>
          </div>
        </div>

        <div className="label-editor__panel">
          <h3>Label Size</h3>
          <label>
            <span>Use custom size</span>
            <input type="checkbox" checked={useCustomSize} onChange={(event) => setUseCustomSize(event.target.checked)} />
          </label>
          {!useCustomSize ? (
            <label>
              Preset size
              <select value={labelSize} onChange={(event) => setLabelSize(event.target.value as LabelSizeKey)}>
                <option value="small">Small Barcode (2x1 in)</option>
                <option value="shipping">Shipping (4x6 in)</option>
              </select>
            </label>
          ) : (
            <>
              <label>
                Width (inches)
                <input
                  type="number"
                  min={0.5}
                  max={12}
                  step={0.1}
                  value={customWidthInches}
                  onChange={(event) => setCustomWidthInches(Math.max(0.5, Number(event.target.value)))}
                />
              </label>
              <label>
                Height (inches)
                <input
                  type="number"
                  min={0.5}
                  max={12}
                  step={0.1}
                  value={customHeightInches}
                  onChange={(event) => setCustomHeightInches(Math.max(0.5, Number(event.target.value)))}
                />
              </label>
              <label>
                Orientation
                <select value={orientation} onChange={(event) => setOrientation(event.target.value as "portrait" | "landscape")}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
            </>
          )}
          <label>
            Preview scale (%)
            <input
              type="number"
              min={60}
              max={200}
              step={5}
              value={previewScalePercent}
              onChange={(event) => setPreviewScalePercent(Math.max(60, Math.min(200, Number(event.target.value) || 100)))}
            />
          </label>
          <p className="hint">Canvas: {canvasSize.width} x {canvasSize.height}px</p>
        </div>

        <div className="label-editor__panel">
          <h3>Fields</h3>
          <p className="hint">Drag inside preview to move fields. Use the corner handle to resize.</p>
          <div className="label-editor__chips label-editor__chips--fields">
            {FIELD_LIBRARY.map((option) => {
              const isSelected = fields.some((field) => field.placeholder === option.placeholder);
              return (
                <button
                  key={option.placeholder}
                  type="button"
                  className={isSelected ? "chip active" : "chip"}
                  onClick={() => toggleFieldSelection(option.placeholder)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="label-editor__fields">
            {fields.map((field) => {
              const option = getFieldOption(field.placeholder);
              return (
                <div className="label-editor__field-row" key={field.placeholder}>
                  <div className="label-editor__field-title">{option?.label ?? field.placeholder}</div>
                  <div className="label-editor__field-controls-compact">
                    <label>
                      Font
                      <input type="number" value={field.fontSize} onChange={(event) => updateField(field.placeholder, { fontSize: Math.max(8, Number(event.target.value) || 8) })} />
                    </label>
                    <label className="label-editor__checkbox-inline">
                      <input
                        type="checkbox"
                        checked={field.bold}
                        onChange={(event) => updateField(field.placeholder, { bold: event.target.checked })}
                      />
                      Bold
                    </label>
                  </div>
                </div>
              );
            })}
            {fields.length === 0 ? <p className="hint">No fields added yet.</p> : null}
          </div>
        </div>

        <div className="label-editor__panel">
          <h3>Barcode</h3>
          <label>
            <span>Include barcode</span>
            <input type="checkbox" checked={barcodeEnabled} onChange={(event) => setBarcodeEnabled(event.target.checked)} />
          </label>
          <div className="label-editor__chips">
            {BARCODE_FIELD_OPTIONS.map((option) => {
              const isSelected = barcodePlaceholder === option.placeholder;
              return (
                <button
                  key={option.placeholder}
                  type="button"
                  className={isSelected ? "chip active" : "chip"}
                  onClick={() => setBarcodePlaceholder(option.placeholder)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="hint">Drag and resize barcode directly in preview.</p>
        </div>

        <div className="label-editor__panel">
          <h3>QR</h3>
          <label>
            <span>Include QR</span>
            <input type="checkbox" checked={qrEnabled} onChange={(event) => setQrEnabled(event.target.checked)} />
          </label>
          <div className="label-editor__chips">
            {QR_FIELD_OPTIONS.map((option) => {
              const isSelected = qrFields.includes(option.placeholder);
              return (
                <button
                  key={option.placeholder}
                  type="button"
                  className={isSelected ? "chip active" : "chip"}
                  onClick={() => toggleQrField(option.placeholder)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <label>
            QR custom text
            <textarea value={qrCustomText} onChange={(event) => setQrCustomText(event.target.value)} rows={2} />
          </label>
          <p className="hint">Drag and resize QR directly in preview.</p>
        </div>
      </div>

      <p className="hint">{status}</p>
    </div>
  );
}
