interface ImageEntry {
  file: string;
  width: number;
  height: number;
}

interface AnimationEntry extends ImageEntry {
  preview: string;
  columns: number;
  rows: number;
  frameCount: number;
  durationsMs: number[];
  durationMs: number;
}

interface Manifest {
  version: number;
  images: Record<string, ImageEntry>;
  animations: Record<string, AnimationEntry>;
}

interface Resource {
  image: HTMLImageElement;
  url: string;
  width: number;
  height: number;
  atlas?: HTMLImageElement;
  columns: number;
  frameEnds: number[];
  duration: number;
}

type Progress = (loaded: number, total: number) => void;

const base = (import.meta as ImportMeta & {
  readonly env?: { readonly BASE_URL?: string };
}).env?.BASE_URL ?? '/';

export const ASSET_ROOT = `${base.endsWith('/') ? base : `${base}/`}assets/`;

function failure(name: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`Failed to load resource "${name}": ${detail}`);
}

function loadImage(name: string, file: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(failure(name, `cannot decode ${file}`));
    image.src = `${ASSET_ROOT}${file}`;
  });
}

function checkSize(name: string, entry: ImageEntry): void {
  if (!Number.isInteger(entry.width) || entry.width <= 0 ||
      !Number.isInteger(entry.height) || entry.height <= 0 || !entry.file) {
    throw failure(name, 'invalid image metadata');
  }
}

export class Assets {
  private resources = new Map<string, Resource>();
  private loading: Promise<void> | null = null;
  private ready = false;
  private loaded = 0;
  private total = 0;
  private listeners = new Set<Progress>();

  async load(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    if (this.ready) {
      onProgress?.(this.total, this.total);
      return;
    }
    if (onProgress) this.listeners.add(onProgress);
    try {
      if (!this.loading) {
        this.loading = this.loadAll().catch((error: unknown) => {
          this.loading = null;
          throw error;
        });
      } else if (this.total) {
        onProgress?.(this.loaded, this.total);
      }
      await this.loading;
    } finally {
      if (onProgress) this.listeners.delete(onProgress);
    }
  }

  image(name: string): HTMLImageElement {
    return this.resource(name).image;
  }

  url(name: string): string {
    return this.resource(name).url;
  }

  size(name: string): { width: number; height: number } {
    const resource = this.resource(name);
    return { width: resource.width, height: resource.height };
  }

  duration(name: string): number {
    return this.resource(name).duration;
  }

  draw(
    ctx: CanvasRenderingContext2D, name: string, x: number, y: number,
    time: number, scale = 1, loop = true,
  ): void {
    const resource = this.resource(name);
    if (!Number.isFinite(scale) || scale <= 0) return;
    const width = resource.width * scale;
    const height = resource.height * scale;
    if (!resource.atlas) {
      ctx.drawImage(resource.image, x, y, width, height);
      return;
    }
    const elapsed = Number.isFinite(time) ? Math.max(0, time) : 0;
    const position = loop ? elapsed % resource.duration : Math.min(elapsed, resource.duration);
    // Select by original per-frame timing rather than an assumed fixed FPS.
    let low = 0;
    let high = resource.frameEnds.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (position < resource.frameEnds[middle]) high = middle;
      else low = middle + 1;
    }
    ctx.drawImage(
      resource.atlas,
      (low % resource.columns) * resource.width,
      Math.floor(low / resource.columns) * resource.height,
      resource.width, resource.height, x, y, width, height,
    );
  }

  private resource(name: string): Resource {
    const resource = this.resources.get(name);
    if (!resource) throw new Error(`Unknown or unloaded resource "${name}"`);
    return resource;
  }

  private report(): void {
    for (const listener of this.listeners) listener(this.loaded, this.total);
  }

  private async loadAll(): Promise<void> {
    let manifest: Manifest;
    try {
      const response = await fetch(`${ASSET_ROOT}manifest.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      manifest = await response.json() as Manifest;
      if (manifest.version !== 1 || !manifest.images || !manifest.animations) {
        throw new Error('unsupported or incomplete manifest');
      }
    } catch (error) {
      throw failure('manifest', error);
    }
    const images = Object.entries(manifest.images);
    const animations = Object.entries(manifest.animations);
    this.total = 1 + images.length + animations.length * 2;
    this.loaded = 1;
    this.report();
    const resources = new Map<string, Resource>();
    const image = async (name: string, file: string): Promise<HTMLImageElement> => {
      const result = await loadImage(name, file);
      this.loaded++;
      this.report();
      return result;
    };
    await Promise.all([
      ...images.map(async ([name, entry]) => {
        checkSize(name, entry);
        const loaded = await image(name, entry.file);
        resources.set(name, {
          image: loaded, url: `${ASSET_ROOT}${entry.file}`,
          width: entry.width, height: entry.height,
          columns: 1, frameEnds: [], duration: 0,
        });
      }),
      ...animations.map(async ([name, entry]) => {
        checkSize(name, entry);
        if (!Number.isInteger(entry.columns) || entry.columns <= 0 ||
            !Number.isInteger(entry.rows) || entry.rows <= 0 ||
            !Number.isInteger(entry.frameCount) || entry.frameCount <= 0 ||
            entry.frameCount > entry.columns * entry.rows ||
            !Array.isArray(entry.durationsMs) || entry.durationsMs.length !== entry.frameCount ||
            !entry.preview) {
          throw failure(name, 'invalid animation metadata');
        }
        let duration = 0;
        const frameEnds = entry.durationsMs.map((milliseconds) => {
          if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
            throw failure(name, 'invalid frame duration');
          }
          duration += milliseconds / 1000;
          return duration;
        });
        const [atlas, preview] = await Promise.all([
          image(name, entry.file), image(name, entry.preview),
        ]);
        resources.set(name, {
          image: preview, url: `${ASSET_ROOT}${entry.preview}`, atlas,
          width: entry.width, height: entry.height,
          columns: entry.columns, frameEnds, duration,
        });
      }),
    ]);
    this.resources = resources;
    this.ready = true;
  }
}
