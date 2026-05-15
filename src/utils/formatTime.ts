export function formatTime(tod: number): string {
    const minutesPerDay = 24 * 60;
    const totalMinutes = ((Math.round(tod * 60) % minutesPerDay) + minutesPerDay) % minutesPerDay;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}
