export function formatTime(tod: number): string {
    const hours = Math.floor(tod) % 24;
    const mins = Math.floor((tod % 1) * 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}
