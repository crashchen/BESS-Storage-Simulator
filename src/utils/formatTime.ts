export function formatTime(tod: number): string {
    const minutesPerDay = 24 * 60;
    const totalMinutes = ((Math.round(tod * 60) % minutesPerDay) + minutesPerDay) % minutesPerDay;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/** Chart time includes the day so midnight and multi-day runs stay unambiguous. */
export function formatSimulationTime(hours: number, withSeconds = false): string {
    const unitsPerHour = withSeconds ? 3600 : 60;
    const unitsPerDay = 24 * unitsPerHour;
    const total = Math.round(hours * unitsPerHour);
    const day = Math.floor(total / unitsPerDay) + 1;
    const clock = ((total % unitsPerDay) + unitsPerDay) % unitsPerDay;
    const hh = Math.floor(clock / unitsPerHour).toString().padStart(2, '0');
    const mm = Math.floor((clock % unitsPerHour) / (withSeconds ? 60 : 1)).toString().padStart(2, '0');
    const ss = withSeconds ? `:${(clock % 60).toString().padStart(2, '0')}` : '';
    return `D${day} ${hh}:${mm}${ss}`;
}
