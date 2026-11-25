import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, Between, EntityManager } from 'typeorm';

import { StudentsService } from '../students/students.service';
import { Student } from '../students/student.entity';

import { FreeSchedule, FreeScheduleStatus } from './free-schedule.entity';

import {
  getTodayChile,
  validateDate,
  validateHour,
  addDays,
} from '../common/utils/date.util';

@Injectable()
export class FreeScheduleService {
  constructor(
    @InjectRepository(FreeSchedule)
    private readonly repo: Repository<FreeSchedule>,

    private readonly studentsService: StudentsService,
  ) {}

  // =====================================================
  // VALIDAR ALUMNO FREE
  // =====================================================

  private validateStudent(student: Student | null) {
    if (!student || !student.active || !student.user?.active) {
      throw new BadRequestException('Alumno no encontrado o inactivo');
    }

    if (student.plan?.type !== 'FREE') {
      throw new BadRequestException(
        'Solo alumnos con plan FREE pueden utilizar esta agenda',
      );
    }

    return student;
  }

  // =====================================================
  // VALIDAR FECHA Y HORARIO
  // =====================================================

  private validateSchedule(student: Student, date: string, hour: string) {
    validateDate(date);
    validateHour(hour);

    if (date < getTodayChile()) {
      throw new BadRequestException('No puedes agendar fechas pasadas');
    }

    const day = new Date(`${date}T00:00:00Z`).getUTCDay();

    if (day === 0) {
      throw new BadRequestException('Domingo no disponible');
    }

    const plan = student.plan;

    const start = day === 6 ? plan.saturdayStartHour : plan.weekdayStartHour;

    const end = day === 6 ? plan.saturdayEndHour : plan.weekdayEndHour;

    if (!start || !end) {
      throw new BadRequestException(
        'No existe horario configurado para este día',
      );
    }

    if (hour < start.slice(0, 5) || hour > end.slice(0, 5)) {
      throw new BadRequestException(
        'Horario fuera del rango permitido por el plan',
      );
    }
  }

  // =====================================================
  // BLOQUEAR ALUMNO DURANTE LA TRANSACCIÓN
  // =====================================================

  private async lockStudent(manager: EntityManager, studentId: number) {
    const student = await manager
      .getRepository(Student)
      .createQueryBuilder('student')
      .setLock('pessimistic_write')
      .where('student.id = :studentId', {
        studentId,
      })
      .getOne();

    if (!student || !student.active) {
      throw new BadRequestException('Alumno no disponible');
    }
  }

  // =====================================================
  // GUARDAR DÍA POR USUARIO AUTENTICADO
  // =====================================================

  async saveDayForUser(userId: number, date: string, hour: string) {
    const student = this.validateStudent(
      await this.studentsService.findByUserId(userId),
    );

    return this.saveDay(student.id, date, hour);
  }

  // =====================================================
  // GUARDAR DÍA
  // =====================================================

  async saveDay(studentId: number, date: string, hour: string) {
    const student = this.validateStudent(
      await this.studentsService.findOne(studentId),
    );

    this.validateSchedule(student, date, hour);

    return this.repo.manager.transaction(async (manager) => {
      await this.lockStudent(manager, studentId);

      const repository = manager.getRepository(FreeSchedule);

      const existing = await repository
        .createQueryBuilder('schedule')
        .setLock('pessimistic_write')
        .where('schedule.studentId = :studentId', { studentId })
        .andWhere('schedule.date = :date', {
          date,
        })
        .getOne();

      if (existing) {
        if (existing.status !== FreeScheduleStatus.BOOKED) {
          throw new BadRequestException(
            'No puedes modificar una asistencia registrada',
          );
        }

        existing.hour = hour;

        await repository.save(existing);

        return {
          ok: true,
          action: 'update',
        };
      }

      await repository.insert({
        studentId,
        date,
        hour,
        status: FreeScheduleStatus.BOOKED,
        attendedAt: null,
      });

      return {
        ok: true,
        action: 'insert',
      };
    });
  }

  // =====================================================
  // REEMPLAZAR SEMANA FREE
  // =====================================================

  async replaceWeek(
    userId: number,
    weekStart: string,
    days: { date: string; hour: string }[],
  ) {
    const student = this.validateStudent(
      await this.studentsService.findByUserId(userId),
    );

    validateDate(weekStart);

    if (!Array.isArray(days)) {
      throw new BadRequestException('days debe ser un arreglo');
    }

    const from = weekStart;
    const to = addDays(from, 6);

    const today = getTodayChile();

    const requested = new Map<string, string>();

    for (const item of days) {
      if (!item) {
        throw new BadRequestException('Registro de agenda inválido');
      }

      this.validateSchedule(student, item.date, item.hour);

      if (item.date < from || item.date > to) {
        throw new BadRequestException(
          'La fecha no pertenece a la semana seleccionada',
        );
      }

      if (requested.has(item.date)) {
        throw new BadRequestException(
          'No puedes agendar dos horarios el mismo día',
        );
      }

      requested.set(item.date, item.hour);
    }

    return this.repo.manager.transaction(async (manager) => {
      await this.lockStudent(manager, student.id);

      const repository = manager.getRepository(FreeSchedule);

      const existing = await repository
        .createQueryBuilder('schedule')
        .setLock('pessimistic_write')
        .where('schedule.studentId = :studentId', {
          studentId: student.id,
        })
        .andWhere('schedule.date BETWEEN :from AND :to', { from, to })
        .getMany();

      const existingByDate = new Map(existing.map((item) => [item.date, item]));

      // Proteger registros históricos y asistencias

      for (const item of existing) {
        if (item.date < today) {
          continue;
        }

        if (item.status !== FreeScheduleStatus.BOOKED) {
          const requestedHour = requested.get(item.date);

          if (requestedHour !== undefined && requestedHour !== item.hour) {
            throw new BadRequestException(
              `No puedes modificar la asistencia del ${item.date}`,
            );
          }

          continue;
        }

        // Eliminar únicamente reservas pendientes
        // que ya no fueron seleccionadas

        if (!requested.has(item.date)) {
          await repository.delete({
            id: item.id,
            status: FreeScheduleStatus.BOOKED,
          });
        }
      }

      // Actualizar o crear reservas pendientes

      for (const [date, hour] of requested) {
        const current = existingByDate.get(date);

        if (current) {
          if (current.status !== FreeScheduleStatus.BOOKED) {
            continue;
          }

          if (current.hour !== hour) {
            await repository.update(
              {
                id: current.id,
                status: FreeScheduleStatus.BOOKED,
              },
              { hour },
            );
          }

          continue;
        }

        await repository.insert({
          studentId: student.id,
          date,
          hour,
          status: FreeScheduleStatus.BOOKED,
          attendedAt: null,
        });
      }

      return {
        ok: true,
        action: days.length === 0 ? 'cleared' : 'replaced',
      };
    });
  }

  // =====================================================
  // AGENDA DIARIA FREE
  // =====================================================

  async getDailyGrouped(date: string) {
    validateDate(date);

    const slots = await this.repo.find({
      where: { date },
      relations: ['student', 'student.plan'],
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
        id: s.id,
        studentId: s.student.id,
        firstName: s.student.firstName,
        lastName: s.student.lastName,
        planName: s.student.plan?.name ?? 'PLAN',
        status: s.status,
        free: true,
      });
    }

    return Object.values(byHour);
  }
}
