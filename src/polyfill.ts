if (typeof globalThis.HTMLVideoElement === 'undefined') {
    (globalThis as any).HTMLVideoElement = class HTMLVideoElement {};
}
if (typeof globalThis.HTMLCanvasElement === 'undefined') {
    (globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
}
if (typeof globalThis.document === 'undefined') {
    const mockContext = {
        fillStyle: '',
        fillRect: () => {},
        getImageData: () => ({ data: [0, 0, 0, 0] }),
        putImageData: () => {},
        createImageData: () => ({ data: [] }),
        drawFocusIfNeeded: () => {}
    };
    (globalThis as any).document = {
        createElement: (tag: string) => {
            if (tag === 'canvas') {
                return {
                    getContext: () => mockContext,
                    style: {},
                    width: 100,
                    height: 100
                };
            }
            return { style: {} };
        },
        getElementsByTagName: () => [],
        documentElement: { style: {} },
        body: { appendChild: () => {}, style: {} }
    };
}
if (typeof globalThis.window === 'undefined') {
    (globalThis as any).window = globalThis;
}
if (typeof globalThis.navigator === 'undefined') {
    (globalThis as any).navigator = { userAgent: 'node' };
}
if (typeof globalThis.Image === 'undefined') {
    (globalThis as any).Image = class Image {};
}
