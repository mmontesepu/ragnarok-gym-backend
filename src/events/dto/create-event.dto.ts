export class CreateEventDto {
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  hour: string; // HH:mm
  location?: string;
  maxParticipants?: number | null;
  active?: boolean;
}
