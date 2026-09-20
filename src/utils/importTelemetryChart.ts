// Keep the native browser import separate so recovery tests replace only the
// network/module transport, while exercising the production URL and cache logic.
export async function importTelemetryChart(url: string): Promise<typeof import('../components/TelemetryChart')> {
    return import(/* @vite-ignore */ url);
}
