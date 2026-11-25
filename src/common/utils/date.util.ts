import { BadRequestException } from '@nestjs/common';

export function getTodayChile(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === 'year')?.value;

  const month = parts.find((p) => p.type === 'month')?.value;

  const day = parts.find((p) => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

export function validateDate(date: string): void {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestException(
      'Fecha inválida. Formato esperado YYYY-MM-DD',
    );
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new BadRequestException(`Fecha inválida: ${date}`);
  }
}

export function addDays(date: string, days: number): string {
  validateDate(date);

  const result = new Date(`${date}T00:00:00Z`);

  result.setUTCDate(result.getUTCDate() + days);

  return result.toISOString().slice(0, 10);
}

export function validateHour(hour: string): void {
  if (typeof hour !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hour)) {
    throw new BadRequestException('Hora inválida. Formato esperado HH:mm');
  }
}
