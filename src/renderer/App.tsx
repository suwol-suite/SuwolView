import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FolderCog,
  ExternalLink,
  FileImage,
  FlipHorizontal,
  FlipVertical,
  FolderOpen,
  Fullscreen,
  History,
  Image as ImageIcon,
  Info,
  Minimize2,
  Monitor,
  PanelLeft,
  PanelRight,
  Pin,
  PinOff,
  Power,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
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
import { DEFAULT_VIEWER_PREFERENCES } from "../shared/viewerPreferences";
import type {
  AppLanguageSetting,
  AppError,
  ArchiveBrowseMode,
  ArchiveFolderNode,
  CacheStats,
  ChromeBarMode,
  ImageFilterPreset,
  InterpolationFilter,
  ImageMetadata,
  LibraryItem,
  LocaleInfo,
  OpenLibraryResult,
  Preferences,
  RecentSource,
  RuntimeInfo,
  ThemeMode,
  UpdateCheckProgressEvent,
  UpdateState,
  ViewerPreferences,
  ViewMode
} from "../shared/types";
import { filterPresetClass, imageRenderingClass, computeImageScale, MAX_IMAGE_SCALE, MIN_IMAGE_SCALE } from "./viewerLayout";
import { consumeWheelPage, INITIAL_WHEEL_ACCUMULATOR } from "./navigationInput";
import { isTwoPageMode, selectTwoPageItems, selectWebtoonItems } from "./twoPageMode";
import { elapsedSecondsSince, isUpdateCheckActive, updateElapsed, UPDATE_CHECK_UI_TIMEOUT_MS } from "./updateProgress";

interface ImageSize {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

type ResizePanelSide = "left" | "right";
type PreferencesTab = "general" | "viewer" | "rendering" | "updates" | "fileAssociations" | "maintenance" | "about";
type ToolbarMenu = "recent" | "view" | "filter";

interface PanelResizeState {
  side: ResizePanelSide;
  startX: number;
  startWidth: number;
}

const PANEL_STATE_DELAY_MS = 250;
const METADATA_REQUEST_DELAY_MS = 250;
const viewModeOptions: readonly ViewMode[] = [
  "original",
  "fit-window",
  "fit-width",
  "fit-height",
  "smart-two-page-left-to-right",
  "smart-two-page-right-to-left",
  "webtoon"
];

const viewModeLabelKeys: Record<ViewMode, string> = {
  original: "viewer.viewModeOriginal",
  "fit-window": "viewer.viewModeFitWindow",
  "fit-width": "viewer.viewModeFitWidth",
  "fit-height": "viewer.viewModeFitHeight",
  "smart-two-page-left-to-right": "viewer.viewModeSmartTwoPageLeftToRight",
  "smart-two-page-right-to-left": "viewer.viewModeSmartTwoPageRightToLeft",
  webtoon: "viewer.viewModeWebtoon"
};

const interpolationOptions: readonly InterpolationFilter[] = ["nearest", "bilinear", "bicubic", "lanczos"];

const interpolationLabelKeys: Record<InterpolationFilter, string> = {
  nearest: "viewer.interpolationNearest",
  bilinear: "viewer.interpolationBilinear",
  bicubic: "viewer.interpolationBicubic",
  lanczos: "viewer.interpolationLanczos"
};

const filterPresetOptions: readonly ImageFilterPreset[] = ["none", "smooth", "extra-smooth", "sharp"];

const filterPresetLabelKeys: Record<ImageFilterPreset, string> = {
  none: "viewer.filterNone",
  smooth: "viewer.filterSmooth",
  "extra-smooth": "viewer.filterExtraSmooth",
  sharp: "viewer.filterSharp"
};

const interpolationForFilterPreset: Record<ImageFilterPreset, InterpolationFilter> = {
  none: "nearest",
  smooth: "bilinear",
  "extra-smooth": "bicubic",
  sharp: "lanczos"
};

const filterPresetForInterpolation: Record<InterpolationFilter, ImageFilterPreset> = {
  nearest: "none",
  bilinear: "smooth",
  bicubic: "extra-smooth",
  lanczos: "sharp"
};

const preferenceTabs: readonly { id: PreferencesTab; labelKey: string }[] = [
  { id: "general", labelKey: "settings.general" },
  { id: "viewer", labelKey: "settings.viewer" },
  { id: "rendering", labelKey: "settings.rendering" },
  { id: "updates", labelKey: "settings.updates" },
  { id: "fileAssociations", labelKey: "settings.fileAssociations" },
  { id: "maintenance", labelKey: "settings.maintenance" },
  { id: "about", labelKey: "settings.about" }
];

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

function isWindowsRuntime(runtimeInfo: RuntimeInfo | undefined): boolean {
  return runtimeInfo?.platform === "win32";
}

function isMacRuntime(runtimeInfo: RuntimeInfo | undefined): boolean {
  return runtimeInfo?.platform === "darwin";
}

function isLinuxRuntime(runtimeInfo: RuntimeInfo | undefined): boolean {
  return runtimeInfo?.platform === "linux";
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

function isAiMetadataKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[\s_-]+/g, "");
  return [
    "prompt",
    "negativeprompt",
    "generationdata",
    "generationsettings",
    "parameters",
    "workflow",
    "workflowjson",
    "comfyworkflow",
    "a1111"
  ].some((token) => normalized.includes(token));
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

function canScrollVertically(element: Element, deltaY: number): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (!(style.overflowY === "auto" || style.overflowY === "scroll")) return false;
  if (element.scrollHeight <= element.clientHeight) return false;
  return deltaY > 0
    ? element.scrollTop + element.clientHeight < element.scrollHeight - 1
    : element.scrollTop > 0;
}

function findWheelScrollRegion(target: Element | undefined, viewer: Element, deltaY: number): Element | undefined {
  let current = target;
  while (current && current !== viewer) {
    if (
      current.matches("[data-wheel-scroll-region], select, textarea, input, .side-panel-scroll, .preferences-body") ||
      canScrollVertically(current, deltaY)
    ) {
      return current;
    }
    current = current.parentElement ?? undefined;
  }
  return undefined;
}

export function App(): React.ReactElement {
  const { t } = useTranslation();
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<Point | null>(null);
  const panelResizeRef = useRef<PanelResizeState | null>(null);
  const panelSaveTimerRef = useRef<number | undefined>(undefined);
  const chromeSaveTimerRef = useRef<number | undefined>(undefined);
  const viewerSaveTimerRef = useRef<number | undefined>(undefined);
  const topChromeHideTimerRef = useRef<number | undefined>(undefined);
  const topChromeHoveredRef = useRef(false);
  const topChromeFocusedRef = useRef(false);
  const preferencesLoadStartedRef = useRef(false);
  const openRequestRef = useRef(0);
  const externalOpenRequestRef = useRef(0);
  const metadataRequestRef = useRef(0);
  const updateCheckRequestRef = useRef(0);
  const updateCheckTimeoutRef = useRef<number | undefined>(undefined);
  const latestUpdateProgressRequestRef = useRef<string | undefined>(undefined);
  const currentItemIdRef = useRef<string | undefined>(undefined);
  const wheelAccumulatorRef = useRef(INITIAL_WHEEL_ACCUMULATOR);

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
  const [viewMode, setViewModeState] = useState<ViewMode>(DEFAULT_VIEWER_PREFERENCES.viewMode);
  const [upscaleSmallImages, setUpscaleSmallImages] = useState(DEFAULT_VIEWER_PREFERENCES.upscaleSmallImages);
  const [interpolationFilter, setInterpolationFilter] = useState<InterpolationFilter>(
    DEFAULT_VIEWER_PREFERENCES.interpolationFilter
  );
  const [filterPreset, setFilterPreset] = useState<ImageFilterPreset>(DEFAULT_VIEWER_PREFERENCES.filterPreset);
  const [hdrEnabled, setHdrEnabled] = useState(DEFAULT_VIEWER_PREFERENCES.hdrEnabled);
  const [showZoomPercent, setShowZoomPercent] = useState(DEFAULT_VIEWER_PREFERENCES.showZoomPercent);
  const [resetZoomOnImageChange, setResetZoomOnImageChange] = useState(DEFAULT_VIEWER_PREFERENCES.resetZoomOnImageChange);
  const [userZoom, setUserZoom] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [flippedVertical, setFlippedVertical] = useState(false);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageSize, setImageSize] = useState<ImageSize | undefined>();
  const [metadata, setMetadata] = useState<ImageMetadata | undefined>();
  const [metadataError, setMetadataError] = useState<string | undefined>();
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [toolbarMenu, setToolbarMenu] = useState<ToolbarMenu | undefined>();
  const [archiveBrowseMode, setArchiveBrowseMode] = useState<ArchiveBrowseMode>("continuous");
  const [archiveFolderPath, setArchiveFolderPath] = useState<string | undefined>();
  const [collapsedArchiveFolders, setCollapsedArchiveFolders] = useState<Set<string>>(new Set());

  const items = library?.items ?? [];
  const visibleItems = useMemo(() => {
    if (library?.source.kind !== "archive" || archiveBrowseMode === "continuous") return items;
    return items.filter((item) => item.archive?.parentPath === archiveFolderPath);
  }, [archiveBrowseMode, archiveFolderPath, items, library?.source.kind]);
  const currentItem = visibleItems[currentIndex];
  const itemCount = visibleItems.length;
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

  const twoPageItems = useMemo(() => selectTwoPageItems(visibleItems, currentIndex, viewMode), [currentIndex, visibleItems, viewMode]);
  const webtoonItems = useMemo(() => selectWebtoonItems(visibleItems), [visibleItems]);

  const calculateViewZoom = useCallback((
    mode: ViewMode,
    size = displayedSize,
    nextUserZoom = userZoom,
    nextUpscaleSmallImages = upscaleSmallImages
  ): number => {
    if (!viewerRef.current || !size?.width || !size.height) return clamp(nextUserZoom || 1, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE);
    const bounds = viewerRef.current.getBoundingClientRect();
    const availableWidth = Math.max(120, bounds.width - 48);
    const availableHeight = Math.max(120, bounds.height - 48);
    const pageCount = isTwoPageMode(mode) ? Math.max(1, twoPageItems.length) : 1;

    return computeImageScale({
      imageWidth: size.width * pageCount,
      imageHeight: size.height,
      viewportWidth: availableWidth,
      viewportHeight: availableHeight,
      viewMode: mode,
      upscaleSmallImages: nextUpscaleSmallImages,
      userZoom: nextUserZoom
    });
  }, [displayedSize, twoPageItems.length, upscaleSmallImages, userZoom]);

  const applyOpenResult = useCallback((result: OpenLibraryResult | null) => {
    if (!result) return;
    setLibrary(result);
    setRecent(result.recent);
    setArchiveBrowseMode("continuous");
    setArchiveFolderPath(undefined);
    setCollapsedArchiveFolders(new Set());
    setCurrentIndex(result.selectedIndex);
    setImageSize(undefined);
    setMetadata(undefined);
    setMetadataError(undefined);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setFlipped(false);
    setFlippedVertical(false);
    if (resetZoomOnImageChange) {
      setUserZoom(1);
      setZoom(1);
    }
  }, [resetZoomOnImageChange]);

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
    setViewModeState(preferences.viewMode);
    setUpscaleSmallImages(preferences.upscaleSmallImages);
    setInterpolationFilter(interpolationForFilterPreset[preferences.filterPreset]);
    setFilterPreset(preferences.filterPreset);
    setHdrEnabled(preferences.hdrEnabled);
    setShowZoomPercent(preferences.showZoomPercent);
    setResetZoomOnImageChange(preferences.resetZoomOnImageChange);
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
    if (resetZoomOnImageChange) {
      setUserZoom(1);
    }
  }, [itemCount, resetZoomOnImageChange]);

  const nextImage = useCallback(() => moveTo(currentIndex + 1), [currentIndex, moveTo]);
  const previousImage = useCallback(() => moveTo(currentIndex - 1), [currentIndex, moveTo]);

  const selectArchiveFolder = useCallback((folderPath: string | undefined) => {
    const nextItems = folderPath === undefined
      ? items
      : items.filter((item) => item.archive?.parentPath === folderPath);
    const currentId = currentItem?.id;
    const selectedIndex = currentId ? nextItems.findIndex((item) => item.id === currentId) : -1;
    setArchiveBrowseMode(folderPath === undefined ? "continuous" : "folder");
    setArchiveFolderPath(folderPath);
    setCurrentIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setImageSize(undefined);
    setMetadata(undefined);
    setMetadataError(undefined);
    setPan({ x: 0, y: 0 });
  }, [currentItem?.id, items]);

  const setViewMode = useCallback((mode: ViewMode) => {
    const nextUpscaleSmallImages = mode === "original" || mode === "webtoon" ? upscaleSmallImages : true;
    setViewModeState(mode);
    setUpscaleSmallImages(nextUpscaleSmallImages);
    setPan({ x: 0, y: 0 });
    setUserZoom(1);
    setZoom(calculateViewZoom(mode, displayedSize, 1, nextUpscaleSmallImages));
  }, [calculateViewZoom, displayedSize, upscaleSmallImages]);

  const zoomBy = useCallback((factor: number) => {
    setUserZoom((value) => clamp(value * factor, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE));
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

  const setThemeMode = useCallback((nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    void window.suwol
      .setTheme(nextTheme)
      .then((nextPreferences) => {
        setRecent(nextPreferences.recent);
      })
      .catch((themeError) => {
        setError(translatedErrorMessage(themeError, t));
      });
  }, [t]);

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
    const unsubscribe = window.suwol.onUpdateCheckProgress((event: UpdateCheckProgressEvent) => {
      const previousRequestId = latestUpdateProgressRequestRef.current;
      if (previousRequestId !== event.requestId && event.phase !== "starting") return;
      latestUpdateProgressRequestRef.current = event.requestId;
      setUpdateStatus((current) => ({
        ...(current ?? {
          status: "checking",
          supported: runtimeInfo?.isPackaged === true,
          updateAvailable: false,
          downloaded: false,
          version: runtimeInfo?.version
        }),
        status: event.status ?? (isUpdateCheckActive(event.phase) ? "checking" : current?.status ?? "checking"),
        requestId: event.requestId,
        source: event.source,
        phase: event.phase,
        startedAt: event.startedAt,
        elapsedSeconds: elapsedSecondsSince(event.startedAt),
        messageKey: event.messageKey,
        releaseLookupStatus: event.releaseStatus,
        nativeUpdaterStatus: event.nativeUpdaterStatus,
        updateAvailable: event.updateAvailable ?? current?.updateAvailable ?? false,
        downloaded: event.downloaded ?? current?.downloaded ?? false,
        comparison: event.comparison ?? current?.comparison,
        latestVersion: event.latestVersion ?? current?.latestVersion,
        lastCheckedAt: event.lastCheckedAt ?? current?.lastCheckedAt,
        error: event.phase === "starting" || isUpdateCheckActive(event.phase) ? undefined : event.error ?? current?.error
      }));
    });
    return unsubscribe;
  }, [runtimeInfo?.isPackaged, runtimeInfo?.version]);

  useEffect(() => {
    if (!preferencesOpen) return;
    let active = true;
    void window.suwol.getUpdateStatus().then((current) => {
      if (active) setUpdateStatus(current);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [preferencesOpen]);

  useEffect(() => {
    if (!preferencesOpen || !isUpdateCheckActive(updateStatus?.phase)) return;
    const intervalId = window.setInterval(() => {
      setUpdateStatus((current) => updateElapsed(current));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [preferencesOpen, updateStatus?.phase, updateStatus?.startedAt]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    return () => {
      document.body.classList.remove("is-resizing-panel");
      window.clearTimeout(panelSaveTimerRef.current);
      window.clearTimeout(chromeSaveTimerRef.current);
      window.clearTimeout(viewerSaveTimerRef.current);
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
    if (!preferencesLoaded) return;
    window.clearTimeout(viewerSaveTimerRef.current);
    viewerSaveTimerRef.current = window.setTimeout(() => {
      void window.suwol
        .updateViewerPreferences({
          viewMode,
          upscaleSmallImages,
          interpolationFilter,
          filterPreset,
          hdrEnabled,
          showZoomPercent,
          resetZoomOnImageChange
        })
        .then((nextPreferences) => {
          setRecent(nextPreferences.recent);
        });
    }, PANEL_STATE_DELAY_MS);
  }, [
    filterPreset,
    hdrEnabled,
    interpolationFilter,
    preferencesLoaded,
    resetZoomOnImageChange,
    showZoomPercent,
    upscaleSmallImages,
    viewMode
  ]);

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
    setZoom(calculateViewZoom(viewMode));
  }, [calculateViewZoom, displayedSize, userZoom, viewMode]);

  useEffect(() => {
    const handleResize = () => {
      setZoom(calculateViewZoom(viewMode));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [calculateViewZoom, viewMode]);

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

      if (toolbarMenu && event.key === "Escape") {
        event.preventDefault();
        setToolbarMenu(undefined);
        return;
      }
      if (toolbarMenu) return;

      if (preferencesOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          setPreferencesOpen(false);
        }
        return;
      }

      if (
        (event.key === "PageDown" || event.key === "PageUp") &&
        !editableTarget &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        viewMode !== "webtoon"
      ) {
        event.preventDefault();
        if (event.key === "PageDown") nextImage();
        else previousImage();
        return;
      }

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
  }, [
    exitFullscreen,
    fullscreen,
    nextImage,
    openFile,
    openFolder,
    preferencesOpen,
    previousImage,
    setViewMode,
    toolbarMenu,
    toggleFullscreen,
    viewMode,
    zoomBy
  ]);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!currentItem || viewMode === "webtoon") return;
    const target = event.target instanceof Element ? event.target : undefined;
    const scrollRegion = findWheelScrollRegion(target, event.currentTarget, event.deltaY);
    if (scrollRegion) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.deltaY === 0) return;

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomBy(event.deltaY > 0 ? 1 / 1.15 : 1.15);
      return;
    }

    event.preventDefault();
    const decision = consumeWheelPage(
      wheelAccumulatorRef.current,
      event.deltaY,
      event.deltaMode,
      performance.now()
    );
    wheelAccumulatorRef.current = decision.state;
    if (decision.direction === "next") nextImage();
    if (decision.direction === "previous") previousImage();
  };

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
    void window.suwol
      .openSystemSettings("defaultApps")
      .then((result) => {
        if (!result.ok) setError(translatedErrorMessage(result, t));
      })
      .catch((settingsError) => {
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

  const toggleTopBarPin = useCallback(() => {
    setTopBarMode((value) => (value === "always" ? "auto" : "always"));
  }, []);

  const setFilterPresetWithInterpolation = useCallback((preset: ImageFilterPreset) => {
    setFilterPreset(preset);
    setInterpolationFilter(interpolationForFilterPreset[preset]);
  }, []);

  const setInterpolationFilterWithPreset = useCallback((filter: InterpolationFilter) => {
    setInterpolationFilter(filter);
    setFilterPreset(filterPresetForInterpolation[filter]);
  }, []);

  const applyUpdateResult = useCallback((result: Awaited<ReturnType<typeof window.suwol.checkForUpdates>>) => {
    if (result.ok) {
      setUpdateStatus(result.data);
      setError(undefined);
      return;
    }
    const updatesDisabled = result.code === "UPDATE_DISABLED_DEV" || result.code === "UPDATE_DISABLED_SAFE_MODE" || result.code === "UPDATE_UNSUPPORTED_PLATFORM" || result.code === "UPDATE_UNSUPPORTED_LINUX_PACKAGE";
    setUpdateStatus((current) => ({
      ...(current ?? { supported: false, updateAvailable: false, downloaded: false }),
      status: updatesDisabled ? "disabled" : "error",
      phase: updatesDisabled ? "idle" : current?.phase === "timeout" ? "timeout" : "error",
      comparison: updatesDisabled ? "disabled" : current?.comparison ?? "error",
      lastCheckedAt: current?.lastCheckedAt ?? new Date().toISOString(),
      errorCode: result.code,
      releaseLookupStatus: updatesDisabled ? "idle" : current?.releaseLookupStatus,
      nativeUpdaterStatus: updatesDisabled ? "unsupported" : current?.nativeUpdaterStatus,
      error: result
    }));
    setError(translatedErrorMessage(result, t));
  }, [t]);

  const checkForUpdates = useCallback(() => {
    const requestId = updateCheckRequestRef.current + 1;
    updateCheckRequestRef.current = requestId;
    if (updateCheckTimeoutRef.current !== undefined) {
      window.clearTimeout(updateCheckTimeoutRef.current);
      updateCheckTimeoutRef.current = undefined;
    }
    const startedAt = new Date().toISOString();
    setUpdateStatus((current) => ({
      ...(current ?? { supported: runtimeInfo?.isPackaged === true, updateAvailable: false, downloaded: false }),
      status: "checking",
      requestId: `renderer-${requestId}`,
      source: "manual",
      phase: "starting",
      startedAt,
      elapsedSeconds: 0,
      messageKey: "updates.progress.starting",
      releaseLookupStatus: "checking",
      nativeUpdaterStatus: "waiting",
      error: undefined
    }));
    let timeoutId: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject({ code: "UPDATE_CHECK_TIMEOUT", messageKey: "errors.updateCheckTimeout" }), UPDATE_CHECK_UI_TIMEOUT_MS);
      updateCheckTimeoutRef.current = timeoutId;
    });
    void Promise.race([window.suwol.checkForUpdates("manual"), timeout])
      .then((result) => {
        if (updateCheckRequestRef.current === requestId) applyUpdateResult(result);
      })
      .catch((updateError) => {
        if (updateCheckRequestRef.current !== requestId) return;
        const appError = updateError && typeof updateError === "object" && "messageKey" in updateError
          ? updateError as AppError
          : { code: "IPC_ERROR", messageKey: "errors.actionFailed" };
        setUpdateStatus((current) => ({
          ...(current ?? { supported: runtimeInfo?.isPackaged === true, updateAvailable: false, downloaded: false }),
          status: "error",
          phase: appError.code === "UPDATE_CHECK_TIMEOUT" ? "timeout" : "error",
          comparison: "error",
          lastCheckedAt: new Date().toISOString(),
          messageKey: appError.code === "UPDATE_CHECK_TIMEOUT" ? "updates.progress.timeout" : "updates.progress.error",
          errorCode: appError.code,
          releaseLookupStatus: appError.code === "UPDATE_CHECK_TIMEOUT" ? "timeout" : "error",
          error: appError
        }));
        updateCheckRequestRef.current += 1;
        setError(translatedErrorMessage(appError, t));
      })
      .finally(() => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        if (updateCheckTimeoutRef.current === timeoutId) updateCheckTimeoutRef.current = undefined;
      });
  }, [applyUpdateResult, runtimeInfo?.isPackaged, t]);

  const downloadUpdate = useCallback(() => {
    setUpdateStatus((current) => (current ? { ...current, status: "downloading", error: undefined } : current));
    void window.suwol.downloadUpdate().then(applyUpdateResult).catch((updateError) => {
      setUpdateStatus((current) => (current ? { ...current, status: "error", downloadStatus: "error", error: updateError } : current));
      setError(translatedErrorMessage(updateError, t));
    });
  }, [applyUpdateResult, t]);

  const installUpdate = useCallback(() => {
    void window.suwol.installUpdate().then(applyUpdateResult).catch((updateError) => {
      setUpdateStatus((current) => (current ? { ...current, status: "error", installStatus: "error", errorCode: updateError.code, error: updateError } : current));
      setError(translatedErrorMessage(updateError, t));
    });
  }, [applyUpdateResult, t]);

  const closePreferences = useCallback(() => {
    updateCheckRequestRef.current += 1;
    if (updateCheckTimeoutRef.current !== undefined) {
      window.clearTimeout(updateCheckTimeoutRef.current);
      updateCheckTimeoutRef.current = undefined;
    }
    setPreferencesOpen(false);
  }, []);

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

  const displayTransform: React.CSSProperties = {
    transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scaleX(${flipped ? -1 : 1}) scaleY(${flippedVertical ? -1 : 1})`
  };
  const scaledImageDimensions: React.CSSProperties = imageSize
    ? {
        width: `${Math.max(1, Math.round(imageSize.width * zoom))}px`,
        height: `${Math.max(1, Math.round(imageSize.height * zoom))}px`
      }
    : {};
  const mainImageStyle: React.CSSProperties = {
    ...scaledImageDimensions,
    ...displayTransform
  };
  const twoPageImageStyle: React.CSSProperties | undefined = imageSize ? scaledImageDimensions : undefined;
  const effectiveInterpolationFilter = interpolationForFilterPreset[filterPreset];
  const imageClassName = [
    "viewer-image",
    imageRenderingClass(effectiveInterpolationFilter),
    filterPresetClass(filterPreset),
    hdrEnabled ? "hdr-enabled" : undefined
  ].filter(Boolean).join(" ");
  const mainImageClassName = `main-image ${imageClassName}`;
  const twoPageImageClassName = `two-page-image ${imageClassName}`;
  const webtoonImageClassName = `webtoon-image ${imageClassName}`;
  const zoomPercent = Math.round(zoom * 100);
  const viewerPreferences: ViewerPreferences = {
    viewMode,
    upscaleSmallImages,
    interpolationFilter,
    filterPreset,
    hdrEnabled,
    showZoomPercent,
    resetZoomOnImageChange
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
        <div className="toolbar-group toolbar-primary">
          <button aria-label={t("toolbar.openFile")} className="icon-button toolbar-icon-only" onClick={openFile} disabled={busy} title={t("toolbar.openFile")}>
            <FileImage size={17} />
          </button>
          <button aria-label={t("toolbar.openFolder")} className="icon-button toolbar-icon-only" onClick={openFolder} disabled={busy} title={t("toolbar.openFolder")}>
            <FolderOpen size={17} />
          </button>
          <button
            aria-expanded={toolbarMenu === "recent"}
            aria-label={t("toolbar.recentItems")}
            className={`icon-button toolbar-icon-only ${toolbarMenu === "recent" ? "active" : ""}`}
            disabled={recent.length === 0}
            onClick={() => setToolbarMenu((value) => (value === "recent" ? undefined : "recent"))}
            title={t("toolbar.recentItems")}
          >
            <History size={18} />
          </button>
        </div>

        <div className="toolbar-group toolbar-secondary">
          <button className="icon-button" onClick={previousImage} disabled={currentIndex <= 0} title={t("shortcuts.previous")}>
            <ChevronLeft size={18} />
          </button>
          <button className="icon-button" onClick={() => zoomBy(1 / 1.15)} disabled={!currentItem} title={t("toolbar.zoomOut")}>
            <ZoomOut size={18} />
          </button>
          <button className="zoom-chip zoom-chip-button" onClick={() => setViewMode("original")} disabled={!currentItem} title={t("toolbar.originalSize")}>
            {zoomPercent}%
          </button>
          <button className="icon-button" onClick={() => zoomBy(1.15)} disabled={!currentItem} title={t("toolbar.zoomIn")}>
            <ZoomIn size={18} />
          </button>
          <button className="icon-button" onClick={nextImage} disabled={currentIndex >= itemCount - 1} title={t("shortcuts.next")}>
            <ChevronRight size={18} />
          </button>
          <button
            aria-expanded={toolbarMenu === "view"}
            aria-label={t("viewer.viewMode")}
            className={`icon-button ${toolbarMenu === "view" || viewMode !== "original" ? "active" : ""}`}
            onClick={() => setToolbarMenu((value) => (value === "view" ? undefined : "view"))}
            title={t("viewer.viewMode")}
          >
            <Monitor size={18} />
          </button>
          <button
            aria-pressed={fullscreen}
            className={`icon-button ${fullscreen ? "active" : ""}`}
            onClick={toggleFullscreen}
            title={t(fullscreen ? "toolbar.exitFullscreen" : "toolbar.fullscreen")}
          >
            {fullscreen ? <Minimize2 size={18} /> : <Fullscreen size={18} />}
          </button>
          <button
            aria-pressed={topBarMode === "always"}
            className={`icon-button ${topBarMode === "always" ? "active" : ""}`}
            onClick={toggleTopBarPin}
            title={t("settings.pinTopBar")}
          >
            {topBarMode === "always" ? <Pin size={18} /> : <PinOff size={18} />}
          </button>
          <button
            aria-expanded={toolbarMenu === "filter"}
            aria-label={t("viewer.filterPreset")}
            className={`icon-button ${toolbarMenu === "filter" || filterPreset !== "none" ? "active" : ""}`}
            onClick={() => setToolbarMenu((value) => (value === "filter" ? undefined : "filter"))}
            title={t("viewer.filterPreset")}
          >
            <SlidersHorizontal size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => setRotation((value) => (value + 270) % 360)}
            disabled={!currentItem}
            title={t("toolbar.rotateLeft90")}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => setRotation((value) => (value + 90) % 360)}
            disabled={!currentItem}
            title={t("toolbar.rotateRight90")}
          >
            <RotateCw size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => setFlipped((value) => !value)}
            disabled={!currentItem}
            title={t("toolbar.flipHorizontal")}
          >
            <FlipHorizontal size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => setFlippedVertical((value) => !value)}
            disabled={!currentItem}
            title={t("toolbar.flipVertical")}
          >
            <FlipVertical size={18} />
          </button>
          <button className="icon-button" onClick={() => setLeftPanelVisible((value) => !value)} title={t("toolbar.thumbnails")}>
            <PanelLeft size={18} />
          </button>
          <button className="icon-button" onClick={() => setRightPanelVisible((value) => !value)} title={t("toolbar.info")}>
            <PanelRight size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => {
              setToolbarMenu(undefined);
              setPreferencesOpen(true);
            }}
            title={t("settings.preferences")}
          >
            <SettingsIcon size={18} />
          </button>
        </div>
      </header>

      {toolbarMenu && (
        <>
          <div className="toolbar-popover-backdrop" onMouseDown={() => setToolbarMenu(undefined)} />
          {toolbarMenu === "recent" && (
            <div className="toolbar-popover toolbar-popover-left">
              {recent.map((source) => (
                <button
                  key={source.id}
                  className="panel-command-button"
                  onClick={() => {
                    setToolbarMenu(undefined);
                    openRecent(source.id);
                  }}
                  title={source.path}
                >
                  <span>{source.name}</span>
                </button>
              ))}
            </div>
          )}
          {toolbarMenu === "view" && (
            <div className="toolbar-popover toolbar-popover-right">
              <div className="toolbar-popover-title">{t("viewer.viewMode")}</div>
              {viewModeOptions.map((value) => (
                <button
                  key={value}
                  aria-pressed={viewMode === value}
                  className={`panel-command-button ${viewMode === value ? "active" : ""}`}
                  onClick={() => {
                    setToolbarMenu(undefined);
                    setViewMode(value);
                  }}
                  type="button"
                >
                  <span>{t(viewModeLabelKeys[value])}</span>
                </button>
              ))}
            </div>
          )}
          {toolbarMenu === "filter" && (
            <div className="toolbar-popover toolbar-popover-right">
              <div className="toolbar-popover-title">{t("viewer.filterPreset")}</div>
              {filterPresetOptions.map((value) => (
                <button
                  key={value}
                  aria-pressed={filterPreset === value}
                  className={`panel-command-button ${filterPreset === value ? "active" : ""}`}
                  onClick={() => {
                    setToolbarMenu(undefined);
                    setFilterPresetWithInterpolation(value);
                  }}
                  type="button"
                >
                  <span>{t(filterPresetLabelKeys[value])}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <main className={`workspace ${isResizingPanel ? "resizing-panel" : ""}`} style={workspaceStyle}>
        {leftPanelVisible && (
          <aside className="thumbnail-panel side-panel-scroll">
            {library?.source.kind === "archive" && library.archive && (
              <ArchiveBrowser
                folders={library.archive.folders}
                mode={archiveBrowseMode}
                selectedPath={archiveFolderPath}
                currentFolderPath={currentItem?.archive?.parentPath}
                collapsedFolders={collapsedArchiveFolders}
                onSelectFolder={selectArchiveFolder}
                onToggleFolder={(folderPath) => {
                  setCollapsedArchiveFolders((current) => {
                    const next = new Set(current);
                    if (next.has(folderPath)) next.delete(folderPath);
                    else next.add(folderPath);
                    return next;
                  });
                }}
                t={t}
              />
            )}
            {visibleItems.map((item) => (
              <button
                className={`thumbnail-item ${item.id === currentItem?.id ? "active" : ""}`}
                key={item.id}
                onClick={() => moveTo(visibleItems.findIndex((candidate) => candidate.id === item.id))}
                title={item.archive?.displayPath ?? item.name}
              >
                <span className="thumbnail-frame">
                  <img src={item.thumbnailUrl} alt="" draggable={false} loading="lazy" />
                </span>
                <span className="thumbnail-name">{item.archive?.displayPath ?? item.name}</span>
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
          onWheel={handleWheel}
          onDragStart={(event) => event.preventDefault()}
        >
          {error && <div className="toast">{error}</div>}
          {!currentItem && (
            <div className="empty-state">
              <ImageIcon size={48} />
              <span>{archiveBrowseMode === "folder" ? t("archive.noImagesInFolder") : t("viewer.emptyTitle")}</span>
            </div>
          )}

          {currentItem && viewMode !== "webtoon" && !isTwoPageMode(viewMode) && (
            <img
              className={mainImageClassName}
              src={currentItem.displayUrl}
              alt={currentItem.name}
              draggable={false}
              style={mainImageStyle}
              onLoad={(event) => {
                const nextSize = {
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight
                };
                setImageSize(nextSize);
                setZoom(calculateViewZoom(viewMode, nextSize));
              }}
            />
          )}

          {currentItem && isTwoPageMode(viewMode) && (
            <div className="two-page-spread" style={displayTransform}>
              {twoPageItems.map((item) => (
                <img
                  key={item.id}
                  className={twoPageImageClassName}
                  src={item.displayUrl}
                  alt={item.name}
                  draggable={false}
                  loading={item.id === currentItem.id ? "eager" : "lazy"}
                  style={twoPageImageStyle}
                  onLoad={(event) => {
                    if (item.id !== currentItem.id) return;
                    const nextSize = {
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight
                    };
                    setImageSize(nextSize);
                    setZoom(calculateViewZoom(viewMode, nextSize));
                  }}
                />
              ))}
            </div>
          )}

          {currentItem && viewMode === "webtoon" && (
            <div className="webtoon-strip" data-wheel-scroll-region="true" style={{ "--webtoon-zoom": String(zoom) } as React.CSSProperties}>
              {webtoonItems.map((item) => (
                <img
                  key={item.id}
                  className={`${webtoonImageClassName} ${item.id === currentItem.id ? "active" : ""}`}
                  src={item.displayUrl}
                  alt={item.name}
                  draggable={false}
                  loading="lazy"
                  onClick={() => moveTo(visibleItems.findIndex((candidate) => candidate.id === item.id))}
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
          <aside className="info-panel side-panel-scroll">
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
          </aside>
        )}
      </main>

      {preferencesOpen && (
        <PreferencesModal
          leftPanelVisible={leftPanelVisible}
          rightPanelVisible={rightPanelVisible}
          cacheStats={cacheStats}
          checkForUpdatesOnStartup={checkForUpdatesOnStartup}
          language={language}
          runtimeInfo={runtimeInfo}
          theme={theme}
          topBarMode={topBarMode}
          updateStatus={updateStatus}
          viewerPreferences={viewerPreferences}
          onChangeLanguage={changeLanguage}
          onCleanupThumbnailCache={cleanupThumbnailCache}
          onClearThumbnailCache={clearThumbnailCache}
          onCheckForUpdates={checkForUpdates}
          onClose={closePreferences}
          onCopyExecutablePath={copyExecutablePath}
          onDownloadUpdate={downloadUpdate}
          onInstallUpdate={installUpdate}
          onOpenLogsFolder={openLogsFolder}
          onOpenReleases={openReleases}
          onOpenWindowsDefaultApps={openWindowsDefaultApps}
          onResetPanelSizes={resetPanelSizes}
          onResetSettings={resetSettings}
          onRestartInSafeMode={restartInSafeMode}
          onSetHdrEnabled={setHdrEnabled}
          onSetInterpolationFilter={setInterpolationFilterWithPreset}
          onSetResetZoomOnImageChange={setResetZoomOnImageChange}
          onSetShowZoomPercent={setShowZoomPercent}
          onSetTheme={setThemeMode}
          onSetTopBarMode={setTopBarMode}
          onSetUpdateStartupCheck={setUpdateStartupCheck}
          onSetUpscaleSmallImages={setUpscaleSmallImages}
          onSetViewMode={setViewMode}
          onToggleLeftPanel={() => setLeftPanelVisible((value) => !value)}
          onToggleRightPanel={() => setRightPanelVisible((value) => !value)}
        />
      )}

      <footer
        className={`status-bar chrome-bar chrome-bottom auto ${bottomBarVisible ? "visible" : ""}`}
      >
        <span className="status-file">{currentItem?.archive?.displayPath ?? currentItem?.name ?? t("common.noFileSelected")}</span>
        <span>{statusResolution}</span>
        {showZoomPercent && <span>{zoomPercent}%</span>}
        <span>
          {itemCount > 0 ? currentIndex + 1 : 0} / {itemCount}
        </span>
        {busy && <span>{t("common.working")}</span>}
      </footer>
    </div>
  );
}

function PreferencesModal({
  leftPanelVisible,
  rightPanelVisible,
  cacheStats,
  checkForUpdatesOnStartup,
  language,
  runtimeInfo,
  theme,
  topBarMode,
  updateStatus,
  viewerPreferences,
  onChangeLanguage,
  onCleanupThumbnailCache,
  onClearThumbnailCache,
  onCheckForUpdates,
  onClose,
  onCopyExecutablePath,
  onDownloadUpdate,
  onInstallUpdate,
  onOpenLogsFolder,
  onOpenReleases,
  onOpenWindowsDefaultApps,
  onResetPanelSizes,
  onResetSettings,
  onRestartInSafeMode,
  onSetHdrEnabled,
  onSetInterpolationFilter,
  onSetResetZoomOnImageChange,
  onSetShowZoomPercent,
  onSetTheme,
  onSetTopBarMode,
  onSetUpdateStartupCheck,
  onSetUpscaleSmallImages,
  onSetViewMode,
  onToggleLeftPanel,
  onToggleRightPanel
}: {
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  cacheStats?: CacheStats;
  checkForUpdatesOnStartup: boolean;
  language: AppLanguageSetting;
  runtimeInfo?: RuntimeInfo;
  theme: ThemeMode;
  topBarMode: ChromeBarMode;
  updateStatus?: UpdateState;
  viewerPreferences: ViewerPreferences;
  onChangeLanguage: (language: AppLanguageSetting) => void;
  onCleanupThumbnailCache: () => void;
  onClearThumbnailCache: () => void;
  onCheckForUpdates: () => void;
  onClose: () => void;
  onCopyExecutablePath: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onOpenLogsFolder: () => void;
  onOpenReleases: () => void;
  onOpenWindowsDefaultApps: () => void;
  onResetPanelSizes: () => void;
  onResetSettings: () => void;
  onRestartInSafeMode: () => void;
  onSetHdrEnabled: (enabled: boolean) => void;
  onSetInterpolationFilter: (filter: InterpolationFilter) => void;
  onSetResetZoomOnImageChange: (enabled: boolean) => void;
  onSetShowZoomPercent: (enabled: boolean) => void;
  onSetTheme: (theme: ThemeMode) => void;
  onSetTopBarMode: (mode: ChromeBarMode) => void;
  onSetUpdateStartupCheck: (enabled: boolean) => void;
  onSetUpscaleSmallImages: (enabled: boolean) => void;
  onSetViewMode: (mode: ViewMode) => void;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PreferencesTab>("general");
  const updateStatusLabel = t(`updates.status.${updateStatus?.status ?? "idle"}`);
  const updatePhaseLabel = t(`updates.phase.${updateStatus?.phase ?? "idle"}`);
  const updateError = updateStatus?.error ? translatedErrorMessage(updateStatus.error, t) : undefined;
  const updateCheckActive = isUpdateCheckActive(updateStatus?.phase) || updateStatus?.status === "checking";
  const canCheckForUpdates = runtimeInfo?.isPackaged === true && updateStatus?.status !== "disabled" && updateStatus?.status !== "unsupported" && !updateCheckActive;
  const canDownloadUpdate = updateStatus?.supported === true && updateStatus.autoUpdateSupported === true && updateStatus.updateAvailable && updateStatus.nativeUpdaterStatus === "available" && updateStatus.downloadStatus !== "downloading" && updateStatus.downloadStatus !== "downloaded";
  const canInstallUpdate = updateStatus?.supported === true && updateStatus.downloadStatus === "downloaded" && updateStatus.installStatus === "ready";
  const showDeveloperUpdateNotes = runtimeInfo?.isPackaged === false;
  const showWindowsFileAssociationControls = isWindowsRuntime(runtimeInfo);
  const showMacFileAssociationInstructions = isMacRuntime(runtimeInfo);
  const showLinuxFileAssociationInstructions = isLinuxRuntime(runtimeInfo);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        aria-labelledby="preferences-title"
        aria-modal="true"
        className="preferences-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="preferences-header">
          <div>
            <div className="panel-title" id="preferences-title">
              <SettingsIcon size={17} />
              <span>{t("settings.preferences")}</span>
            </div>
            <p className="settings-note">{t("settings.preferencesNote")}</p>
          </div>
          <button className="icon-button preferences-close" onClick={onClose} title={t("settings.closePreferences")}>
            <X size={18} />
          </button>
        </header>

        <div className="preferences-layout">
          <nav className="preferences-tabs" aria-label={t("settings.preferences")}>
            {preferenceTabs.map((tab) => (
              <button
                key={tab.id}
                aria-selected={activeTab === tab.id}
                className={`preferences-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </nav>

          <div className="preferences-body" role="tabpanel">
            {activeTab === "general" && (
              <div className="settings-content modal-settings-content">
                <div className="subheading">{t("settings.general")}</div>
                <label className="settings-field">
                  <span>{t("settings.language")}</span>
                  <select
                    className="select-control settings-select"
                    value={language}
                    onChange={(event) => onChangeLanguage(event.currentTarget.value as AppLanguageSetting)}
                  >
                    <option value="system">{t("settings.systemDefault")}</option>
                    {builtInLanguages.map((code) => (
                      <option key={code} value={code}>
                        {t(languageOptions.find((option) => option.code === code)?.labelKey ?? `languages.${code}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>{t("settings.theme")}</span>
                  <select
                    className="select-control settings-select"
                    value={theme}
                    onChange={(event) => onSetTheme(event.currentTarget.value as ThemeMode)}
                  >
                    <option value="dark">{t("settings.darkTheme")}</option>
                    <option value="light">{t("settings.lightTheme")}</option>
                  </select>
                </label>
                <InfoRow label={t("settings.startupBehavior")} value={t("settings.startupBehaviorDefault")} />
                <InfoRow label={t("settings.defaultUiPolicy")} value={t("settings.defaultUiPolicyImmersive")} />
              </div>
            )}

            {activeTab === "viewer" && (
              <div className="settings-content modal-settings-content">
                <div className="subheading">{t("settings.viewer")}</div>
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
                <label className="settings-field">
                  <span>{t("viewer.viewMode")}</span>
                  <select
                    className="select-control settings-select"
                    value={viewerPreferences.viewMode}
                    onChange={(event) => onSetViewMode(event.currentTarget.value as ViewMode)}
                  >
                    {viewModeOptions.map((value) => (
                      <option key={value} value={value}>
                        {t(viewModeLabelKeys[value])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={viewerPreferences.showZoomPercent}
                    onChange={(event) => onSetShowZoomPercent(event.currentTarget.checked)}
                  />
                  <span>{t("viewer.showZoomPercent")}</span>
                </label>
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={viewerPreferences.resetZoomOnImageChange}
                    onChange={(event) => onSetResetZoomOnImageChange(event.currentTarget.checked)}
                  />
                  <span>{t("viewer.resetZoomOnImageChange")}</span>
                </label>
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={viewerPreferences.upscaleSmallImages}
                    onChange={(event) => onSetUpscaleSmallImages(event.currentTarget.checked)}
                  />
                  <span>{t("viewer.upscaleSmallImages")}</span>
                </label>
              </div>
            )}

            {activeTab === "rendering" && (
              <div className="settings-content modal-settings-content">
                <div className="subheading">{t("settings.rendering")}</div>
                <label className="settings-field">
                  <span>{t("viewer.interpolationFilter")}</span>
                  <select
                    className="select-control settings-select"
                    value={viewerPreferences.interpolationFilter}
                    onChange={(event) => onSetInterpolationFilter(event.currentTarget.value as InterpolationFilter)}
                  >
                    {interpolationOptions.map((value) => (
                      <option key={value} value={value}>
                        {t(interpolationLabelKeys[value])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={viewerPreferences.hdrEnabled}
                    onChange={(event) => onSetHdrEnabled(event.currentTarget.checked)}
                  />
                  <span>{t("viewer.hdrViewing")}</span>
                </label>
                <p className="settings-note">{t("viewer.hdrViewingNote")}</p>
                <p className="settings-note">{t("viewer.interpolationFallbackNote")}</p>
              </div>
            )}

            {activeTab === "updates" && (
              <div className="settings-content modal-settings-content">
                <div className="subheading">{t("settings.updates")}</div>
                <InfoRow label={t("settings.currentVersion")} value={runtimeInfo?.version ?? t("common.unknown")} />
                <InfoRow label={t("settings.updateStatus")} value={updateStatusLabel} />
                <InfoRow label={t("settings.currentPhase")} value={updatePhaseLabel} />
                {updateStatus?.phase && isUpdateCheckActive(updateStatus.phase) && (
                  <InfoRow label={t("settings.elapsedTime")} value={t("updates.elapsedSeconds", { count: updateStatus.elapsedSeconds ?? 0 })} />
                )}
                {updateStatus?.nativeUpdaterStatus && (
                  <InfoRow label={t("settings.nativeUpdateStatus")} value={t(`updates.nativeStatus.${updateStatus.nativeUpdaterStatus}`)} />
                )}
                {updateStatus?.latestVersion && <InfoRow label={t("settings.latestVersion")} value={updateStatus.latestVersion} />}
                {updateStatus?.lastCheckedAt && (
                  <InfoRow label={t("settings.lastChecked")} value={formatDate(updateStatus.lastCheckedAt, i18n.language, t("common.unknown"))} />
                )}
                {updateStatus?.comparison === "up-to-date" && <p className="settings-note">{t("settings.upToDate")}</p>}
                {updateStatus?.comparison === "update-available" && <p className="settings-note">{t("settings.updateAvailableNote")}</p>}
                {updateStatus?.comparison === "ahead" && <p className="settings-note">{t("settings.aheadOfRelease")}</p>}
                {updateStatus?.comparison === "no-release" && <p className="settings-note">{t("settings.noReleaseNote")}</p>}
                {updateStatus?.release?.title && <InfoRow label={t("settings.releaseTitle")} value={updateStatus.release.title} />}
                {updateStatus?.release?.publishedAt && (
                  <InfoRow label={t("settings.publishedDate")} value={formatDate(updateStatus.release.publishedAt, i18n.language, t("common.unknown"))} />
                )}
                {updateStatus?.updateAvailable && (
                  <p className="settings-note">
                    {updateStatus.autoUpdateSupported ? t("settings.automaticUpdateAvailable") : t("settings.automaticUpdateUnavailable")}
                  </p>
                )}
                {updateStatus?.platformPackageAvailable !== undefined && updateStatus.updateAvailable && (
                  <InfoRow label={t("settings.platformPackageAvailable")} value={updateStatus.platformPackageAvailable ? t("settings.automaticUpdateAvailable") : t("settings.automaticUpdateUnavailable")} />
                )}
                {updateStatus?.updateAvailable && (!updateStatus.autoUpdateSupported || updateStatus.nativeUpdaterStatus === "timeout" || updateStatus.nativeUpdaterStatus === "error") && (
                  <p className="settings-note">{t("settings.manualDownload")}</p>
                )}
                {updateStatus?.release?.body && (
                  <div className="settings-release-notes" data-wheel-scroll-region="true">
                    <div className="subheading">{t("settings.releaseNotes")}</div>
                    <pre>{updateStatus.release.body}</pre>
                  </div>
                )}
                {updateError && <p className="settings-note">{updateError}</p>}
                {updateCheckActive && <p aria-live="polite" className="settings-update-progress"><RefreshCw className="spinning" size={15} />{t(updateStatus?.messageKey ?? "updates.progress.starting")} · {t("updates.elapsedSeconds", { count: updateStatus?.elapsedSeconds ?? 0 })} · {t("updates.maxCheckTime")}</p>}
                {(updateStatus?.phase === "timeout" || updateStatus?.phase === "error") && <p className="settings-note">{t("updates.retryHint")}</p>}
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={checkForUpdatesOnStartup}
                    onChange={(event) => onSetUpdateStartupCheck(event.currentTarget.checked)}
                  />
                  <span>{t("settings.checkForUpdatesOnStartup")}</span>
                </label>
                {showDeveloperUpdateNotes && (
                  <>
                    <p className="settings-note">{t("settings.macSignedUpdateNote")}</p>
                    <p className="settings-note">{t("settings.appImageUpdateNote")}</p>
                    <p className="settings-note">{t("settings.portableUpdateNote")}</p>
                  </>
                )}
                {runtimeInfo?.safeMode && <p className="settings-note">{t("settings.safeModeUpdateNote")}</p>}
                <div className="settings-actions">
                  <button className="panel-command-button" onClick={onCheckForUpdates} disabled={!canCheckForUpdates}>
                    <RefreshCw size={15} />
                    <span>{updateStatus?.phase === "timeout" || updateStatus?.phase === "error" ? t("updates.retry") : t("settings.checkForUpdates")}</span>
                  </button>
                  <button className="panel-command-button" onClick={onDownloadUpdate} disabled={!canDownloadUpdate}>
                    <Download size={15} />
                    <span>{t("settings.downloadUpdate")}</span>
                  </button>
                  <button className="panel-command-button" onClick={onInstallUpdate} disabled={!canInstallUpdate}>
                    <Power size={15} />
                    <span>{t("settings.installAndRestart")}</span>
                  </button>
                  {runtimeInfo?.isPackaged === true && (updateStatus?.release?.url || updateStatus?.manualDownloadUrl || updateStatus?.phase === "timeout" || updateStatus?.phase === "error" || updateStatus?.updateAvailable) && (
                    <button className="panel-command-button" onClick={onOpenReleases}>
                      <ExternalLink size={15} />
                      <span>{t("settings.openReleasePage")}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === "fileAssociations" && (
              <div className="settings-content modal-settings-content">
                <div className="subheading">{t("settings.fileAssociations")}</div>
                <p className="settings-note">{t("settings.launchArgumentNote")}</p>
                {showWindowsFileAssociationControls && (
                  <>
                    <p className="settings-note">{t("settings.portableAssociationNote")}</p>
                    <p className="settings-note">{t("settings.installerAssociationNote")}</p>
                  </>
                )}
                {showMacFileAssociationInstructions && (
                  <p className="settings-note">{t("settings.macAssociationNote")}</p>
                )}
                {showLinuxFileAssociationInstructions && (
                  <p className="settings-note">{t("settings.linuxAssociationNote")}</p>
                )}
                <div className="settings-actions">
                  {showWindowsFileAssociationControls && (
                    <button className="panel-command-button" onClick={onOpenWindowsDefaultApps}>
                      <ExternalLink size={15} />
                      <span>{t("settings.openWindowsDefaultApps")}</span>
                    </button>
                  )}
                  <button className="panel-command-button" onClick={onOpenReleases}>
                    <ExternalLink size={15} />
                    <span>{t("settings.openReleases")}</span>
                  </button>
                  <button className="panel-command-button" onClick={onCopyExecutablePath}>
                    <Copy size={15} />
                    <span>{t("settings.copyExecutablePath")}</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === "maintenance" && (
              <div className="settings-content modal-settings-content">
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
            )}

            {activeTab === "about" && (
              <div className="settings-content modal-settings-content">
                <div className="subheading">{t("settings.about")}</div>
                <InfoRow label={t("settings.appName")} value={t("app.name")} />
                <InfoRow label={t("settings.currentVersion")} value={runtimeInfo?.version ?? t("common.unknown")} />
                <InfoRow label={t("settings.license")} value="Apache License 2.0" />
                <InfoRow label={t("settings.repository")} value="https://github.com/suwol-suite/SuwolView" />
                <InfoRow label={t("settings.thirdPartyLicenses")} value="THIRD_PARTY_LICENSES.md, NOTICE" />
                <div className="settings-actions">
                  <button className="panel-command-button" onClick={onOpenReleases}>
                    <ExternalLink size={15} />
                    <span>{t("settings.openReleases")}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ArchiveBrowser({
  folders,
  mode,
  selectedPath,
  currentFolderPath,
  collapsedFolders,
  onSelectFolder,
  onToggleFolder,
  t
}: {
  folders: ArchiveFolderNode[];
  mode: ArchiveBrowseMode;
  selectedPath?: string;
  currentFolderPath?: string;
  collapsedFolders: Set<string>;
  onSelectFolder: (folderPath: string | undefined) => void;
  onToggleFolder: (folderPath: string) => void;
  t: TFunction;
}): React.ReactElement {
  return (
    <div className="archive-browser" aria-label={t("archive.browseArchive")}>
      <div className="archive-browser-heading">{t("archive.browseArchive")}</div>
      <button
        className={`archive-tree-root ${mode === "continuous" ? "active" : ""}`}
        onClick={() => onSelectFolder(undefined)}
        type="button"
      >
        <FolderOpen size={15} />
        <span>{t("archive.allImages")}</span>
      </button>
      <div className="archive-tree" role="tree">
        {folders.map((folder) => (
          <ArchiveFolderTreeNode
            key={folder.id}
            node={folder}
            depth={0}
            selectedPath={selectedPath}
            currentFolderPath={currentFolderPath}
            collapsedFolders={collapsedFolders}
            onSelectFolder={onSelectFolder}
            onToggleFolder={onToggleFolder}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

function ArchiveFolderTreeNode({
  node,
  depth,
  selectedPath,
  currentFolderPath,
  collapsedFolders,
  onSelectFolder,
  onToggleFolder,
  t
}: {
  node: ArchiveFolderNode;
  depth: number;
  selectedPath?: string;
  currentFolderPath?: string;
  collapsedFolders: Set<string>;
  onSelectFolder: (folderPath: string) => void;
  onToggleFolder: (folderPath: string) => void;
  t: TFunction;
}): React.ReactElement {
  const hasChildren = node.childFolders.length > 0;
  const collapsed = collapsedFolders.has(node.fullPath);
  return (
    <div className="archive-tree-node" role="treeitem" aria-expanded={hasChildren ? !collapsed : undefined}>
      <div
        className={`archive-tree-row ${selectedPath === node.fullPath ? "active" : ""} ${currentFolderPath === node.fullPath ? "current" : ""}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {hasChildren ? (
          <button
            aria-label={collapsed ? t("archive.expandFolder") : t("archive.collapseFolder")}
            className="archive-tree-toggle"
            onClick={() => onToggleFolder(node.fullPath)}
            type="button"
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : <span className="archive-tree-toggle-spacer" />}
        <button className="archive-tree-folder" onClick={() => onSelectFolder(node.fullPath)} type="button" title={node.fullPath}>
          <FolderOpen size={14} />
          <span className="archive-tree-label">{node.name}</span>
          <span className="archive-tree-count">{node.descendantImageCount}</span>
        </button>
      </div>
      {!collapsed && node.childFolders.map((child) => (
        <ArchiveFolderTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          currentFolderPath={currentFolderPath}
          collapsedFolders={collapsedFolders}
          onSelectFolder={onSelectFolder}
          onToggleFolder={onToggleFolder}
          t={t}
        />
      ))}
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
  const aiEntries = exifEntries.filter(([key]) => isAiMetadataKey(key));
  const standardExifEntries = exifEntries.filter(([key]) => !isAiMetadataKey(key));
  const unknownLabel = t("common.unknown");
  const rawMetadata = metadata ? JSON.stringify(metadata, null, 2) : undefined;

  return (
    <div className="metadata-content">
      <InfoRow label={t("metadata.file")} value={item.archive?.displayPath ?? item.name} />
      <InfoRow label={t("metadata.container")} value={item.containerName ?? item.sourceKind} />
      <InfoRow label={t("metadata.format")} value={item.extension.toUpperCase()} />
      <InfoRow label={t("metadata.support")} value={t(`formats.${item.support.level}`)} />
      <InfoRow label={t("metadata.size")} value={formatBytes(item.sizeBytes, unknownLabel)} />
      <InfoRow label={t("metadata.modified")} value={formatDate(item.modifiedAt, locale, unknownLabel)} />
      <InfoRow label={t("metadata.width")} value={basic?.width ? String(basic.width) : unknownLabel} />
      <InfoRow label={t("metadata.height")} value={basic?.height ? String(basic.height) : unknownLabel} />
      <InfoRow label={t("metadata.color")} value={basic?.space ?? unknownLabel} />
      <InfoRow label={t("metadata.pages")} value={basic?.pages ? String(basic.pages) : "1"} />
      <InfoRow label={t("metadata.index")} value={String(item.index + 1)} />
      {loading && <div className="muted-line">{t("metadata.readingMetadata")}</div>}
      {error && <div className="muted-line">{error}</div>}
      {standardExifEntries.length > 0 && (
        <>
          <div className="subheading">{t("metadata.exif")}</div>
          {standardExifEntries.map(([key, value]) => (
            <InfoRow key={key} label={key} value={value} />
          ))}
        </>
      )}
      {aiEntries.length > 0 && (
        <>
          <div className="subheading">{t("metadata.aiMetadata")}</div>
          {aiEntries.map(([key, value]) => (
            <InfoRow key={key} label={key} value={value} />
          ))}
        </>
      )}
      {rawMetadata && (
        <details className="raw-metadata">
          <summary>{t("metadata.rawMetadata")}</summary>
          {metadata?.truncated && <p className="settings-note">{t("metadata.truncated")}</p>}
          <pre>{rawMetadata}</pre>
        </details>
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
