import { WeekDay } from './week-day.enum';

export class PlanWeekDto {
  weekStart: string; // "YYYY-MM-DD" (una fecha cualquiera de la semana)
  days: WeekDay[]; // ["MONDAY", "WEDNESDAY", ...]
}
