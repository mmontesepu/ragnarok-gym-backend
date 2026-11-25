import {
  IsArray,
  IsString,
  Matches,
  ArrayNotEmpty,
  ArrayUnique,
  ArrayMaxSize,
  IsEnum,
} from 'class-validator';

import { WeekDay } from './week-day.enum';

export class PlanWeekDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'weekStart debe tener formato YYYY-MM-DD',
  })
  weekStart: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(6)
  @IsEnum(WeekDay, { each: true })
  days: WeekDay[];
}
