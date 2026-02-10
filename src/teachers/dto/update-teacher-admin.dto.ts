import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { TeacherTurn } from '../teacher.entity';

export class UpdateTeacherAdminDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEnum(TeacherTurn)
  turn?: TeacherTurn;

  // opcional: permitir activar/desactivar directo (si quieres)
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
