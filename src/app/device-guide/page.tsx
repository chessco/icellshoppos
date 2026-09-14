"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";
import {
  fetchModelCatalog,
  saveModelCatalogRemote,
  type ModelCatalog,
} from "@/lib/modelCatalog";
import { useSubscriptionStatus } from "@/lib/useSubscriptionStatus";
import ToolUnavailableBanner from "@/components/ToolUnavailableBanner";

type CatalogDraft = {
  capacities: string;
  colors: string;
};

type CsvRow = Record<string, string>;

export default function DeviceGuidePage() {
  const pathname = usePathname();
  const { isActive, loading: subLoading } = useSubscriptionStatus();
  const [catalog, setCatalog] = useState<ModelCatalog>({});
  const [catalogDrafts, setCatalogDrafts] = useState<Record<string, CatalogDraft>>({});
  const [newModel, setNewModel] = useState("");
  const [newCapacities, setNewCapacities] = useState("");
  const [newColors, setNewColors] = useState("");
  const [guideStatus, setGuideStatus] = useState<string | null>(null);

  const normalizeList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const csvEscape = (value: string) => {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const parseCsvLine = (line: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result.map((value) => value.trim());
  };

  const parseCsv = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return { headers: [] as string[], rows: [] as CsvRow[] };
    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const row: CsvRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return row;
    });
    return { headers, rows };
  };

  const readFileText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
      reader.readAsText(file);
    });

  const downloadCsv = (filename: string, rows: string[][]) => {
    const content = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  useEffect(() => {
    void (async () => {
      const loadedCatalog = await fetchModelCatalog();
      setCatalog(loadedCatalog);
      const nextDrafts: Record<string, CatalogDraft> = {};
      Object.entries(loadedCatalog).forEach(([model, entry]) => {
        nextDrafts[model] = {
          capacities: entry.capacities.join(", "),
          colors: entry.colors.join(", "),
        };
      });
      setCatalogDrafts(nextDrafts);
    })();
  }, []);

  const handleSaveCatalog = async () => {
    const nextCatalog: ModelCatalog = {};
    Object.entries(catalogDrafts).forEach(([model, draft]) => {
      const cleanModel = model.trim();
      if (!cleanModel) return;
      const capacities = normalizeList(draft.capacities);
      const colors = normalizeList(draft.colors);
      if (capacities.length === 0 || colors.length === 0) return;
      nextCatalog[cleanModel] = { capacities, colors };
    });

    if (Object.keys(nextCatalog).length === 0) {
      setGuideStatus("Device guide must include at least one model.");
      return;
    }

    try {
      const persisted = await saveModelCatalogRemote(nextCatalog);
      setCatalog(persisted);
      setGuideStatus("Device guide saved.");
    } catch (error: unknown) {
      setGuideStatus(error instanceof Error ? error.message : "Failed to save device guide.");
    }
  };

  const handleDownloadGuide = () => {
    const rows: string[][] = [["Title", "Storage", "Color"]];
    Object.entries(catalog).forEach(([model, entry]) => {
      rows.push([model, entry.capacities.join(", "), entry.colors.join(", ")]);
    });
    if (rows.length === 1) {
      rows.push(["iPhone 11", "64GB, 256GB, 512GB", "Purple, Yellow, Green, Black, White, Red"]);
    }
    downloadCsv("device-guide-template.csv", rows);
  };

  const handleUploadGuide = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await readFileText(file);
      const { rows } = parseCsv(text);
      const nextCatalog: ModelCatalog = {};
      rows.forEach((row) => {
        const model = row.title || row.model || row.device || "";
        const storage = row.storage || row.capacity || row.capacities || "";
        const colors = row.color || row.colors || "";
        if (!model.trim()) return;
        const capacities = normalizeList(storage);
        const colorList = normalizeList(colors);
        if (capacities.length === 0 || colorList.length === 0) return;
        nextCatalog[model.trim()] = { capacities, colors: colorList };
      });

      if (Object.keys(nextCatalog).length === 0) {
        setGuideStatus("No valid device guide rows found.");
        return;
      }

      setCatalogDrafts(() => {
        const drafts: Record<string, CatalogDraft> = {};
        Object.entries(nextCatalog).forEach(([model, entry]) => {
          drafts[model] = {
            capacities: entry.capacities.join(", "),
            colors: entry.colors.join(", "),
          };
        });
        return drafts;
      });
      const persisted = await saveModelCatalogRemote(nextCatalog);
      setCatalog(persisted);
      setGuideStatus("CSV imported successfully.");
    } catch (error: unknown) {
      setGuideStatus(error instanceof Error ? error.message : "Failed to import device guide.");
    }
  };

  const handleAddModel = () => {
    const model = newModel.trim();
    if (!model) {
      setGuideStatus("Enter a model name.");
      return;
    }
    setCatalogDrafts((prev) => ({
      ...prev,
      [model]: {
        capacities: newCapacities.trim(),
        colors: newColors.trim(),
      },
    }));
    setNewModel("");
    setNewCapacities("");
    setNewColors("");
    setGuideStatus(null);
  };

  const handleRemoveModel = (model: string) => {
    setCatalogDrafts((prev) => {
      const next = { ...prev };
      delete next[model];
      return next;
    });
  };

  if (!subLoading && isActive === false) {
    return (
      <div className="app-shell">
        <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
            <CurrentOrgBadge />
          </div>
        </nav>
        <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
          <AppSidebar pathname={pathname} />
          <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
            <ToolUnavailableBanner toolName="Device Guide" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <CurrentOrgBadge />
        </div>
      </nav>

      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">Device Guide</h1>
            <p className="text-sm text-[#6a4d3a]">
              Manage valid model, storage, and color combinations.
            </p>
          </header>

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#1f1a16]">Device Guide</h2>
                <p className="text-sm text-[#6a4d3a]">
                  Upload or edit the allowed configurations.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-semibold text-[#3b2a1e]"
                  onClick={handleDownloadGuide}
                  type="button"
                >
                  Download CSV
                </button>
                <label className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-semibold text-[#3b2a1e] cursor-pointer">
                  Upload CSV
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(event) => handleUploadGuide(event.target.files?.[0] || null)}
                  />
                </label>
                <button
                  className="rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    void handleSaveCatalog();
                  }}
                  type="button"
                >
                  Save Guide
                </button>
                {guideStatus && (
                  <span className="text-sm text-[#6a4d3a]">{guideStatus}</span>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {Object.keys(catalogDrafts).length === 0 && (
                <p className="text-sm text-[#6a4d3a]">No models configured.</p>
              )}
              {Object.entries(catalogDrafts).map(([model, entry]) => (
                <div
                  key={model}
                  className="grid gap-3 rounded-xl border border-[#e6d6c6] bg-[#fffaf3] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#1f1a16]">{model}</span>
                    <button
                      className="rounded-full border border-[#d6c1ad] px-3 py-1 text-xs font-semibold text-[#c24d34]"
                      onClick={() => handleRemoveModel(model)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={entry.capacities}
                      onChange={(event) =>
                        setCatalogDrafts((prev) => ({
                          ...prev,
                          [model]: { ...prev[model], capacities: event.target.value },
                        }))
                      }
                      className="rounded-xl border border-[#e6d6c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                      placeholder="Storage (comma-separated)"
                    />
                    <input
                      value={entry.colors}
                      onChange={(event) =>
                        setCatalogDrafts((prev) => ({
                          ...prev,
                          [model]: { ...prev[model], colors: event.target.value },
                        }))
                      }
                      className="rounded-xl border border-[#e6d6c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                      placeholder="Colors (comma-separated)"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-[#e6d6c6] bg-[#fffaf3] p-4">
              <div className="text-sm font-semibold text-[#1f1a16]">Add Model</div>
              <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_auto]">
                <input
                  value={newModel}
                  onChange={(event) => setNewModel(event.target.value)}
                  className="rounded-xl border border-[#e6d6c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                  placeholder="Model"
                />
                <input
                  value={newCapacities}
                  onChange={(event) => setNewCapacities(event.target.value)}
                  className="rounded-xl border border-[#e6d6c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                  placeholder="Storage"
                />
                <input
                  value={newColors}
                  onChange={(event) => setNewColors(event.target.value)}
                  className="rounded-xl border border-[#e6d6c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                  placeholder="Colors"
                />
                <button
                  className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-semibold text-[#3b2a1e]"
                  onClick={handleAddModel}
                  type="button"
                >
                  Add
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

