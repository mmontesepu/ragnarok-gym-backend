import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FreeSchedule } from './free-schedule.entity';
import { QueryFailedError } from 'typeorm';
import { StudentsService } from '../students/students.service'; // ✅ IMPORT CLAVE

@Injectable()
export class FreeScheduleService {
  constructor(
    @InjectRepository(FreeSchedule)
    private readonly repo: Repository<FreeSchedule>,
    private readonly studentsService: StudentsService, // ✅
  ) {}

  async saveDay(studentId: number, date: string, hour: string) {
    try {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(FreeSchedule)
        .values({ studentId, date, hour })
        .execute();

      return { ok: true, action: 'insert' };
    } catch (e) {
      if (e instanceof QueryFailedError && (e as any).code === '23505') {
        // 🔁 DUPLICADO → UPDATE
        await this.repo.update({ studentId, date }, { hour });

        return { ok: true, action: 'update' };
      }

      throw e; // otros errores reales
    }
  }

  async replaceWeek(
    userId: number,
    weekStart: string,
    days: { date: string; hour: string }[],
  ) {
    const student = await this.studentsService.findByUserId(userId);

    if (!student) {
      throw new BadRequestException('Student not found');
    }

    const studentId = student.id; // 🔥 AHORA SÍ EXISTE

    // 1️⃣ borrar semana
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    await this.repo
      .createQueryBuilder()
      .delete()
      .from(FreeSchedule)
      .where('studentId = :studentId', { studentId })
      .andWhere('date BETWEEN :from AND :to', {
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      })
      .execute();

    // 2️⃣ insertar nuevos días
    if (!days.length) {
      return { ok: true, action: 'cleared' };
    }

    const records = days.map((d) => ({
      studentId, // ✅ GARANTIZADO
      date: d.date,
      hour: d.hour,
    }));

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(FreeSchedule)
      .values(records)
      .execute();

    return { ok: true, action: 'replaced' };
  }

  async getDailyGrouped(date: string) {
    const slots = await this.repo.find({
      where: { date },
      relations: ['student'],
      order: { hour: 'ASC' },
    });

    const byHour: Record<string, any> = {};

    for (const s of slots) {
      if (!byHour[s.hour]) {
        byHour[s.hour] = {
          hour: s.hour,
          students: [],
        };
      }

      byHour[s.hour].students.push({
        id: s.id, // 👈 ID REAL del free_schedule (CLAVE PARA QR)
        studentId: s.student.id,
        firstName: s.student.firstName,
        lastName: s.student.lastName,
        planName: s.student.plan?.name ?? 'PLAN',
      });
    }

    return Object.values(byHour);
  }
}
