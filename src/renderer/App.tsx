import {
  Copy,
  Download,
  FolderCog,
  ExternalLink,
  FileImage,
  FlipHorizontal,
  FolderOpen,
  Fullscreen,
  Image as ImageIcon,
  Info,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeft,
  PanelRight,
  Power,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Rows3,
  Scan,
  ShieldCheck,
  Sun,
  Trash2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { TFunction } from "i18next";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AUTO_HIDE_DELAY_MS, DEFAULT_CHROME_PREFERENCES, EDGE_HOT_ZONE_PX, isBottomStatusBarVisible } from "../shared/chromePreferences";
import i18n from "../shared/i18n";
import { formatErrorMessage } from "../shared/i18n/errors";
import { builtInLanguages, languageOptions, normalizeLanguagePreference, resolveAppLanguage } from "../shared/i18n/languages";
import {
  DEFAULT_PANEL_PREFERENCES,
  LEFT_PANEL_DEFAULT_WIDTH,
  LEFT_PANEL_MAX_WIDTH,
  LEFT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH
} from "../shared/panelPreferences";
import type {
  AppLanguageSetting,
  AppError,
  CacheStats,
  ChromeBarMode,
  ImageMetadata,
  LibraryItem,
  LocaleInfo,
  OpenLibraryResult,
  Preferences,
  RecentSource,
  RuntimeInfo,
  ThemeMode,
  UpdateState,
  ViewMode
} from "../shared/types";

interface ImageSize {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

type ResizePanelSide = "left" | "right";

interface PanelResizeState {
  side: ResizePanelSide;
  startX: number;
  startWidth: number;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 12;
const PANEL_STATE_DELAY_MS = 250;
const METADATA_REQUEST_DELAY_MS = 250;

const viewModeOptions: readonly ViewMode[] = ["single", "fit-window", "fit-width", "original", "webtoon", "comic-page"];

const viewModeLabelKeys: Record<ViewMode, string> = {
  single: "viewer.singleImage",
  "fit-window": "viewer.fitWindow",
  "fit-width": "viewer.fitWidth",
  original: "viewer.originalSize",
  webtoon: "viewer.webtoonScroll",
  "comic-page": "viewer.comicPage"
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(value: number | undefined, unknownLabel: string): string {
  if (value === undefined || value === null) return unknownLabel;
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string | undefined, locale: string, unknownLabel: string): string {
  if (!value) return unknownLabel;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function localeCandidates(localeInfo: LocaleInfo | undefined): string[] {
  const browserLanguages = typeof navigator === "undefined" ? [] : [...navigator.languages, navigator.language];
  return [
    ...(localeInfo?.preferredSystemLanguages ?? []),
    localeInfo?.locale,
    ...browserLanguages
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function translatedErrorMessage(error: unknown, t: TFunction): string {
  return formatErrorMessage(error, t);
}

function clampPanelWidth(side: ResizePanelSide, width: number): number {
  if (side === "left") {
    return clamp(width, LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH);
  }
  return clamp(width, RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH);
}

function chromeModeForAutoHide(autoHide: boolean): ChromeBarMode {
  return autoHide ? "auto" : "always";
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("button, input, textarea, select, option, [contenteditable='true']"));
}

export function App(): React.ReactElement {
  const { t } = useTranslation();
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<Point | null>(null);
  const panelResizeRef = useRef<PanelResizeState | null>(null);
  const panelSaveTimerRef = useRef<number | undefined>(undefined);
  const chromeSaveTimerRef = useRef<number | undefined>(undefined);
  const topChromeHideTimerRef = useRef<number | undefined>(undefined);
  const topChromeHoveredRef = useRef(false);
  const topChromeFocusedRef = useRef(false);
  const preferencesLoadStartedRef = useRef(false);
  const openRequestRef = useRef(0);
  const externalOpenRequestRef = useRef(0);
  const metadataRequestRef = useRef(0);
  const currentItemIdRef = useRef<string | undefined>(undefined);

  const [library, setLibrary] = useState<OpenLibraryResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recent, setRecent] = useState<RecentSource[]>([]);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [language, setLanguage] = useState<AppLanguageSetting>("system");
  const [localeInfo, setLocaleInfo] = useState<LocaleInfo | undefined>();
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | undefined>();
  const [cacheStats, setCacheStats] = useState<CacheStats | undefined>();
  const [updateStatus, setUpdateStatus] = useState<UpdateState | undefined>();
  const [checkForUpdatesOnStartup, setCheckForUpdatesOnStartup] = useState(false);
  const [leftPanelVisible, setLeftPanelVisible] = useState(DEFAULT_PANEL_PREFERENCES.leftPanelVisible);
  const [rightPanelVisible, setRightPanelVisible] = useState(DEFAULT_PANEL_PREFERENCES.rightPanelVisible);
  const [leftPanelWidth, setLeftPanelWidth] = useState(DEFAULT_PANEL_PREFERENCES.leftPanelWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_PANEL_PREFERENCES.rightPanelWidth);
  const [topBarMode, setTopBarMode] = useState<ChromeBarMode>(DEFAULT_CHROME_PREFERENCES.topBarMode);
  const [topBarAutoVisible, setTopBarAutoVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [viewMode, setViewModeState] = useState<ViewMode>("fit-window");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageSize, setImageSize] = useState<ImageSize | undefined>();
  const [metadata, setMetadata] = useState<ImageMetadata | undefined>();
  const [metadataError, setMetadataError] = useState<string | undefined>();
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const items = library?.items ?? [];
  const currentItem = items[currentIndex];
  const itemCount = items.length;
  const resolvedLanguage = resolveAppLanguage(language, localeCandidates(localeInfo));

  useEffect(() => {
    currentItemIdRef.current = currentItem?.id;
  }, [currentItem?.id]);

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
    setMetadataError(undefined);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setFlipped(false);
    setViewModeState("fit-window");
    setZoom(1);
  }, []);

  const runOpenAction = useCallback(async (action: () => Promise<OpenLibraryResult | null>) => {
    const requestId = openRequestRef.current + 1;
    openRequestRef.current = requestId;
    setBusy(true);
    setError(undefined);
    try {
      const result = await action();
      if (openRequestRef.current === requestId) {
        applyOpenResult(result);
      }
    } catch (actionError) {
      if (openRequestRef.current === requestId) {
        setError(translatedErrorMessage(actionError, t));
      }
    } finally {
      if (openRequestRef.current === requestId) {
        setBusy(false);
      }
    }
  }, [applyOpenResult, t]);

  const applyExternalOpenResult = useCallback((requestId: number, result: OpenLibraryResult) => {
    if (requestId < externalOpenRequestRef.current) return;
    externalOpenRequestRef.current = requestId;
    openRequestRef.current += 1;
    setBusy(false);
    setError(undefined);
    applyOpenResult(result);
  }, [applyOpenResult]);

  const applyExternalOpenError = useCallback((requestId: number, appError: AppError) => {
    if (requestId < externalOpenRequestRef.current) return;
    externalOpenRequestRef.current = requestId;
    setBusy(false);
    setError(translatedErrorMessage(appError, t));
  }, [t]);

  const openFile = useCallback(() => {
    void runOpenAction(() => window.suwol.openFile());
  }, [runOpenAction]);

  const openFolder = useCallback(() => {
    void runOpenAction(() => window.suwol.openFolder());
  }, [runOpenAction]);

  const openRecent = useCallback((sourceId: string) => {
    if (!sourceId) return;
    void runOpenAction(() => window.suwol.openRecent(sourceId));
  }, [runOpenAction]);

  const openDroppedPaths = useCallback((paths: string[]) => {
    if (paths.length === 0) {
      setError(t("errors.dropUnsupported"));
      return;
    }
    void runOpenAction(() => window.suwol.openDroppedPaths(paths));
  }, [runOpenAction, t]);

  const applyPreferences = useCallback(async (preferences: Preferences, nextLocaleInfo = localeInfo) => {
    const nextLanguage = normalizeLanguagePreference(preferences.language);
    setTheme(preferences.theme);
    setLanguage(nextLanguage);
    setTopBarMode(preferences.topBarMode);
    setLeftPanelVisible(preferences.leftPanelVisible);
    setRightPanelVisible(preferences.rightPanelVisible);
    setLeftPanelWidth(preferences.leftPanelWidth);
    setRightPanelWidth(preferences.rightPanelWidth);
    setCheckForUpdatesOnStartup(preferences.checkForUpdatesOnStartup);
    setRecent(preferences.recent);
    await i18n.changeLanguage(resolveAppLanguage(nextLanguage, localeCandidates(nextLocaleInfo)));
  }, [localeInfo]);

  const moveTo = useCallback((nextIndex: number) => {
    if (itemCount === 0) return;
    setCurrentIndex(clamp(nextIndex, 0, itemCount - 1));
    setImageSize(undefined);
    setMetadata(undefined);
    setMetadataError(undefined);
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

  const applyLanguage = useCallback(async (nextLanguage: AppLanguageSetting, nextLocaleInfo = localeInfo) => {
    await i18n.changeLanguage(resolveAppLanguage(nextLanguage, localeCandidates(nextLocaleInfo)));
  }, [localeInfo]);

  const changeLanguage = useCallback((nextLanguage: AppLanguageSetting) => {
    const normalizedLanguage = normalizeLanguagePreference(nextLanguage);
    setLanguage(normalizedLanguage);
    void applyLanguage(normalizedLanguage).catch((languageError) => {
      setError(translatedErrorMessage(languageError, t));
    });
    void window.suwol
      .setLanguage(normalizedLanguage)
      .then((nextPreferences) => {
        setLanguage(normalizeLanguagePreference(nextPreferences.language));
        setRecent(nextPreferences.recent);
      })
      .catch((languageError) => {
        setError(translatedErrorMessage(languageError, t));
      });
  }, [applyLanguage, t]);

  const toggleTheme = useCallback(() => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    void window.suwol.setTheme(nextTheme).then((nextPreferences) => {
      setRecent(nextPreferences.recent);
    });
  }, [theme]);

  const setTopChromeAutoVisible = useCallback((visible: boolean) => {
    setTopBarAutoVisible((current) => (current === visible ? current : visible));
  }, []);

  const clearTopChromeHideTimer = useCallback(() => {
    const timerRef = topChromeHideTimerRef;
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const showTopChrome = useCallback(() => {
    clearTopChromeHideTimer();
    setTopChromeAutoVisible(true);
  }, [clearTopChromeHideTimer, setTopChromeAutoVisible]);

  const scheduleTopChromeHide = useCallback((resetTimer = false) => {
    if (topBarMode !== "auto") return;

    const timerRef = topChromeHideTimerRef;
    if (timerRef.current !== undefined && !resetTimer) return;
    clearTopChromeHideTimer();

    timerRef.current = window.setTimeout(() => {
      const hovered = topChromeHoveredRef.current;
      const focused = topChromeFocusedRef.current;
      timerRef.current = undefined;
      if (!hovered && !focused) {
        setTopChromeAutoVisible(false);
      }
    }, AUTO_HIDE_DELAY_MS);
  }, [clearTopChromeHideTimer, setTopChromeAutoVisible, topBarMode]);

  const handleTopChromePointerEnter = useCallback(() => {
    topChromeHoveredRef.current = true;
    showTopChrome();
  }, [showTopChrome]);

  const handleTopChromePointerLeave = useCallback(() => {
    topChromeHoveredRef.current = false;
    scheduleTopChromeHide(true);
  }, [scheduleTopChromeHide]);

  const handleTopChromeFocus = useCallback(() => {
    topChromeFocusedRef.current = true;
    showTopChrome();
  }, [showTopChrome]);

  const handleTopChromeBlur = useCallback((event: React.FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    topChromeFocusedRef.current = false;
    scheduleTopChromeHide(true);
  }, [scheduleTopChromeHide]);

  const handleShellMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging || isResizingPanel) return;

    const topInHotZone = event.clientY <= EDGE_HOT_ZONE_PX;

    if (topBarMode === "auto") {
      if (topInHotZone) {
        showTopChrome();
      } else if (topBarAutoVisible && !topChromeHoveredRef.current && !topChromeFocusedRef.current) {
        scheduleTopChromeHide();
      }
    }
  }, [
    isDragging,
    isResizingPanel,
    scheduleTopChromeHide,
    showTopChrome,
    topBarAutoVisible,
    topBarMode
  ]);

  useEffect(() => {
    if (preferencesLoadStartedRef.current) return;
    preferencesLoadStartedRef.current = true;
    void Promise.all([
      window.suwol.getPreferences(),
      window.suwol.getLocaleInfo(),
      window.suwol.getRuntimeInfo(),
      window.suwol.getCacheStats(),
      window.suwol.getUpdateStatus()
    ])
      .then(async ([preferences, nextLocaleInfo, nextRuntimeInfo, nextCacheStats, nextUpdateStatus]: [
        Preferences,
        LocaleInfo,
        RuntimeInfo,
        CacheStats,
        UpdateState
      ]) => {
        setLocaleInfo(nextLocaleInfo);
        setRuntimeInfo(nextRuntimeInfo);
        setCacheStats(nextCacheStats);
        setUpdateStatus(nextUpdateStatus);
        await applyPreferences(preferences, nextLocaleInfo);
      })
      .catch((preferencesError) => {
        setError(translatedErrorMessage(preferencesError, t));
      })
      .finally(() => {
        setPreferencesLoaded(true);
      });
  }, [applyPreferences, t]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    return () => {
      document.body.classList.remove("is-resizing-panel");
      window.clearTimeout(panelSaveTimerRef.current);
      window.clearTimeout(chromeSaveTimerRef.current);
      window.clearTimeout(topChromeHideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    clearTopChromeHideTimer();
    setTopBarAutoVisible(false);
  }, [clearTopChromeHideTimer, topBarMode]);

  useEffect(() => {
    const handleDroppedPaths = (event: Event) => {
      const paths = (event as CustomEvent<string[]>).detail;
      if (Array.isArray(paths)) {
        openDroppedPaths(paths);
      }
    };

    window.addEventListener("suwol:dropped-paths", handleDroppedPaths);
    return () => window.removeEventListener("suwol:dropped-paths", handleDroppedPaths);
  }, [openDroppedPaths]);

  useEffect(() => {
    const handleOpenResult = (event: WindowEventMap["suwol:open-library-result"]) => {
      const payload = event.detail;
      if (typeof payload?.requestId === "number" && payload.result) {
        applyExternalOpenResult(payload.requestId, payload.result);
      }
    };
    const handleOpenError = (event: WindowEventMap["suwol:open-error"]) => {
      const payload = event.detail;
      if (typeof payload?.requestId === "number" && payload.error) {
        applyExternalOpenError(payload.requestId, payload.error);
      }
    };

    window.addEventListener("suwol:open-library-result", handleOpenResult);
    window.addEventListener("suwol:open-error", handleOpenError);
    return () => {
      window.removeEventListener("suwol:open-library-result", handleOpenResult);
      window.removeEventListener("suwol:open-error", handleOpenError);
    };
  }, [applyExternalOpenError, applyExternalOpenResult]);

  useEffect(() => {
    void window.suwol.rendererReady().catch((readyError) => {
      setError(translatedErrorMessage(readyError, t));
    });
  }, [t]);

  useEffect(() => {
    const handleFullscreenChanged = (event: WindowEventMap["suwol:fullscreen-changed"]) => {
      setFullscreen(event.detail.fullscreen === true);
    };

    window.addEventListener("suwol:fullscreen-changed", handleFullscreenChanged);
    void window.suwol
      .getFullscreenState()
      .then(setFullscreen)
      .catch((fullscreenError) => {
        setError(translatedErrorMessage(fullscreenError, t));
      });

    return () => window.removeEventListener("suwol:fullscreen-changed", handleFullscreenChanged);
  }, [t]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    window.clearTimeout(panelSaveTimerRef.current);
    panelSaveTimerRef.current = window.setTimeout(() => {
      void window.suwol
        .updatePanelPreferences({
          leftPanelVisible,
          rightPanelVisible,
          leftPanelWidth,
          rightPanelWidth
        })
        .then((nextPreferences) => {
          setRecent(nextPreferences.recent);
        });
    }, PANEL_STATE_DELAY_MS);
  }, [leftPanelVisible, leftPanelWidth, preferencesLoaded, rightPanelVisible, rightPanelWidth]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    window.clearTimeout(chromeSaveTimerRef.current);
    chromeSaveTimerRef.current = window.setTimeout(() => {
      void window.suwol
        .updateChromePreferences({
          topBarMode
        })
        .then((nextPreferences) => {
          setRecent(nextPreferences.recent);
        });
    }, PANEL_STATE_DELAY_MS);
  }, [preferencesLoaded, topBarMode]);

  useEffect(() => {
    const requestId = metadataRequestRef.current + 1;
    metadataRequestRef.current = requestId;

    if (!currentItem || !rightPanelVisible) {
      setMetadata(undefined);
      setMetadataError(undefined);
      setMetadataLoading(false);
      return;
    }

    const requestedItemId = currentItem.id;
    setMetadataLoading(true);
    setMetadataError(undefined);

    const timerId = window.setTimeout(() => {
      void window.suwol
        .getMetadata(requestedItemId)
        .then((result) => {
          if (metadataRequestRef.current !== requestId || currentItemIdRef.current !== requestedItemId) return;
          if (result.ok) {
            const data = result.data;
            setMetadata(data);
            if (data.basic.width && data.basic.height) {
              setImageSize({ width: data.basic.width, height: data.basic.height });
            }
          } else {
            setMetadata(undefined);
            setMetadataError(translatedErrorMessage(result, t));
          }
        })
        .catch((metadataError) => {
          if (metadataRequestRef.current === requestId && currentItemIdRef.current === requestedItemId) {
            setMetadata(undefined);
            setMetadataError(translatedErrorMessage(metadataError, t));
          }
        })
        .finally(() => {
          if (metadataRequestRef.current === requestId && currentItemIdRef.current === requestedItemId) {
            setMetadataLoading(false);
          }
        });
    }, METADATA_REQUEST_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [currentItem, rightPanelVisible, t]);

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

  const toggleFullscreen = useCallback(() => {
    void window.suwol
      .toggleFullscreen()
      .then(setFullscreen)
      .catch((fullscreenError) => {
        setError(translatedErrorMessage(fullscreenError, t));
      });
  }, [t]);

  const exitFullscreen = useCallback(() => {
    void window.suwol
      .setFullscreen(false)
      .then(setFullscreen)
      .catch((fullscreenError) => {
        setError(translatedErrorMessage(fullscreenError, t));
      });
  }, [t]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const editableTarget = isEditableShortcutTarget(event.target);
      const interactiveTarget = isInteractiveShortcutTarget(event.target);

      if (modifier && key === "o" && event.shiftKey) {
        event.preventDefault();
        openFolder();
      } else if (modifier && key === "o") {
        event.preventDefault();
        openFile();
      } else if (event.key === "F11") {
        event.preventDefault();
        toggleFullscreen();
      } else if (event.key === "Escape" && fullscreen && !editableTarget) {
        event.preventDefault();
        exitFullscreen();
      } else if (event.key === "Tab" && !interactiveTarget) {
        event.preventDefault();
        setRightPanelVisible((value) => !value);
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
        toggleFullscreen();
      } else if (key === "t") {
        setLeftPanelVisible((value) => !value);
      } else if (key === "i") {
        setRightPanelVisible((value) => !value);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exitFullscreen, fullscreen, nextImage, openFile, openFolder, previousImage, setViewMode, toggleFullscreen, zoomBy]);

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

  const startPanelResize = (side: ResizePanelSide, event: React.PointerEvent<HTMLDivElement>) => {
    const startWidth = side === "left" ? leftPanelWidth : rightPanelWidth;
    panelResizeRef.current = {
      side,
      startX: event.clientX,
      startWidth
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-panel");
    setIsResizingPanel(true);
  };

  const movePanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resizeState = panelResizeRef.current;
    if (!resizeState) return;
    const delta = event.clientX - resizeState.startX;
    const nextWidth =
      resizeState.side === "left"
        ? clampPanelWidth("left", resizeState.startWidth + delta)
        : clampPanelWidth("right", resizeState.startWidth - delta);
    if (resizeState.side === "left") {
      setLeftPanelWidth(nextWidth);
    } else {
      setRightPanelWidth(nextWidth);
    }
  };

  const stopPanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panelResizeRef.current) return;
    panelResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.classList.remove("is-resizing-panel");
    setIsResizingPanel(false);
  };

  const resetPanelSizes = useCallback(() => {
    setLeftPanelWidth(LEFT_PANEL_DEFAULT_WIDTH);
    setRightPanelWidth(RIGHT_PANEL_DEFAULT_WIDTH);
  }, []);

  const copyExecutablePath = useCallback(() => {
    void window.suwol
      .copyExecutablePath()
      .then(() => {
        setError(t("settings.executablePathCopied"));
      })
      .catch((copyError) => {
        setError(translatedErrorMessage(copyError, t));
      });
  }, [t]);

  const openWindowsDefaultApps = useCallback(() => {
    void window.suwol.openSystemSettings("defaultApps").catch((settingsError) => {
      setError(translatedErrorMessage(settingsError, t));
    });
  }, [t]);

  const openReleases = useCallback(() => {
    void window.suwol.openReleases().catch((releaseError) => {
      setError(translatedErrorMessage(releaseError, t));
    });
  }, [t]);

  const openLogsFolder = useCallback(() => {
    void window.suwol
      .openLogsFolder()
      .catch((logsError) => {
        setError(translatedErrorMessage(logsError, t));
      });
  }, [t]);

  const resetSettings = useCallback(() => {
    if (!window.confirm(t("settings.resetSettingsConfirm"))) return;
    void window.suwol
      .resetSettings()
      .then(async (nextPreferences) => {
        await applyPreferences(nextPreferences);
        setError(t("settings.settingsResetDone"));
      })
      .catch((settingsError) => {
        setError(translatedErrorMessage(settingsError, t));
      });
  }, [applyPreferences, t]);

  const clearThumbnailCache = useCallback(() => {
    void window.suwol
      .clearThumbnailCache()
      .then((result) => {
        setCacheStats(result.stats);
        setError(t("settings.thumbnailCacheCleared"));
      })
      .catch((cacheError) => {
        setError(translatedErrorMessage(cacheError, t));
      });
  }, [t]);

  const cleanupThumbnailCache = useCallback(() => {
    void window.suwol
      .cleanupThumbnailCache()
      .then((result) => {
        setCacheStats(result.stats);
        setError(t("settings.thumbnailCacheCleaned"));
      })
      .catch((cacheError) => {
        setError(translatedErrorMessage(cacheError, t));
      });
  }, [t]);

  const restartInSafeMode = useCallback(() => {
    void window.suwol.restartInSafeMode().catch((safeModeError) => {
      setError(translatedErrorMessage(safeModeError, t));
    });
  }, [t]);

  const applyUpdateResult = useCallback((result: Awaited<ReturnType<typeof window.suwol.checkForUpdates>>) => {
    if (result.ok) {
      setUpdateStatus(result.data);
      setError(undefined);
      return;
    }
    setUpdateStatus((current) => ({
      status: "error",
      supported: current?.supported ?? false,
      updateAvailable: current?.updateAvailable ?? false,
      downloaded: current?.downloaded ?? false,
      version: current?.version,
      latestVersion: current?.latestVersion,
      releaseName: current?.releaseName,
      error: result
    }));
    setError(translatedErrorMessage(result, t));
  }, [t]);

  const checkForUpdates = useCallback(() => {
    setUpdateStatus((current) => (current ? { ...current, status: "checking", error: undefined } : current));
    void window.suwol.checkForUpdates().then(applyUpdateResult).catch((updateError) => {
      setError(translatedErrorMessage(updateError, t));
    });
  }, [applyUpdateResult, t]);

  const downloadUpdate = useCallback(() => {
    setUpdateStatus((current) => (current ? { ...current, status: "downloading", error: undefined } : current));
    void window.suwol.downloadUpdate().then(applyUpdateResult).catch((updateError) => {
      setError(translatedErrorMessage(updateError, t));
    });
  }, [applyUpdateResult, t]);

  const installUpdate = useCallback(() => {
    void window.suwol.installUpdate().then(applyUpdateResult).catch((updateError) => {
      setError(translatedErrorMessage(updateError, t));
    });
  }, [applyUpdateResult, t]);

  const setUpdateStartupCheck = useCallback((enabled: boolean) => {
    setCheckForUpdatesOnStartup(enabled);
    void window.suwol
      .updateUpdatePreferences({ checkForUpdatesOnStartup: enabled })
      .then(async (nextPreferences) => {
        await applyPreferences(nextPreferences);
      })
      .catch((updatePreferenceError) => {
        setCheckForUpdatesOnStartup((current) => !current);
        setError(translatedErrorMessage(updatePreferenceError, t));
      });
  }, [applyPreferences, t]);

  const displayTransform = {
    transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scaleX(${flipped ? -1 : 1}) scale(${zoom})`
  };

  const statusResolution = displayedSize ? `${displayedSize.width} x ${displayedSize.height}` : t("common.unknown");
  const topBarVisible = topBarMode === "always" || topBarAutoVisible;
  const bottomBarVisible = isBottomStatusBarVisible({
    topBarVisible,
    topBarMode,
    leftPanelVisible,
    rightPanelVisible
  });
  const shellClassName = [
    "app-shell",
    topBarMode === "always" ? "top-bar-always" : "top-bar-auto",
    bottomBarVisible ? "bottom-bar-visible" : "bottom-bar-hidden"
  ].join(" ");
  const workspaceColumns = [
    leftPanelVisible ? "var(--left-panel-width)" : undefined,
    leftPanelVisible ? "6px" : undefined,
    "minmax(0, 1fr)",
    rightPanelVisible ? "6px" : undefined,
    rightPanelVisible ? "var(--right-panel-width)" : undefined
  ].filter(Boolean).join(" ");
  const workspaceStyle = {
    "--left-panel-width": `${leftPanelWidth}px`,
    "--right-panel-width": `${rightPanelWidth}px`,
    gridTemplateColumns: workspaceColumns
  } as React.CSSProperties;

  return (
    <div className={shellClassName} onMouseMove={handleShellMouseMove} onDragStart={(event) => event.preventDefault()}>
      <header
        className={`top-bar chrome-bar chrome-top ${topBarMode} ${topBarVisible ? "visible" : ""}`}
        onPointerEnter={handleTopChromePointerEnter}
        onPointerLeave={handleTopChromePointerLeave}
        onFocusCapture={handleTopChromeFocus}
        onBlurCapture={handleTopChromeBlur}
      >
        <div className="toolbar-group">
          <button className="command-button" onClick={openFile} disabled={busy} title={t("toolbar.openFile")}>
            <FileImage size={17} />
            <span>{t("toolbar.openFile")}</span>
          </button>
          <button className="command-button" onClick={openFolder} disabled={busy} title={t("toolbar.openFolder")}>
            <FolderOpen size={17} />
            <span>{t("toolbar.openFolder")}</span>
          </button>
          <select
            aria-label={t("viewer.fitWindow")}
            className="select-control"
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as ViewMode)}
          >
            {viewModeOptions.map((value) => (
              <option key={value} value={value}>
                {t(viewModeLabelKeys[value])}
              </option>
            ))}
          </select>
          <select
            aria-label={t("toolbar.recent")}
            className="select-control recent-select"
            value=""
            onChange={(event) => openRecent(event.target.value)}
            title={t("toolbar.recent")}
          >
            <option value="">{t("toolbar.recent")}</option>
            {recent.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-group">
          <select
            aria-label={t("settings.language")}
            className="select-control language-select"
            value={language}
            onChange={(event) => changeLanguage(event.target.value as AppLanguageSetting)}
            title={t("settings.language")}
          >
            <option value="system">{t("settings.systemDefault")}</option>
            {builtInLanguages.map((code) => (
              <option key={code} value={code}>
                {t(languageOptions.find((option) => option.code === code)?.labelKey ?? `languages.${code}`)}
              </option>
            ))}
          </select>
          <button className="icon-button" onClick={() => zoomBy(1 / 1.15)} disabled={!currentItem} title={t("toolbar.zoomOut")}>
            <ZoomOut size={18} />
          </button>
          <button className="icon-button" onClick={() => zoomBy(1.15)} disabled={!currentItem} title={t("toolbar.zoomIn")}>
            <ZoomIn size={18} />
          </button>
          <button className="icon-button" onClick={() => setViewMode("fit-window")} disabled={!currentItem} title={t("toolbar.fitWindow")}>
            <Maximize2 size={18} />
          </button>
          <button className="icon-button" onClick={() => setViewMode("fit-width")} disabled={!currentItem} title={t("toolbar.fitWidth")}>
            <Scan size={18} />
          </button>
          <button className="icon-button" onClick={() => setViewMode("webtoon")} disabled={!currentItem} title={t("toolbar.webtoonScroll")}>
            <Rows3 size={18} />
          </button>
          <button
            aria-pressed={fullscreen}
            className={`icon-button ${fullscreen ? "active" : ""}`}
            onClick={toggleFullscreen}
            title={t(fullscreen ? "toolbar.exitFullscreen" : "toolbar.toggleFullscreen")}
          >
            {fullscreen ? <Minimize2 size={18} /> : <Fullscreen size={18} />}
          </button>
          <button className="icon-button" onClick={() => setRotation((value) => (value + 90) % 360)} disabled={!currentItem} title={t("toolbar.rotate")}>
            <RotateCw size={18} />
          </button>
          <button className="icon-button" onClick={() => setFlipped((value) => !value)} disabled={!currentItem} title={t("toolbar.flipHorizontal")}>
            <FlipHorizontal size={18} />
          </button>
          <button className="icon-button" onClick={() => setLeftPanelVisible((value) => !value)} title={t("toolbar.thumbnails")}>
            <PanelLeft size={18} />
          </button>
          <button className="icon-button" onClick={() => setRightPanelVisible((value) => !value)} title={t("toolbar.info")}>
            <PanelRight size={18} />
          </button>
          <button className="icon-button" onClick={toggleTheme} title={t("toolbar.theme")}>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className={`workspace ${isResizingPanel ? "resizing-panel" : ""}`} style={workspaceStyle}>
        {leftPanelVisible && (
          <aside className="thumbnail-panel">
            {items.map((item) => (
              <button
                className={`thumbnail-item ${item.index === currentIndex ? "active" : ""}`}
                key={item.id}
                onClick={() => moveTo(item.index)}
                title={item.name}
              >
                <span className="thumbnail-frame">
                  <img src={item.thumbnailUrl} alt="" draggable={false} loading="lazy" />
                </span>
                <span className="thumbnail-name">{item.name}</span>
              </button>
            ))}
          </aside>
        )}
        {leftPanelVisible && (
          <div
            aria-label={t("settings.resizeLeftPanel")}
            className="panel-splitter"
            role="separator"
            onPointerDown={(event) => startPanelResize("left", event)}
            onPointerMove={movePanelResize}
            onPointerUp={stopPanelResize}
            onPointerCancel={stopPanelResize}
          />
        )}

        <section
          className={`viewer-surface ${isDragging ? "dragging" : ""}`}
          ref={viewerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDragStart={(event) => event.preventDefault()}
        >
          {error && <div className="toast">{error}</div>}
          {!currentItem && (
            <div className="empty-state">
              <ImageIcon size={48} />
              <span>{t("viewer.emptyTitle")}</span>
              <span className="empty-hint">{t("viewer.topBarAutoHint")}</span>
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
                  draggable={false}
                  loading="lazy"
                  onClick={() => moveTo(item.index)}
                />
              ))}
            </div>
          )}
        </section>

        {rightPanelVisible && (
          <div
            aria-label={t("settings.resizeRightPanel")}
            className="panel-splitter"
            role="separator"
            onPointerDown={(event) => startPanelResize("right", event)}
            onPointerMove={movePanelResize}
            onPointerUp={stopPanelResize}
            onPointerCancel={stopPanelResize}
          />
        )}

        {rightPanelVisible && (
          <aside className="info-panel">
            <div className="panel-title">
              <Info size={17} />
              <span>{t("metadata.info")}</span>
            </div>
            {currentItem ? (
              <MetadataPanel
                item={currentItem}
                metadata={metadata}
                loading={metadataLoading}
                error={metadataError}
                locale={resolvedLanguage}
              />
            ) : (
              <div className="muted-line">{t("common.noFile")}</div>
            )}
            <SettingsPanel
              leftPanelVisible={leftPanelVisible}
              rightPanelVisible={rightPanelVisible}
              cacheStats={cacheStats}
              checkForUpdatesOnStartup={checkForUpdatesOnStartup}
              runtimeInfo={runtimeInfo}
              topBarMode={topBarMode}
              updateStatus={updateStatus}
              onCleanupThumbnailCache={cleanupThumbnailCache}
              onClearThumbnailCache={clearThumbnailCache}
              onCheckForUpdates={checkForUpdates}
              onCopyExecutablePath={copyExecutablePath}
              onDownloadUpdate={downloadUpdate}
              onInstallUpdate={installUpdate}
              onOpenLogsFolder={openLogsFolder}
              onOpenReleases={openReleases}
              onOpenWindowsDefaultApps={openWindowsDefaultApps}
              onResetPanelSizes={resetPanelSizes}
              onResetSettings={resetSettings}
              onRestartInSafeMode={restartInSafeMode}
              onSetUpdateStartupCheck={setUpdateStartupCheck}
              onSetTopBarMode={setTopBarMode}
              onToggleLeftPanel={() => setLeftPanelVisible((value) => !value)}
              onToggleRightPanel={() => setRightPanelVisible((value) => !value)}
            />
          </aside>
        )}
      </main>

      <footer
        className={`status-bar chrome-bar chrome-bottom auto ${bottomBarVisible ? "visible" : ""}`}
      >
        <span className="status-file">{currentItem?.name ?? t("common.noFileSelected")}</span>
        <span>{statusResolution}</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span>
          {itemCount > 0 ? currentIndex + 1 : 0} / {itemCount}
        </span>
        {busy && <span>{t("common.working")}</span>}
      </footer>
    </div>
  );
}

function SettingsPanel({
  leftPanelVisible,
  rightPanelVisible,
  cacheStats,
  checkForUpdatesOnStartup,
  runtimeInfo,
  topBarMode,
  updateStatus,
  onCleanupThumbnailCache,
  onClearThumbnailCache,
  onCheckForUpdates,
  onCopyExecutablePath,
  onDownloadUpdate,
  onInstallUpdate,
  onOpenLogsFolder,
  onOpenReleases,
  onOpenWindowsDefaultApps,
  onResetPanelSizes,
  onResetSettings,
  onRestartInSafeMode,
  onSetUpdateStartupCheck,
  onSetTopBarMode,
  onToggleLeftPanel,
  onToggleRightPanel
}: {
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  cacheStats?: CacheStats;
  checkForUpdatesOnStartup: boolean;
  runtimeInfo?: RuntimeInfo;
  topBarMode: ChromeBarMode;
  updateStatus?: UpdateState;
  onCleanupThumbnailCache: () => void;
  onClearThumbnailCache: () => void;
  onCheckForUpdates: () => void;
  onCopyExecutablePath: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onOpenLogsFolder: () => void;
  onOpenReleases: () => void;
  onOpenWindowsDefaultApps: () => void;
  onResetPanelSizes: () => void;
  onResetSettings: () => void;
  onRestartInSafeMode: () => void;
  onSetUpdateStartupCheck: (enabled: boolean) => void;
  onSetTopBarMode: (mode: ChromeBarMode) => void;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const updateStatusLabel = t(`updates.status.${updateStatus?.status ?? "idle"}`);
  const updateError = updateStatus?.error ? translatedErrorMessage(updateStatus.error, t) : undefined;
  const canCheckForUpdates = updateStatus?.supported === true && updateStatus.status !== "checking";
  const canDownloadUpdate = updateStatus?.supported === true && updateStatus.updateAvailable && updateStatus.status !== "downloading";
  const canInstallUpdate = updateStatus?.supported === true && updateStatus.downloaded;

  return (
    <div className="settings-content">
      <div className="subheading">{t("settings.fileAssociations")}</div>
      <p className="settings-note">{t("settings.version", { version: runtimeInfo?.version ?? "" })}</p>
      {runtimeInfo?.safeMode && <p className="settings-note">{t("settings.safeModeActive")}</p>}
      <p className="settings-note">{t("settings.launchArgumentNote")}</p>
      <p className="settings-note">{t("settings.portableAssociationNote")}</p>
      <p className="settings-note">{t("settings.installerAssociationNote")}</p>
      <div className="settings-actions">
        <button className="panel-command-button" onClick={onOpenWindowsDefaultApps}>
          <ExternalLink size={15} />
          <span>{t("settings.openWindowsDefaultApps")}</span>
        </button>
        <button className="panel-command-button" onClick={onOpenReleases}>
          <ExternalLink size={15} />
          <span>{t("settings.openReleases")}</span>
        </button>
        <button className="panel-command-button" onClick={onCopyExecutablePath}>
          <Copy size={15} />
          <span>{t("settings.copyExecutablePath")}</span>
        </button>
      </div>

      <div className="subheading">{t("settings.updates")}</div>
      <InfoRow label={t("settings.currentVersion")} value={runtimeInfo?.version ?? t("common.unknown")} />
      <InfoRow label={t("settings.updateStatus")} value={updateStatusLabel} />
      {updateStatus?.latestVersion && <InfoRow label={t("settings.latestVersion")} value={updateStatus.latestVersion} />}
      {updateError && <p className="settings-note">{updateError}</p>}
      <label className="settings-check">
        <input
          type="checkbox"
          checked={checkForUpdatesOnStartup}
          onChange={(event) => onSetUpdateStartupCheck(event.currentTarget.checked)}
        />
        <span>{t("settings.checkForUpdatesOnStartup")}</span>
      </label>
      <p className="settings-note">{t("settings.appImageUpdateNote")}</p>
      <p className="settings-note">{t("settings.tarballUpdateNote")}</p>
      {runtimeInfo?.safeMode && <p className="settings-note">{t("settings.safeModeUpdateNote")}</p>}
      <div className="settings-actions">
        <button className="panel-command-button" onClick={onCheckForUpdates} disabled={!canCheckForUpdates}>
          <RefreshCw size={15} />
          <span>{t("settings.checkForUpdates")}</span>
        </button>
        <button className="panel-command-button" onClick={onDownloadUpdate} disabled={!canDownloadUpdate}>
          <Download size={15} />
          <span>{t("settings.downloadUpdate")}</span>
        </button>
        <button className="panel-command-button" onClick={onInstallUpdate} disabled={!canInstallUpdate}>
          <Power size={15} />
          <span>{t("settings.installAndRestart")}</span>
        </button>
      </div>

      <div className="subheading">{t("settings.viewLayout")}</div>
      <p className="settings-note">{t("settings.immersiveDefaultNote")}</p>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={topBarMode === "auto"}
          onChange={(event) => onSetTopBarMode(chromeModeForAutoHide(event.currentTarget.checked))}
        />
        <span>{t("settings.autoHideTopBar")}</span>
      </label>
      <p className="settings-note">{t("settings.bottomBarFollowsChrome")}</p>
      <label className="settings-check">
        <input type="checkbox" checked={leftPanelVisible} onChange={onToggleLeftPanel} />
        <span>{t("settings.showLeftPanelByDefault")}</span>
      </label>
      <label className="settings-check">
        <input type="checkbox" checked={rightPanelVisible} onChange={onToggleRightPanel} />
        <span>{t("settings.showRightPanelByDefault")}</span>
      </label>
      <button className="panel-command-button" onClick={onResetPanelSizes}>
        <RotateCcw size={15} />
        <span>{t("settings.resetPanelSizes")}</span>
      </button>

      <div className="subheading">{t("settings.maintenance")}</div>
      <p className="settings-note">{t("settings.logsPrivacyNote")}</p>
      <InfoRow label={t("settings.cacheSize")} value={formatBytes(cacheStats?.thumbnailSizeBytes, t("common.unknown"))} />
      <InfoRow label={t("settings.cacheEntries")} value={String(cacheStats?.thumbnailEntries ?? 0)} />
      <div className="settings-actions">
        <button className="panel-command-button" onClick={onOpenLogsFolder}>
          <FolderCog size={15} />
          <span>{t("settings.openLogsFolder")}</span>
        </button>
        <button className="panel-command-button" onClick={onClearThumbnailCache}>
          <Trash2 size={15} />
          <span>{t("settings.clearThumbnailCache")}</span>
        </button>
        <button className="panel-command-button" onClick={onCleanupThumbnailCache}>
          <Trash2 size={15} />
          <span>{t("settings.cleanOldCache")}</span>
        </button>
        <button className="panel-command-button" onClick={onResetSettings}>
          <RotateCcw size={15} />
          <span>{t("settings.resetSettings")}</span>
        </button>
        <button className="panel-command-button" onClick={onRestartInSafeMode}>
          <ShieldCheck size={15} />
          <span>{t("settings.restartInSafeMode")}</span>
        </button>
      </div>
      <p className="settings-note">{t("settings.safeModeNote")}</p>
    </div>
  );
}

function MetadataPanel({
  item,
  metadata,
  loading,
  error,
  locale
}: {
  item: LibraryItem;
  metadata?: ImageMetadata;
  loading: boolean;
  error?: string;
  locale: string;
}): React.ReactElement {
  const { t } = useTranslation();
  const basic = metadata?.basic;
  const exifEntries = Object.entries(metadata?.exif ?? {}).slice(0, 80);
  const unknownLabel = t("common.unknown");

  return (
    <div className="metadata-content">
      <InfoRow label={t("metadata.file")} value={item.name} />
      <InfoRow label={t("metadata.container")} value={item.containerName ?? item.sourceKind} />
      <InfoRow label={t("metadata.format")} value={item.extension.toUpperCase()} />
      <InfoRow label={t("metadata.support")} value={t(`formats.${item.support.level}`)} />
      <InfoRow label={t("metadata.size")} value={formatBytes(item.sizeBytes, unknownLabel)} />
      <InfoRow label={t("metadata.modified")} value={formatDate(item.modifiedAt, locale, unknownLabel)} />
      <InfoRow label={t("metadata.width")} value={basic?.width ? String(basic.width) : unknownLabel} />
      <InfoRow label={t("metadata.height")} value={basic?.height ? String(basic.height) : unknownLabel} />
      <InfoRow label={t("metadata.color")} value={basic?.space ?? unknownLabel} />
      <InfoRow label={t("metadata.pages")} value={basic?.pages ? String(basic.pages) : "1"} />
      {loading && <div className="muted-line">{t("metadata.readingMetadata")}</div>}
      {error && <div className="muted-line">{error}</div>}
      {exifEntries.length > 0 && (
        <>
          <div className="subheading">{t("metadata.exif")}</div>
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
