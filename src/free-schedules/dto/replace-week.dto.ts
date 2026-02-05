export class ReplaceFreeWeekDto {
  weekStart: string; // YYYY-MM-DD (lunes)
  days: {
    date: string; // YYYY-MM-DD
    hour: string; // HH:mm
  }[];
}
