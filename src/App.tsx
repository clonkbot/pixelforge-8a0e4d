import { useState, useRef, useCallback, useEffect } from 'react';
import './styles.css';

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rectangle';

const GRID_SIZES = [8, 16, 32, 64];
const PRESET_COLORS = [
  '#000000', '#1D2B53', '#7E2553', '#008751',
  '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
  '#FF004D', '#FFA300', '#FFEC27', '#00E436',
  '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA',
];

interface HistoryState {
  pixels: string[][];
}

export default function App() {
  const [gridSize, setGridSize] = useState(16);
  const [pixels, setPixels] = useState<string[][]>(() =>
    Array(16).fill(null).map(() => Array(16).fill('transparent'))
  );
  const [currentColor, setCurrentColor] = useState('#FF004D');
  const [secondaryColor, setSecondaryColor] = useState('transparent');
  const [tool, setTool] = useState<Tool>('pencil');
  const [isDrawing, setIsDrawing] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);
  const [previewPixels, setPreviewPixels] = useState<{ x: number; y: number }[]>([]);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const saveToHistory = useCallback((newPixels: string[][]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ pixels: newPixels.map(row => [...row]) });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setPixels(history[historyIndex - 1].pixels.map(row => [...row]));
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setPixels(history[historyIndex + 1].pixels.map(row => [...row]));
    }
  }, [history, historyIndex]);

  const resizeCanvas = (newSize: number) => {
    const newPixels = Array(newSize).fill(null).map(() => Array(newSize).fill('transparent'));
    const minSize = Math.min(newSize, gridSize);
    for (let y = 0; y < minSize; y++) {
      for (let x = 0; x < minSize; x++) {
        newPixels[y][x] = pixels[y]?.[x] || 'transparent';
      }
    }
    setPixels(newPixels);
    setGridSize(newSize);
    saveToHistory(newPixels);
  };

  const floodFill = (startX: number, startY: number, targetColor: string, fillColor: string, pixelsCopy: string[][]) => {
    if (targetColor === fillColor) return pixelsCopy;

    const stack = [{ x: startX, y: startY }];
    const visited = new Set<string>();

    while (stack.length > 0) {
      const { x, y } = stack.pop()!;
      const key = `${x},${y}`;

      if (visited.has(key)) continue;
      if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) continue;
      if (pixelsCopy[y][x] !== targetColor) continue;

      visited.add(key);
      pixelsCopy[y][x] = fillColor;

      stack.push({ x: x + 1, y });
      stack.push({ x: x - 1, y });
      stack.push({ x, y: y + 1 });
      stack.push({ x, y: y - 1 });
    }

    return pixelsCopy;
  };

  const getLinePixels = (x0: number, y0: number, x1: number, y1: number) => {
    const pixels: { x: number; y: number }[] = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let x = x0;
    let y = y0;

    while (true) {
      pixels.push({ x, y });
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }

    return pixels;
  };

  const getRectPixels = (x0: number, y0: number, x1: number, y1: number) => {
    const pixels: { x: number; y: number }[] = [];
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    for (let x = minX; x <= maxX; x++) {
      pixels.push({ x, y: minY });
      pixels.push({ x, y: maxY });
    }
    for (let y = minY + 1; y < maxY; y++) {
      pixels.push({ x: minX, y });
      pixels.push({ x: maxX, y });
    }

    return pixels;
  };

  const handlePixelAction = (x: number, y: number, isStart: boolean = false) => {
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return;

    if (tool === 'eyedropper') {
      const color = pixels[y][x];
      if (color !== 'transparent') {
        setCurrentColor(color);
      }
      setTool('pencil');
      return;
    }

    if (tool === 'line' || tool === 'rectangle') {
      if (isStart) {
        setLineStart({ x, y });
        setPreviewPixels([{ x, y }]);
      } else if (lineStart) {
        const shapePixels = tool === 'line'
          ? getLinePixels(lineStart.x, lineStart.y, x, y)
          : getRectPixels(lineStart.x, lineStart.y, x, y);
        setPreviewPixels(shapePixels);
      }
      return;
    }

    const newPixels = pixels.map(row => [...row]);

    if (tool === 'fill') {
      const targetColor = newPixels[y][x];
      floodFill(x, y, targetColor, currentColor, newPixels);
    } else {
      newPixels[y][x] = tool === 'eraser' ? 'transparent' : currentColor;
    }

    setPixels(newPixels);

    if (isStart || tool === 'fill') {
      saveToHistory(newPixels);
    }
  };

  const commitShape = (x: number, y: number) => {
    if (!lineStart || (tool !== 'line' && tool !== 'rectangle')) return;

    const newPixels = pixels.map(row => [...row]);
    const shapePixels = tool === 'line'
      ? getLinePixels(lineStart.x, lineStart.y, x, y)
      : getRectPixels(lineStart.x, lineStart.y, x, y);

    shapePixels.forEach(({ x: px, y: py }) => {
      if (px >= 0 && px < gridSize && py >= 0 && py < gridSize) {
        newPixels[py][px] = currentColor;
      }
    });

    setPixels(newPixels);
    saveToHistory(newPixels);
    setLineStart(null);
    setPreviewPixels([]);
  };

  const getPixelFromEvent = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY : e.clientY;
    const x = Math.floor((clientX - rect.left) / (rect.width / gridSize));
    const y = Math.floor((clientY - rect.top) / (rect.height / gridSize));
    return { x, y };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pixel = getPixelFromEvent(e);
    if (!pixel) return;
    setIsDrawing(true);
    handlePixelAction(pixel.x, pixel.y, true);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const pixel = getPixelFromEvent(e);
    if (!pixel) return;
    handlePixelAction(pixel.x, pixel.y, false);
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (lineStart && (tool === 'line' || tool === 'rectangle')) {
      const pixel = getPixelFromEvent(e);
      if (pixel) {
        commitShape(pixel.x, pixel.y);
      }
    }
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const newPixels = Array(gridSize).fill(null).map(() => Array(gridSize).fill('transparent'));
    setPixels(newPixels);
    saveToHistory(newPixels);
  };

  const exportPNG = () => {
    const scale = 16;
    const canvas = document.createElement('canvas');
    canvas.width = gridSize * scale;
    canvas.height = gridSize * scale;
    const ctx = canvas.getContext('2d')!;

    pixels.forEach((row, y) => {
      row.forEach((color, x) => {
        if (color !== 'transparent') {
          ctx.fillStyle = color;
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      });
    });

    const link = document.createElement('a');
    link.download = 'pixel-art.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  useEffect(() => {
    if (history.length === 0) {
      saveToHistory(pixels);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const tools: { id: Tool; icon: string; label: string }[] = [
    { id: 'pencil', icon: '✏️', label: 'Pencil' },
    { id: 'eraser', icon: '🧹', label: 'Eraser' },
    { id: 'fill', icon: '🪣', label: 'Fill' },
    { id: 'eyedropper', icon: '💧', label: 'Picker' },
    { id: 'line', icon: '📏', label: 'Line' },
    { id: 'rectangle', icon: '⬜', label: 'Rect' },
  ];

  return (
    <div className="app-container">
      <div className="scanlines" />
      <div className="crt-overlay" />

      <header className="header">
        <h1 className="title">
          <span className="title-bracket">[</span>
          PIXELFORGE
          <span className="title-bracket">]</span>
        </h1>
        <p className="subtitle">PIXEL ART STUDIO v1.0</p>
      </header>

      <main className="main-content">
        {/* Mobile Tool Toggle */}
        <button
          className="mobile-tools-toggle"
          onClick={() => setMobileToolsOpen(!mobileToolsOpen)}
        >
          {mobileToolsOpen ? '✕ CLOSE' : '☰ TOOLS'}
        </button>

        {/* Tools Panel */}
        <aside className={`tools-panel ${mobileToolsOpen ? 'open' : ''}`}>
          <div className="panel-section">
            <h3 className="panel-title">TOOLS</h3>
            <div className="tools-grid">
              {tools.map(t => (
                <button
                  key={t.id}
                  className={`tool-btn ${tool === t.id ? 'active' : ''}`}
                  onClick={() => { setTool(t.id); setMobileToolsOpen(false); }}
                  title={t.label}
                >
                  <span className="tool-icon">{t.icon}</span>
                  <span className="tool-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <h3 className="panel-title">COLORS</h3>
            <div className="color-preview">
              <div
                className="color-main"
                style={{ backgroundColor: currentColor }}
                title="Primary Color"
              />
              <div
                className="color-secondary"
                style={{ backgroundColor: secondaryColor === 'transparent' ? '#0a0a0f' : secondaryColor }}
                title="Secondary Color"
              />
            </div>
            <div className="color-palette">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  className={`color-swatch ${currentColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setCurrentColor(color)}
                  onContextMenu={(e) => { e.preventDefault(); setSecondaryColor(color); }}
                />
              ))}
            </div>
            <input
              type="color"
              value={currentColor}
              onChange={(e) => setCurrentColor(e.target.value)}
              className="color-input"
            />
          </div>

          <div className="panel-section">
            <h3 className="panel-title">CANVAS</h3>
            <div className="size-buttons">
              {GRID_SIZES.map(size => (
                <button
                  key={size}
                  className={`size-btn ${gridSize === size ? 'active' : ''}`}
                  onClick={() => resizeCanvas(size)}
                >
                  {size}x{size}
                </button>
              ))}
            </div>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              <span className="toggle-text">Show Grid</span>
            </label>
          </div>

          <div className="panel-section">
            <h3 className="panel-title">ACTIONS</h3>
            <div className="action-buttons">
              <button className="action-btn" onClick={undo} disabled={historyIndex <= 0}>
                ↶ UNDO
              </button>
              <button className="action-btn" onClick={redo} disabled={historyIndex >= history.length - 1}>
                ↷ REDO
              </button>
              <button className="action-btn danger" onClick={clearCanvas}>
                ✕ CLEAR
              </button>
              <button className="action-btn success" onClick={exportPNG}>
                ⬇ EXPORT
              </button>
            </div>
          </div>
        </aside>

        {/* Canvas Area */}
        <div className="canvas-wrapper">
          <div className="canvas-frame">
            <div className="frame-corner tl" />
            <div className="frame-corner tr" />
            <div className="frame-corner bl" />
            <div className="frame-corner br" />

            <div
              ref={canvasRef}
              className={`pixel-canvas ${showGrid ? 'show-grid' : ''}`}
              style={{
                gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                gridTemplateRows: `repeat(${gridSize}, 1fr)`,
              }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            >
              {pixels.map((row, y) =>
                row.map((color, x) => {
                  const isPreview = previewPixels.some(p => p.x === x && p.y === y);
                  return (
                    <div
                      key={`${x}-${y}`}
                      className={`pixel ${isPreview ? 'preview' : ''}`}
                      style={{
                        backgroundColor: isPreview ? currentColor : (color === 'transparent' ? undefined : color),
                        opacity: isPreview ? 0.6 : 1,
                      }}
                    />
                  );
                })
              )}
            </div>
          </div>

          <div className="canvas-info">
            <span>{gridSize}x{gridSize}</span>
            <span className="separator">|</span>
            <span>Tool: {tool.toUpperCase()}</span>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>Requested by @flambons · Built by @clonkbot</p>
      </footer>
    </div>
  );
}
