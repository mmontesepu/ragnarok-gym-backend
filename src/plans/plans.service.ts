import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Plan, PlanType } from './plan.entity';
import { PlanSchedule } from './plan-schedule.entity';

import { validateHour } from '../common/utils/date.util';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
  ) {}

  // =====================================================
  // CREAR PLAN
  // =====================================================

  async create(data: {
    name: string;
    classesPerWeek: number;
    type: PlanType;
    weekdayStartHour?: string;
    weekdayEndHour?: string;
    saturdayStartHour?: string;
    saturdayEndHour?: string;
    schedules?: {
      dayOfWeek: string;
      hour: string;
    }[];
  }) {
    // ===================================================
    // VALIDACIONES GENERALES
    // ===================================================

    if (typeof data.name !== 'string' || !data.name.trim()) {
      throw new BadRequestException('El nombre del plan es obligatorio');
    }

    if (!Object.values(PlanType).includes(data.type)) {
      throw new BadRequestException('Tipo de plan inválido');
    }

    if (
      !Number.isInteger(data.classesPerWeek) ||
      data.classesPerWeek < 0 ||
      (data.type !== PlanType.FREE && data.classesPerWeek === 0)
    ) {
      throw new BadRequestException('Cantidad de clases por semana inválida');
    }

    const requiresTeacher =
      data.type === PlanType.PERSONALIZED || data.type === PlanType.CLASS;

    // ===================================================
    // VALIDACIONES FREE
    // ===================================================

    if (data.type === PlanType.FREE) {
      if (!data.weekdayStartHour || !data.weekdayEndHour) {
        throw new BadRequestException('FREE debe tener rango horario semana');
      }

      validateHour(data.weekdayStartHour);
      validateHour(data.weekdayEndHour);

      if (data.weekdayStartHour >= data.weekdayEndHour) {
        throw new BadRequestException('Rango horario semanal inválido');
      }

      if (data.saturdayStartHour || data.saturdayEndHour) {
        if (!data.saturdayStartHour || !data.saturdayEndHour) {
          throw new BadRequestException(
            'Debes configurar ambas horas del sábado',
          );
        }

        validateHour(data.saturdayStartHour);
        validateHour(data.saturdayEndHour);

        if (data.saturdayStartHour >= data.saturdayEndHour) {
          throw new BadRequestException('Rango horario del sábado inválido');
        }
      }
    }

    // ===================================================
    // VALIDACIONES CLASS
    // ===================================================

    const normalizedSchedules: {
      dayOfWeek: string;
      hour: string;
    }[] = [];

    if (data.type === PlanType.CLASS) {
      if (!Array.isArray(data.schedules) || data.schedules.length === 0) {
        throw new BadRequestException('CLASS debe tener horarios definidos');
      }

      const allowedDays = [
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ];

      const seen = new Set<string>();

      for (const schedule of data.schedules) {
        if (typeof schedule?.dayOfWeek !== 'string') {
          throw new BadRequestException('Día de la semana inválido');
        }

        const day = schedule.dayOfWeek.toUpperCase();

        if (!allowedDays.includes(day)) {
          throw new BadRequestException(`Día inválido: ${day}`);
        }

        validateHour(schedule.hour);

        const key = `${day}-${schedule.hour}`;

        if (seen.has(key)) {
          throw new BadRequestException('Existen horarios duplicados');
        }

        seen.add(key);

        normalizedSchedules.push({
          dayOfWeek: day,
          hour: schedule.hour,
        });
      }
    }

    // ===================================================
    // CREAR PLAN Y HORARIOS EN UNA TRANSACCIÓN
    // ===================================================

    return this.planRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Plan);

      const plan = repository.create({
        name: data.name.trim(),
        classesPerWeek: data.classesPerWeek,
        requiresTeacher,
        type: data.type,
        weekdayStartHour: data.weekdayStartHour,
        weekdayEndHour: data.weekdayEndHour,
        saturdayStartHour: data.saturdayStartHour,
        saturdayEndHour: data.saturdayEndHour,
      });

      const savedPlan = await repository.save(plan);

      let scheduleEntities: PlanSchedule[] = [];

      if (data.type === PlanType.CLASS) {
        const scheduleRepository = manager.getRepository(PlanSchedule);

        scheduleEntities = normalizedSchedules.map((s) =>
          scheduleRepository.create({
            dayOfWeek: s.dayOfWeek,
            hour: s.hour,
            plan: savedPlan,
          }),
        );

        await scheduleRepository.save(scheduleEntities);
      }

      // ===============================================
      // RESPONSE SIN REFERENCIAS CIRCULARES
      // ===============================================

      return {
        id: savedPlan.id,
        name: savedPlan.name,
        classesPerWeek: savedPlan.classesPerWeek,
        type: savedPlan.type,
        requiresTeacher: savedPlan.requiresTeacher,
        weekdayStartHour: savedPlan.weekdayStartHour,
        weekdayEndHour: savedPlan.weekdayEndHour,
        saturdayStartHour: savedPlan.saturdayStartHour,
        saturdayEndHour: savedPlan.saturdayEndHour,
        schedules: scheduleEntities.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          hour: s.hour,
        })),
      };
    });
  }

  // =====================================================
  // LISTAR PLANES
  // =====================================================

  findAll() {
    return this.planRepository.find({
      relations: ['schedules'],
    });
  }

  // =====================================================
  // DETALLE PLAN
  // =====================================================

  findOne(id: number) {
    return this.planRepository.findOne({
      where: { id },
      relations: ['schedules'],
    });
  }

  // =====================================================
  // ELIMINAR PLAN
  // =====================================================

  remove(id: number) {
    return this.planRepository.delete(id);
  }
}
