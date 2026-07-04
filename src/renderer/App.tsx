import {
  FileImage,
  FlipHorizontal,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Maximize2,
  Moon,
  PanelLeft,
  PanelRight,
  RotateCw,
  Rows3,
  Scan,
  Sun,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImageMetadata, LibraryItem, OpenLibraryResult, Preferences, RecentSource, ThemeMode, ViewMode } from "../shared/types";

interface ImageSize {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 12;
const PANEL_STATE_DELAY_MS = 250;

const viewModeLabels: Record<ViewMode, string> = {
  single: "Single Image",
  "fit-window": "Fit Window",
  "fit-width": "Fit Width",
  original: "Original Size",
  webtoon: "Webtoon Scroll",
  "comic-page": "Comic Page"
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(value?: number): string {
  if (!value) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value?: string): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function App(): React.ReactElement {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<Point | null>(null);
  const panelSaveTimerRef = useRef<number | undefined>(undefined);

  const [library, setLibrary] = useState<OpenLibraryResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recent, setRecent] = useState<RecentSource[]>([]);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [showInfo, setShowInfo] = useState(true);
  const [viewMode, setViewModeState] = useState<ViewMode>("fit-window");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageSize, setImageSize] = useState<ImageSize | undefined>();
  const [metadata, setMetadata] = useState<ImageMetadata | undefined>();
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const items = library?.items ?? [];
  const currentItem = items[currentIndex];
  const itemCount = items.length;

  const displayedSize = useMemo<ImageSize | undefined>(() => {
    const basic = metadata?.basic;
    if (basic?.width && basic.height) {
      return { width: basic.width, height: basic.height };
    }
    return imageSize;
  }, [imageSize, metadata]);

  const calculateFitZoom = useCallback((mode: ViewMode, size = displayedSize): number => {
    if (!viewerRef.current || !size?.width || !size.height) return zoom;
    const bounds = viewerRef.current.getBoundingClientRect();
    const availableWidth = Math.max(120, bounds.width - 48);
    const availableHeight = Math.max(120, bounds.height - 48);

    if (mode === "original") return 1;
    if (mode === "fit-width") return clamp(availableWidth / size.width, MIN_ZOOM, MAX_ZOOM);
    if (mode === "fit-window" || mode === "comic-page") {
      return clamp(Math.min(availableWidth / size.width, availableHeight / size.height), MIN_ZOOM, MAX_ZOOM);
    }
    return zoom;
  }, [displayedSize, zoom]);

  const applyOpenResult = useCallback((result: OpenLibraryResult | null) => {
    if (!result) return;
    setLibrary(result);
    setRecent(result.recent);
    setCurrentIndex(result.selectedIndex);
    setImageSize(undefined);
    setMetadata(undefined);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setFlipped(false);
    setViewModeState("fit-window");
    setZoom(1);
  }, []);

  const runAction = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }, []);

  const openFile = useCallback(() => {
    void runAction(async () => {
      applyOpenResult(await window.suwol.openFile());
    });
  }, [applyOpenResult, runAction]);

  const openFolder = useCallback(() => {
    void runAction(async () => {
      applyOpenResult(await window.suwol.openFolder());
    });
  }, [applyOpenResult, runAction]);

  const openRecent = useCallback((sourceId: string) => {
    if (!sourceId) return;
    void runAction(async () => {
      applyOpenResult(await window.suwol.openRecent(sourceId));
    });
  }, [applyOpenResult, runAction]);

  const moveTo = useCallback((nextIndex: number) => {
    if (itemCount === 0) return;
    setCurrentIndex(clamp(nextIndex, 0, itemCount - 1));
    setImageSize(undefined);
    setMetadata(undefined);
    setPan({ x: 0, y: 0 });
  }, [itemCount]);

  const nextImage = useCallback(() => moveTo(currentIndex + 1), [currentIndex, moveTo]);
  const previousImage = useCallback(() => moveTo(currentIndex - 1), [currentIndex, moveTo]);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setPan({ x: 0, y: 0 });
    if (mode === "original") {
      setZoom(1);
    } else if (mode === "fit-window" || mode === "fit-width" || mode === "comic-page") {
      setZoom(calculateFitZoom(mode));
    }
  }, [calculateFitZoom]);

  const zoomBy = useCallback((factor: number) => {
    setViewModeState((mode) => (mode === "webtoon" ? mode : "single"));
    setZoom((value) => clamp(value * factor, MIN_ZOOM, MAX_ZOOM));
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    void window.suwol.setTheme(nextTheme).then((nextPreferences) => {
      setRecent(nextPreferences.recent);
    });
  }, [theme]);

  useEffect(() => {
    void window.suwol.getPreferences().then((preferences: Preferences) => {
      setTheme(preferences.theme);
      setShowThumbnails(preferences.showThumbnails);
      setShowInfo(preferences.showInfo);
      setRecent(preferences.recent);
      setPreferencesLoaded(true);
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    window.clearTimeout(panelSaveTimerRef.current);
    panelSaveTimerRef.current = window.setTimeout(() => {
      void window.suwol.setPanelState({ showThumbnails, showInfo }).then((nextPreferences) => {
        setRecent(nextPreferences.recent);
      });
    }, PANEL_STATE_DELAY_MS);
  }, [preferencesLoaded, showInfo, showThumbnails]);

  useEffect(() => {
    if (!currentItem) return;
    setMetadataLoading(true);
    void window.suwol
      .getMetadata(currentItem.id)
      .then((data) => {
        setMetadata(data);
        if (data.basic.width && data.basic.height) {
          setImageSize({ width: data.basic.width, height: data.basic.height });
        }
      })
      .catch((metadataError) => {
        setError(errorMessage(metadataError));
      })
      .finally(() => {
        setMetadataLoading(false);
      });
  }, [currentItem]);

  useEffect(() => {
    if (viewMode === "fit-window" || viewMode === "fit-width" || viewMode === "comic-page") {
      setZoom(calculateFitZoom(viewMode));
    }
  }, [calculateFitZoom, displayedSize, viewMode]);

  useEffect(() => {
    const handleResize = () => {
      if (viewMode === "fit-window" || viewMode === "fit-width" || viewMode === "comic-page") {
        setZoom(calculateFitZoom(viewMode));
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [calculateFitZoom, viewMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (modifier && key === "o" && event.shiftKey) {
        event.preventDefault();
        openFolder();
      } else if (modifier && key === "o") {
        event.preventDefault();
        openFile();
      } else if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        nextImage();
      } else if (event.key === "ArrowLeft" || event.key === "Backspace") {
        event.preventDefault();
        previousImage();
      } else if (event.key === "+" || event.key === "=" || event.key === "*") {
        zoomBy(1.15);
      } else if (event.key === "-") {
        zoomBy(1 / 1.15);
      } else if (event.key === "0") {
        setViewMode("original");
      } else if (event.key === "1") {
        setViewMode("fit-window");
      } else if (event.key === "2") {
        setViewMode("fit-width");
      } else if (key === "r") {
        setRotation((value) => (value + 90) % 360);
      } else if (key === "f") {
        event.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void document.documentElement.requestFullscreen();
        }
      } else if (key === "t") {
        setShowThumbnails((value) => !value);
      } else if (key === "i") {
        setShowInfo((value) => !value);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextImage, openFile, openFolder, previousImage, setViewMode, zoomBy]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!currentItem || viewMode === "webtoon") return;
    dragStartRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || !isDragging) return;
    setPan({
      x: event.clientX - dragStartRef.current.x,
      y: event.clientY - dragStartRef.current.y
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsDragging(false);
  };

  const displayTransform = {
    transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scaleX(${flipped ? -1 : 1}) scale(${zoom})`
  };

  const statusResolution = displayedSize ? `${displayedSize.width} x ${displayedSize.height}` : "Unknown";

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="toolbar-group">
          <button className="command-button" onClick={openFile} disabled={busy} title="Open File">
            <FileImage size={17} />
            <span>Open File</span>
          </button>
          <button className="command-button" onClick={openFolder} disabled={busy} title="Open Folder">
            <FolderOpen size={17} />
            <span>Open Folder</span>
          </button>
          <select className="select-control" value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)}>
            {Object.entries(viewModeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select className="select-control recent-select" value="" onChange={(event) => openRecent(event.target.value)} title="Recent">
            <option value="">Recent</option>
            {recent.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-group">
          <button className="icon-button" onClick={() => zoomBy(1 / 1.15)} disabled={!currentItem} title="Zoom Out">
            <ZoomOut size={18} />
          </button>
          <button className="icon-button" onClick={() => zoomBy(1.15)} disabled={!currentItem} title="Zoom In">
            <ZoomIn size={18} />
          </button>
          <button className="icon-button" onClick={() => setViewMode("fit-window")} disabled={!currentItem} title="Fit Window">
            <Maximize2 size={18} />
          </button>
          <button className="icon-button" onClick={() => setViewMode("fit-width")} disabled={!currentItem} title="Fit Width">
            <Scan size={18} />
          </button>
          <button className="icon-button" onClick={() => setViewMode("webtoon")} disabled={!currentItem} title="Webtoon Scroll">
            <Rows3 size={18} />
          </button>
          <button className="icon-button" onClick={() => setRotation((value) => (value + 90) % 360)} disabled={!currentItem} title="Rotate">
            <RotateCw size={18} />
          </button>
          <button className="icon-button" onClick={() => setFlipped((value) => !value)} disabled={!currentItem} title="Flip Horizontal">
            <FlipHorizontal size={18} />
          </button>
          <button className="icon-button" onClick={() => setShowThumbnails((value) => !value)} title="Thumbnails">
            <PanelLeft size={18} />
          </button>
          <button className="icon-button" onClick={() => setShowInfo((value) => !value)} title="Info">
            <PanelRight size={18} />
          </button>
          <button className="icon-button" onClick={toggleTheme} title="Theme">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className={`workspace ${showThumbnails ? "" : "hide-thumbnails"} ${showInfo ? "" : "hide-info"}`}>
        {showThumbnails && (
          <aside className="thumbnail-panel">
            {items.map((item) => (
              <button
                className={`thumbnail-item ${item.index === currentIndex ? "active" : ""}`}
                key={item.id}
                onClick={() => moveTo(item.index)}
                title={item.name}
              >
                <span className="thumbnail-frame">
                  <img src={item.thumbnailUrl} alt="" loading="lazy" />
                </span>
                <span className="thumbnail-name">{item.name}</span>
              </button>
            ))}
          </aside>
        )}

        <section
          className={`viewer-surface ${isDragging ? "dragging" : ""}`}
          ref={viewerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {error && <div className="toast">{error}</div>}
          {!currentItem && (
            <div className="empty-state">
              <ImageIcon size={48} />
              <span>SuwolView</span>
            </div>
          )}

          {currentItem && viewMode !== "webtoon" && (
            <img
              className="main-image"
              src={currentItem.displayUrl}
              alt={currentItem.name}
              draggable={false}
              style={displayTransform}
              onLoad={(event) => {
                const nextSize = {
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight
                };
                setImageSize(nextSize);
                if (viewMode === "fit-window" || viewMode === "fit-width" || viewMode === "comic-page") {
                  setZoom(calculateFitZoom(viewMode, nextSize));
                }
              }}
            />
          )}

          {currentItem && viewMode === "webtoon" && (
            <div className="webtoon-strip" style={{ "--webtoon-zoom": String(zoom) } as React.CSSProperties}>
              {items.map((item) => (
                <img
                  key={item.id}
                  className={`webtoon-image ${item.index === currentIndex ? "active" : ""}`}
                  src={item.displayUrl}
                  alt={item.name}
                  loading="lazy"
                  onClick={() => moveTo(item.index)}
                />
              ))}
            </div>
          )}
        </section>

        {showInfo && (
          <aside className="info-panel">
            <div className="panel-title">
              <Info size={17} />
              <span>Info</span>
            </div>
            {currentItem ? (
              <MetadataPanel item={currentItem} metadata={metadata} loading={metadataLoading} />
            ) : (
              <div className="muted-line">No file</div>
            )}
          </aside>
        )}
      </main>

      <footer className="status-bar">
        <span className="status-file">{currentItem?.name ?? "No file selected"}</span>
        <span>{statusResolution}</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span>
          {itemCount > 0 ? currentIndex + 1 : 0} / {itemCount}
        </span>
        {busy && <span>Working</span>}
      </footer>
    </div>
  );
}

function MetadataPanel({ item, metadata, loading }: { item: LibraryItem; metadata?: ImageMetadata; loading: boolean }): React.ReactElement {
  const basic = metadata?.basic;
  const exifEntries = Object.entries(metadata?.exif ?? {}).slice(0, 80);

  return (
    <div className="metadata-content">
      <InfoRow label="File" value={item.name} />
      <InfoRow label="Container" value={item.containerName ?? item.sourceKind} />
      <InfoRow label="Format" value={item.extension.toUpperCase()} />
      <InfoRow label="Support" value={item.support.label} />
      <InfoRow label="Size" value={formatBytes(item.sizeBytes)} />
      <InfoRow label="Modified" value={formatDate(item.modifiedAt)} />
      <InfoRow label="Width" value={basic?.width ? String(basic.width) : "Unknown"} />
      <InfoRow label="Height" value={basic?.height ? String(basic.height) : "Unknown"} />
      <InfoRow label="Color" value={basic?.space ?? "Unknown"} />
      <InfoRow label="Pages" value={basic?.pages ? String(basic.pages) : "1"} />
      {loading && <div className="muted-line">Reading metadata</div>}
      {exifEntries.length > 0 && (
        <>
          <div className="subheading">EXIF</div>
          {exifEntries.map(([key, value]) => (
            <InfoRow key={key} label={key} value={value} />
          ))}
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
    </div>
  );
}
